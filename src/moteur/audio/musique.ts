// F. Musique de fond (dev 3) : morceaux posés en temps de sortie, en boucle, fondus d'entrée et de sortie,
// niveau bas, baisse automatique quand on parle (le mixeur la calcule, voir auto/son/baisse.ts).
// Branché dans rendre.ts : preparerMusique() une fois par rendu, puis bloc() pour chaque bloc mixé ;
// le mixeur (mixeur.ts, dev 3) reçoit le BlocMusique. Aperçu et export passent par ici : même son.

import { NIVEAU_PAROLE } from '../../auto/son/baisse';
import type { Scenario } from '../../recette/chronologie';
import { MUSIQUE } from '../../recette/normaliser-auto-son';
import { placerMots } from '../../recette/sous-titres-places';
import type { Recette, Sec } from '../../recette/types';
import type { LireImporte } from './effets';
import type { SonPose } from './mixeur';
import { FREQUENCE_SORTIE, type Pcm } from './reechantillonner';

/** Ce que la musique apporte à UN bloc mixé. */
export interface BlocMusique {
  /** Morceaux de musique qui tombent dans le bloc (PCM déjà lu, fondus et volume compris). */
  sons: SonPose[];
  /** true = le mixeur baisse la musique quand on parle (seuil 0,03, ratio 6, attaque 20 ms, relâche 400 ms). */
  baisse: boolean;
  /**
   * Moments où l'on parle (temps de sortie), d'après les mots transcrits (v4 : les tours de parole) : la baisse
   * n'écoute la voix que là. Absent = pas de transcription : la baisse écoute tout le son des plans.
   */
  parole?: { t0: Sec; t1: Sec }[];
  /** v4 (`baisseSur: 'parole'`) : pendant `parole`, la commande vaut au moins ce niveau (≈ −8 dB de baisse). */
  niveauParole?: number;
}

export interface MusiquePreparee {
  bloc(t0: Sec, n: number): Promise<BlocMusique | null>;
}

/** Un morceau placé : de `t` à `fin` (temps de sortie), lu dans son fichier dès `debut`, rejoué tous les `periode`. */
export interface MorceauPlace {
  src: string;
  t: Sec;
  fin: Sec;
  debut: Sec;
  /** Durée d'un passage (fichier − debut) ; Infinity si pas de boucle. */
  periode: Sec;
}

/** Fondu aux raccords d'une boucle (pas de clic). */
export const FONDU_BOUCLE: Sec = 0.02;
/** Marges autour d'un mot pour la baisse (la voix commence un peu avant le mot détecté). */
const MARGE_PAROLE = { avant: 0.05, apres: 0.15, fusion: 0.3 };
/** v4 (`baisseSur: 'parole'`) : marges plus larges, mesurées sur la vraie session (voir momentsParoleV4). */
export const MARGE_PAROLE_V4 = { avant: 0.1, apres: 0.3, fusion: 0.6 } as const;

/** Morceaux placés : chacun dure jusqu'au suivant (ou sa fin, ou la fin de la vidéo). Pure. */
export function placerMorceaux(recette: Recette, duree: Sec): MorceauPlace[] {
  const m = recette.musique;
  if (!m) return [];
  const res: MorceauPlace[] = [];
  m.morceaux.forEach((x, i) => {
    const source = recette.sources.find((s) => s.id === x.src && s.type === 'audio');
    if (!source) return;
    const suivant = m.morceaux[i + 1]?.t ?? duree;
    const fin = Math.min(x.fin ?? suivant, suivant, duree);
    const debut = x.debut ?? 0;
    const longueur = source.duree - debut;
    if (fin <= x.t || longueur <= 0.05) return;
    res.push({ src: x.src, t: x.t, fin, debut, periode: x.boucle === false ? Infinity : longueur });
  });
  return res;
}

/**
 * Gain de la musique au temps de sortie `t` pour un morceau (pure) : volume × fondu d'entrée × fondu de sortie ×
 * petits fondus aux raccords de boucle ; 0 hors du morceau.
 */
