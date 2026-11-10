// Petits modèles ONNX d'Arko : fiches FIGÉES (révision huggingface.co, taille, SHA-256, licence) vérifiées par l'agent
// « références » le 7/11/2026 (docs/references-montage-auto.md §B5). Une adresse = une révision précise : jamais
// « main ». Constantes seulement (aucun accès réseau ici). Propriétaire en vague 2 : dev-vad.
//  - Le détecteur de voix (Silero VAD v5, 2,2 Mo, MIT) est RANGÉ DANS L'APPLI (public/modeles/, décision de
//    l'orchestrateur du 7/11/2026) : aucun accord à demander, chargé au 1er Best-of puis gardé par le navigateur.
//  - L'empreinte de voix (CAM++, 28 Mo) se télécharge depuis huggingface.co, une fois, après accord.

import type { IdModele } from '../types-v4';

export interface FicheModele {
  id: IdModele;
  /** Nom du fichier (information, et clé du banc dans /home/claude/modeles/). */
  fichier: string;
  /** Nom affiché (français simple). */
  nom: string;
  /** Le nom dans une phrase (« Je télécharge l'empreinte de voix… »). */
  nomDans: string;
  /** À quoi il sert (une phrase courte, affichée sur l'écran d'accord). */
  role: string;
  /**
   * Adresse à révision figée sur huggingface.co (la seule origine permise pour un téléchargement). Pour un modèle
   * rangé dans l'appli : son origine (information, crédits) ; il est lu depuis `dansLAppli`.
   */
  url: string;
  /** Chemin du fichier dans public/ de l'appli (sans « / » au début) : le modèle est livré avec Arko. */
  dansLAppli?: string;
  octets: number;
  /** SHA-256 en hexadécimal (vérifié après téléchargement : un fichier différent est jeté). */
  sha256: string;
  licence: string;
  /** Ligne de CREDITS.md (à ajouter par l'intégrateur). */
  credit: string;
}

/** Cache Storage des modèles d'Arko (Whisper reste dans « transformers-cache »). */
export const CACHE_MODELES = 'arko-modeles';

export const MODELES: Readonly<Record<IdModele, FicheModele>> = {
  vad: {
    id: 'vad',
    fichier: 'silero-vad-v5.onnx',
    nom: 'Détecteur de voix',
    nomDans: 'le détecteur de voix',
    role: 'Trouve quand quelqu\'un parle, même une voix faible : des coupes nettes, sans blancs.',
    url: 'https://huggingface.co/onnx-community/silero-vad/resolve/e71cae966052b992a7eca6b17738916ce0eca4ec/onnx/model.onnx',
    dansLAppli: 'modeles/silero-vad-v5.onnx',
    octets: 2_243_022,
    sha256: 'a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808',
    licence: 'MIT',
    credit: 'Silero VAD v5 — Silero Team, licence MIT (https://github.com/snakers4/silero-vad)',
  },
  empreinte: {
    id: 'empreinte',
    fichier: 'campplus-zh-en.onnx',
    nom: 'Empreinte de voix',
    nomDans: 'l\'empreinte de voix',
    role: 'Sépare deux voix qui parlent aussi fort l\'une que l\'autre.',
    url: 'https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/0743f301363dec56491a490f6d6cbc9d67f9a3bf/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx',
    octets: 28_281_164,
    sha256: 'aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2',
    licence: 'Apache-2.0',
    credit: 'CAM++ « common advanced » — 3D-Speaker / ModelScope (iic), licence Apache 2.0 ; conversion ONNX : sherpa-onnx (k2-fsa)',
  },
  // 10/11/2026 : « Arko regarde l'image » (menus, bureau, chargements) — CLIP ViT-B/32, partie vision quantifiée.
  // Essayé sur la vidéo CS2 de Romain : 12 images de jeu sur 12 gardées, 7 temps morts sur 8 trouvés.
  vision: {
    id: 'vision',
    fichier: 'clip-vit-b32-vision-quantized.onnx',
    nom: 'Regard sur l\'image',
    nomDans: 'le regard sur l\'image',
    role: 'Repère les menus, le bureau et les chargements pour ne garder que le jeu.',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_quantized.onnx',
    octets: 89_117_001,
    sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
    licence: 'MIT',
    credit: 'CLIP ViT-B/32 — OpenAI, licence MIT ; conversion ONNX : Xenova (transformers.js), licence MIT',
  },
};

/**
 * Silero VAD v5 : entrées `input` float32 [B, 576] (64 derniers échantillons de la trame d'avant + 512 nouveaux),
 * `state` float32 [2, B, 128] (zéros au départ, puis `stateN`), `sr` int64 scalaire 16000 ; sorties `output` [B, 1]
 * (probabilité) et `stateN`. Son brut mono 16 kHz entre −1 et 1, sans pré-traitement.
 */
export const SILERO = { frequence: 16000, trame: 512, contexte: 64, etat: [2, 1, 128] as const, pas: 0.032 } as const;

/**
 * CAM++ zh-en : entrée `x` float32 [N, T, 80] = fbank 80 « Kaldi » (fenêtre povey, son non multiplié, moyenne de
 * chaque bande retirée sur le morceau ; code de référence vérifié : /home/claude/modeles/essais/outils-audio.cjs) ;
 * sortie `embedding` [N, 192] à normer (L2). 2 voix si le cosinus entre les 2 centres < 0,68.
 */
export const CAMPLUS = { frequence: 16000, bandes: 80, taille: 192, cosinusDeuxVoix: 0.68 } as const;

/** Taille totale annoncée d'une liste de modèles (octets). */
export function tailleModeles(ids: readonly IdModele[]): number {
  return ids.reduce((t, id) => t + MODELES[id].octets, 0);
}
