// Types COMMUNS de la v4 « Best-of serré sans IA » (vague 2), partagés par les devs, dev-musique et l'intégrateur.
// Contrat : /home/claude/equipe/CONTRAT.md (écrit par l'architecte le 7/11/2026 ; résumé dans docs/passation.md à
// l'intégration). Fichier GELÉ pendant la vague 2 : un changement se demande à l'intégrateur (rapport → « Demandes
// aux autres »). Temps = TEMPS SOURCE (secondes dans la vidéo d'origine) sauf mention contraire.
// RIEN ici n'est écrit dans la recette : la recette `arko.recette/1` ne gagne qu'UN champ facultatif en v4
// (`musique.baisseSur`, voir ChampsRecetteV4, ajouté par dev-musique dans src/recette/types-auto.ts).

import type { AnalyseBestOf, ReglagesBestOf, SceneBestOf } from './express/best-of';
import type { ReglagesExpress } from './express/express';
import type { ReglagesBlancs } from './coupes/reglages';
import type { ForceZoomsAuto } from './habillage/zooms-auto';
import type { DefinitionChibi, Mot, NiveauBlancs, PassageNote, PisteMusique, Recette, Rognage, Sec, Source } from '../recette/types';
import type { Morceau, PlageTemps, SignauxSource, Transcription } from './types';
import type { EmpreintesVoix, EnveloppeDb, VoixDetectees } from './types-v3';

export type { ReglagesBestOf, ReglagesExpress };

/* ================================================================== A. Petits modèles sur l'appareil (dev-vad) */

/** Les modèles ONNX qu'Arko peut télécharger UNE fois (après accord), en plus de Whisper. Fiches : modeles/catalogue.ts. */
export type IdModele = 'vad' | 'empreinte' | 'vision';

/**
 * État d'un module pour CE Best-of : 'present' = sur l'appareil ; 'absent' = jamais téléchargé (à proposer) ;
 * 'refuse' = l'utilisateur a dit « Pas maintenant » (pour cette ouverture du Montage express) ; 'horsLigne' = pas de
 * connexion pour le télécharger ; 'erreur' = téléchargement ou chargement raté (message dans les avertissements).
 */
export type EtatModule = 'present' | 'absent' | 'refuse' | 'horsLigne' | 'erreur';

/** Les 3 modules du Best-of : Whisper (≈ 90 Mo, punchlines + sous-titres), la VAD (2,2 Mo), l'empreinte (28 Mo, facultative). */
export interface ModulesBestOf {
  whisper: EtatModule;
  vad: EtatModule;
  empreinte: EtatModule;
}

/** Ce que l'écran Réglages doit faire des modules (chaine-best-of.ts → decisionModules, pur). */
export interface DecisionModules {
  /** Modules à proposer d'un seul accord avant l'analyse (jamais l'empreinte : elle se propose sur la revue). */
  aProposer: ('whisper' | 'vad')[];
  /** Taille annoncée de ce qui est proposé (octets). */
  octets: number;
  /** Ce que donnera l'analyse avec les modules présents : 'mots' (Whisper) ou 'voix' (sans texte). */
  parole: 'mots' | 'voix';
  /**
   * Ce qui manquera tant que ces modules ne sont pas là (codes : l'interface écrit les phrases dans ses textes) :
   * 'textes' = ni punchlines ni sous-titres (pas de Whisper) ; 'precision' = coupes et voix moins justes (pas de VAD).
   */
  manques: ('textes' | 'precision')[];
}

/* ================================================================== B. ONNX (même code dans le navigateur et le banc) */

/** Un tenseur, sans dépendre d'onnxruntime-web ni d'onnxruntime-node (les adaptateurs convertissent). */
export interface TenseurOnnx {
  type: 'float32' | 'int64';
  data: Float32Array | BigInt64Array;
  dims: readonly number[];
}

/**
 * Une session ONNX ouverte : onnxruntime-web WASM 1 fil dans un Worker (dev-vad, modeles/onnx-web.ts), ou
 * onnxruntime-node dans le banc (dev-banc, tests/banc-reel/chaine/adaptateurs/onnx-node.ts). Le code des modèles
 * (vad/silero.ts, voix/empreinte-neurale.ts) ne voit QUE cette interface : il est testable avec une fausse session.
 */
