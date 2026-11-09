// Miniature YouTube : une image de la vidéo + un GROS texte (styles d'Arko, contour épais), un émoji, une flèche.
// Taille : 1280 × 720 (16:9) ou 1080 × 1920 pour un Short (9:16). Fichier PNG ou JPEG de moins de 2 Mo.
//
// Règles vérifiées le 4/11/2026 (https://support.google.com/youtube/answer/72431) : JPG ou PNG, 16:9 pour une vidéo
// (9:16 pour un Short), au moins 640 px de large ; 2 Mo au plus depuis un téléphone (50 Mo depuis un ordinateur).
// On vise donc 2 Mo : la miniature passe partout.

import { gabarit, type Destination } from '../recette/destination';
import type { Recette, Sec } from '../recette/types';
import type { SourceOuverte } from './api';
import { envPour, type Ctx2D } from './canevas';
import { CITRON } from './couches/styles-texte';
import { GROTESK } from './polices';
import { rendre } from './rendre';
import { mediasDe } from './sources';
import { imagesDe } from './inserts/images-ouvertes'; // v3 (B)
import { dessinerChibiCache } from '../chibis/cache';
import type { Emotion } from '../chibis/catalogue';
import { chibiDe } from './couches/avatars';

export const MINIATURE = { l: 1280, h: 720, maxOctets: 2 * 1024 * 1024 } as const;
export const MINIATURE_SHORT = { l: 1080, h: 1920 } as const;

export type StyleMiniature = 'accroche' | 'alerte' | 'citron';
export interface ReglagesMiniature {
  t: Sec;
  texte: string;
  style: StyleMiniature;
  position: 'haut' | 'bas';
  emoji: string;
  fleche: 'aucune' | 'gauche' | 'droite';
  /** GROS persos de la vidéo (un de chaque côté), absent = oui s'il y en a. */
  persos?: boolean;
  /** Leur émotion (défaut : choqué). */
  emoPersos?: Emotion;
}

export const EMOJIS_MINIATURE = ['😱', '🔥', '💀', '😂', '🤯', '🏆'] as const;
const COULEURS: Record<StyleMiniature, string> = { accroche: '#FFFFFF', alerte: '#FFE14D', citron: CITRON };

/** Taille de la miniature selon la destination. */
export function tailleMiniature(d: Destination): { l: number; h: number } {
  return gabarit(d).paysage ? { l: MINIATURE.l, h: MINIATURE.h } : { ...MINIATURE_SHORT };
}

/**
 * Encode jusqu'à passer sous `max` octets : PNG d'abord (si demandé), sinon JPEG de plus en plus compressé.
 * `encoder(type, qualite)` fabrique le fichier (canvas.convertToBlob dans la page). Pure, testée.
 */
export async function encoderSousLimite(
  encoder: (type: string, qualite?: number) => Promise<Blob>,
  type: 'image/png' | 'image/jpeg',
  max: number = MINIATURE.maxOctets,
): Promise<Blob> {
  if (type === 'image/png') {
    const png = await encoder('image/png');
    if (png.size < max) return png;
  }
  let dernier: Blob | null = null;
  for (const q of [0.92, 0.85, 0.75, 0.65, 0.5, 0.35, 0.2]) {
    dernier = await encoder('image/jpeg', q);
    if (dernier.size < max) return dernier;
  }
  return dernier!;
}

/** Dessine l'image t du MONTAGE (sans ses textes ni ses sous-titres) : même rendu que l'export. */
export async function imageDuMontage(recette: Recette, sources: SourceOuverte[], t: Sec, ctx: Ctx2D, l: number, h: number) {
  const r: Recette = { ...recette, textes: [], sousTitres: null };
  const rendu = rendre(r, mediasDe(sources), undefined, undefined, { generiques: false, images: imagesDe(r) });
  try {
    await rendu.image(t, ctx, envPour(l, h));
  } finally {
    await rendu.fermer();
  }
}

/** Coupe le texte en 2 lignes au plus, et réduit la taille jusqu'à ce qu'il tienne dans `largeur`. */
function lignesTexte(ctx: Ctx2D, txt: string, largeur: number, taille0: number): { lignes: string[]; taille: number } {
  const mots = txt.toUpperCase().split(/\s+/).filter(Boolean);
  for (let taille = taille0; ; taille *= 0.92) {
    ctx.font = `700 ${taille}px ${GROTESK}`;
    const lignes: string[] = [];
    let cour = '';
    for (const m of mots) {
      const essai = cour ? `${cour} ${m}` : m;
      if (cour && ctx.measureText(essai).width > largeur) {
        lignes.push(cour);
        cour = m;
      } else cour = essai;
    }
    if (cour) lignes.push(cour);
    const tient = lignes.length <= 2 && lignes.every((l) => ctx.measureText(l).width <= largeur);
    if (tient || taille < taille0 * 0.3) return { lignes, taille };
  }
}

