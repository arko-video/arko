// E. Opérations « pistes audio » et « gros mots » (dev 2). Contrat : conception/contrat-wankil.md §4.2.
// Mêmes règles que operations.ts : NOUVELLE recette normalisée ; la recette d'origine si rien ne change.

import { normaliser } from './normaliser';
import type { PisteGardee, Recette, ReglagesBips } from './types';

function finir(origine: Recette, r: Recette): Recette {
  const res = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(res) === JSON.stringify(origine) ? origine : res;
}

/** Pistes gardées et mixées pour la source `src` (null = la piste principale seule, comme avant). */
export function choisirPistes(r: Recette, src: string, pistes: readonly PisteGardee[] | null): Recette {
  if (!r.sources.some((s) => s.id === src && s.type === 'video')) return r;
  const autres = (r.pistesAudio ?? []).filter((x) => x.src !== src);
  const liste =
    pistes && pistes.length > 0 ? [...autres, { src, pistes: pistes.map((p) => ({ ...p })) }] : autres;
  const res: Recette = { ...r, pistesAudio: liste };
  if (liste.length === 0) delete res.pistesAudio;
  return finir(r, res);
}

/** Bip / silence sur les jurons des sous-titres (null = rien). */
export function choisirBips(r: Recette, bips: ReglagesBips | null): Recette {
  const res: Recette = { ...r };
  if (bips) res.bips = { son: bips.son };
  else delete res.bips;
  return finir(r, res);
}

/**
 * Numéros des pistes audio gardées pour la source `src` (vide = pas de réglage : la piste principale seule).
 * Pour « Qui parle » (dev 1) et le Best-of (intégrateur) : une voix par piste gardée.
 */
export function pistesGardees(r: Pick<Recette, 'pistesAudio'>, src: string): number[] {
  return (r.pistesAudio?.find((x) => x.src === src)?.pistes ?? []).map((p) => p.n);
}
