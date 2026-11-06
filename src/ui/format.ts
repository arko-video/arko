// Petites fonctions de mise en forme des nombres pour l'interface (pures).

import { T } from '../textes-fr';

const NBSP = ' ';

/** 12.43 → « 0:12,4 » ; 75 → « 1:15,0 ». */
export function formatTemps(t: number): string {
  const s = Math.max(0, t);
  const dixiemes = Math.floor(s * 10 + 1e-6);
  const min = Math.floor(dixiemes / 600);
  const sec = Math.floor((dixiemes % 600) / 10);
  const d = dixiemes % 10;
  return `${min}:${String(sec).padStart(2, '0')},${d}`;
}

/** Durée lisible : « 2,0 s », « 24 s », « 1 min 12 s ». */
export function formatDuree(d: number): string {
  const s = Math.max(0, d);
  if (s < 10) return `${s.toFixed(1).replace('.', ',')}${NBSP}s`;
  const r = Math.round(s);
  if (r < 60) return `${r}${NBSP}s`;
  const min = Math.floor(r / 60);
  const sec = r % 60;
  return sec ? `${min}${NBSP}min ${sec}${NBSP}s` : `${min}${NBSP}min`;
}

/** Taille en octets → « 25 Mo », « 1,2 Go ». */
export function formatTaille(octets: number): string {
  const mo = octets / 1e6;
  if (mo < 1) return `1${NBSP}Mo`;
  if (mo < 1000) return `${Math.round(mo)}${NBSP}Mo`;
  return `${(mo / 1000).toFixed(1).replace('.', ',')}${NBSP}Go`;
}

/** Ce que le compteur de durée doit savoir de la destination (gabarit de recette/destination.ts). */
export interface DestinationDuree {
  id: 'tiktok' | 'youtube' | 'short';
  dureeMax: number;
  dureeLimite: number | null;
}

/**
 * Couleur du compteur de durée selon la destination (TikTok si absente) :
 *  - TikTok : vert de 7 à 30 s, neutre jusqu'à 45 s, orange au-delà ;
 *  - Short : vert de 15 à 60 s, orange au-delà de 3 min (ce n'est plus un Short) ;
 *  - YouTube 16:9 : vert dès 1 min, orange au-delà de la limite d'Arko (60 min).
 */
export function niveauDuree(d: number, g?: DestinationDuree): 'bien' | 'neutre' | 'long' {
  if (g?.id === 'youtube') return d > g.dureeMax ? 'long' : d >= 60 ? 'bien' : 'neutre';
  if (g?.id === 'short') return d > (g.dureeLimite ?? 180) ? 'long' : d >= 15 && d <= 60 ? 'bien' : 'neutre';
  if (d > 45) return 'long';
  if (d >= 7 && d <= 30) return 'bien';
  return 'neutre';
}

/** Arrondi au 1/100 de seconde (format de la recette). */
export function auCentieme(t: number): number {
  return Math.round(t * 100) / 100;
}

/** Cadence de la vidéo finale (phase 1). */
export const IPS = 30;

/**
 * Avance (n > 0) ou recule (n < 0) de n images en restant sur la grille des images (1/30 s).
 * Pas d'arrondi au 1/100 ici : seule l'écriture dans la recette arrondit (normaliseur).
 */
export function pasImage(t: number, n: number): number {
  return Math.max(0, (Math.round(t * IPS) + n) / IPS);
}

/** Temps d'une longue vidéo : « 1:30:00 » au-delà d'une heure, sinon « 12:05 ». */
export function formatHeure(t: number): string {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/**
 * Lit un temps tapé par l'utilisateur : « 1:30:00 », « 90:00 », « 5400 », « 1h30 », « 1 h 30 min 5 s », « 12,5 ».
 * Renvoie des secondes, ou null si ce n'est pas un temps.
 */
export function lireHeure(texte: string): number | null {
  const t = texte.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  const unites = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)(?:min|m))?(?:(\d+(?:\.\d+)?)s?)?$/.exec(t);
  if (unites && /[hms]/.test(t) && (unites[1] || unites[2] || unites[3])) {
    const [, h, m, s] = unites;
    // « 1h30 » : le nombre sans unité après les heures compte en minutes.
    const sansUnite = h && !m && s && !t.endsWith('s');
    return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + (sansUnite ? Number(s) * 60 : Number(s ?? 0));
  }
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const parties = t.split(':');
  if (parties.length < 2 || parties.length > 3 || parties.some((x) => !/^\d+(?:\.\d+)?$/.test(x))) return null;
  return parties.reduce((acc, x) => acc * 60 + Number(x), 0);
}

/** Date relative : « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j », puis « 12 oct. ». */
export function formatDepuis(quand: number, maintenant = Date.now()): string {
  const min = Math.floor((maintenant - quand) / 60_000);
  if (min < 1) return T.montages.instant;
  if (min < 60) return T.montages.minutes(min);
  if (min < 24 * 60) return T.montages.heures(Math.floor(min / 60));
  const jours = Math.floor(min / (24 * 60));
  if (jours === 1) return T.montages.hier;
  if (jours < 7) return T.montages.jours(jours);
  return new Date(quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
