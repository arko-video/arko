// Quels fichiers du module sous-titres manquent dans le Cache Storage de transformers.js ?
// Utilisé par la page (moduleSousTitres) ET par le Worker (annoncer « Je télécharge » seulement si c'est vrai).

import { CLE_CACHE, FICHIERS_MODELE, OCTETS_ORT, ORT_WASM, urlModele } from './config';

export interface FichierManquant {
  /** Chemin dans le dépôt du modèle (« onnx/encoder_model_quantized.onnx »), ou "ort" pour le WASM. */
  chemin: string;
  octets: number;
}

const TOUS: FichierManquant[] = [
  ...FICHIERS_MODELE.map(([chemin, octets]) => ({ chemin, octets })),
  { chemin: 'ort', octets: OCTETS_ORT },
];

export async function fichiersManquants(): Promise<FichierManquant[]> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(CLE_CACHE))) return TOUS;
    const cache = await caches.open(CLE_CACHE);
    const manquants: FichierManquant[] = [];
    for (const f of TOUS) {
      if (f.chemin !== 'ort' && !(await cache.match(urlModele(f.chemin)))) manquants.push(f);
    }
    // Le WASM est rangé avec sa version dans l'adresse (?v=…) : on cherche juste son nom.
    const cles = await cache.keys();
    if (!cles.some((r) => new URL(r.url).pathname.endsWith('/ort/' + ORT_WASM))) manquants.push(TOUS[TOUS.length - 1]!);
    return manquants;
  } catch {
    return TOUS;
  }
}
