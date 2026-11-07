// D. Export d'une variante en PNG transparent (dev 3) : OffscreenCanvas → convertToBlob (repli <canvas>.toBlob),
// et toutes les variantes d'un style en .zip « stocké ». Contrat : conception/contrat-wankil.md §5.

import { creerCanevas, type Canevas, type Ctx2D } from '../moteur/canevas';
import type { DefinitionChibi } from '../recette/types';
import { debordDe, dessinerChibi, PROPORTIONS_CHIBI, type PoseChibi } from './dessin';
import { variantes } from './variantes';
import { ecrireZip } from './zip-ecriture';

/** Où poser le chibi dans un PNG de `hauteur` px : tout ce qui dépasse (chapeaux, signes) tient dans l'image. */
export function cadrePng(hauteur: number, style = 'feutre') {
  const D = debordDe(style);
  const l = Math.round(hauteur * PROPORTIONS_CHIBI.largeur);
  const marge = hauteur * 0.04;
  // Hauteur du perso : chapeaux et signes compris (boîte du style), dans l'image moins ses marges.
  const h = Math.min((hauteur - 2 * marge) / (D.haut + D.bas), (l - 2 * marge) / (2 * D.cote));
  return { l, ht: hauteur, cadre: { x: l / 2, y: hauteur - marge - h * D.bas, h } };
}

async function versBlob(c: Canevas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((ok, ko) => (c as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : ko(new Error('PNG impossible'))), 'image/png'));
}

/** PNG transparent de `hauteur` px (largeur = 0,8 × hauteur, marge 4 %). */
export async function chibiEnPng(def: DefinitionChibi, pose: PoseChibi, hauteur = 512): Promise<Blob> {
  const { l, ht, cadre } = cadrePng(hauteur, def.style);
  const c = creerCanevas(l, ht);
  const ctx = c.getContext('2d') as Ctx2D | null; // transparent (alpha par défaut)
  if (!ctx) throw new Error('Canevas 2D indisponible');
  dessinerChibi(ctx, def, pose, cadre);
  return versBlob(c);
}

/** Nom de fichier sûr (« Mon chibi ! » → « mon-chibi »). */
export function nomFichier(nom: string): string {
  const s = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 40) || 'chibi';
}

/** Toutes les variantes en .zip « stocké » : « <chibi>-<émotion>-<ouverte|fermee>.png ». */
export async function chibisEnZip(def: DefinitionChibi, nom: string, hauteur = 512): Promise<Blob> {
  const base = nomFichier(nom);
  const fichiers = [];
  for (const p of variantes()) {
    const png = await chibiEnPng(def, p, hauteur);
    fichiers.push({ nom: `${base}-${p.emo}-${p.bouche ? 'ouverte' : 'fermee'}.png`, donnees: new Uint8Array(await png.arrayBuffer()) });
  }
  return new Blob([ecrireZip(fichiers) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
