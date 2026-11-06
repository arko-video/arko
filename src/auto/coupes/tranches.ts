// Transcription longue (dev 1), fonctions PURES : ce qui reste à transcrire, découpé en tranches de 5 min, et la
// fusion d'une tranche finie dans la transcription gardée (reprise après fermeture de l'appli).

import type { Mot, Sec } from '../../recette/types';
import type { PlageTemps } from '../types';

/** Taille d'une tranche (s) : la transcription est gardée après chacune. */
export const TRANCHE: Sec = 300;
export const VERSION_TRANSCRIPTION = 1;

/** Ce qui est gardé dans IndexedDB (clé `arko.transcription.<empreinte>`). */
export interface TranscriptionGardee {
  version: number;
  duree: Sec;
  langue: string;
  /** Plages déjà transcrites (triées, sans chevauchement). */
  plages: PlageTemps[];
  /** Mots déjà transcrits (triés). */
  mots: Mot[];
}

export function transcriptionVide(duree: Sec, langue: string): TranscriptionGardee {
  return { version: VERSION_TRANSCRIPTION, duree, langue, plages: [], mots: [] };
}

/** La transcription gardée sert-elle pour cette source et cette langue ? */
export function gardeeUtilisable(g: unknown, duree: Sec, langue: string): g is TranscriptionGardee {
  if (!g || typeof g !== 'object') return false;
  const o = g as Partial<TranscriptionGardee>;
  return o.version === VERSION_TRANSCRIPTION && typeof o.duree === 'number' && Math.abs(o.duree - duree) < 0.5 && o.langue === langue && Array.isArray(o.plages) && Array.isArray(o.mots);
}

/** Plages triées et fusionnées (celles qui se touchent à 0,05 s près n'en font qu'une). */
export function unionPlages(plages: readonly PlageTemps[]): PlageTemps[] {
  const res: PlageTemps[] = [];
  for (const p of [...plages].filter((x) => x.a > x.de).sort((x, y) => x.de - y.de)) {
    const der = res[res.length - 1];
    if (der && p.de <= der.a + 0.05) der.a = Math.max(der.a, p.a);
    else res.push({ de: p.de, a: p.a });
  }
  return res;
}

/** Parties de `voulue` qui ne sont pas dans `faites` (ignorant les bouts de moins de 0,5 s). */
export function plagesManquantes(voulue: PlageTemps, faites: readonly PlageTemps[]): PlageTemps[] {
  const res: PlageTemps[] = [];
  let t = voulue.de;
  for (const f of unionPlages(faites)) {
    if (f.a <= t) continue;
    if (f.de >= voulue.a) break;
    if (f.de - t >= 0.5) res.push({ de: t, a: f.de });
    t = Math.max(t, f.a);
  }
  if (voulue.a - t >= 0.5) res.push({ de: t, a: voulue.a });
  return res;
}

/** Coupe des plages en tranches de `taille` s au plus (la dernière d'une plage peut être plus courte). */
export function enTranches(plages: readonly PlageTemps[], taille: Sec = TRANCHE): PlageTemps[] {
  const res: PlageTemps[] = [];
  for (const p of plages) {
    const n = Math.max(1, Math.ceil((p.a - p.de) / taille - 1e-9));
    for (let i = 0; i < n; i++) res.push({ de: p.de + i * taille, a: Math.min(p.a, p.de + (i + 1) * taille) });
  }
  return res;
}

/** Durée totale de plages (s). */
export function dureePlages(plages: readonly PlageTemps[]): Sec {
  return plages.reduce((s, p) => s + Math.max(0, p.a - p.de), 0);
}

/** Le milieu du mot tombe-t-il dans [de, a[ ? */
function dans(m: Mot, p: PlageTemps): boolean {
  const milieu = (m[1] + m[2]) / 2;
  return milieu >= p.de && milieu < p.a;
}

/**
 * Ajoute une tranche finie : ses mots remplacent ceux qu'on avait déjà au même endroit (une tranche refaite ne
 * double jamais ses mots), et la tranche rejoint les plages faites. Pure : renvoie une nouvelle transcription.
 */
export function ajouterTranche(g: TranscriptionGardee, tranche: PlageTemps, mots: readonly Mot[]): TranscriptionGardee {
  const gardes = g.mots.filter((m) => !dans(m, tranche));
  const nouveaux = mots.filter((m) => dans(m, tranche));
  return {
    ...g,
    plages: unionPlages([...g.plages, tranche]),
    mots: [...gardes, ...nouveaux].sort((a, b) => a[1] - b[1]),
  };
}

/** Mots dont le milieu est dans la plage. */
export function motsDansPlage(mots: readonly Mot[], p: PlageTemps): Mot[] {
  return mots.filter((m) => dans(m, p));
}

/** Parties de `faites` qui tombent dans `voulue`. */
export function plagesDans(faites: readonly PlageTemps[], voulue: PlageTemps): PlageTemps[] {
  return unionPlages(faites)
    .map((f) => ({ de: Math.max(f.de, voulue.de), a: Math.min(f.a, voulue.a) }))
    .filter((f) => f.a > f.de);
}

/**
 * Mots déjà transcrits qui couvrent TOUTES les plages voulues (les sous-titres réutilisent la transcription de
 * « Couper les blancs » ou du Montage express : pas de 2ᵉ passage de Whisper) ; null s'il en manque une partie.
 */
export function motsCouverts(g: Pick<TranscriptionGardee, 'plages' | 'mots'>, voulues: readonly PlageTemps[]): Mot[] | null {
  if (voulues.length === 0 || voulues.some((v) => plagesManquantes(v, g.plages).length > 0)) return null;
  return g.mots.filter((m) => voulues.some((v) => dans(m, v)));
}
