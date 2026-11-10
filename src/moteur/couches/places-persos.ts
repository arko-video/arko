// Placement des persos de qui parle (7/11/2026), PUR : calculé au rendu à partir de la recette et du temps, donc
// identique dans l'aperçu et dans l'export (une seule voie de rendu).
//  - 16:9 : en bas, collés au bord. Voix 1 à gauche, voix 2 à droite, voix 3 à côté de la 1, voix 4 à côté de la 2…
//    sans se chevaucher (plus petits s'il y a trop de monde).
//  - 9:16 : plus petits, les pieds AU-DESSUS des sous-titres et des punchlines, hors des zones de TikTok (bas 20 %,
//    bande de droite 15 %). Voix 1 à gauche, voix 2 plus à droite, les autres entre les deux.
//  - 1:1 : comme le 16:9, en plus petit.
// Une voix garde toujours sa place (son rang dans `recette.personnes`). Une place choisie à la main est gardée.
// Pendant une punchline qui toucherait le perso, il rétrécit un peu et se décale (vers le bord, ou vers le haut en
// 9:16), avec un petit fondu de 0,15 s.

import { estBuste } from '../../chibis/persos/fiches';
import type { Gabarit } from '../../recette/destination';
import type { PlaceAvatar } from '../../recette/types';

