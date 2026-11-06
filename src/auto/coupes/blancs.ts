// A. Couper les blancs (dev 1), fonctions PURES. On garde la PAROLE (mots de Whisper), pas le volume brut :
// le son du jeu n'est jamais muet. Réglages « Normal » = ceux qui ont marché sur une vraie session de 3 h 20.
//  - chaque mot garde 0,25 s avant et 0,35 s après ; deux morceaux séparés de moins de 0,5 s sont fusionnés ;
//  - les sons forts hors parole (RMS sur 100 ms > −16 dBFS) sont gardés de −0,4 s à +0,6 s ;
//  - morceau minimal 0,35 s ; fondus du son 20 ms à l'entrée, 40 ms à la sortie (fondus-coupes.ts).
// Sans transcription : zones de voix (voix.ts, bande 300–3400 Hz, seuil adaptatif) à la place des mots.

import { couperLesBlancs } from '../../recette/operations-coupes-auto';
import { arrondir, dureePlan } from '../../recette/temps';
import type { Mot, NiveauBlancs, Recette, Sec } from '../../recette/types';
import type { Morceau, PlageTemps, SignauxSource } from '../types';
import { decouperPlans, ranger } from './decoupe';
import { REGLAGES_BLANCS, type ReglagesBlancs } from './reglages';
import { zonesDeVoix, type EnergieVoix } from './voix';

export { REGLAGES_BLANCS, type ReglagesBlancs } from './reglages';

/** Sons forts : fenêtres de `fortFenetre` s dont le RMS dépasse `fortDb`, regroupées, avec leurs marges. */
export function sonsForts(s: SignauxSource, r: ReglagesBlancs, de = 0, a = Infinity): Morceau[] {
  const n = Math.max(1, Math.round(r.fortFenetre / s.pas));
  const k0 = Math.max(0, Math.floor(de / s.pas));
  const k1 = Math.min(s.rms.length, Math.ceil(Math.min(a, s.duree) / s.pas));
  const seuil = 10 ** (r.fortDb / 10) * n; // somme des carrés sur n cases
  const res: Morceau[] = [];
  let somme = 0;
  let debut = -1;
  let fin = -1;
  for (let k = k0; k < k1; k++) {
    somme += s.rms[k]! * s.rms[k]!;
    if (k - n >= k0) somme -= s.rms[k - n]! * s.rms[k - n]!;
    if (k - k0 + 1 < n) continue;
    const kDebut = k - n + 1; // fenêtre [kDebut, k]
    if (somme > seuil) {
      if (debut < 0 || kDebut * s.pas > fin + r.fusion) {
        if (debut >= 0) res.push({ de: debut - r.fortAvant, a: fin + r.fortApres, raison: 'fort' });
        debut = kDebut * s.pas;
      }
      fin = (k + 1) * s.pas;
    }
  }
  if (debut >= 0) res.push({ de: debut - r.fortAvant, a: fin + r.fortApres, raison: 'fort' });
  return res;
}

/** Retire de [m.de, m.a] les passages muets (fin d'enregistrement AFK…). */
function sansMuets(liste: Morceau[], muets: readonly PlageTemps[]): Morceau[] {
  let res = liste;
  for (const z of muets) {
    res = res.flatMap((m) => {
      if (z.a <= m.de || z.de >= m.a) return [m];
      const parts: Morceau[] = [];
      if (z.de > m.de) parts.push({ ...m, a: z.de });
      if (z.a < m.a) parts.push({ ...m, de: z.a });
      return parts;
    });
  }
  return res;
}

/** Zones (mots ou voix) → morceaux : marges, sons forts, tri, fusion, plage, muets, longueur minimale. */
function construire(zones: readonly PlageTemps[], raison: Morceau['raison'], signaux: SignauxSource | null, r: ReglagesBlancs, plage?: PlageTemps): Morceau[] {
  const p0 = Math.max(0, plage?.de ?? 0);
  const p1 = Math.min(plage?.a ?? Infinity, signaux?.duree ?? Infinity);
  const bruts: Morceau[] = zones.filter((z) => z.a > p0 - r.apres && z.de < p1 + r.avant).map((z) => ({ de: z.de - r.avant, a: z.a + r.apres, raison }));
  if (signaux) bruts.push(...sonsForts(signaux, r, p0, p1));
  bruts.sort((x, y) => x.de - y.de);
  const fusionnes: Morceau[] = [];
  for (const m of bruts) {
    const der = fusionnes[fusionnes.length - 1];
    if (der && m.de - der.a < r.fusion) {
      der.a = Math.max(der.a, m.a);
      if (der.raison === 'fort') der.raison = m.raison;
    } else fusionnes.push({ ...m });
  }
  const bornes = fusionnes
    .map((m) => ({ ...m, de: Math.max(m.de, p0), a: Math.min(m.a, p1) }))
    .filter((m) => m.a > m.de);
  return sansMuets(bornes, signaux?.muets ?? [])
    .map((m) => ({ ...m, de: arrondir(m.de), a: arrondir(m.a) }))
    .filter((m) => m.a - m.de >= r.morceauMin - 1e-9);
}

/**
 * Morceaux à garder d'après les MOTS (+ sons forts hors parole si `signaux`), triés, fusionnés, dans `plage`
 * (toute la source si absente). Les mots sont ceux d'UNE source (temps source).
 */
export function morceauxDeParole(mots: readonly Mot[], signaux: SignauxSource | null, reglages: ReglagesBlancs, plage?: PlageTemps): Morceau[] {
  return construire(mots.map((m) => ({ de: m[1], a: m[2] })), 'parole', signaux, reglages, plage);
}

/** Même chose SANS transcription : zones de voix détectées dans la bande 300–3400 Hz (voix.ts). */
export function morceauxDeVoix(voix: EnergieVoix, signaux: SignauxSource | null, reglages: ReglagesBlancs, plage?: PlageTemps): Morceau[] {
  return construire(zonesDeVoix(voix), 'voix', signaux, reglages, plage);
}

/** Ce que l'aperçu affiche avant d'appliquer : « 2 h 03 → 41 min de parole · 312 coupes ». */
export interface ApercuBlancs {
  /** Durée de la vidéo finale avant et après (s). */
  avant: Sec;
  apres: Sec;
  /** Nombre de coupes ajoutées. */
  coupes: number;
}

/**
 * Aperçu du résultat de couperLesBlancs(recette, morceaux, niveau, { plage }) sans rien appliquer (pure).
 * `avant` = durée de la partie traitée (la plage, sinon le montage actuel) ; `apres` = durée réelle du résultat ;
 * `coupes` = passages enlevés. Sans aucun morceau gardé : apres = avant et 0 coupe (l'opération serait sans effet).
 */
export function apercuBlancs(recette: Recette, morceaux: readonly Morceau[], plage?: PlageTemps, niveau: NiveauBlancs = 'normal'): ApercuBlancs {
  const avant = arrondir(plage ? Math.max(0, plage.a - plage.de) : recette.plans.reduce((s, p) => s + dureePlan(p), 0));
  const resultat = couperLesBlancs(recette, morceaux, niveau, { plage });
  if (resultat === recette) return { avant, apres: avant, coupes: 0 };
  const { enleves } = decouperPlans(recette, ranger(morceaux), REGLAGES_BLANCS[niveau].morceauMin, plage);
  return { avant, apres: arrondir(resultat.plans.reduce((s, p) => s + dureePlan(p), 0)), coupes: enleves };
}
