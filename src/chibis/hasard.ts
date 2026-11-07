// D. Hasard reproductible des chibis (dev 3) : même graine → même dessin, partout (aperçu, export, PNG).
// Contrat : conception/contrat-wankil.md §5.

import type { DefinitionChibi, StyleChibi } from '../recette/types';
import { ACCESSOIRES, CHEVEUX, COIFFURES, COULEURS, PEAUX, STYLE_DEFAUT, TENUES, YEUX } from './catalogue';

/** Générateur pseudo-aléatoire (mulberry32) : nombres dans [0, 1[, toujours les mêmes pour une graine. FIGÉ. */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function un<T>(h: () => number, liste: readonly T[]): T {
  return liste[Math.min(liste.length - 1, Math.floor(h() * liste.length))]!;
}

/** Graine entière valide (0 à 2³¹ − 1). */
export function graineValide(g: number): number {
  return Number.isFinite(g) ? Math.abs(Math.round(g)) % 2147483647 : 1;
}

/**
 * « Au hasard » : un perso complet tiré de la graine (palettes du catalogue), dans le style donné (défaut :
 * STYLE_DEFAUT, le même pour un nouveau perso et pour le perso tiré de l'id d'une voix). Le style ne change rien
 * aux autres traits tirés.
 * Un accessoire sur deux environ (« aucun » est tiré plus souvent), cheveux naturels deux fois sur trois.
 */
export function chibiAuHasard(graine: number, style: StyleChibi = STYLE_DEFAUT): DefinitionChibi {
  const g = graineValide(graine);
  const h = aleatoire(g ^ 0x9e3779b9);
  const naturels = CHEVEUX.slice(0, 5);
  const def: DefinitionChibi = {
    style,
    graine: g,
    peau: un(h, PEAUX),
    coiffure: un(h, COIFFURES),
    cheveux: h() < 0.66 ? un(h, naturels) : un(h, CHEVEUX),
    tenue: un(h, TENUES),
    accessoire: h() < 0.4 ? 'aucun' : un(h, ACCESSOIRES.slice(1)),
    couleur: un(h, COULEURS),
    yeux: un(h, YEUX),
  };
  return def;
}

/** « Ressemble à… » : les traits choisis à la main, le reste tiré de la graine. */
export function chibiRessemblant(traits: Partial<Omit<DefinitionChibi, 'graine'>>, graine: number): DefinitionChibi {
  const base = chibiAuHasard(graine, traits.style ?? STYLE_DEFAUT);
  const res: DefinitionChibi = { ...base };
  for (const [k, v] of Object.entries(traits) as [keyof DefinitionChibi, unknown][]) {
    if (v !== undefined) (res as unknown as Record<string, unknown>)[k] = v;
  }
  return res;
}