export interface SessionOnnx {
  run(entrees: Readonly<Record<string, TenseurOnnx>>): Promise<Record<string, TenseurOnnx>>;
  /** Libère la mémoire (un modèle à la fois dans un Worker). */
  release?(): Promise<void>;
}

/* ================================================================== C. Parole (dev-vad) */

/** Probabilités de voix de Silero VAD v5 : une trame de 32 ms (512 échantillons à 16 kHz) par case. */
export interface ProbasVad {
  src: string;
  /** Pas d'une case (0,032 s). La case k couvre [k × pas, (k + 1) × pas[. */
  pas: Sec;
  /** Probabilité × 255, arrondie (2 h ≈ 225 000 octets). Une case jamais calculée vaut 0. */
  p: Uint8Array;
  /** Parties réellement passées dans le modèle (le silence numérique sauté n'y est pas : p = 0 là). */
  plages: PlageTemps[];
  /** Fichier du modèle (catalogue) : 'silero-vad-v5' (défaut) ou 'silero-vad-v6' (essai). */
  modele: string;
}

/** Un segment de parole (temps source). `p` = probabilité moyenne (1 pour un repli sans modèle). */
export interface SegmentParole extends PlageTemps {
  p: number;
}

/**
 * Où quelqu'un parle, sur toute la source. 'vad' = Silero ; 'sans-modele' = repli sur l'énergie de la bande voix
 * (VAD refusée ou hors ligne) ; 'mots' = repli sur les mots de Whisper (ni VAD ni énergie).
 */
export interface ParoleDetectee {
  src: string;
  methode: 'vad' | 'sans-modele' | 'mots';
  /** Segments triés, sans chevauchement. */
  segments: SegmentParole[];
  /** Les probabilités (seulement avec la VAD) : coupes « jamais dans la parole », bouche, rires. */
  probas: ProbasVad | null;
  /** Part de la source où l'on parle (0 à 1). */
  part: number;
}

/** Réglages de la découpe en segments (règle 8 des références ; réglages officiels de Silero). */
export interface ReglagesVad {
  /** Entrée dans la parole (p ≥ entree) et sortie (p < sortie). */
  entree: number;
  sortie: number;
  /** Parole retenue si elle dure au moins `paroleMin` s ; elle finit après `silenceMin` s sous `sortie`. */
  paroleMin: Sec;
  silenceMin: Sec;
  /** Marge ajoutée de chaque côté d'un segment (s). */
  marge: Sec;
  /** Deux segments à moins de `trouMax` s n'en font qu'un. */
  trouMax: Sec;
}

/** Ce que reçoit l'étape « parole ». */
export interface EntreeParole {
  src: string;
  duree: Sec;
  vad: ProbasVad | null;
  /** Énergie de la bande voix 300–3400 Hz (empreintes de la piste principale), pour le repli sans modèle. */
  energie: EnveloppeDb | null;
  signaux: SignauxSource;
  /** Mots de Whisper (dernier repli, et mode d'avant la v4). */
  mots: readonly Mot[] | null;
}

/* ================================================================== D. Mesures du son (dev-vad : passe du son ; dev-voix : empreintes) */

/** Hauteur de la voix (f0) toutes les `pas` s, seulement sur la parole (0 = pas voisé ou pas calculé). Facultative. */
export interface HauteurVoix {
  pas: Sec;
  /** Hz. */
  f0: Float32Array;
}

/** L'empreinte neuronale (CAM++, 192 valeurs normées L2) d'un morceau de parole. */
export interface EmpreinteMorceau extends PlageTemps {
  v: Float32Array;
}

export interface EmpreintesNeurales {
  /** Id du catalogue (« campplus-zh-en »). */
  modele: string;
  morceaux: EmpreinteMorceau[];
}

/**
 * TOUT ce que l'appareil a mesuré d'une source, avant la chaîne pure. Rempli dans le navigateur par
 * mesurerPourBestOf (express/mesures-best-of.ts, dev-vad) et dans le banc par les mêmes fonctions (faux Workers).
 */
