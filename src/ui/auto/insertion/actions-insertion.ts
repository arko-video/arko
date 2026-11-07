// B. Gestes « Insérer ici » (dev 2) côté interface : ouvrir ce qu'il faut (image décodée, clip de Ma bibliothèque,
// vidéo d'un fichier gardée dans Mèmes), puis UNE opération de la recette (un seul Annuler), et placer la tête sur
// l'élément. Aussi : régler, déplacer, retirer un élément inséré, et rouvrir les images à la reprise d'un montage.

import { inspecterClip } from '../../../bibliotheque/inspecter-clip';
import { ErreurArko, ouvrirImage, garderImage, lireImage, type MonClip } from '../../../moteur/api';
import {
  bornesDesPlans,
  deplacerElement,
  insererElement,
  modifierElement,
  supprimerElement,
  type DetailsInsertion,
} from '../../../recette/operations';
import type { ElementInsere, Recette } from '../../../recette/types';
import { garderClip } from '../../../stockage/clips';
import { T } from '../../../textes-fr';
import { TV } from '../../../textes-v3';
import { sourceDuClip } from '../../clips-montage';
import { afficherToast, annulerAction, modifier, recette, selection, teteLecture } from '../../etat';
import { chercher, mettreEnPause } from '../../lecture';

const TI = TV.insertion;

/** Nom court d'un élément (« Carton », « Image »…). */
export function etiquetteInsere(el: ElementInsere): string {
  return TI.etiquettes[el.type];
}

function message(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return TI.impossible;
}

/** Une opération d'insertion à la tête (ou au temps t) : sélectionne l'élément et y place la tête. */
function appliquer(el: ElementInsere, d: DetailsInsertion, t = teteLecture.peek()): boolean {
  mettreEnPause();
  let i = -1;
  const ok = modifier((r) => {
    const res = insererElement(r, t, el, d);
    i = res.i;
    return res.recette;
  });
  const r = recette.peek();
  if (!ok || i < 0 || !r) {
    afficherToast(TI.impossible);
    return false;
  }
  selection.value = i;
  chercher(bornesDesPlans(r)[i]!);
  afficherToast(`${TI.inseres[el.type]}.`, 3500, { label: T.annuler, agir: annulerAction });
  return true;
}

export function insererCarton(
  el: Extract<ElementInsere, { type: 'carton' }>,
  dur: number,
  t?: number,
): boolean {
  return appliquer(el, { dur }, t);
}

export function insererChibi(
  el: Extract<ElementInsere, { type: 'chibi' }>,
  dur: number,
  t?: number,
): boolean {
  return appliquer(el, { dur }, t);
}

/** Image fixe : gardée sur l'appareil, décodée, puis insérée. */
export async function insererImage(fichier: File, dur: number, t = teteLecture.peek()): Promise<boolean> {
  try {
    const fiche = await garderImage(fichier);
    await ouvrirImage(fiche.emp, fichier);
    return appliquer({ type: 'image', img: '' }, { dur, image: { ...fiche, id: '' } }, t);
  } catch (e) {
    afficherToast(message(e), 5000);
    return false;
  }
}

/** Vidéo de Ma bibliothèque (clip ou mème), passage [de, a] du clip. */
export async function insererClip(
  clip: MonClip,
  de: number,
  a: number,
  t = teteLecture.peek(),
): Promise<boolean> {
  try {
    const s = await sourceDuClip(clip);
    return appliquer({ type: 'clip' }, { clip: { source: s.infos, de, a } }, t);
  } catch (e) {
    afficherToast(message(e), 5000);
    return false;
  }
}

/** Vidéo d'un fichier : gardée dans Ma bibliothèque → Mèmes (pour la reprise), puis la fiche du clip. */
export async function garderVideo(fichier: File): Promise<MonClip> {
  const infos = await inspecterClip(fichier);
  const nom = fichier.name.replace(/\.[^.]+$/, '') || 'Vidéo';
  return (await garderClip(fichier, { rayon: 'memes', nom, etiquette: '', ...infos })).clip;
}

export function reglerInsere(i: number, partiel: Partial<ElementInsere>, dur?: number) {
  modifier((r) => modifierElement(r, i, partiel, dur));
}

export function retirerInsere(i: number) {
  mettreEnPause();
  if (modifier((r) => supprimerElement(r, i))) {
    selection.value = null;
    afficherToast(TI.retire, 3500, { label: T.annuler, agir: annulerAction });
  }
}

/** « Déplacer ici » : l'élément va à la tête de lecture. */
export function deplacerInsere(i: number) {
  mettreEnPause();
  const t = teteLecture.peek();
  let j = -1;
  if (
    !modifier((r) => {
      const res = deplacerElement(r, i, t);
      j = res.i;
      return res.recette;
    })
  )
    return afficherToast(TI.deplacerAide, 4000);
  const r = recette.peek();
  selection.value = j;
  if (r && j >= 0) chercher(bornesDesPlans(r)[j]!);
  afficherToast(TI.deplace, 2500);
}

/** À la reprise d'un montage : rouvre ses images depuis l'appareil ; une image disparue est retirée (décalage inverse). */
export async function rouvrirImages(r: Recette): Promise<{ recette: Recette; messages: string[] }> {
  const messages: string[] = [];
  let res = r;
  for (const img of r.images ?? []) {
    const fichier = await lireImage(img.emp);
    const ok = fichier
      ? await ouvrirImage(img.emp, fichier).then(
          () => true,
          () => false,
        )
      : false;
    if (ok) continue;
    messages.push(TI.imageAbsente(img.nom));
    for (let i = res.plans.length - 1; i >= 0; i--) {
      const p = res.plans[i]!;
      if (p.ins?.type === 'image' && p.ins.img === img.id) res = supprimerElement(res, i);
    }
  }
  return { recette: res, messages };
}
