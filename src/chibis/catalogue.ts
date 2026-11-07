// Catalogue des chibis d'Arko (v3, partie D) : les IDENTIFIANTS des styles, émotions, coiffures, tenues et
// accessoires, et les palettes. Ce sont NOS personnages, dessinés par le code (CC0) : aucun dessin copié.
// Les listes sont lues par le normaliseur de la recette (un id inconnu est remplacé, avec un message).
// Contrat : conception/contrat-wankil.md §5. Dev 3 peut AJOUTER des ids à la fin ; jamais en retirer ni renommer
// (un montage enregistré les garde).

/**
 * Styles de dessin (chacun donne les 24 émotions × bouche ouverte / fermée). Les 3 premiers sont les chibis
 * d'origine (grosse tête) ; les 6 suivants (7/11/2026) sont les « Persos » aux proportions non-chibi.
 */
export const STYLES_CHIBI = ['feutre', 'crayon', 'paint', 'bd', 'cartoon', 'rate', 'mascotte', 'pixel', 'papier'] as const;
export type StyleChibi = (typeof STYLES_CHIBI)[number];

/** Les 6 styles « Persos » (proportions non-chibi), dans l'ordre de l'atelier. */
export const STYLES_PERSO = ['bd', 'cartoon', 'rate', 'mascotte', 'pixel', 'papier'] as const;
export type StylePerso = (typeof STYLES_PERSO)[number];

/**
 * Styles proposés dans l'atelier : « Papier découpé » (choisi par Romain le 7/11), puis les 3 chibis d'origine. Les 5
 * autres styles « Persos » (BD, dessin animé, raté, mascotte, pixel) restent dessinables (un montage qui les aurait
 * s'ouvre pareil) et testés, mais ne sont plus proposés.
 */
export const STYLES_ATELIER: readonly StyleChibi[] = ['papier', 'feutre', 'crayon', 'paint'];

/** Style d'un NOUVEAU perso et des persos tout prêts. */
export const STYLE_DEFAUT: StyleChibi = 'papier';

/** Un des 6 styles « Persos » ? */
export function estStylePerso(s: string): s is StylePerso {
  return (STYLES_PERSO as readonly string[]).includes(s);
}

/**
 * Les 24 émotions (variantes) d'un chibi. « parle » est l'émotion par défaut d'un tour de parole.
 * Chacune existe bouche ouverte et bouche fermée (animation façon PNGtuber).
 */
export const EMOTIONS = [
  'parle', 'rit', 'mortDeRire', 'crie', 'hurle', 'enerve', 'rage', 'choque', 'surpris', 'frime', 'moqueur', 'panique',
  'triste', 'pleure', 'gene', 'reflechit', 'confus', 'dort', 'content', 'amoureux', 'malade', 'determine', 'victoire', 'defaite',
] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** Coiffures (≥ 8). */
export const COIFFURES = ['courts', 'herisses', 'meche', 'longs', 'queue', 'chignon', 'afro', 'rase', 'bol', 'crete'] as const;
export type Coiffure = (typeof COIFFURES)[number];

/** Tenues (≥ 8). */
export const TENUES = ['sweat', 'tshirt', 'armure', 'astronaute', 'cowboy', 'pyjama', 'costume', 'ninja', 'sorcier', 'pirate', 'chemise'] as const;
export type Tenue = (typeof TENUES)[number];

/** Accessoires (≥ 8, sans compter « aucun »). */
export const ACCESSOIRES = ['aucun', 'casquette', 'casqueAudio', 'lunettes', 'lunettesSoleil', 'bandeau', 'couronne', 'bonnet', 'masque', 'echarpe', 'barbe', 'casquetteEnvers', 'capuche'] as const;
export type Accessoire = (typeof ACCESSOIRES)[number];

/**
 * Situations de jeu (7/11/2026, style « Papier découpé ») : un objet en main ou un décor léger, une pose des bras et
 * une émotion par défaut. OBJETS GÉNÉRIQUES, dessinés par le code : aucun dessin d'un jeu connu. « aucune » = juste
 * l'émotion. Ajouts en fin de liste seulement (un montage enregistré garde ses ids).
 */
export const SITUATIONS = [
  'aucune', 'epee', 'arc', 'bouclier', 'pioche', 'marteau', 'bombe', 'feu', 'peche', 'mange', 'potion', 'mort',
  'trophee', 'coffre', 'gemme', 'manette', 'lag', 'peur', 'afk', 'micro', 'soin', 'chute', 'court', 'frime',
] as const;
export type Situation = (typeof SITUATIONS)[number];

/** Formes des yeux (« Ressemble à… »). */
export const YEUX = ['ronds', 'points', 'fatigues', 'grands'] as const;
export type Yeux = (typeof YEUX)[number];

/** Palettes proposées (le normaliseur accepte toute couleur « #RRGGBB »). */
export const PEAUX = ['#FFE0C7', '#F6C9A0', '#E8B07E', '#C98A5A', '#A0663D', '#7A4A2A', '#5A3420', '#F2D2B6'] as const;
export const CHEVEUX = ['#1E1A18', '#4A2C1A', '#8A5A2B', '#D9A441', '#F2E07A', '#C0392B', '#2E86DE', '#8E44AD', '#27AE60', '#ECF0F1'] as const;
export const COULEURS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E', '#FF6FB5', '#FFFFFF'] as const;

/** Nombre de variantes d'un chibi (émotions × bouche ouverte / fermée) : 24 × 2 = 48 images par style. */
export const NB_VARIANTES = EMOTIONS.length;

/** Couleur « #RRGGBB » valide ? */
export function estCouleur(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