export interface MesuresSource {
  src: string;
  duree: Sec;
  /** Enveloppe 20 ms, pics, cris et rires d'AVANT la v4 (ia/signaux, ia/rires), passages muets. */
  signaux: SignauxSource;
  /** Niveau + timbre (8 bandes 300–3400 Hz) toutes les 20 ms ; [0] = piste principale (le mélange). */
  empreintes: EmpreintesVoix[];
  /** true : `empreintes` vient de 2 pistes ou plus (OBS micro + Discord) = une voix par piste, exact. */
  pistesSeparees: boolean;
  vad: ProbasVad | null;
  hauteur: HauteurVoix | null;
  /** Mots de Whisper (déjà `nettoyer` + corrections), null = pas de transcription (refus, hors ligne, décoché). */
  transcription: Transcription | null;
  /** 2ᵉ passe facultative (empreinte CAM++ des morceaux demandés par besoinsChaine). */
  neurales: EmpreintesNeurales | null;
  cadreBords: Omit<Rognage, 'src'> | null;
  modules: ModulesBestOf;
  /** Messages pour l'utilisateur (passages muets, module refusé, écoute ratée…). */
  avertissements: string[];
}

/**
 * Ajouts v4 au protocole du Worker « Qui parle » (auto/voix/worker-voix.ts : DemandeEmpreintes / message 'fini'),
 * écrits par dev-vad ; le faux Worker du banc (dev-banc) répond EXACTEMENT pareil (depuis ses caches). Champs
 * facultatifs : une ancienne demande donne l'ancienne réponse.
 */
export interface DemandePasseSonV4 {
  /** Passer la VAD : le Worker lit lui-même le modèle (modeles/modeles.ts → lireModele('vad')). */
  vad?: boolean;
  /** Mesurer la hauteur de la voix (sur la parole seulement). */
  hauteur?: boolean;
}
export interface ResultatPasseSonV4 {
  /** null : VAD demandée mais impossible (modèle absent ou illisible) → `avertissement`. */
  vad?: Omit<ProbasVad, 'src'> | null;
  hauteur?: HauteurVoix | null;
  avertissement?: string;
}

/** Worker de l'empreinte de voix (auto/voix/worker-empreintes.ts, dev-voix) ; le banc répond pareil (onnxruntime-node). */
export interface DemandeEmpreintesNeurales {
  fichier: Blob;
  duree: Sec;
  /** Morceaux de parole (temps source), 0,6 à 3 s chacun. */
  morceaux: PlageTemps[];
}
export type DepuisWorkerEmpreintesNeurales =
  | { type: 'progression'; p: number }
  /** `v` = n × dim valeurs (n = nombre de morceaux, dans l'ordre), chaque empreinte normée L2. */
  | { type: 'fini'; modele: string; dim: number; v: Float32Array }
  | { type: 'erreur'; message: string; code: string };

/**
 * Ce que l'appareil garde d'une vidéo après l'analyse (IndexedDB, clé `arko.mesures.<emp>`, dev-vad) pour RECOUPER
 * après coup (Habiller → Couper, « Passages pas retenus → Ajouter ») sans réécouter la vidéo.
 */
export interface MesuresGardees {
  v: 1;
  vad: Omit<ProbasVad, 'src'> | null;
  /** Énergie de la bande voix (piste principale), 20 ms. */
  energie: EnveloppeDb | null;
  hauteur: HauteurVoix | null;
}

/** Ce que la chaîne demande de mesurer en plus (pur, chaine-best-of.ts → besoinsChaine). */
export interface BesoinsChaine {
  /** Zones à faire écouter à Whisper : segments de parole + 0,3 s de chaque côté, trous < 1 s bouchés. */
  transcrire: PlageTemps[];
  /** Morceaux dont il faudrait l'empreinte CAM++ (vide = inutile). */
  empreintes: PlageTemps[];
  /** Pourquoi l'empreinte aiderait (message de la revue) ; null = elle n'apporterait rien. */
  raisonEmpreinte: 'memeNiveau' | 'ambigus' | null;
}

/* ================================================================== E. Mots de Whisper (dev-mots) */

export interface EntreeMots {
  /** Mots de la transcription (temps source, triés ou non). */
  mots: readonly Mot[];
  /** Parties transcrites (hors de là : aucun mot n'est attendu). */
  plages: readonly PlageTemps[];
  parole: ParoleDetectee;
  /** Énergie de la bande voix (20 ms) : recaler un mot sur la fin de la voix. */
  energie: EnveloppeDb | null;
}

