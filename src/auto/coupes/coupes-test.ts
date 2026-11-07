// Données FABRIQUÉES pour les tests des coupes v4 (dev-coupes) : VAD, énergie de la bande voix, signaux, entrée de
// couperV4. Jamais de son réel, de modèle ni de fichier : tout est calculé ici.

import type { Mot, NiveauBlancs } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';
import type { EnveloppeDb } from '../types-v3';
import type { EntreeCoupes, MomentV4, ParoleDetectee, ProbasVad } from '../types-v4';
import { paroleDepuisProbas } from '../vad/segments';

export const PAS_VAD = 0.032;

/** VAD fabriquée : p (0 à 1) sur des plages, 0 ailleurs. */
export function vadFabriquee(duree: number, plages: readonly [number, number, number][]): ProbasVad {
  const p = new Uint8Array(Math.ceil(duree / PAS_VAD));
  for (const [de, a, x] of plages) for (let k = Math.floor(de / PAS_VAD); k < Math.min(p.length, Math.ceil(a / PAS_VAD)); k++) p[k] = Math.round(x * 255);
  return { src: 's1', pas: PAS_VAD, p, plages: [{ de: 0, a: duree }], modele: 'silero-vad-v5' };
}

/** Énergie de la bande voix fabriquée (20 ms) : `fond` dB partout, puis des plages [de, a, dB]. */
export function energieFabriquee(duree: number, fond: number, plages: readonly [number, number, number][] = []): EnveloppeDb {
  const db = new Float32Array(Math.ceil(duree / 0.02)).fill(fond);
  for (const [de, a, x] of plages) for (let k = Math.round(de / 0.02); k < Math.min(db.length, Math.round(a / 0.02)); k++) db[k] = x;
  return { pas: 0.02, db };
}

/** Signaux fabriqués : fond à `fondDb` dBFS, rafales fortes [de, a, dB], passages muets. */
export function signauxFabriques(duree: number, fondDb = -40, rafales: readonly [number, number, number][] = [], muets: PlageTemps[] = []): SignauxSource {
  const pas = 0.02;
  const rms = new Float32Array(Math.round(duree / pas)).fill(10 ** (fondDb / 20));
  for (const [de, a, db] of rafales) for (let k = Math.round(de / pas); k < Math.round(a / pas); k++) rms[k] = 10 ** (db / 20);
  for (const m of muets) for (let k = Math.round(m.de / pas); k < Math.round(m.a / pas); k++) rms[k] = 0;
  return { src: 's1', duree, pas, rms, pics: [], cris: [], rires: [], muets };
}

export const sansParole = (): ParoleDetectee => ({ src: 's1', methode: 'mots', segments: [], probas: null, part: 0 });

/** Parole d'après une VAD fabriquée (segments de Silero, comme detecterParoleV4). */
export function paroleFabriquee(duree: number, plages: readonly [number, number, number][]): ParoleDetectee {
  return paroleDepuisProbas(vadFabriquee(duree, plages), duree);
}

export function moment(genre: MomentV4['genre'], de: number, a: number): MomentV4 {
  return { genre, de, a, t: (de + a) / 2, force: 0.8, indices: [] };
}

/** Entrée de couperV4 (d'office : rien entendu, aucun signal, Normal, parole + sons forts). */
export function entree(o: Partial<EntreeCoupes> & { mots?: Mot[] } = {}): EntreeCoupes {
  return {
    mots: o.mots ?? [],
    parole: o.parole ?? sansParole(),
    energie: o.energie ?? null,
    moments: o.moments ?? [],
    signaux: o.signaux ?? null,
    niveau: o.niveau ?? ('normal' as NiveauBlancs),
    garder: o.garder ?? 'parole+forts',
    ...(o.plages ? { plages: o.plages } : {}),
  };
}

/** Probabilité (0 à 1) de la VAD au temps t. */
export function pA(v: ProbasVad, t: number): number {
  const k = Math.floor(t / v.pas);
  return k >= 0 && k < v.p.length ? v.p[k]! / 255 : 0;
}