/** Rectangle en parts de l'image (0 à 1). */
export interface Boite {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type FormeImage = 'paysage' | 'vertical' | 'carre';

export const PLACES_PERSOS = {
  /** Demi-largeur d'un perso (corps et bras) en part de sa hauteur ; un objet de situation peut dépasser un peu. */
  demiLargeur: 0.32,
  /** Écart entre deux persos voisins (part de la largeur de l'image). */
  ecart: 0.012,
  // 10/11 (Romain) : GRANDS, comme les persos des best-of YouTube (≈ 40 % de la hauteur), en bas dans les coins.
  paysage: { taille: 0.42, x1: 0.13, yBuste: 1, yEntier: 0.97 },
  carre: { taille: 0.22, x1: 0.13, yBuste: 1, yEntier: 0.97 },
  // 9:16 : bord gauche, bande de droite de TikTok (15 %), bas caché (20 %), demi-hauteur prévue d'une punchline.
  vertical: { taille: 0.12, gauche: 0.04, droite: 0.15, bas: 0.2, demiTexte: 0.045, marge: 0.012, yHaut: 0.45 },
  /** Évitement d'une punchline : rétrécir jusqu'à 78 %, fondu de 0,15 s. */
  evite: { echelles: [1, 0.92, 0.85, 0.78], fondu: 0.15 },
} as const;

export function formeDe(gab: Pick<Gabarit, 'l' | 'h'>): FormeImage {
  const r = gab.l / gab.h;
  return r >= 1.3 ? 'paysage' : r <= 0.8 ? 'vertical' : 'carre';
}

/** Largeur d'un perso de `taille` (part de la hauteur de l'image), en part de la largeur de l'image. */
export function largeurPerso(taille: number, gab: Pick<Gabarit, 'l' | 'h'>): number {
  return (2 * PLACES_PERSOS.demiLargeur * taille * gab.h) / gab.l;
}

/** Boîte occupée par un perso posé à `place` (pieds en bas, au milieu). */
export function boitePerso(place: PlaceAvatar, gab: Pick<Gabarit, 'l' | 'h'>): Boite {
  const w = largeurPerso(place.taille, gab) / 2;
  return { x0: place.x - w, x1: place.x + w, y0: place.y - place.taille, y1: place.y };
}

export function recouvrement(a: Boite, b: Boite): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

/** Hauteur des pieds en 9:16 : au-dessus des sous-titres (s'ils sont dans le bas), jamais dans les 20 % du bas. */
export function piedsVertical(ySousTitres: number | null): number {
  const V = PLACES_PERSOS.vertical;
  const plusBas = 1 - V.bas - V.marge;
  if (ySousTitres === null || ySousTitres < V.yHaut) return plusBas;
  return Math.min(plusBas, ySousTitres - V.demiTexte - V.marge);
}

/**
 * Place automatique de la voix de rang `rang` (0 = voix 1) parmi `n` voix avec un perso.
 * `ySousTitres` : centre des sous-titres / punchlines (null = aucun texte en bas).
 */
export function placeAuto(rang: number, n: number, gab: Pick<Gabarit, 'l' | 'h'>, buste: boolean, ySousTitres: number | null = null): PlaceAvatar {
  const r = Math.max(0, Math.floor(rang));
  const total = Math.max(n, r + 1, 1);
  const P = PLACES_PERSOS;
  const forme = formeDe(gab);
  if (forme === 'vertical') {
    const V = P.vertical;
    const y = piedsVertical(ySousTitres);
    // Tous entre le bord gauche et la bande de droite de TikTok, sans se chevaucher (plus petits s'il le faut).
    const place = 1 - V.droite - V.gauche;
    const taille = Math.min(V.taille, ((place - (total - 1) * P.ecart) / total) * (gab.l / gab.h) / (2 * P.demiLargeur));
    const w = largeurPerso(taille, gab);
    const xG = V.gauche + w / 2;
    const xD = 1 - V.droite - P.ecart - w / 2;
    // Voix 1 à gauche, voix 2 à droite, les suivantes entre les deux (de gauche à droite).
    const fente = r === 0 ? 0 : r === 1 ? total - 1 : r - 1;
    const x = total === 1 ? xG : xG + ((xD - xG) * fente) / (total - 1);
    return { x: arrondi(x), y: arrondi(y), taille: arrondi(taille) };
  }
  const F = forme === 'paysage' ? P.paysage : P.carre;
  const bord = F.x1 - largeurPerso(F.taille, gab) / 2;
  // Moitié des voix à gauche (1, 3, 5…), moitié à droite (2, 4, 6…), serrées vers le bord.
  const parCote = Math.ceil(total / 2);
  const dispo = 0.5 - bord - P.ecart;
  const taille = Math.min(F.taille, ((dispo - (parCote - 1) * P.ecart) / parCote) * (gab.l / gab.h) / (2 * P.demiLargeur));
  const w = largeurPerso(taille, gab);
  const k = Math.floor(r / 2);
  const depuisBord = bord + w / 2 + k * (w + P.ecart);
  const x = r % 2 === 0 ? depuisBord : 1 - depuisBord;
  return { x: arrondi(x), y: buste ? F.yBuste : F.yEntier, taille: arrondi(taille) };
}

const arrondi = (x: number) => Math.round(x * 10000) / 10000;

/** Personnes avec un perso à l'écran (même filtre que la couche avatars). */
interface PersonneAPlacer {
  id: string;
  place?: PlaceAvatar;
  style: string;
}

/** Place de chaque personne : la sienne si elle a été choisie à la main, sinon la place automatique de son rang. */
export function placesDesPersos(personnes: readonly PersonneAPlacer[], gab: Pick<Gabarit, 'l' | 'h'>, ySousTitres: number | null): Map<string, PlaceAvatar> {
  const res = new Map<string, PlaceAvatar>();
  personnes.forEach((p, rang) => res.set(p.id, p.place ?? placeAuto(rang, personnes.length, gab, estBuste(p.style), ySousTitres)));
  return res;
}

/**
 * Évite les textes (punchlines, sous-titres) visibles : la place la moins changée qui ne touche aucun texte
 * (rétrécir un peu, décaler vers le bord en 16:9 / 1:1, vers le haut en 9:16) ; sinon celle qui en touche le moins.
 */
export function eviterTextes(place: PlaceAvatar, textes: readonly Boite[], gab: Pick<Gabarit, 'l' | 'h'>): PlaceAvatar {
  if (textes.length === 0) return place;
  const touche = (p: PlaceAvatar) => textes.reduce((s, b) => s + recouvrement(boitePerso(p, gab), b), 0);
  if (touche(place) === 0) return place;
  const vertical = formeDe(gab) === 'vertical';
  const w = largeurPerso(place.taille, gab);
  const sens = place.x < 0.5 ? -1 : 1;
  const candidats: { p: PlaceAvatar; cout: number }[] = [];
  for (const k of PLACES_PERSOS.evite.echelles)
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const p = vertical ? { x: place.x, y: place.y - d * 0.08, taille: place.taille * k } : { x: place.x + sens * d * 0.5 * w, y: place.y, taille: place.taille * k };
      candidats.push({ p, cout: (1 - k) * 4 + d });
    }
  candidats.sort((a, b) => a.cout - b.cout);
  let mieux = candidats[0]!;
  let mieuxTouche = Infinity;
  for (const c of candidats) {
    const t = touche(c.p);
    if (t === 0) return c.p;
    if (t < mieuxTouche - 1e-9) {
      mieux = c;
      mieuxTouche = t;
    }
  }
  return mieux.p;
}

/** Mélange de deux places (fondu de l'évitement : 0 = `a`, 1 = `b`). */
export function melanger(a: PlaceAvatar, b: PlaceAvatar, e: number): PlaceAvatar {
  if (e <= 0) return a;
  if (e >= 1) return b;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, taille: a.taille + (b.taille - a.taille) * e };
}