/** Ce que le nettoyage a fait (comptes seulement : jamais de texte, ça part dans le banc). */
export interface BilanMots {
  avant: number;
  apres: number;
  /** Piles (≥ 3 mots au même instant) trouvées, et mots qu'elles contenaient. */
  piles: number;
  motsDePiles: number;
  /** Mots de piles gardés et répartis dans un segment de parole voisin. */
  repartis: number;
  /** Mots retirés parce qu'aucune parole n'est entendue autour (hallucinations), ou une parole inaudible (bruit lointain). */
  horsParole: number;
  /** Mots étirés (> 0,8 s) raccourcis à la fin de la voix. */
  etires: number;
  /** Mots dont un bord a été recalé sur la parole. */
  recales: number;
}

export interface MotsNettoyes {
  /** Triés par début, sans durée nulle. Le 4ᵉ champ (`fort`) est gardé. */
  mots: Mot[];
  bilan: BilanMots;
}

/* ================================================================== F. Qui parle (dev-voix) */

/** Comment les voix ont été séparées (détail de la v4, en plus de VoixDetectees.methode). */
export interface SeparationVoix {
  par: 'pistes' | 'niveau' | 'niveau+empreinte' | 'empreinte' | 'timbre' | 'une';
  /** Seuil de niveau entre les 2 voix (dB, bande voix, 90ᵉ centile par morceau) ; null sans séparation par niveau. */
  seuilDb: number | null;
  /** Écart entre les niveaux habituels des 2 voix (dB). */
  ecartDb: number | null;
  /** Cosinus entre les 2 centres d'empreintes (2 voix si < 0,68) ; null sans empreinte. */
  cosinusCentres: number | null;
  /** Part du temps de parole dont le niveau est ambigu (à ± 3 dB du seuil). */
  ambigu: number;
  /** Nombre de morceaux de parole classés. */
  morceaux: number;
  /** Conseil pour la revue : proposer l'empreinte de voix (28 Mo) ; null = inutile. */
  proposerEmpreinte: 'memeNiveau' | 'ambigus' | null;
}

/**
 * Qui parle en v4 : le même objet que la v3 (l'interface, poserPersos et le banc le lisent tel quel) + le détail.
 * `methode` reste une valeur de la v3 : 'niveau' et 'niveau+empreinte' → 'niveau+timbre' ; 'empreinte' → 'timbre'.
 * Ordre des voix : p1 = la voix la plus FORTE (elle va à gauche, comme Guts dans la DA), p2 la suivante…
 */
export interface VoixDetecteesV4 extends VoixDetectees {
  separation: SeparationVoix;
}

export interface EntreeVoix {
  src: string;
  empreintes: readonly EmpreintesVoix[];
  pistesSeparees: boolean;
  parole: ParoleDetectee;
  neurales: EmpreintesNeurales | null;
  /** L'utilisateur a dit sur la revue « une seule personne » (1) ou « deux personnes » (2). */
  forcer?: 1 | 2;
}

/* ================================================================== G. Moments forts (dev-moments) */

export type GenreMoment = 'rire' | 'fouRire' | 'cri' | 'exclamation' | 'phraseForte' | 'juron' | 'sonFort' | 'calmePuisPic' | 'echanges';

/** Un moment fort (temps source). Remplace, dans la v4, les rires / cris d'ia/rires.ts et ia/signaux.ts. */
export interface MomentV4 extends PlageTemps {
  genre: GenreMoment;
  /** Sommet (s). */
  t: Sec;
  /** Force RELATIVE à la session, de 0 à 1 (rang dans la session, pondéré par le genre). */
  force: number;
  /** Personne (id de voix) si on le sait. */
  p?: string;
  /** Indices qui l'ont déclenché (« voix sans mots », « +9 dB », « hauteur ×1,4 »…) : pour le banc, jamais affichés tels quels. */
  indices: string[];
}

export interface EntreeMoments {
  /** Signaux d'AVANT la v4 (enveloppe, pics, et anciens rires / cris à ne pas croire). */
  signaux: SignauxSource;
  parole: ParoleDetectee;
  /** Mots propres (vides en mode voix). */
  mots: readonly Mot[];
  voix: VoixDetecteesV4 | null;
  energie: EnveloppeDb | null;
  hauteur: HauteurVoix | null;
}

/* ================================================================== H. Séquences (dev-scenes) */

/**
 * Une séquence du Best-of v4 : une HISTOIRE (mise en place → moment → réaction → chute) de 30 à 120 s de source.
 * Reste une SceneBestOf (l'écran de revue et le banc la lisent telle quelle) : `de`/`a` = mise en place → chute,
 * `duree` = durée APRÈS coupes (même fonction que le montage), `score` = centile, `garde` = cochée.
 */
