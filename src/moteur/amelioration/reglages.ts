// Améliorer l'image — réglages (champ facultatif `recette.amelioration`) et choix du traitement (pur, testé).
// Pensé pour les captures de jeu (OBS 720p très compressé) : nettoyer les carrés de compression, agrandir ×2 en
// gardant les pixels nets, renforcer un peu les contours. Tout se fait sur l'appareil, rien n'est envoyé.

export type NiveauImage = 'leger' | 'fort';

/** Champ `recette.amelioration` (absent = « Non » : l'image est dessinée comme avant). */
export interface ReglagesAmelioration {
  niveau: NiveauImage;
  /** « Nettoyer la compression » : Restore CNN d'Anime4K (repli sans IA : déblocage). */
  nettoyer: boolean;
  /** « Agrandir avec l'IA » : Upscale CNN ×2 d'Anime4K, quand l'image est agrandie à l'écran (repli : bicubique). */
  agrandir: boolean;
}

export const AMELIORATION_DEFAUT: ReglagesAmelioration = { niveau: 'leger', nettoyer: true, agrandir: true };

/**
 * Ce que l'appareil sait faire : 'ia' = WebGL2 + rendu en nombres à virgule (les réseaux d'Anime4K) ;
 * 'classique' = WebGL2 sans rendu à virgule (repli SANS IA : déblocage, bicubique, contours) ; 'aucun' = pas de WebGL2.
 */
export type ModeMoteur = 'ia' | 'classique' | 'aucun';

/** Ce que fait la carte graphique pour une image. */
export interface PlanTraitement {
  mode: Exclude<ModeMoteur, 'aucun'>;
  /** Déblocage des carrés 8 × 8 (sans IA, d'abord). */
  deblocage: boolean;
  /** Restore CNN (IA), après le déblocage : part de la correction ajoutée (0 = pas de Restore). */
  nettoyage: number;
  /** Agrandissement ×2 : 'ia' (Upscale CNN), 'bicubique' (sans IA) ou null (pas d'agrandissement par Arko). */
  agrandissement: 'ia' | 'bicubique' | null;
  /** Renforcement des contours (0 = aucun, 1 = le plus fort). */
  contours: number;
}

/**
 * Forces par niveau (réglées sur une image de jeu mesurée, voir qualite.test.ts). Le déblocage sans IA protège les
 * textures du jeu ; le Restore d'Anime4K (seulement en Fort, à moitié) lisse davantage mais « peint » les textures.
 * Après l'agrandissement par l'IA, pas de renforcement en plus (les contours sont déjà nets).
 */
export const FORCES: Record<NiveauImage, { nettoyage: number; contoursSansAgrandir: number; contoursClassique: number }> = {
  leger: { nettoyage: 0, contoursSansAgrandir: 0.15, contoursClassique: 0.25 },
  fort: { nettoyage: 0.5, contoursSansAgrandir: 0.25, contoursClassique: 0.45 },
};

/** On agrandit ×2 seulement si l'image est agrandie à l'écran d'au moins 1,2 (même règle que les shaders d'Anime4K). */
export const ECHELLE_MIN_AGRANDIR = 1.2;
/** Au-delà (≈ 1080p), pas d'agrandissement ×2 : l'image serait énorme (4K) pour un gain faible, et trop lente. */
export const PIXELS_MAX_AGRANDIR = 1920 * 1088;
/** Au-delà (≈ 1440p), plus de réseau du tout (trop lent) : seulement le renforcement des contours. */
export const PIXELS_MAX_RESEAU = 2560 * 1440;

/** Le montage a-t-il l'amélioration de l'image ? */
export function ameliorationActive(r: { amelioration?: ReglagesAmelioration | undefined } | null | undefined): boolean {
  return !!r?.amelioration;
}

/**
 * Choisit le traitement d'une image de `l` × `h` pixels, dessinée agrandie `echelle` fois (pure).
 * null = rien à faire (pas de réglage, ou appareil sans WebGL2) : l'image est dessinée telle quelle.
 */
export function choisirPlan(
  reglages: ReglagesAmelioration | undefined,
  mode: ModeMoteur,
  l: number,
  h: number,
  echelle: number,
): PlanTraitement | null {
  if (!reglages || mode === 'aucun' || l <= 0 || h <= 0) return null;
  const f = FORCES[reglages.niveau] ?? FORCES.leger;
  const pixels = l * h;
  const reseau = mode === 'ia' && pixels <= PIXELS_MAX_RESEAU;
  const agrandir = reglages.agrandir && echelle >= ECHELLE_MIN_AGRANDIR && pixels <= PIXELS_MAX_AGRANDIR;
  const plan: PlanTraitement = {
    mode: reseau ? 'ia' : 'classique',
    deblocage: reglages.nettoyer && pixels <= PIXELS_MAX_RESEAU,
    nettoyage: reseau && reglages.nettoyer ? f.nettoyage : 0,
    agrandissement: agrandir ? (reseau ? 'ia' : 'bicubique') : null,
    contours: !reseau ? f.contoursClassique : agrandir ? 0 : f.contoursSansAgrandir,
  };
  return plan;
}

/** Facteur d'agrandissement du résultat (1 ou 2). */
export function facteurDuPlan(p: PlanTraitement): 1 | 2 {
  return p.agrandissement ? 2 : 1;
}

/** Clé courte d'un plan (pour garder les programmes et le résultat d'une image déjà traitée). */
export function clePlan(p: PlanTraitement): string {
  return `${p.mode}:${p.nettoyage}:${p.deblocage ? 1 : 0}:${p.agrandissement ?? '-'}:${p.contours}`;
}
