// A. Titres retirables / modifiables (dev 1) : l'accroche posée automatiquement (monteur sans IA, « ATTENDS… » du
// meilleur d'abord), les titres de section et tout titre posé par un modèle ou une IA. Un toucher pour retirer, un
// pour modifier. Contrat : conception/contrat-wankil.md §3.1.

import { normaliser } from './normaliser';
import type { Recette, Son, Texte } from './types';

/** Rôles de texte considérés comme des « titres » posés automatiquement. */
export const ROLES_TITRES = ['accroche', 'section', 'top3'] as const;

/** Un son de section (whoosh) est rattaché au titre posé à moins de 0,05 s de lui. */
const ECART_SON = 0.05;

function estTitre(x: Texte | undefined): boolean {
  return !!x?.role && (ROLES_TITRES as readonly string[]).includes(x.role);
}

/** Normalise ; renvoie la recette d'origine si rien n'a changé. */
function finir(origine: Recette, r: Recette): Recette {
  const n = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(n) === JSON.stringify(origine) ? origine : n;
}

/** Sans `sections` si plus aucun titre de section ne reste. */
function sansReglagesOrphelins(r: Recette): Recette {
  if (!r.sections || r.textes.some((x) => x.role === 'section')) return r;
  const { sections: _s, ...reste } = r;
  void _s;
  return reste as Recette;
}

/** « ATTENDS LA FIN » → « Attends la fin » (le nom du projet suit l'accroche, comme titreDuMoment). */
function enTitre(txt: string): string {
  const t = txt.trim();
  if (t !== t.toUpperCase()) return t;
  const bas = t.toLowerCase();
  return bas.charAt(0).toUpperCase() + bas.slice(1);
}

/** Indices (dans recette.textes) des titres : textes de rôle accroche, section ou top3. */
export function indicesTitres(recette: Recette): number[] {
  return recette.textes.flatMap((x, i) => (estTitre(x) ? [i] : []));
}

/** Retire un titre (indice), ou tous (`'tous'`) avec leurs sons de rôle « section ». */
export function retirerTitres(recette: Recette, quoi: number | 'tous'): Recette {
  let textes: Texte[];
  let sons: Son[];
  if (quoi === 'tous') {
    if (indicesTitres(recette).length === 0) return recette;
    textes = recette.textes.filter((x) => !estTitre(x));
    sons = recette.sons.filter((s) => s.role !== 'section');
  } else {
    const x = recette.textes[quoi];
    if (!Number.isInteger(quoi) || !estTitre(x)) return recette;
    textes = recette.textes.filter((_, k) => k !== quoi);
    // Le whoosh d'un titre de section part avec lui.
    sons = x!.role === 'section' ? recette.sons.filter((s) => !(s.role === 'section' && s.t !== undefined && Math.abs(s.t - x!.t) <= ECART_SON)) : recette.sons;
  }
  return finir(recette, sansReglagesOrphelins({ ...recette, textes, sons }));
}

/** Change le texte du titre i (vide = retirer). Le titre de la recette (`titre`) suit si c'était l'accroche. */
export function changerTitre(recette: Recette, i: number, txt: string): Recette {
  const x = recette.textes[i];
  if (!Number.isInteger(i) || !x) return recette;
  const propre = txt.replace(/\s+/g, ' ').trim();
  if (!propre) return estTitre(x) ? retirerTitres(recette, i) : recette;
  if (propre === x.txt) return recette;
  const textes = recette.textes.map((y, k) => (k === i ? { ...y, txt: propre } : y));
  const r: Recette = { ...recette, textes };
  if (x.role === 'accroche') r.titre = enTitre(propre).slice(0, 80);
  return finir(recette, r);
}
