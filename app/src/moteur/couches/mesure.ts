// Outils communs aux textes et aux sous-titres : mesure des mots, retour à la ligne, émojis, rectangle arrondi.
// Toutes les mesures se font à la taille de RÉFÉRENCE (1080 px de large), avec un seul petit canevas de mesure :
// les retours à la ligne sont donc identiques dans l'aperçu (540 px) et dans l'export (1080 px).

import type { Ctx2D } from '../canevas';
import { policesChargees, versionPolices } from '../polices';

/** Largeur de référence de la vidéo et hauteur (9:16). */
export const REF_L = 1080;
export const REF_H = 1920;

let ctxMesure: Ctx2D | null | undefined;

/** Largeur (en px de référence) de `texte` dans la police CSS `police` (ex. '800 64px "Arko Inter"'). */
export function mesurer(texte: string, police: string): number {
  if (ctxMesure === undefined) {
    ctxMesure = typeof OffscreenCanvas !== 'undefined' ? (new OffscreenCanvas(1, 1).getContext('2d') as Ctx2D | null) : null;
  }
  if (!ctxMesure) {
    // Tests dans Node (pas de canevas) : estimation simple, 0,56 × taille par caractère.
    const taille = Number(/(\d+(?:\.\d+)?)px/.exec(police)?.[1] ?? 16);
    return texte.length * taille * 0.56;
  }
  ctxMesure.font = police;
  return ctxMesure.measureText(texte).width;
}

const memoire = new Map<string, unknown>();
let versionMemoire = 0;

/**
 * Garde un calcul de mise en page en mémoire (seulement quand le chargement des polices est fini).
 * Si les vraies polices arrivent plus tard (après le délai), la mémoire est vidée : tout est re-mesuré.
 */
export function memo<T>(cle: string, calcul: () => T): T {
  if (versionMemoire !== versionPolices()) {
    memoire.clear();
    versionMemoire = versionPolices();
  }
  if (memoire.has(cle)) return memoire.get(cle) as T;
  const res = calcul();
  if (policesChargees()) {
    if (memoire.size > 500) memoire.clear();
    memoire.set(cle, res);
  }
  return res;
}

/** Émojis et caractères qui les accompagnent (variantes, peaux, drapeaux, touches). */
const EMOJIS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;

/** Retire les émojis (la police du canevas ne les a pas) et les espaces en trop. */
export function retirerEmojis(txt: string): string {
  return txt
    .replace(EMOJIS, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Retour à la ligne glouton : ajoute les mots tant que la ligne tient dans `largeurMax`.
 * Un mot trop long reste seul sur sa ligne (la ligne dépasse : c'est à l'appelant de rétrécir).
 */
export function couperEnLignes(mots: string[], largeurMax: number, largeur: (s: string) => number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (courante && largeur(essai) > largeurMax) {
      lignes.push(courante);
      courante = mot;
    } else courante = essai;
  }
  if (courante) lignes.push(courante);
  return lignes;
}

/** Trace un rectangle arrondi (à remplir ensuite avec ctx.fill()). */
export function rectArrondi(ctx: Ctx2D, x: number, y: number, l: number, h: number, rayon: number) {
  const r = Math.max(0, Math.min(rayon, l / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** Courbe douce qui ralentit à la fin (0 → 1). */
export function sortieDouce(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return 1 - (1 - q) * (1 - q);
}