export function gainMusique(m: MorceauPlace, t: Sec, vol: number, fonduEntree: Sec, fonduSortie: Sec): number {
  if (t < m.t || t >= m.fin) return 0;
  let g = vol;
  if (fonduEntree > 0) g *= Math.min(1, (t - m.t) / fonduEntree);
  if (fonduSortie > 0) g *= Math.min(1, (m.fin - t) / fonduSortie);
  if (Number.isFinite(m.periode)) {
    const dans = (t - m.t) % m.periode;
    if (t - m.t >= m.periode) g *= Math.min(1, dans / FONDU_BOUCLE);
    if (m.t + (Math.floor((t - m.t) / m.periode) + 1) * m.periode < m.fin) g *= Math.min(1, (m.periode - dans) / FONDU_BOUCLE);
  }
  return g;
}

/** Mots des sous-titres placés sur les plans (temps de sortie, sans marge) ; null s'il n'y en a pas. */
function placesDesMots(recette: Recette, scenario: Scenario): { t0: Sec; t1: Sec }[] | null {
  const st = recette.sousTitres;
  if (!st || !Array.isArray(st.mots) || st.mots.length === 0) return null;
  const src = st.src ?? recette.sources.find((s) => s.type === 'video')?.id ?? '';
  return placerMots(scenario.plans, st.mots, src).map((m) => ({ t0: m.t0, t1: m.t1 }));
}

/** Moments de parole (temps de sortie), fusionnés : d'après les mots transcrits placés sur les plans. Pure. */
export function momentsDeParole(recette: Recette, scenario: Scenario): { t0: Sec; t1: Sec }[] | null {
  const places = placesDesMots(recette, scenario);
  return places ? fusionnerAvecMarges(places, MARGE_PAROLE) : null;
}

/** Tours de parole (`recette.paroles`, temps source) coupés par les plans comme les mots (temps de sortie). */
function placesDesTours(recette: Recette, scenario: Scenario): { t0: Sec; t1: Sec }[] {
  const tours = recette.paroles;
  if (!tours || tours.length === 0) return [];
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const places: { t0: Sec; t1: Sec }[] = [];
  for (const p of scenario.plans) {
    if (p.ins || !p.src) continue;
    const fin = p.de + (p.tFige - p.t0) * p.vit; // rien pendant un arrêt sur image (muet)
    for (const x of tours) {
      if ((x.src ?? premiere) !== p.src) continue;
      const de = Math.max(x.ts, p.de);
      const a = Math.min(x.fin, fin);
      if (a > de) places.push({ t0: p.t0 + (de - p.de) / p.vit, t1: p.t0 + (a - p.de) / p.vit });
    }
  }
  return places;
}

/**
 * v4 (`baisseSur: 'parole'`) : moments de parole (temps de sortie) = les TOURS de parole (en v4, faits des segments du
 * détecteur de voix) ET les mots des sous-titres, avec des marges plus larges (0,1 s avant, 0,3 s après, trous de
 * moins de 0,6 s bouchés : la musique ne remonte pas entre deux phrases). Mesuré sur la vraie session (0–3000 s) :
 * parole de Romain baissée d'au moins 6 dB 91,8 % du temps (avant : 0,7 %), Guts 96,1 % (avant : 50 %).
 * null s'il n'y a ni tour ni mot. Pure.
 */
export function momentsParoleV4(recette: Recette, scenario: Scenario): { t0: Sec; t1: Sec }[] | null {
  const places = [...placesDesTours(recette, scenario), ...(placesDesMots(recette, scenario) ?? [])];
  return places.length > 0 ? fusionnerAvecMarges(places, MARGE_PAROLE_V4) : null;
}

