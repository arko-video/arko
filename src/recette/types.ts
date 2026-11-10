// Types de la recette de montage Arko — format "arko.recette/1".
// La recette est la SEULE source de vérité d'un montage : l'interface et l'IA écrivent ce format,
// l'aperçu et l'export ne lisent que lui. Les champs des phases 2 à 6 existent déjà pour ne jamais
// avoir à changer le format ; le moteur de la phase 1 les ignore simplement.

import type { ModeSousTitres, PisteMusique, PlagePunchline, ReglagesBlancsRecette, ReglagesSections, RoleSon, Rognage, VolumeFinal, ZoomFixe } from './types-auto';

export type * from './types-auto';
// Ma bibliothèque (fonds verts, mèmes)
import type { Incrustation } from './types-bibliotheque';
export type * from './types-bibliotheque';
// Améliorer l'image
import type { ReglagesAmelioration } from '../moteur/amelioration/reglages';
// v3 « Best-of » (contrat : conception/contrat-wankil.md) : qui parle, avatars, derush, insertion, pistes, bips.
import type { Personne, ReglagesAvatars, ReglagesDerush, TourDeParole } from './types-voix';
import type { ElementInsere, ImageRecette, ReglagePistes, ReglagesBips } from './types-insertion';
export type * from './types-voix';
export type * from './types-insertion';

export const FORMAT_RECETTE = 'arko.recette/1';

/** Secondes, arrondies au 1/100. */
export type Sec = number;

export interface Recette {
  format: typeof FORMAT_RECETTE;
  titre?: string;
  sources: Source[];
  /** Morceaux gardés, dans l'ordre de la vidéo finale. */
  plans: Plan[];
  /** Mise en page par défaut de tous les plans. */
  mise: MiseEnPage;
  textes: Texte[]; // phase 2
  sousTitres: SousTitres | null; // phase 2
  sons: Son[]; // phase 3
  zooms: Zoom[]; // phase 3
  /** Son guide : joué dans l'aperçu, JAMAIS exporté (phase 3). */
  guide: SonGuide | null;
  /** Fin raccordée au début (phase 4). */
  boucle: boolean;
  /** Repères sur la frise : moments forts détectés (phase 4/6). */
  marqueurs?: Marqueur[];
  /** État d'un clip proposé par le monteur IA (phase 6). */
  statut?: 'brouillon' | 'garde' | 'jete';
  export: ReglagesExport;
  /** Où sera publiée la vidéo (absent = 'tiktok', comme tous les anciens projets). */
  destination?: 'tiktok' | 'youtube' | 'short';
  /** Chapitres YouTube (16:9) : temps de SORTIE du montage, sans compter l'intro. */
  chapitres?: Chapitre[];
  /** Intro et outro ajoutées au début et à la fin de la vidéo exportée (YouTube 16:9). */
  intro?: Generique;
  outro?: Generique;
  // Montage auto (novembre 2026), tous facultatifs : voir types-auto.ts.
  /** A. Les plans viennent de « Couper les blancs » (réglage et fondus du son aux coupes). */
  blancs?: ReglagesBlancsRecette;
  /** D. Bords d'écran enlevés, par source vidéo. */
  rognages?: Rognage[];
  /** F. Musique de fond (baisse automatique quand on parle). */
  musique?: PisteMusique;
  /** F. Volume final visé à l'export (−14 LUFS, −1,5 dBTP). */
  volumeFinal?: VolumeFinal;
  /** G. Titres de section à l'écran. */
  sections?: ReglagesSections;
  // Améliorer l'image (facultatif ; absent = « Non ») : voir moteur/amelioration/reglages.ts.
  amelioration?: ReglagesAmelioration;
  // Ma bibliothèque (facultatif) : fonds verts et mèmes posés par-dessus la vidéo, voir types-bibliotheque.ts.
  incrustations?: Incrustation[];
  // v3 « Best-of », tous facultatifs : voir types-voix.ts et types-insertion.ts.
  /** C. Les personnes qui parlent (Qui parle ?) et leur chibi. */
  personnes?: Personne[];
  /** C. Qui parle quand (temps source, suit les coupes). */
  paroles?: TourDeParole[];
  /** C. Avatars à l'écran (le chibi de la personne qui parle). */
  avatars?: ReglagesAvatars;
  /** C. Passages notés par le derush mais pas gardés (« Passages pas retenus »). */
  derush?: ReglagesDerush;
  /** B. Images fixes insérées (le fichier reste sur l'appareil). */
  images?: ImageRecette[];
  /** E. Pistes audio mixées, par source (vidéo à plusieurs pistes). */
  pistesAudio?: ReglagePistes[];
  /** E. Bip ou silence sur les gros mots. */
  bips?: ReglagesBips;
}

