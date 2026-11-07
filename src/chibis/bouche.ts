// C. Bouche des avatars façon PNGtuber (dev 3), fonctions PURES : ouverte quand la voix dépasse son niveau habituel
// − 10 dB (toutes les 0,04 s, tenue au moins 0,08 s), fermée sinon. Les bits sont gardés dans le tour (`b`, base64)
// pour que l'aperçu et l'export dessinent EXACTEMENT la même bouche. Contrat : conception/contrat-wankil.md §5.

import type { SignauxSource } from '../auto/types';
import type { EnveloppeDb } from '../auto/types-v3';
import type { Mot, Sec, TourDeParole } from '../recette/types';
import { situationDuTour } from './situations-mots';
import { emotionDuTour } from './emotions';

export const BOUCHE = { pas: 0.04, margeDb: 10, tenueMin: 0.08, battementSansMots: 6 } as const;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Octets → base64 (sans btoa : marche partout, même dans un Worker ou Node). */
export function versBase64(o: Uint8Array): string {
  let s = '';
  for (let i = 0; i < o.length; i += 3) {
    const n = (o[i]! << 16) | ((o[i + 1] ?? 0) << 8) | (o[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < o.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < o.length ? B64[n & 63]! : '=');
  }
  return s;
}

const DECODES = new Map<string, Uint8Array>();

/** base64 → octets (gardés : relu à chaque image). Caractère inconnu = 0. */
export function depuisBase64(s: string): Uint8Array {
  const deja = DECODES.get(s);
  if (deja) return deja;
  const propre = s.replace(/=+$/, '');
  const o = new Uint8Array(Math.floor((propre.length * 6) / 8));
  let acc = 0;
  let nb = 0;
  let j = 0;
  for (const c of propre) {
    acc = (acc << 6) | Math.max(0, B64.indexOf(c));
    nb += 6;
    if (nb >= 8) {
      nb -= 8;
      if (j < o.length) o[j++] = (acc >> nb) & 255;
    }
  }
  if (DECODES.size > 256) DECODES.clear();
  DECODES.set(s, o);
  return o;
}

/** Niveau (dB) à t : le plus fort des 2 trames de l'enveloppe qui couvrent [t, t + 0,04[. */
function niveau(env: EnveloppeDb, t: Sec): number {
  const i = Math.floor(t / env.pas + 1e-9);
  let m = -Infinity;
  const n = Math.max(1, Math.round(BOUCHE.pas / env.pas));
  for (let k = 0; k < n; k++) {
    const v = env.db[i + k];
    if (v !== undefined && v > m) m = v;
  }
  return m;
}

/**
 * Bits de bouche (base64) pour [de, a] d'après l'enveloppe ; ouverte si niveau > seuilDb (et, si `permise` est
 * donnée, seulement là où elle dit oui : la v4 n'ouvre la bouche que là où le détecteur de voix entend parler).
 */
export function bitsBouche(env: EnveloppeDb, de: Sec, a: Sec, seuilDb: number, permise?: (t: Sec) => boolean): string {
  const n = Math.max(0, Math.ceil((a - de) / BOUCHE.pas - 1e-9));
  const bits = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const t = de + k * BOUCHE.pas;
    bits[k] = niveau(env, t) > seuilDb && (!permise || permise(t)) ? 1 : 0;
  }
  // Tenue minimale : une bouche qui s'ouvre reste ouverte 0,08 s (pas de clignement d'une seule image).
  const tenue = Math.round(BOUCHE.tenueMin / BOUCHE.pas);
  for (let k = 0; k < n; k++) {
    if (bits[k] === 1 && (k === 0 || bits[k - 1] === 0)) for (let j = 1; j < tenue && k + j < n; j++) bits[k + j] = 2;
  }
  const o = new Uint8Array(Math.ceil(n / 8));
  for (let k = 0; k < n; k++) if (bits[k]) o[k >> 3]! |= 0x80 >> (k & 7);
  return versBase64(o);
}

/** Bouche ouverte au temps source ts ? Avec `b` : les bits ; sans : pendant les mots (`mots`), sinon 6 battements/s. */
export function boucheOuverte(tour: TourDeParole, ts: Sec, mots?: readonly Mot[]): boolean {
  if (ts < tour.ts || ts >= tour.fin) return false;
  if (tour.b !== undefined) {
    const k = Math.floor((ts - tour.ts) / BOUCHE.pas + 1e-9);
    const o = depuisBase64(tour.b);
    const octet = o[k >> 3];
    return octet !== undefined && (octet & (0x80 >> (k & 7))) !== 0;
  }
  let debut = tour.ts;
  if (mots && mots.length > 0) {
    const m = mots.find((x) => x[1] <= ts && ts < x[2] && x[2] > tour.ts && x[1] < tour.fin);
    if (!m) return false;
    debut = m[1];
  }
  // 6 battements par seconde : ouverte la 1re moitié de chaque battement.
  return Math.floor((ts - debut) * BOUCHE.battementSansMots * 2 + 1e-9) % 2 === 0;
}

/** Ce qu'il faut pour compléter des tours (tout est facultatif). */
export interface ContexteTours {
  /** Enveloppe de la voix d'un tour (sa piste, ou le mélange). */
  enveloppe?: (tour: TourDeParole) => EnveloppeDb | null;
  mots?: readonly Mot[];
  signaux?: SignauxSource | null;
  /** Niveau habituel de la voix de chaque personne (dBFS) ; absent : la médiane de l'enveloppe pendant le tour. */
  niveaux?: Readonly<Record<string, number>>;
}

function mediane(env: EnveloppeDb, de: Sec, a: Sec): number {
  const v: number[] = [];
  for (let i = Math.floor(de / env.pas); i < Math.ceil(a / env.pas) && i < env.db.length; i++) if (Number.isFinite(env.db[i]!)) v.push(env.db[i]!);
  if (v.length === 0) return -60;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)]!;
}

/** Ajoute `emo` (emotionDuTour) et `b` (bitsBouche) aux tours ; renvoie de NOUVEAUX tours. */
export function completerTours(tours: readonly TourDeParole[], c: ContexteTours): TourDeParole[] {
  const mots = c.mots ?? [];
  return tours.map((t) => {
    const res: TourDeParole = { ...t };
    const dedans = mots.filter((m) => (m[1] + m[2]) / 2 >= t.ts && (m[1] + m[2]) / 2 < t.fin);
    res.emo = emotionDuTour(t, dedans, c.signaux ?? null);
    // Situation de jeu d'après les mots dits pendant le tour et autour (situations-mots.ts) ; aucune sans mot clé.
    const sit = situationDuTour(t, mots);
    if (sit) res.sit = sit;
    else delete res.sit;
    const env = c.enveloppe?.(t) ?? null;
    if (env) {
      const seuil = (c.niveaux?.[t.p] ?? mediane(env, t.ts, t.fin)) - BOUCHE.margeDb;
      res.b = bitsBouche(env, t.ts, t.fin, seuil);
    } else delete res.b;
    return res;
  });
}
