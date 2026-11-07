// Types de la recette ajoutés par la v3 « Best-of » (novembre 2026) pour INSÉRER un élément entre deux parties (B),
// les PISTES AUDIO séparées (E) et les BIPS sur les gros mots (E). TOUS FACULTATIFS : un ancien montage n'en a aucun.
// Propriétaire : dev 2. Contrat : conception/contrat-wankil.md §4.

import type { DefinitionChibi, Emotion, Situation } from './types-voix';

/**
 * Élément inséré entre deux parties (champ `plan.ins`). Un plan inséré est un plan ORDINAIRE de la frise :
 * transitions, textes, sous-titres et zooms marchent pareil.
 * - 'clip' : un autre clip vidéo (fichier, ou Ma bibliothèque) : `plan.src` est sa source, `de` / `a` dans le clip.
 * - 'image', 'carton', 'chibi' : pas de vidéo ; `plan.de` = 0 et `plan.a` = la durée (0,3 à 30 s), pas de `src`.
 *   Le moteur fabrique l'image (moteur/inserts/) ; aucun son (on peut poser un son en temps de sortie dessus).
 */
export type ElementInsere =
  | { type: 'clip' }
  /** Image fixe : `img` = id dans `recette.images` (fond flou autour si le format diffère). */
  | { type: 'image'; img: string }
  /** Carton texte : fond uni + texte centré (style d'un texte, défaut « accroche »). */
  | { type: 'carton'; txt: string; fond?: string; couleur?: string; style?: string }
  /** Chibi plein écran : celui de la personne `p`, sinon `chibi` ; émotion ; texte facultatif ; fond uni. */
  | { type: 'chibi'; emo: Emotion; p?: string; chibi?: DefinitionChibi; txt?: string; fond?: string; sit?: Situation };

export type TypeInsere = ElementInsere['type'];

/** Une image fixe du montage (le fichier reste sur l'appareil, rangé par son empreinte ; jamais dans la recette). */
export interface ImageRecette {
  /** « i1 », « i2 »… */
  id: string;
  nom: string;
  /** Empreinte du fichier (pour le retrouver sur l'appareil). */
  emp: string;
  taille: number;
  /** Dimensions en pixels. */
  l: number;
  h: number;
}

/** Une piste audio gardée d'une vidéo à plusieurs pistes (OBS : micro + Discord). */
export interface PisteGardee {
  /** Numéro de la piste audio dans le fichier (0 = la 1re). */
  n: number;
  /** 0 à 1,5 (défaut 1). */
  vol?: number;
  /** Nom affiché (« Micro », « Discord »). */
  nom?: string;
}

/** Pistes audio mixées pour une source (absent = la piste principale seule, comme avant). */
export interface ReglagePistes {
  src: string;
  pistes: PisteGardee[];
}

/** Gros mots : bip (son de 1 kHz) ou silence à la place, sur les jurons des sous-titres. Absent = rien. */
export interface ReglagesBips {
  son: 'bip' | 'muet';
}

/** Durées d'un élément inséré (s). */
export const DUREE_INSERE = { min: 0.3, max: 30, image: 2, carton: 2, chibi: 1.5 } as const;