export interface Chapitre {
  t: Sec;
  nom: string;
}

/**
 * Intro ou outro. Soit un modèle animé dessiné par Arko (`modele` + nom de la chaîne),
 * soit une vidéo de l'utilisateur (`src` = id d'une source vidéo de la recette, gardée sur l'appareil).
 */
export interface Generique {
  modele?: 'abonne' | 'neon' | 'ecranFin';
  chaine?: string;
  /** Texte principal (ex. « Abonne-toi ! »). */
  texte?: string;
  src?: string;
  dur: Sec;
}

/** Une référence vers un fichier, jamais ses données. */
export interface Source {
  id: string; // "s1", "g1"…
  nom: string;
  taille: number; // octets
  /** Empreinte : hash(64 Kio du début + 64 Kio de la fin + taille), pour retrouver le fichier. */
  emp: string;
  duree: Sec;
  type: 'video' | 'audio';
  /** Dimensions affichées (après rotation). */
  l?: number;
  h?: number;
  /** Clip de Ma bibliothèque (fond vert, mème) : son identifiant là-bas (le fichier n'est pas copié dans le montage). */
  bib?: string;
  /** v3 (E) : nombre de pistes audio du fichier, seulement s'il y en a au moins 2 (information). */
  pistes?: number;
}

export interface Plan {
  /** Source du plan (défaut : première source vidéo). */
  src?: string;
  /** TEMPS SOURCE du début et de la fin du morceau gardé. */
  de: Sec;
  a: Sec;
  /** Vitesse, de 0,25 à 4 (défaut 1). */
  vit?: number;
  /** Transition pour ENTRER dans ce plan (ignorée sur le premier). Phase 3. */
  trans?: string | Transition;
  /** Remplace la mise en page globale pour ce plan (fusionnée si même type). */
  mise?: Partial<MiseEnPage> & { type: MiseEnPage['type'] };
  /** Id du moment d'origine (phase 6, information). */
  m?: string;
  /** Arrêt sur image : la dernière image du plan est figée pendant `fige` secondes, sans son (0,3 à 5 s). Phase 4. */
  fige?: Sec;
  /** C. Zoom fixe tenu sur tout le plan (« punch-in » des jump cuts). Montage auto. */
  zoomFixe?: ZoomFixe;
  /** v3 (B) : élément inséré entre deux parties (clip, image fixe, carton texte, chibi plein écran). */
  ins?: ElementInsere;
}

export interface Transition {
  type: string;
  dur?: Sec;
  /** Son assorti : absent = son par défaut de la transition, false = aucun. */
  son?: string | false;
}

export type MiseEnPage =
  /** Vidéo entière ajustée à la largeur + fond flou. y = centre vertical (0 à 1). */
  | { type: 'flou'; y?: number }
  /** Plein écran 9:16 recadré. x = centre du cadrage dans la source (0 à 1). */
  | { type: 'recadre'; x?: number }
  /** Jeu + webcam (phase 2). cam = rectangle de la webcam dans la source. */
  | { type: 'jeuCam'; cam: Cadre; x?: number; camEnHaut?: boolean; partCam?: number };

/** Rectangle en coordonnées normalisées (0 à 1) dans l'image source. */
export interface Cadre {
  x: number;
  y: number;
  l: number;
  h: number;
}

