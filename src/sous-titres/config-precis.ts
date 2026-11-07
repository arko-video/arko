// Module « sous-titres précis » (dev-mots-2, 7/11/2026) : Whisper « small » avec les temps de chaque mot. Il réécoute
// SEULEMENT la voix sous-titrée des passages gardés du Best-of (src/auto/mots/passe-precise.ts) : 2,7 fois plus de
// mots justes pour la voix faible sur la vraie session (28 → 76 %), moins de mots faux (45 → 34 %), 1,9 fois plus de
// ses sous-titres recouverts (voir l'en-tête de passe-precise.ts). Réglages partagés par la
// page (precis.ts) et le Worker (worker-precis.ts). Téléchargé une seule fois, après l'accord de l'utilisateur, depuis
// huggingface.co (révision figée), gardé dans le même Cache Storage que Whisper base (le WASM d'onnxruntime y est
// partagé). Licence : Apache-2.0 (openai/whisper-small), conversion ONNX onnx-community.

import { OCTETS_ORT } from './config';

export const MODELE_PRECIS = 'onnx-community/whisper-small_timestamped';
/** Révision figée (jamais « main ») : les tailles annoncées sont celles de ces fichiers. */
export const REVISION_PRECIS = '65caa70f294b46e1c33ff820aae6b16d048ab818';
/**
 * Poids quantifiés : encodeur en 4 bits (66 Mo au lieu de 92), décodeur en 8 bits. Mesuré sur la vraie session : à
 * peu près comme tout en 8 bits (66 % de mots justes contre 70 %, 30 % de mots faux contre 32 %), 26 Mo de moins :
 * sous les 250 Mo.
 */
export const DTYPE_PRECIS = { encoder_model: 'q4', decoder_model_merged: 'q8' } as const;

/** Fichiers du modèle téléchargés depuis huggingface.co, avec leur taille en octets (révision REVISION_PRECIS). */
export const FICHIERS_PRECIS: [chemin: string, octets: number][] = [
  ['config.json', 2227],
  ['generation_config.json', 3893],
  ['preprocessor_config.json', 339],
  ['tokenizer.json', 2480466],
  ['tokenizer_config.json', 282683],
  ['onnx/encoder_model_q4.onnx', 66178491],
  ['onnx/decoder_model_merged_quantized.onnx', 156795750],
];

/** Taille du modèle seul (le WASM d'onnxruntime est souvent déjà là, avec Whisper base). */
export const OCTETS_PRECIS = FICHIERS_PRECIS.reduce((s, [, o]) => s + o, 0);
/** Taille annoncée au pire (modèle + WASM d'onnxruntime) : environ 240 Mo. */
export const TAILLE_PRECIS = OCTETS_PRECIS + OCTETS_ORT;

/** Adresse d'un fichier du modèle (c'est aussi sa clé dans le Cache Storage de transformers.js). */
export function urlPrecis(chemin: string): string {
  return `https://huggingface.co/${MODELE_PRECIS}/resolve/${REVISION_PRECIS}/${chemin}`;
}
