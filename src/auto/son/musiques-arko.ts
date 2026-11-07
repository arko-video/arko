// Les musiques PROPOSÉES par Arko (navigateur) :
//  - les morceaux de Kevin MacLeod (CC BY 4.0) sont dans public/musiques/kevin-macleod/ mais PAS dans le pré-cache
//    du service worker (.m4a n'est pas dans ses motifs) : ils sont téléchargés À LA DEMANDE, puis gardés sur
//    l'appareil (Cache Storage « arko-musiques ») pour marcher sans internet la fois suivante ;
//  - les musiques fabriquées par Arko (CC0) sont rendues en PCM par le générateur, puis enregistrées en WAV : le
//    montage les ouvre comme n'importe quel son importé (même voie pour l'aperçu et l'export).

import { fabriquerMusique, type Ambiance } from '../../sons/musique/generateur';
import { encoderWav } from '../../sons/musique/wav';
import { lireIdArko, MORCEAUX_KEVIN, nomFichierKevin, nomMusiqueArko } from './musique-auto';

/** Nom du cache des morceaux téléchargés (gardés tant que l'utilisateur ne vide pas les données du site). */
export const CACHE_MUSIQUES = 'arko-musiques';

const aDesCaches = () => typeof caches !== 'undefined';

/** Adresse d'un morceau de Kevin MacLeod sur le site d'Arko. */
export function urlKevin(fichier: string, base: string = import.meta.env.BASE_URL ?? '/'): string {
  return new URL(`${base.replace(/\/?$/, '/')}musiques/kevin-macleod/${encodeURIComponent(fichier)}`, globalThis.location?.href ?? 'http://localhost/').href;
}

/** Ids des morceaux de Kevin MacLeod déjà gardés sur l'appareil. */
export async function kevinGardes(): Promise<Set<string>> {
  if (!aDesCaches()) return new Set();
  try {
    const cache = await caches.open(CACHE_MUSIQUES);
    const res = new Set<string>();
    for (const m of MORCEAUX_KEVIN) if (await cache.match(urlKevin(m.fichier))) res.add(m.id);
    return res;
  } catch {
    return new Set();
  }
}

/** Qui peut-on avoir maintenant ? Les morceaux gardés, et tous si l'appareil est en ligne. */
export async function kevinDisponibles(): Promise<(id: string) => boolean> {
  const gardes = await kevinGardes();
  const enLigne = typeof navigator === 'undefined' || navigator.onLine !== false;
  return (id) => enLigne || gardes.has(id);
}

/** Fichier d'un morceau de Kevin MacLeod : gardé sur l'appareil, sinon téléchargé (puis gardé). Lève si impossible. */
export async function fichierKevin(id: string, signal?: AbortSignal): Promise<File> {
  const m = MORCEAUX_KEVIN.find((x) => x.id === id);
  if (!m) throw new Error(`Morceau inconnu : ${id}`);
  const url = urlKevin(m.fichier);
  const cache = aDesCaches() ? await caches.open(CACHE_MUSIQUES).catch(() => null) : null;
  let rep = (await cache?.match(url)) ?? null;
  if (!rep) {
    const reseau = await fetch(url, { signal });
    if (!reseau.ok) throw new Error(`Téléchargement impossible (${reseau.status})`);
    if (cache) await cache.put(url, reseau.clone()).catch(() => undefined);
    rep = reseau;
  }
  const blob = await rep.blob();
  return new File([blob], nomFichierKevin(m), { type: 'audio/mp4' });
}

/** Musiques fabriquées déjà rendues pendant cette session (même ambiance + même graine → même fichier). */
const fabriquees = new Map<string, File>();

/** Musique fabriquée par Arko → fichier WAV (rendu une fois, quelques centaines de ms). */
export function fichierArko(ambiance: Ambiance, graine: number): File {
  const cle = `${ambiance}:${graine}`;
  let f = fabriquees.get(cle);
  if (!f) {
    const m = fabriquerMusique(ambiance, graine);
    f = new File([encoderWav(m.canaux, m.frequence, graine)], nomMusiqueArko(ambiance, graine), { type: 'audio/wav' });
    fabriquees.set(cle, f);
  }
  return f;
}

/** Laisse la page respirer entre deux calculs (l'interface reste fluide pendant qu'on fabrique la musique). */
const respirer = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Fichier d'un candidat « kevin:… » ou « arko:… » (ceux de Ma bibliothèque sont lus par la page, dans Mes sons).
 * null si ce n'est ni l'un ni l'autre ; lève si le téléchargement échoue.
 */
export async function fichierPropose(id: string, signal?: AbortSignal): Promise<File | null> {
  if (id.startsWith('kevin:')) return fichierKevin(id.slice('kevin:'.length), signal);
  const a = lireIdArko(id);
  if (!a) return null;
  await respirer();
  return fichierArko(a.ambiance, a.graine);
}
