// Banc d'essai des sous-titres dans Chrome : utilise UNIQUEMENT l'API publique (moteur/api).
// Piloté par tests/e2e/sous-titres.spec.ts (window.banc).
import urlVideo from '../fixtures/parole-fr.mp4?url';
import {
  ErreurArko,
  moduleSousTitres,
  ouvrirSource,
  recetteInitiale,
  telechargerModuleSousTitres,
  transcrireRecette,
} from '../../src/moteur/api';
import type { Mot } from '../../src/recette/types';

/** Plans à garder : [de, a, vitesse?] en temps source. Absent = toute la vidéo. */
type Plans = [number, number, number?][];

async function source() {
  const octets = await (await fetch(urlVideo)).blob();
  return ouvrirSource(new File([octets], 'parole-fr.mp4', { type: 'video/mp4' }));
}

async function transcrire(plans?: Plans, langue?: string) {
  const s = await source();
  let r = recetteInitiale(s);
  if (plans) r = { ...r, plans: plans.map(([de, a, vit]) => (vit ? { de, a, vit } : { de, a })) };
  const avant = await moduleSousTitres();
  const progres: [number, string, number][] = [];
  const debut = performance.now();
  const options = { surProgression: (p: number, etape: string) => progres.push([p, etape, Math.round(performance.now() - debut)]) };
  const mots: Mot[] = await transcrireRecette(r, [s], langue ? { ...options, langue } : options);
  const ms = Math.round(performance.now() - debut);
  return { mots, ms, progres, avant, apres: await moduleSousTitres() };
}

async function telecharger() {
  const progres: [number, string][] = [];
  await telechargerModuleSousTitres({ surProgression: (p, e) => progres.push([p, e]) });
  return { progres, module: await moduleSousTitres() };
}

/** Lance une transcription et l'annule après `apresMs` : renvoie le code d'erreur obtenu. */
async function annuler(apresMs: number) {
  const s = await source();
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), apresMs);
  try {
    await transcrireRecette(recetteInitiale(s), [s], { signal: ctrl.signal });
    return 'pas annulé';
  } catch (e) {
    return e instanceof ErreurArko ? e.code : String(e);
  }
}

/** Annule dès le message « Je prépare le module… » (modèle en cours de chargement) : renvoie le code d'erreur. */
async function annulerPendantPreparation() {
  const s = await source();
  const ctrl = new AbortController();
  let etape = '';
  try {
    await transcrireRecette(recetteInitiale(s), [s], {
      signal: ctrl.signal,
      surProgression: (_p, e) => {
        etape = e;
        if (e.startsWith('Je prépare')) ctrl.abort();
      },
    });
    return 'pas annulé';
  } catch (e) {
    return `${e instanceof ErreurArko ? e.code : String(e)} (${etape})`;
  }
}

/** Adresses rangées dans le Cache Storage de transformers.js (modèle + WASM). */
async function cache() {
  const c = await caches.open('transformers-cache');
  return (await c.keys()).map((r) => r.url);
}

Object.assign(window, { banc: { transcrire, telecharger, annuler, annulerPendantPreparation, cache } });
document.title = 'Banc sous-titres prêt';
