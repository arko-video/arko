// Destination d'un montage : TikTok (9:16), YouTube vidéo (16:9) ou YouTube Short (9:16).
// Un « gabarit » regroupe tout ce qui change d'une destination à l'autre : taille de référence de l'image,
// zone sûre, bornes des textes et des sous-titres, durées. Le moteur et l'interface lisent ce gabarit :
// il n'y a toujours qu'un seul chemin de rendu.
//
// Règles de YouTube vérifiées le 4 novembre 2026 :
//  - Short : 3 min au plus, image carrée ou verticale (plus large = vidéo normale).
//    https://support.google.com/youtube/answer/15424877
//  - Zone sûre des Shorts : YouTube ne publie AUCUNE mesure officielle pour les Shorts « normaux ».
//    Marges prudentes reprises de guides de créateurs (haut ~15 %, bas ~25 %, côtés ~13 %) :
//    https://reap.video/blog/short-form-video-safe-zones · https://www.clipspeed.ai/blog/youtube-shorts-size.html
//  - Vidéo 16:9 : marges « titre » classiques de la télé (~5 à 8 %) ; en bas, la barre de lecture du lecteur YouTube.

import type { Recette } from './types';

export type Destination = 'tiktok' | 'youtube' | 'short';
export const DESTINATIONS: readonly Destination[] = ['tiktok', 'youtube', 'short'];

export interface Gabarit {
  id: Destination;
  /** Nom de la plateforme, pour les textes (« TikTok », « YouTube »). */
  plateforme: 'TikTok' | 'YouTube';
  /** Taille de RÉFÉRENCE de l'image (px) : tout l'habillage est pensé pour elle. */
  l: number;
  h: number;
  paysage: boolean;
  /** Zone sûre : parts de l'image cachées en haut, en bas, et sur chaque côté. */
  zone: { haut: number; bas: number; cote: number };
  /** Bornes de la position verticale (centre) des textes et des sous-titres. */
  texteY: readonly [number, number];
  sousTitresY: readonly [number, number];
  /** Sous-titres : au-delà de cette hauteur (bas d'une ligne), l'interface de la plateforme risque de les cacher. */
  basSousTitresMax: number;
  /** Largeur maximale d'un texte et d'une ligne de sous-titres (px de référence). */
  largeurTexte: number;
  largeurSousTitres: number;
  /** Durées (s) : conseil (null = aucun), limite de la plateforme (avertissement), maximum d'Arko (bloquant). */
  dureeConseil: number | null;
  dureeLimite: number | null;
  dureeMax: number;
}

export const TIKTOK: Gabarit = {
  id: 'tiktok',
  plateforme: 'TikTok',
  l: 1080,
  h: 1920,
  paysage: false,
  zone: { haut: 0.125, bas: 0.34375, cote: 120 / 1080 },
  texteY: [0.15, 0.62],
  sousTitresY: [0.15, 0.72],
  basSousTitresMax: 0.72,
  largeurTexte: 840,
  largeurSousTitres: 900,
  dureeConseil: 180,
  dureeLimite: null,
  dureeMax: 600,
};

export const SHORT: Gabarit = {
  ...TIKTOK,
  id: 'short',
  plateforme: 'YouTube',
  zone: { haut: 0.15, bas: 0.25, cote: 140 / 1080 },
  texteY: [0.17, 0.7],
  sousTitresY: [0.17, 0.75],
  basSousTitresMax: 0.75,
  largeurTexte: 800,
  largeurSousTitres: 800,
  dureeConseil: null,
  /** Au-delà de 3 min, YouTube ne publie plus la vidéo comme un Short. */
  dureeLimite: 180,
};

export const YOUTUBE: Gabarit = {
  id: 'youtube',
  plateforme: 'YouTube',
  l: 1920,
  h: 1080,
  paysage: true,
  zone: { haut: 0.08, bas: 0.14, cote: 0.05 },
  texteY: [0.1, 0.86],
  sousTitresY: [0.12, 0.88],
  basSousTitresMax: 0.88,
  largeurTexte: 1500,
  largeurSousTitres: 1400,
  dureeConseil: null,
  dureeLimite: null,
  dureeMax: 3600,
};

const GABARITS: Record<Destination, Gabarit> = { tiktok: TIKTOK, youtube: YOUTUBE, short: SHORT };

export function estDestination(x: unknown): x is Destination {
  return typeof x === 'string' && (DESTINATIONS as readonly string[]).includes(x);
}

/** Destination d'une recette : 'tiktok' pour les anciens projets (champ absent). */
export function destinationDe(r: Pick<Recette, 'destination'> | null | undefined): Destination {
  return estDestination(r?.destination) ? r.destination : 'tiktok';
}

export function gabarit(d: Destination | undefined): Gabarit {
  return GABARITS[d ?? 'tiktok'] ?? TIKTOK;
}

/** Gabarit d'une recette (TikTok si elle n'a pas de destination). */
export function gabaritDe(r: Pick<Recette, 'destination'> | null | undefined): Gabarit {
  return gabarit(destinationDe(r));
}

/** Hauteur par défaut des sous-titres en 16:9 : au-dessus de la barre de lecture. */
export const Y_SOUS_TITRES_PAYSAGE = 0.82;

/** Rapport largeur / hauteur d'une source « déjà au format » 16:9 (tolérance 3 %). */
export function dejaAuFormat(l: number | undefined, h: number | undefined, g: Gabarit): boolean {
  if (!l || !h) return false;
  if (!g.paysage) return h > l;
  return Math.abs(l / h / (16 / 9) - 1) < 0.03;
}
