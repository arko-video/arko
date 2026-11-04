// Réglages du module sous-titres (modèle Whisper), partagés par la page et le Worker.

/** Modèle Whisper « base » avec les temps de chaque mot, quantifié (q8). */
export const MODELE = 'onnx-community/whisper-base_timestamped';

/** Nom du Cache Storage où transformers.js garde le modèle (et le WASM d'onnxruntime). */
export const CLE_CACHE = 'transformers-cache';

/** Fichiers du modèle téléchargés depuis huggingface.co, avec leur taille en octets. */
export const FICHIERS_MODELE: [chemin: string, octets: number][] = [
  ['config.json', 2243],
  ['generation_config.json', 3832],
  ['preprocessor_config.json', 339],
  ['tokenizer.json', 2480466],
  ['tokenizer_config.json', 282682],
  ['onnx/encoder_model_quantized.onnx', 23159167],
  ['onnx/decoder_model_merged_quantized.onnx', 53712708],
];

/** Fichiers d'onnxruntime-web inclus dans l'appli (copiés dans public/ort/ par scripts/copier-ort.mjs). */
export const ORT_MJS = 'ort-wasm-simd-threaded.mjs';
export const ORT_WASM = 'ort-wasm-simd-threaded.wasm';
/** Taille du WASM d'onnxruntime (mis aussi en cache au premier usage). */
export const OCTETS_ORT = 14 * 1024 * 1024;

/** Taille totale annoncée : environ 90 Mo. */
export const TAILLE_MODULE = FICHIERS_MODELE.reduce((s, [, o]) => s + o, 0) + OCTETS_ORT;

/** Adresse d'un fichier du modèle (c'est aussi sa clé dans le Cache Storage). */
export function urlModele(chemin: string): string {
  return `https://huggingface.co/${MODELE}/resolve/main/${chemin}`;
}

/** Whisper écoute du son mono à 16 kHz. */
export const FREQUENCE = 16000;
/** Une fenêtre envoyée à Whisper dure 28 s au plus (le modèle lit des blocs de 30 s). */
export const FENETRE_MAX_S = 28;
/** Silence glissé entre deux morceaux collés dans la même fenêtre. */
export const BLANC_S = 0.2;