export interface SequenceV4 extends SceneBestOf {
  /** Le moment fort au cœur de l'histoire. */
  coeur: PlageTemps;
  /** Note brute, sans plafond (sert au choix et au départage ; jamais l'ordre chronologique). */
  noteBrute: number;
  /** Rang dans la session, 0 à 100 (affiché ; = `score`). */
  centile: number;
  /** Bloc de 20 min de son actif où elle tombe (répartition sur toute la session). */
  bloc: number;
  /** Indices des moments (dans AnalyseV4.moments) qu'elle contient. */
  moments: number[];
}

export interface EntreeSequences {
  src: string;
  duree: Sec;
  mots: readonly Mot[];
  parole: ParoleDetectee;
  moments: readonly MomentV4[];
  voix: VoixDetecteesV4 | null;
  signaux: SignauxSource;
  /** Niveau de la bande de la voix (mélange des pistes) : la parole d'une séquence doit être audible. Absent : le volume. */
  energie?: EnveloppeDb | null;
  /** Durée visée des séquences APRÈS coupes (accroche déjà déduite), s. */
  dureeVisee: Sec;
  /** Durée qu'auraient ces plages APRÈS coupes : c'est la MÊME fonction que le montage (pas d'écart revue / montage). */
  dureeDe: (plages: readonly PlageTemps[]) => Sec;
}

export interface ChoixSequences {
  /** Toutes les séquences proposées, dans l'ordre chronologique ; `garde` = choisie. */
  scenes: SequenceV4[];
  /** « Passages pas retenus » (Couper → Ajouter), triés par note, 100 au plus. */
  passages: PassageNote[];
}

/* ================================================================== I. Coupes (dev-coupes) */

/** Réglages des coupes v4 = ceux de Couper les blancs (marges de la DA en « normal ») + la VAD et les creux. */
export interface ReglagesCoupesV4 extends ReglagesBlancs {
  /** Si la VAD entend encore la voix au-delà de la marge : prolonger de `prolongerApres` s au plus (avant : `prolongerAvant`). */
  prolongerAvant: Sec;
  prolongerApres: Sec;
  /** Jamais de coupe là où p ≥ seuilParole. */
  seuilParole: number;
  /** Le point de coupe glisse vers la trame de 20 ms la plus calme à ± fenetreCreux s. */
  fenetreCreux: Sec;
  /** Un son fort hors parole n'est gardé que si une réaction suit dans les `reactionApres` s (ou s'il touche la parole). */
  fortSiReaction: boolean;
  reactionApres: Sec;
}

export interface EntreeCoupes {
  /** Mots propres ; en mode voix : « mots » vides faits des segments de parole. */
  mots: readonly Mot[];
  parole: ParoleDetectee;
  energie: EnveloppeDb | null;
  moments: readonly MomentV4[];
  signaux: SignauxSource | null;
  niveau: NiveauBlancs;
  garder: 'parole+forts' | 'parole';
  /** Seulement dans ces plages (absent : toute la source). */
  plages?: readonly PlageTemps[];
}

/* ================================================================== J. Habillage (dev-habillage) */

export interface AccrocheV4 {
  /** Morceaux de source copiés au début (1 ou 2, ~6 s en tout). */
  plages: PlageTemps[];
  /** Le moment choisi. */
  t: Sec;
  raison: GenreMoment | 'pic';
}

export interface EntreeHabillage {
  src: string;
  /** Mots propres des séquences gardées (vides en mode voix). */
  mots: readonly Mot[];
  moments: readonly MomentV4[];
  /** Signaux dont les rires / cris sont ceux des moments (signauxAvecMoments). */
  signaux: SignauxSource;
  /** Séquences gardées, dans l'ordre du montage. */
  sequences: readonly SequenceV4[];
  voix: VoixDetecteesV4 | null;
  punchlines: boolean;
  zooms: ForceZoomsAuto | null;
  accroche: boolean;
  /** Titres de section + texte de l'accroche (Best-of : décochés d'office). */
  titres: boolean;
}

export interface BilanHabillage {
  punchlines: number;
  zoomsForts: number;
  zoomsLegers: number;
  plans: number;
  accroche: AccrocheV4 | null;
  chapitres: number;
  titres: number;
}

export interface ResultatHabillage {
  recette: Recette;
  bilan: BilanHabillage;
}