/** Marges (la voix commence un peu avant le mot ou le segment) puis fusion des moments proches. */
function fusionnerAvecMarges(liste: readonly { t0: Sec; t1: Sec }[], marge: { avant: Sec; apres: Sec; fusion: Sec }): { t0: Sec; t1: Sec }[] {
  const places = liste.map((m) => ({ t0: m.t0 - marge.avant, t1: m.t1 + marge.apres })).sort((a, b) => a.t0 - b.t0);
  const res: { t0: Sec; t1: Sec }[] = [];
  for (const p of places) {
    const der = res[res.length - 1];
    if (der && p.t0 - der.t1 < marge.fusion) der.t1 = Math.max(der.t1, p.t1);
    else res.push({ ...p });
  }
  return res;
}

/**
 * Prépare la musique d'un rendu (null s'il n'y en a pas). `lire` lit un morceau d'une source audio
 * (le même lecteur que les sons importés). Ne lève jamais : une musique illisible est simplement muette.
 */
export function preparerMusique(recette: Recette, scenario: Scenario, lire: LireImporte): MusiquePreparee | null {
  const piste = recette.musique;
  const morceaux = placerMorceaux(recette, scenario.duree);
  if (!piste || morceaux.length === 0) return null;
  const vol = piste.vol ?? MUSIQUE.vol;
  const fe = piste.fonduEntree ?? MUSIQUE.fonduEntree;
  const fs = piste.fonduSortie ?? MUSIQUE.fonduSortie;
  const baisse = piste.baisse !== false;
  // v4 (`baisseSur: 'parole'`) : la baisse suit la parole (tours ∪ mots) avec une commande fixe, même pour une
  // voix faible ; sans ce champ (anciens montages) : exactement comme avant.
  const surParole = baisse && piste.baisseSur === 'parole';
  const parole = !baisse ? null : surParole ? momentsParoleV4(recette, scenario) : momentsDeParole(recette, scenario);

  async function bloc(t0: Sec, n: number): Promise<BlocMusique | null> {
    const t1 = t0 + n / FREQUENCE_SORTIE;
    const sons: SonPose[] = [];
    for (const m of morceaux) {
      if (m.fin <= t0 || m.t >= t1) continue;
      // Passages (boucles) du morceau qui touchent le bloc.
      const j0 = Number.isFinite(m.periode) ? Math.max(0, Math.floor((t0 - m.t) / m.periode)) : 0;
      for (let j = j0; ; j++) {
        const debutPassage = m.t + j * (Number.isFinite(m.periode) ? m.periode : 0);
        if (debutPassage >= Math.min(t1, m.fin) || (j > 0 && !Number.isFinite(m.periode))) break;
        const de = m.debut + Math.max(0, t0 - debutPassage);
        const a = m.debut + Math.min(m.periode, t1 - debutPassage);
        if (a <= de) continue;
        const pcm = await lire(m.src, de, a).catch(() => null);
        if (!pcm) continue;
        // L'échantillon au temps pcm.debut du fichier se joue à debutPassage + (pcm.debut − m.debut).
        const t = debutPassage + (pcm.debut - m.debut);
        sons.push({ t, vol: 1, pcm: avecGains(pcm, t, m, debutPassage, (x) => gainMusique(m, x, vol, fe, fs)) });
      }
    }
    if (sons.length === 0) return null;
    const res: BlocMusique = { sons, baisse };
    if (parole) res.parole = parole.filter((p) => p.t1 > t0 && p.t0 < t1);
    if (parole && surParole) res.niveauParole = NIVEAU_PAROLE;
    return res;
  }
  return { bloc };
}

/** Copie du PCM avec le gain de chaque échantillon (rien avant le passage ni après sa fin : boucles sans chevauchement). */
function avecGains(pcm: Pcm, t: Sec, m: MorceauPlace, debutPassage: Sec, gain: (t: Sec) => number): Pcm {
  const finPassage = Math.min(m.fin, debutPassage + m.periode);
  const canaux = pcm.canaux.map((c) => {
    const res = new Float32Array(c.length);
    for (let k = 0; k < c.length; k++) {
      const x = t + k / pcm.frequence;
      if (x >= debutPassage && x < finPassage) res[k] = c[k]! * gain(x);
    }
    return res;
  });
  return { frequence: pcm.frequence, debut: pcm.debut, canaux };
}
