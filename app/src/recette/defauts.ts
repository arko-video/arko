// Valeurs par défaut de la recette (une seule source pour le normaliseur, le compilateur et le moteur).

import { Y_SOUS_TITRES_PAYSAGE } from './destination';
import { FORMAT_RECETTE, type MiseEnPage, type Recette, type ReglagesExport } from './types';

export const VITESSE = { defaut: 1, min: 0.25, max: 4 };
/** Arrêt sur image (secondes). */
export const FIGE = { min: 0.3, max: 5 };

export const TRANSITION = { defaut: 'coupe', dur: 0.3, durMin: 0.1, durMax: 0.6 };
/** Transitions connues (rendues à partir de la phase 3). « coupe » = coupe franche. */
export const TYPES_TRANSITION = ['coupe', 'flash', 'zoom', 'glisse', 'noir', 'glitch', 'secousse'] as const;
/** Anciens noms acceptés par le normaliseur (une IA peut les écrire). */
export const ALIAS_TRANSITION: Readonly<Record<string, (typeof TYPES_TRANSITION)[number]>> = { whoosh: 'glisse', fondu: 'noir' };
/** Catalogue des transitions pour l'interface (phase 3) : nom affiché et son par défaut (null = aucun). */
export const TRANSITIONS: readonly { id: (typeof TYPES_TRANSITION)[number]; nom: string; son: string | null }[] = [
  { id: 'coupe', nom: 'Coupe', son: null },
  { id: 'flash', nom: 'Flash', son: 'impact.claque' },
  { id: 'zoom', nom: 'Zoom', son: 'whoosh.rapide' },
  { id: 'glisse', nom: 'Glissé', son: 'whoosh.rapide' },
  { id: 'noir', nom: 'Noir', son: null },
  { id: 'glitch', nom: 'Glitch', son: 'interface.erreur' },
  { id: 'secousse', nom: 'Secousse', son: 'impact.boom' },
];

export const TYPES_MISE: readonly MiseEnPage['type'][] = ['flou', 'recadre', 'jeuCam'];
export const MISE_DEFAUT: MiseEnPage = { type: 'flou', y: 0.5 };
export const JEU_CAM = {
  partCam: 0.35,
  partCamMin: 0.25,
  partCamMax: 0.6,
  cadreMin: 0.05,
  /** Cadre webcam par défaut : coin en bas à gauche (là où la plupart des streamers la mettent). */
  cam: { x: 0.02, y: 0.62, l: 0.26, h: 0.34 },
};

export const TEXTE = { style: 'accroche', dur: 3, durMin: 0.3, x: 0.5, y: 0.2, yMin: 0.15, yMax: 0.62, longueurMax: 120 };
/**
 * Zone sûre de TikTok (part de l'image) : en haut, les onglets ; en bas, la description et les boutons ;
 * sur les côtés, 120 px sur 1080. Un texte entier doit y rester.
 */
export const ZONE_SURE = { haut: 0.125, bas: 0.34375, cote: 120 / 1080 };
/** Au-delà de cette hauteur (bas d'une ligne), la description TikTok risque de cacher les sous-titres. */
export const BAS_SOUS_TITRES_MAX = 0.72;
export const SOUS_TITRES = { style: 'karaoke', y: 0.58, yMin: 0.15, yMax: 0.72, parLigne: 3, ecartMin: 0.05, motMax: 1.5 };

/** Styles de texte (phase 2), dans l'ordre d'affichage. */
export const STYLES_TEXTE = ['accroche', 'bulle', 'citron', 'alerte', 'discret'] as const;
/** Styles de sous-titres (phase 2). */
export const STYLES_SOUS_TITRES = ['karaoke', 'pop', 'boite'] as const;
/** Accroche : texte du début, visible dès la 1re image. */
export const ACCROCHE = { t: 0, dur: 2.5, style: 'accroche' as const, y: 0.2 };

/**
 * Hauteur par défaut des sous-titres selon la mise en page (flou : sous la vidéo ; jeu + webcam : sur la jointure).
 * En 16:9 (gabarit paysage) : en bas, au-dessus de la barre de lecture de YouTube.
 */
export function ySousTitres(mise: MiseEnPage, gab?: { paysage: boolean; sousTitresY: readonly [number, number] }): number {
  if (gab?.paysage) return Y_SOUS_TITRES_PAYSAGE;
  if (gab) return Math.min(Math.max(ySousTitres(mise), gab.sousTitresY[0]), gab.sousTitresY[1]);
  if (mise.type === 'flou') return 0.66;
  if (mise.type === 'recadre') return 0.6;
  const part = mise.partCam ?? JEU_CAM.partCam;
  const y = mise.camEnHaut === false ? 1 - part : part;
  return Math.min(Math.max(y, SOUS_TITRES.yMin), SOUS_TITRES.yMax);
}
export const SON = { vol: 0.8, volMin: 0, volMax: 1.5 };
export const ZOOM = { dur: 0.6, durMin: 0.2, durMax: 5, x: 0.5, y: 0.5, force: 1.3, forceMin: 1.1, forceMax: 2.5, style: 'punch' as const };
export const GUIDE = { vol: 0.6, volMin: 0, volMax: 1 };

export const DUREE = { conseil: 180, bloquant: 600 };
/** Recette initiale d'une longue vidéo : on ne garde que les 60 premières secondes. */
export const DUREE_INITIALE = { seuil: 180, garde: 60 };

export const EXPORT_DEFAUT: Required<ReglagesExport> = { h: 1920, ips: 30, qualite: 'normale' };

/** Recette vide (sans source ni plan). */
export function recetteVide(): Recette {
  return {
    format: FORMAT_RECETTE,
    sources: [],
    plans: [],
    mise: { ...MISE_DEFAUT },
    textes: [],
    sousTitres: null,
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: { ...EXPORT_DEFAUT },
  };
}
