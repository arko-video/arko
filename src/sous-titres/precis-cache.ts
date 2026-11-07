// Quels fichiers du module « sous-titres précis » manquent dans le Cache Storage de transformers.js ? Utilisé par la
// page (modulePrecis) ET par le Worker (annoncer « Je télécharge » seulement si c'est vrai). Comme cache-module.ts.

import { CLE_CACHE, OCTETS_ORT, ORT_WASM } from './config';
import { FICHIERS_PRECIS, urlPrecis } from './config-precis';
import type { FichierManquant } from './cache-module';

const TOUS: FichierManquant[] = [...FICHIERS_PRECIS.map(([chemin, octets]) => ({ chemin, octets })), { chemin: 'ort', octets: OCTETS_ORT }];

export async function fichiersPrecisManquants(): Promise<FichierManquant[]> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(CLE_CACHE))) return TOUS;
    const cache = await caches.open(CLE_CACHE);
    const manquants: FichierManquant[] = [];
    for (const f of TOUS) if (f.chemin !== 'ort' && !(await cache.match(urlPrecis(f.chemin)))) manquants.push(f);
    // Le WASM (partagé avec Whisper base) est rangé avec sa version dans l'adresse (?v=…) : on cherche juste son nom.
    const cles = await cache.keys();
    if (!cles.some((r) => new URL(r.url).pathname.endsWith('/ort/' + ORT_WASM))) manquants.push(TOUS[TOUS.length - 1]!);
    return manquants;
  } catch {
    return TOUS;
  }
}
