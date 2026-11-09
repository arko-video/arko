// CONTRAT entre l'interface (src/ui) et le moteur (src/moteur, src/recette, src/stockage).
// L'interface n'importe QUE depuis ce fichier et depuis src/recette (types, operations, normaliser).
// Le développeur moteur implémente ces fonctions (ici ou en réexportant depuis d'autres fichiers)
// sans changer leurs signatures. Toute erreur destinée à l'utilisateur est une ErreurArko
// dont le message est déjà en français, prêt à afficher.

import type { Recette, Sec, Source } from '../recette/types';
import type { BilanSonie } from './audio/sonie';

export { ErreurArko } from './erreurs';
/** Montage auto (F) : volume final mesuré à l'export. */
export type { BilanSonie, MesureSonie } from './audio/sonie';

/* ------------------------------------------------------------------ capacités */

export interface Capacites {
  webcodecs: boolean;
  contexteSecurise: boolean;
  opfs: boolean;
  partageFichiers: boolean;
  wakeLock: boolean;
  /** Message bloquant à afficher si Arko ne peut pas fonctionner ici, sinon null. */
  bloquant: string | null;
}
export { capacites } from './capacites';

/* ------------------------------------------------------------------ sources */

/** Une source ouverte et prête à être lue (le contenu interne est privé au moteur). */
export interface SourceOuverte {
  infos: Source;
  /** true si la vidéo est déjà verticale (hauteur > largeur) : l'étape Vertical est sautée. */
  verticale: boolean;
  /** Fichier d'origine. */
  fichier: File;
}

/**
 * Ouvre une vidéo choisie par l'utilisateur : analyse, contrôle du codec, empreinte.
 * `onEtape` reçoit des messages de progression en français (« Je prépare ta vidéo… »).
 * Lève ErreurArko (codes : "format", "codec_video", "pas_de_video", "lecture").
 */
export { ouvrirSource } from './sources';

/** Ferme une source (libère la mémoire). */
export { fermerSource } from './sources';

/** Recette initiale pour une source : un plan [0, durée] (ou [0, 60] si > 180 s), mise en page fond flou. */
export { recetteInitiale } from './sources';

/** Dessine une vignette de la source à l'instant ts (pour la frise). */
export { vignette } from './sources';

/* ------------------------------------------------------------------ aperçu */

export interface Lecteur {
  /** Charge (ou recharge après une modification) la recette à lire. Garde la position si possible. */
  charger(recette: Recette, sources: SourceOuverte[]): void;
  lire(): void;
  pause(): void;
  /** Va au temps t du montage (de `debut` à `duree`) et affiche l'image correspondante. */
  aller(t: Sec): void;
  /** Temps du MONTAGE (0 = début du montage) : négatif pendant l'intro, au-delà de la fin pendant l'outro. */
  readonly temps: Sec;
  /** Fin de la vidéo (outro comprise), en temps du montage. */
  readonly duree: Sec;
  /** Début de la vidéo (intro comprise) : −durée de l'intro, 0 sans intro. */
  readonly debut: Sec;
  readonly enLecture: boolean;
  /** Appelé à chaque changement de temps ou d'état (lecture/pause). Renvoie une fonction de désabonnement. */
  surChangement(cb: () => void): () => void;
  detruire(): void;
}
/** Crée un lecteur qui dessine l'aperçu 9:16 dans ce canvas. */
export { creerLecteur } from './lecteur';

/* ------------------------------------------------------------------ export */

export interface EstimationExport {
  duree: Sec;
  tailleOctets: number;
  /** Place libre estimée sur l'appareil (null si inconnue). */
  placeLibreOctets: number | null;
  /** true si la place libre est insuffisante. */
  manqueDePlace: boolean;
}
export { estimerExport } from './export/client';

export interface ResultatExport {
  fichier: File;
  qualite: '1080p' | '720p' | '1440p';
  largeur: number;
  hauteur: number;
  /** Message à afficher à l'utilisateur si l'export a réussi avec un défaut (ex. son illisible : vidéo muette). */
  avertissement?: string;
  /** Montage auto (F, dev 3) : volume mesuré et corrigé à l'export, si `recette.volumeFinal` est réglé. */
  sonie?: BilanSonie;
}

export interface ExportEnCours {
  /** p de 0 à 1 ; resteS = secondes restantes estimées (null au début). */
  surProgression(cb: (p: number, resteS: number | null) => void): void;
  annuler(): void;
  /** Résolu avec le fichier final, ou rejeté avec ErreurArko (code "annule" si annulé). */
  resultat: Promise<ResultatExport>;
}
/** Lance l'export MP4 (Worker + OPFS + cascade d'encodage). Le son guide est retiré. */
export { lancerExport } from './export/client';

