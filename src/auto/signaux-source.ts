// Signaux du son d'une source pour le Montage auto (dev 1 ; lus par les 3 devs et l'intégrateur).
// On RÉUTILISE l'analyse du monteur IA (ia/client-analyse.ts : enveloppe toutes les 20 ms, point de reprise
// IndexedDB) puis les détecteurs purs de ia/signaux.ts et ia/rires.ts. Rien n'est envoyé : tout reste sur l'appareil.

import { analyserFichier } from '../ia/client-analyse';
import { lirePoint } from '../ia/reprise';
import { detecterRires } from '../ia/rires';
import { detecterCris, detecterPics, enDecibels, fondGlissant, lisser, PAS_ENVELOPPE, type Plage } from '../ia/signaux';
import type { SourceOuverte } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import type { Sec } from '../recette/types';
import type { OptionsTache, PlageMuette, PlageSignal, PlageTemps, SignauxSource } from './types';

/** Un passage plus long que ça sans aucun son (sous −60 dBFS) est « muet » (fin d'enregistrement AFK). */
export const MUET = { dureeMin: 120, dbMax: -60 };

/**
 * Fin AFK avec des bruits isolés : après un passage muet, s'il reste moins de `ilotMax` s de son en tout (hors autres
 * passages muets) ET moins que la durée de ce passage muet, ce reste n'est qu'une courte activité isolée (quelqu'un
 * passe, une notification, le jeu resté ouvert) : la fin entière compte comme muette.
 */
export const FIN_AFK = { ilotMax: 300 };

/** Plancher des niveaux (dBFS) : une case vide vaut ça. */
const PLANCHER = -100;

function enPlageSignal(p: Plage): PlageSignal {
  return { de: p.debut, a: p.fin, t: p.t, force: p.force };
}

/** Passages d'au moins MUET.dureeMin secondes où le volume reste sous MUET.dbMax (pure). */
export function passagesMuets(rms: Float32Array, pas: Sec): PlageTemps[] {
  const seuil = 10 ** (MUET.dbMax / 20);
  const minCases = Math.round(MUET.dureeMin / pas);
  const res: PlageTemps[] = [];
  let debut = -1;
  for (let k = 0; k <= rms.length; k++) {
    const calme = k < rms.length && rms[k]! < seuil;
    if (calme && debut < 0) debut = k;
    else if (!calme && debut >= 0) {
      if (k - debut >= minCases) res.push({ de: debut * pas, a: k * pas });
      debut = -1;
    }
  }
  return res;
}

/**
 * Passages muets avec la fin AFK (pure) : le premier passage muet après lequel il ne reste qu'une courte activité
 * isolée (FIN_AFK) s'étend jusqu'à la fin de la source ; `sonIsole` dit combien de secondes de son il recouvre.
 */
export function avecFinAfk(muets: readonly PlageTemps[], duree: Sec): PlageMuette[] {
  const m = [...muets].filter((x) => x.a > x.de).sort((x, y) => x.de - y.de);
  for (let i = 0; i < m.length; i++) {
    const pause = m[i]!.a - m[i]!.de;
    let muetApres = 0;
    for (let j = i + 1; j < m.length; j++) muetApres += Math.min(duree, m[j]!.a) - Math.max(m[j]!.de, m[i]!.a);
    const actif = Math.max(0, duree - m[i]!.a - muetApres);
    if (actif > 0 && actif < Math.min(FIN_AFK.ilotMax, pause)) return [...m.slice(0, i), { de: m[i]!.de, a: duree, sonIsole: actif }];
    if (actif === 0) break;
  }
  return m;
}

/**
 * Signaux à partir d'une enveloppe déjà calculée (PURE, testable avec un signal fabriqué) :
 * pics (detecterPics), cris (detecterCris), rires (detecterRires), passages muets (avec la fin AFK, avecFinAfk).
 * Mêmes réglages que le monteur IA (ia/candidats.ts) : on retrouve les mêmes moments.
 */
export function signauxDepuisEnveloppe(src: string, duree: Sec, pas: Sec, rms: Float32Array): SignauxSource {
  const db = lisser(enDecibels(rms), 5);
  const fond = fondGlissant(db, Math.round(30 / pas), Math.round(0.3 / pas));
  return {
    src,
    duree,
    pas,
    rms,
    pics: detecterPics(db, fond, pas).map((p) => ({ ts: p.t, db: p.db, z: p.z })),
    cris: detecterCris(db, rms, fond, pas).map(enPlageSignal),
    rires: detecterRires(rms, db, fond, pas).map(enPlageSignal),
    muets: avecFinAfk(passagesMuets(rms, pas), duree),
  };
}

/** Signaux déjà lus pendant cette session (clé : empreinte de la source). */
const deja = new Map<string, SignauxSource>();

/**
 * Signaux d'une source ouverte : relit le point de reprise de l'analyse (instantané si le monteur IA ou un
 * Montage auto l'a déjà fait), sinon lance l'analyse (~30 s pour 2 h sur PC), avec progression et annulation.
 */
export async function lireSignauxSource(source: SourceOuverte, options: OptionsTache = {}): Promise<SignauxSource> {
  const { emp, duree, id } = source.infos;
  const cle = `${emp}|${id}`;
  const connu = deja.get(cle);
  if (connu) return connu;
  let point = await lirePoint(emp, duree, PAS_ENVELOPPE);
  if (!point?.fini) {
    await analyserFichier(source.fichier, emp, { signal: options.signal, surProgression: options.surProgression });
    point = await lirePoint(emp, duree, PAS_ENVELOPPE);
  }
  if (!point?.fini) throw new ErreurArko('Je n\'ai pas pu écouter le son de ta vidéo. Réessaie.', 'analyse');
  const s = signauxDepuisEnveloppe(id, duree, point.pas, point.enveloppe);
  deja.set(cle, s);
  return s;
}

/** Niveau (dBFS) du son entre `de` et `a` (temps source), en RMS moyen (pure). Sert aux sons forts (−16 dBFS sur 100 ms). */
export function niveauDb(s: SignauxSource, de: Sec, a: Sec): number {
  const k0 = Math.max(0, Math.floor(de / s.pas + 1e-9));
  const k1 = Math.min(s.rms.length, Math.max(k0 + 1, Math.ceil(a / s.pas - 1e-9)));
  if (k1 <= k0) return PLANCHER;
  let somme = 0;
  for (let k = k0; k < k1; k++) somme += s.rms[k]! * s.rms[k]!;
  const moyenne = somme / (k1 - k0);
  return moyenne > 0 ? Math.max(PLANCHER, 10 * Math.log10(moyenne)) : PLANCHER;
}