/** Grosse flèche (contour noir) qui pointe vers la gauche ou la droite, centrée en (x, y). */
function dessinerFleche(ctx: Ctx2D, x: number, y: number, longueur: number, sens: 1 | -1) {
  const e = longueur * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sens, 1);
  ctx.rotate(-0.25);
  ctx.beginPath();
  ctx.moveTo(-longueur / 2, -e / 2);
  ctx.lineTo(longueur / 2 - e * 1.4, -e / 2);
  ctx.lineTo(longueur / 2 - e * 1.4, -e * 1.4);
  ctx.lineTo(longueur / 2, 0);
  ctx.lineTo(longueur / 2 - e * 1.4, e * 1.4);
  ctx.lineTo(longueur / 2 - e * 1.4, e / 2);
  ctx.lineTo(-longueur / 2, e / 2);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = e * 0.5;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.fillStyle = '#FF3B30';
  ctx.fill();
  ctx.restore();
}

/** Habillage de la miniature (par-dessus l'image) : voile, gros texte, émoji, flèche. */
export function dessinerHabillageMiniature(ctx: Ctx2D, l: number, h: number, r: ReglagesMiniature) {
  const u = Math.min(l, h) / 720;
  const haut = r.position === 'haut';
  // Voile sombre du côté du texte : il reste lisible sur n'importe quelle image.
  const voile = ctx.createLinearGradient(0, haut ? 0 : h, 0, haut ? h * 0.6 : h * 0.4);
  voile.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  voile.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = voile;
  ctx.fillRect(0, 0, l, h);

  const avecEmoji = r.emoji !== '';
  const largeurTexte = l * (avecEmoji ? 0.72 : 0.9);
  const xTexte = avecEmoji ? l * 0.06 + largeurTexte / 2 : l / 2;
  if (r.texte.trim()) {
    const { lignes, taille } = lignesTexte(ctx, r.texte.trim(), largeurTexte, 150 * u);
    const hLigne = taille * 1.05;
    const yCentre = haut ? h * 0.08 + (hLigne * lignes.length) / 2 + 10 * u : h * 0.92 - (hLigne * lignes.length) / 2 - 10 * u;
    ctx.font = `700 ${taille}px ${GROTESK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(8, taille * 0.2);
    ctx.strokeStyle = '#000';
    ctx.fillStyle = COULEURS[r.style];
    lignes.forEach((ligne, i) => {
      const y = yCentre + (i - (lignes.length - 1) / 2) * hLigne;
      ctx.strokeText(ligne, xTexte, y);
      ctx.fillText(ligne, xTexte, y);
    });
  }
  if (avecEmoji) {
    const taille = Math.min(l * 0.22, h * 0.32);
    ctx.font = `${taille}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.emoji, l * 0.86, haut ? h * 0.72 : h * 0.28);
  }
  // Flèche : du côté opposé au texte, pour ne pas le cacher.
  if (r.fleche !== 'aucune') dessinerFleche(ctx, l * 0.45, h * (haut ? 0.68 : 0.32), Math.min(l, h) * 0.42, r.fleche === 'droite' ? 1 : -1);
}

/**
 * GROS persos sur la miniature (retour d'un spectateur, 9/11/2026 : « mettre les personnages plus gros ») : les 2
 * premières personnes de la recette, en bas, un de chaque côté (un seul : à droite), 78 % de la hauteur, l'émotion
 * choisie. À dessiner AVANT l'habillage : le gros texte passe par-dessus.
 */
export function dessinerPersosMiniature(ctx: Ctx2D, l: number, h: number, recette: Recette, emo: Emotion = 'choque'): number {
  const gens = (recette.personnes ?? []).filter((p) => p.avatar !== false).slice(0, 2);
  const taille = h * (l > h ? 0.78 : 0.42);
  const xs = gens.length === 1 ? [0.8] : [0.17, 0.83];
  gens.forEach((p, i) => {
    const x = xs[i]! * l;
    dessinerChibiCache(ctx, chibiDe(p), { emo, bouche: true, t: 0, retourne: x > l / 2 }, { x, y: h * 1.03, h: taille });
  });
  return gens.length;
}