/* ------------------------------------------------------------------ projet (sauvegarde auto) */

export interface ProjetSauvegarde {
  recette: Recette;
  /** Étape où l'utilisateur s'était arrêté ("couper", "vertical", "exporter"). */
  etape: string;
  modifieLe: number; // Date.now()
  /** Petite image de la vidéo pour la carte « Reprendre » (data:image/jpeg;base64,…, 24 Ko max). */
  vignette?: string;
}
export { sauverProjet } from '../stockage/projet';
export { chargerProjet } from '../stockage/projet';
export { effacerProjet } from '../stockage/projet';
/** Vérifie qu'un fichier re-choisi est bien la source attendue (même empreinte). */
export { memeSource } from '../stockage/fichiers';

/* ------------------------------------------------------------------ phase 2 : habillage */

/** Rectangle en coordonnées normalisées (0 à 1) de l'image 9:16 finale. */
export interface Boite {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Boîte d'un texte visible : `i` = indice dans recette.textes. */
export interface BoiteTexte extends Boite {
  i: number;
}

/**
 * Boîtes des textes visibles au temps de sortie t (même mise en page que le dessin) :
 * l'interface s'en sert pour toucher et faire glisser un texte sur l'aperçu. Polices supposées prêtes.
 */
export { boitesTextes } from './couches/textes';

/** Résolue quand les polices des textes sont chargées (à attendre avant le premier dessin avec texte). */
export { policesPretes } from './polices';

/** true si le texte contient des émojis (non dessinés en phase 2 : l'interface prévient). */
export { contientEmoji } from './couches/textes';

/** État du module sous-titres (modèle Whisper) sur l'appareil. */
export interface ModuleSousTitres {
  /** true si le modèle est déjà téléchargé (marche sans internet). */
  present: boolean;
  /** Taille à télécharger, en octets (environ 90 Mo). */
  tailleOctets: number;
}

export interface OptionsSousTitres {
  /** "fr" par défaut ; "auto" = détection de la langue. */
  langue?: string;
  /** p de 0 à 1, etape = message français (« Je télécharge le module… », « J'écoute ta vidéo… »). */
  surProgression?: (p: number, etape: string) => void;
  signal?: AbortSignal;
}

/** Le module est-il déjà là ? */
export { moduleSousTitres } from '../sous-titres/client';
/** Télécharge le module (après accord de l'utilisateur). Lève ErreurArko (codes "reseau", "place", "annule"). */
export { telechargerModuleSousTitres } from '../sous-titres/client';
/**
 * Transcrit le son des plans gardés de la recette et renvoie les mots en TEMPS SOURCE,
 * hallucinations filtrées, mots forts marqués, corrections mémorisées appliquées.
 * Télécharge le module s'il manque. Lève ErreurArko (codes "annule", "pas_de_son", "module", "reseau").
 */
export { transcrireRecette } from '../sous-titres/client';
/** Mémorise une correction (« jlb » → « JLB ») pour les prochaines transcriptions. */
export { memoriserCorrection } from '../sous-titres/corrections';
/** Corrections mémorisées, pour les afficher : [{ avant (en minuscules, sans ponctuation), apres }]. */
export { listerCorrections } from '../sous-titres/corrections';
/** Oublie une correction mémorisée (les prochaines transcriptions ne la font plus). */
export { oublierCorrection } from '../sous-titres/corrections';

/* ------------------------------------------------------------------ phase 3 : sons, transitions, zooms, son guide */

/** Catalogue des effets sonores (synthétisés par Arko, CC0) et leurs familles. */
export { CATALOGUE as catalogueSons, FAMILLES as famillesSons, type SonCatalogue } from '../sons/catalogue';

/**
 * Joue un son seul pour l'écouter (catalogue : id « famille.nom » ; son importé : la SourceOuverte).
 * Renvoie une fonction pour l'arrêter.
 */
export { ecouterSon } from '../sons/ecoute';

/**
 * Ouvre un son choisi par l'utilisateur (MP3, M4A, WAV, OGG, ou le son d'une vidéo, ou un enregistrement du micro).
 * Renvoie une SourceOuverte de type 'audio' (à ajouter à la recette avec ajouterSource).
 * Lève ErreurArko (codes "format", "pas_de_son", "trop_long" au-delà de 10 min).
 */
export { importerSon } from '../sons/import';

/* ------------------------------------------------------------------ Mes sons (sons gardés pour tous les projets) */

/** « Mes sons » (sons gardés pour tous les projets) : lister, garder, lire, modifier, supprimer. */
export {
  garderMonSon,
  LIMITE_MES_SONS,
  listerMesSons,
  lireMonSon,
  modifierMonSon,
  nomDepuisFichier,
  supprimerMonSon,
  type MonSon,
} from '../stockage/mes-sons';
/** Ma bibliothèque : rayon d'un son (Bruitages ou Musiques). */
export { rayonDuSon, type RayonSon } from '../stockage/mes-sons';
/** Un son du rayon Bruitages (« Mes sons ») ? */
export const estBruitage = (s: { rayon?: string }) => s.rayon !== 'musiques';
/** Import de plusieurs sons (fichiers ou .zip) dans Mes sons ; vérifier qu'un fichier est un son lisible. */
export { importerDansMesSons, verifierSon, type BilanImport } from '../sons/mes-sons-import';
/** Recherche par mot (sans accents) : chercher(éléments, requête, (e) => ({ nom, autres })). */
export { chercher } from '../sons/recherche';
/** Sons reçus par « Partager → Arko » (déposés sur l'appareil par le service worker). */
export { lireSonsPartages, viderSonsPartages } from '../stockage/partage';

/** Temps forts (attaques rythmiques) d'une source audio, en secondes dans le fichier : pour le son guide. */
export { tempsForts } from '../sons/rythme';

/**
 * Pour le dev sons : ouvre un son (fichier audio ou son d'une vidéo) comme source 'audio' d'id donné,
 * enregistrée dans le moteur (l'aperçu et l'export savent alors la mixer). Lève ErreurArko ("format", "lecture", "pas_de_son").
 */
export { ouvrirSourceAudio } from './sources';

/**
 * importerSon(fichier, idsPris?) : passer les ids des sources de la recette (recette.sources.map((s) => s.id))
 * pour que le son reçoive le premier id « aN » libre (aucune collision, même après un rechargement).
 */

/** Garde sur l'appareil (IndexedDB, rangé par empreinte) le fichier d'une source audio importée : à appeler après importerSon. */
export { sauverFichierAudio } from '../stockage/sons';

/**
 * À la reprise : rouvre les sources audio de la recette depuis l'appareil, avec leur id d'origine.
 * `manquants` = ids des sources audio introuvables (à redemander à l'utilisateur).
 */
export { rouvrirSourcesAudio } from '../stockage/sons';

/**
 * Nettoyage des fichiers audio gardés : on ne garde que ceux utilisés par les recettes données
 * (TOUS les projets sauvegardés) ou importés il y a moins d'une heure, et 200 Mo au plus (les plus anciens partent).
 * À appeler après une sauvegarde ou une suppression de projet. Renvoie le nombre de fichiers retirés.
 */
export { nettoyerFichiersAudio } from '../stockage/sons';

/* ------------------------------------------------------------------ phase 4 : rythme, mes montages */

/**
 * Pics sonores de la vidéo finale (temps de SORTIE, triés), calculés sur le son des plans gardés :
 * pour aimanter les combos et pour l'alerte de rythme. Mis en cache par source et par plage.
 */
export { picsSonores, picsSonoresForts } from './audio/pics';

/** « Mes montages » : liste, ouverture, renommage, copie, suppression. */
export {
  listerProjets,
  ouvrirProjet,
  nouveauProjet,
  renommerProjet,
  dupliquerProjet,
  supprimerProjet,
  type ResumeProjet,
} from '../stockage/projets';

/* ------------------------------------------------------------------ phase 6 : monteur IA */

/** Analyse d'une longue source (moments forts) et mode sans IA. */
export * from '../ia/api-ia';
/** Agent IA : fournisseurs, clé API (sur l'appareil), consignes, requête, lecture des réponses. */
export * from '../ia/api-agent';

/* ------------------------------------------------------------------ YouTube : miniature, intro / outro */

/** Miniature : taille selon la destination, image du montage, habillage (gros texte, émoji, flèche), encodage < 2 Mo. */
export {
  dessinerHabillageMiniature,
  dessinerPersosMiniature,
  EMOJIS_MINIATURE,
  encoderSousLimite,
  imageDuMontage,
  MINIATURE,
  tailleMiniature,
  type ReglagesMiniature,
  type StyleMiniature,
} from './miniature';
/** Dessin d'un modèle d'intro / outro (le même que dans l'export). */
export { dessinerGenerique } from './couches/generique';
export { envPour } from './canevas';
/** « Mes génériques » : intros et outros gardées sur l'appareil. */
export { fichierGenerique, garderGenerique, listerGeneriques, supprimerGenerique, type MonGenerique } from '../stockage/generiques';

/* ------------------------------------------------------------------ Ma bibliothèque (fonds verts, mèmes) */

/** Clips vidéo gardés sur l'appareil (rayons Fonds verts et Mèmes). */
export { ficheClip, listerClips, lireClip, modifierClip, placeLibre, supprimerClip, type MonClip } from '../stockage/clips';
export * from './api-v3'; // v3 « Best-of » : images insérées, pistes audio, chibis (contrat-wankil.md)