export interface Texte {
  txt: string;
  /**
   * "accroche" = le texte d'accroche du début (posé par l'outil Accroche).
   * "top3" = un numéro « #1 », « #2 », « #3 » posé par le modèle Top 3 (lui seul le retire).
   * "section" = un titre de section (G, Montage auto), posé et retiré par l'outil Titres de section.
   */
  role?: 'accroche' | 'top3' | 'section';
  style?: string;
  t: Sec;
  dur?: Sec;
  x?: number;
  y?: number;
}

/** Un mot de sous-titre : [texte, début source, fin source, mis en valeur]. */
export type Mot = [txt: string, ts: Sec, fin: Sec, fort?: 0 | 1];

export interface SousTitres {
  style?: string;
  y?: number;
  src?: string;
  parLigne?: number;
  /** "auto" = à transcrire par Arko (c'est ce qu'écrit l'IA). */
  mots: Mot[] | 'auto';
  /** B. 'punchlines' = seules les phrases fortes s'affichent (absent = 'tout'). */
  mode?: ModeSousTitres;
  /** B. Les punchlines gardées (temps source), en mode 'punchlines'. */
  punchlines?: PlagePunchline[];
  /** B. Couleur du mot clé d'une punchline (défaut 'jaune' #FFE500 ; 'rouge' #FF3030). */
  couleurCle?: 'jaune' | 'rouge';
  /** B. Jurons masqués à l'affichage (« P*TAIN ») : défaut oui. */
  jurons?: 'masques' | 'visibles';
  /**
   * Best-of : id d'une personne (`recette.personnes`) dont TOUTES les phrases sont sous-titrées (style boîte, en bas),
   * en plus des punchlines (mode 'punchlines') : la voix qu'on entend mal. Absent = personne.
   */
  pour?: string;
}

export interface Son {
  id: string;
  /** Temps de sortie OU temps source (ts prioritaire). */
  t?: Sec;
  ts?: Sec;
  src?: string;
  vol?: number;
  /** E/G. Qui l'a posé (absent = à la main) : permet de retirer d'un coup les bruitages auto. */
  role?: RoleSon;
  /** E. Durée jouée au plus (le son est coupé après, avec `fondu`). */
  dur?: Sec;
  /** E. Fondu de sortie quand le son est coupé par `dur` (défaut 0,3 s). */
  fondu?: Sec;
  /**
   * Pour quel genre de moment Arko l'a posé (accent : whoosh / pop / impact ; bruitage : rire, rate, explosion…).
   * Sert à apprendre : un son retiré d'un genre de moment n'est plus proposé POUR CE GENRE, il reste permis ailleurs.
   */
  pour?: string;
}

export interface Zoom {
  t?: Sec;
  ts?: Sec;
  src?: string;
  dur?: Sec;
  x?: number;
  y?: number;
  force?: number;
  style?: 'punch' | 'doux';
  /** En jeu + webcam : bande zoomée (défaut 'cam'). Ailleurs : 'tout'. Phase 3. */
  zone?: 'tout' | 'cam' | 'jeu';
}

export interface SonGuide {
  src: string;
  /** Où il démarre dans la vidéo finale. */
  t?: Sec;
  /** Où on commence à le lire dans le fichier son. */
  debut?: Sec;
  vol?: number;
}

export interface Marqueur {
  ts: Sec;
  src?: string;
  type: string; // "rire", "cri", "pic", "kill"…
  label?: string;
}

export interface ReglagesExport {
  /** 1920 = qualité normale (1080p), 1280 = 720p de secours (en 16:9 aussi : c'est la « petite » qualité). */
  h?: 1920 | 1280;
  ips?: 30;
  /** 'haute' en YouTube 16:9 : 2560 × 1440 si la vidéo d'origine le permet. */
  qualite?: 'normale' | 'haute';
}

/** Un problème trouvé (et souvent corrigé) par le normaliseur. Message en français. */
export interface Probleme {
  chemin: string; // ex. "plans[2].a"
  niveau: 'bloquant' | 'corrige' | 'ignore' | 'conseil';
  message: string;
}

/** Ce que le normaliseur sait des sources réellement ouvertes. */
export interface InfosSources {
  sources: Source[];
}
