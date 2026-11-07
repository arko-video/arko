// Point de branchement UNIQUE des champs de la v3 « Best-of » dans le normaliseur (normaliser.ts).
// Fichier GELÉ (architecte / intégrateur) : chaque dev modifie seulement SON fichier (normaliser-voix.ts dev 1,
// normaliser-insertion.ts dev 2, normaliser-chibis.ts dev 3). Règle : un champ absent n'est JAMAIS ajouté →
// un ancien montage s'ouvre exactement pareil (test : src/auto/__tests__/retrocompat-v3.test.ts).

import { normaliserAvatars } from './normaliser-chibis';
import { normaliserBips, normaliserImages, normaliserPistesAudio, type ContexteInsertion } from './normaliser-insertion';
import type { Journal, Objet } from './normaliser-outils';
import { normaliserDerush, normaliserParoles, normaliserPersonnes } from './normaliser-voix';
import type { ImageRecette, Personne, Recette, Source } from './types';

/** Clés de premier niveau de la recette ajoutées par la v3. */
export const CLES_RECETTE_V3 = ['personnes', 'paroles', 'avatars', 'derush', 'images', 'pistesAudio', 'bips'] as const;

/** Lu AVANT les plans : un plan inséré peut citer une image ou une personne. */
export interface ContexteV3 extends ContexteInsertion {
  listeImages: ImageRecette[] | undefined;
  listePersonnes: Personne[] | undefined;
}

export function lireContexteV3(obj: Objet, journal: Journal): ContexteV3 {
  const listeImages = normaliserImages(obj.images, journal);
  const listePersonnes = normaliserPersonnes(obj.personnes, journal);
  return {
    listeImages,
    listePersonnes,
    images: (listeImages ?? []).map((i) => i.id),
    personnes: (listePersonnes ?? []).map((p) => p.id),
  };
}

/**
 * Ajoute les champs v3 à `recette` (déjà munie de ses plans), seulement s'ils sont présents et valides.
 * Les images que plus aucun plan n'utilise sont retirées (sans message) ; une liste vide disparaît.
 */
export function ajouterChampsV3(recette: Recette, obj: Objet, ctx: ContexteV3, sources: readonly Source[], journal: Journal): void {
  const videos = sources.filter((s) => s.type === 'video');
  if (ctx.listeImages) {
    const utilisees = new Set(recette.plans.map((p) => (p.ins?.type === 'image' ? p.ins.img : '')));
    const images = ctx.listeImages.filter((i) => utilisees.has(i.id));
    if (images.length > 0) recette.images = images;
  }
  if (ctx.listePersonnes) recette.personnes = ctx.listePersonnes;
  // Sous-titres pour une personne (Best-of) : seulement si elle existe encore.
  if (recette.sousTitres?.pour !== undefined && !ctx.personnes.includes(recette.sousTitres.pour)) delete recette.sousTitres.pour;
  const paroles = normaliserParoles(obj.paroles, ctx.personnes, videos, journal);
  if (paroles) recette.paroles = paroles;
  const avatars = normaliserAvatars(obj.avatars, journal);
  if (avatars) recette.avatars = avatars;
  const derush = normaliserDerush(obj.derush, videos, journal);
  if (derush) recette.derush = derush;
  const pistes = normaliserPistesAudio(obj.pistesAudio, videos, journal);
  if (pistes) recette.pistesAudio = pistes;
  const bips = normaliserBips(obj.bips, journal);
  if (bips) recette.bips = bips;
}