/* ================================================================== K. Persos (dev-persos) */

export interface EntreePersos {
  voix: VoixDetecteesV4 | null;
  empreintes: readonly EmpreintesVoix[];
  parole: ParoleDetectee;
  /** Mots propres (absent en mode voix). */
  mots?: readonly Mot[];
  moments: readonly MomentV4[];
  signaux: SignauxSource;
  noms: Readonly<Record<string, string>>;
  chibis: Readonly<Record<string, { def: DefinitionChibi; bib?: string }>>;
  quiParle: boolean;
  avatars: boolean;
  /** « Sous-titres pour : » choisi sur la revue (null = personne ; absent = la voix qu'on entend mal). */
  sousTitresPour?: string | null;
}

/* ================================================================== L. Analyse, revue, montage (intégrateur) */

/**
 * L'analyse v4 : reste une AnalyseBestOf (l'interface et le banc la lisent telle quelle). `transcription.mots` = les
 * mots PROPRES (ou les mots vides de la parole en mode voix) ; `signaux` = signaux dont les rires / cris viennent
 * des moments v4.
 */
export interface AnalyseV4 extends AnalyseBestOf {
  v: 4;
  scenes: SequenceV4[];
  voix: VoixDetecteesV4 | null;
  paroleDetectee: ParoleDetectee;
  /** null en mode voix (pas de Whisper). */
  bilanMots: BilanMots | null;
  moments: MomentV4[];
  modules: ModulesBestOf;
  /** Morceaux gardés par les coupes sur TOUTE la source : durées de la revue = montage ; recouper sans réanalyse. */
  morceaux: Morceau[];
  /** Énergie de la bande voix (20 ms, piste principale). */
  energie: EnveloppeDb | null;
  /** Ce que la chaîne demanderait encore (empreinte proposée sur la revue). */
  besoins: BesoinsChaine;
}

/** Ce que l'utilisateur règle sur la revue (tout est modifiable ; un seul Annuler pour le montage entier). */
export interface RevueV4 {
  /** Les séquences de l'écran, dans l'ordre choisi (cochées = gardées). */
  scenes: SequenceV4[];
  noms: Readonly<Record<string, string>>;
  chibis: Readonly<Record<string, { def: DefinitionChibi; bib?: string }>>;
  /** Id de la voix sous-titrée ; null = personne. */
  sousTitresPour: string | null;
}

/** La musique prête (dev-musique) : piste déjà placée + sources audio ouvertes dans le projet. */
export interface MusiquePrete {
  piste: PisteMusique;
  sources: readonly Source[];
}

/**
 * Les étapes de la chaîne, injectables : ETAPES_V4 (les fonctions des devs) par défaut ; ETAPES_ANCIENNES
 * (express/etapes-anciennes.ts, gelé) = le comportement d'avant, pour le banc (« --ancien voix,coupes ») et les tests.
 * Une étape ne lève JAMAIS : en cas de souci elle rend le résultat de l'étape ancienne (et l'écrit dans la console).
 */
export interface EtapesChaine {
  parole(e: EntreeParole): ParoleDetectee;
  mots(e: EntreeMots): MotsNettoyes;
  voix(e: EntreeVoix): VoixDetecteesV4 | null;
  moments(e: EntreeMoments): MomentV4[];
  coupes(e: EntreeCoupes): Morceau[];
  sequences(e: EntreeSequences): ChoixSequences;
  habillage(r: Recette, e: EntreeHabillage): ResultatHabillage;
  persos(r: Recette, e: EntreePersos): Recette;
}

export type NomEtape = keyof EtapesChaine;

/* ================================================================== M. Le seul champ de recette ajouté (dev-musique) */

/**
 * À AJOUTER par dev-musique à `PisteMusique` (src/recette/types-auto.ts), au normaliseur (normaliser-auto-son.ts :
 * gardé seulement s'il vaut 'parole') et à schema.json. Absent = comportement d'avant (anciens montages inchangés).
 * 'parole' : la musique baisse pendant les tours de parole (`recette.paroles`, sinon les mots des sous-titres), d'un
 * gain fixe (commande = NIVEAU_PAROLE ≈ −5 dB avec seuil 0,03 / ratio 6 / 20 / 400 ms), même si la voix est faible.
 */
export interface ChampsRecetteV4 {
  baisseSur?: 'parole';
}
