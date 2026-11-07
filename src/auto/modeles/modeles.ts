// Petits modèles sur l'appareil (détecteur de voix, empreinte de voix) : état, téléchargement, lecture (page OU
// Worker : `caches` et `fetch` existent aux deux endroits), oubli. Propriétaire : dev-vad.
//  - Modèle RANGÉ DANS L'APPLI (détecteur de voix, `dansLAppli`) : aucun accord, lu depuis l'appli au 1er usage
//    (lireModele le fait tout seul), taille et SHA-256 vérifiés, puis gardé dans le Cache Storage CACHE_MODELES :
//    les fois suivantes, il marche sans internet. Il n'est PAS dans le pré-cache du service worker.
//  - Modèle à TÉLÉCHARGER (empreinte de voix) : SEULEMENT après l'accord de l'utilisateur (telechargerModele),
//    depuis l'adresse de sa fiche (huggingface.co, révision figée), en flux avec progression, place vérifiée
//    (+20 %), taille ET SHA-256 vérifiés (un fichier différent est jeté), navigator.storage.persist() demandé.
// Erreurs lisibles : ErreurArko codes 'reseau', 'place', 'module', 'annule'. Aucun test unitaire ne télécharge pour
// de vrai (Cache Storage et fetch simulés).

import { ErreurArko } from '../../moteur/erreurs';
import type { OptionsTache } from '../types';
import type { IdModele } from '../types-v4';
import { adresseDansLAppli, adresseHuggingFacePermise } from './adresses';
import { CACHE_MODELES, MODELES, type FicheModele } from './catalogue';

export interface EtatModeleAppareil {
  id: IdModele;
  /**
   * Utilisable sans rien demander : déjà gardé sur l'appareil, OU livré avec l'appli (lu depuis l'appli au 1er
   * usage). Un modèle livré qui ne se charge pas (hors ligne la 1ʳᵉ fois, fichier abîmé) : la passe du son le dit
   * (avertissement) et la chaîne prend le repli sans modèle.
   */
  present: boolean;
  /** Taille du modèle (octets). Pour un modèle à télécharger : ce qu'il faut annoncer sur l'écran d'accord. */
  octets: number;
  /** Livré avec l'appli : jamais d'accord à demander. */
  dansLAppli: boolean;
  /** Déjà gardé dans le Cache Storage d'Arko. */
  enCache: boolean;
}

const mo = (o: number) => (o / 1e6 < 10 ? (o / 1e6).toFixed(1).replace('.', ',') : String(Math.round(o / 1e6)));

/** Clé du Cache Storage : l'adresse de la fiche (modèle téléchargé) ; pour un modèle livré, son adresse dans l'appli + son SHA. */
export function cleDuModele(f: FicheModele): string {
  if (f.dansLAppli) return `${adresseDansLAppli(f.dansLAppli)}?sha=${f.sha256.slice(0, 16)}`;
  return f.url;
}

/** D'où lire le fichier : l'appli (modèle livré) ou huggingface.co (révision figée, sinon refusé). */
function adresseDeTelechargement(f: FicheModele): string {
  if (f.dansLAppli) return cleDuModele(f);
  if (!adresseHuggingFacePermise(f.url)) throw new ErreurArko(`Adresse refusée pour ${f.nomDans}.`, 'module');
  return f.url;
}

async function ouvrirCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_MODELES);
  } catch {
    return null;
  }
}

async function sha256(octets: ArrayBuffer | Uint8Array): Promise<string> {
  const donnees = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', donnees as Uint8Array<ArrayBuffer>));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Les octets sont-ils EXACTEMENT ceux de la fiche (taille + SHA-256) ? */
async function conforme(f: FicheModele, octets: ArrayBuffer | Uint8Array): Promise<boolean> {
  if (octets.byteLength !== f.octets) return false;
  try {
    return (await sha256(octets)) === f.sha256;
  } catch {
    return false;
  }
}

/** Le modèle est-il dans le Cache Storage (à la bonne taille) ? Ne lit pas tout le fichier. */
async function estEnCache(f: FicheModele): Promise<boolean> {
  const cache = await ouvrirCache();
  if (!cache) return false;
  try {
    const r = await cache.match(cleDuModele(f));
    if (!r) return false;
    return (await r.blob()).size === f.octets;
  } catch {
    return false;
  }
}

/** Demande au navigateur de ne pas effacer les modèles quand la place manque (réponse ignorée). */
async function demanderPersistance() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Pas grave : le modèle sera relu ou retéléchargé si le navigateur l'efface.
  }
}

/** Assez de place pour le modèle + 20 % ? */
async function verifierPlace(f: FicheModele) {
  let libre: number | null = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota !== undefined && e.usage !== undefined) libre = e.quota - e.usage;
  } catch {
    libre = null;
  }
  const besoin = f.octets * 1.2;
  if (libre !== null && libre < besoin) {
    throw new ErreurArko(`Il faut environ ${mo(besoin)} Mo de libre pour ${f.nomDans}. Libère de la place et réessaie.`, 'place');
  }
}

function annule(): ErreurArko {
  return new ErreurArko('Téléchargement annulé.', 'annule');
}

/** Lit le fichier du modèle (en flux, avec progression) et le vérifie. Lève ErreurArko. */
async function recuperer(f: FicheModele, o: OptionsTache): Promise<Uint8Array<ArrayBuffer>> {
  const { signal, surProgression } = o;
  const url = adresseDeTelechargement(f);
  if (signal?.aborted) throw annule();
  const message = (recu: number) => `Je télécharge ${f.nomDans}… ${mo(recu)} / ${mo(f.octets)} Mo`;
  let rep: Response;
  try {
    rep = await fetch(url, { signal, credentials: 'omit' });
  } catch {
    if (signal?.aborted) throw annule();
    throw new ErreurArko(`Pas de connexion : je n'ai pas pu télécharger ${f.nomDans}. Réessaie avec internet.`, 'reseau');
  }
  if (!rep.ok) throw new ErreurArko(`Le téléchargement de ${f.nomDans} a échoué (erreur ${rep.status}). Réessaie plus tard.`, 'reseau');
  const tout = new Uint8Array(f.octets);
  let recu = 0;
  const abime = () => new ErreurArko(`Le fichier de ${f.nomDans} est abîmé. Réessaie plus tard.`, 'module');
  try {
    const lecteur = rep.body?.getReader();
    if (!lecteur) {
      const b = new Uint8Array(await rep.arrayBuffer());
      if (b.length !== f.octets) throw abime();
      tout.set(b);
      recu = b.length;
    } else {
      surProgression?.(0, message(0));
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        if (signal?.aborted) {
          void lecteur.cancel().catch(() => undefined);
          throw annule();
        }
        if (recu + value.length > f.octets) {
          void lecteur.cancel().catch(() => undefined);
          throw abime();
        }
        tout.set(value, recu);
        recu += value.length;
        surProgression?.(recu / f.octets, message(recu));
      }
    }
  } catch (e) {
    if (e instanceof ErreurArko) throw e;
    if (signal?.aborted) throw annule();
    throw new ErreurArko(`La connexion a coupé pendant le téléchargement de ${f.nomDans}. Réessaie.`, 'reseau');
  }
  if (recu !== f.octets || !(await conforme(f, tout))) throw abime();
  return tout;
}

/** Range le modèle vérifié dans le Cache Storage (et retire ses anciennes versions). Erreurs avalées. */
async function ranger(f: FicheModele, octets: Uint8Array<ArrayBuffer>): Promise<void> {
  const cache = await ouvrirCache();
  if (!cache) return;
  const cle = cleDuModele(f);
  try {
    await cache.put(cle, new Response(octets, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(octets.byteLength) } }));
    for (const r of await cache.keys()) if (r.url !== cle && memeFichier(r.url, f)) await cache.delete(r);
  } catch {
    // Plein ou bloqué : il sera relu la prochaine fois.
  }
}

/** Une entrée du cache est-elle une (ancienne) version de ce modèle ? */
function memeFichier(url: string, f: FicheModele): boolean {
  try {
    const u = new URL(url);
    if (f.dansLAppli) return u.pathname.endsWith('/' + f.dansLAppli);
    return u.pathname.endsWith('/' + (new URL(f.url).pathname.split('/').pop() ?? ''));
  } catch {
    return false;
  }
}

/** Le modèle est-il utilisable ? Ne lève jamais (en cas de doute : absent, sauf un modèle livré avec l'appli). */
export async function etatModele(id: IdModele): Promise<EtatModeleAppareil> {
  const f = MODELES[id];
  const enCache = await estEnCache(f);
  const dansLAppli = Boolean(f.dansLAppli);
  return { id, present: enCache || dansLAppli, octets: f.octets, dansLAppli, enCache };
}

/**
 * Met le modèle sur l'appareil. Modèle à télécharger : SEULEMENT après l'accord de l'utilisateur. Modèle livré avec
 * l'appli : simple préchargement (aucun accord). Rien à faire s'il est déjà là. Lève ErreurArko.
 */
export async function telechargerModele(id: IdModele, o: OptionsTache = {}): Promise<void> {
  const f = MODELES[id];
  if (await estEnCache(f)) {
    o.surProgression?.(1, `${f.nom} : prêt.`);
    return;
  }
  await demanderPersistance();
  await verifierPlace(f);
  await ranger(f, await recuperer(f, o));
}

/**
 * Les octets du modèle (vérifiés : taille + SHA-256), null s'il n'est pas utilisable. Un modèle livré avec l'appli
 * est lu depuis l'appli s'il n'est pas encore gardé (puis gardé). Page ou Worker. Ne lève jamais.
 */
export async function lireModele(id: IdModele): Promise<ArrayBuffer | null> {
  const f = MODELES[id];
  const cache = await ouvrirCache();
  const cle = cleDuModele(f);
  if (cache) {
    try {
      const r = await cache.match(cle);
      if (r) {
        const b = await r.arrayBuffer();
        if (await conforme(f, b)) return b;
        await cache.delete(cle);
      }
    } catch {
      // Illisible : on le relit (modèle livré) ou on dit « absent ».
    }
  }
  if (!f.dansLAppli) return null;
  try {
    const b = await recuperer(f, {});
    await ranger(f, b);
    return b.buffer;
  } catch (e) {
    console.warn(`[Arko] ${f.nom} : lecture impossible`, e);
    return null;
  }
}

/** Oublie le modèle (place à libérer, fichier abîmé). Un modèle livré sera relu depuis l'appli au prochain usage. */
export async function oublierModele(id: IdModele): Promise<void> {
  const f = MODELES[id];
  const cache = await ouvrirCache();
  if (!cache) return;
  try {
    for (const r of await cache.keys()) if (r.url === cleDuModele(f) || memeFichier(r.url, f)) await cache.delete(r);
  } catch {
    /* rien */
  }
}

/**
 * Au démarrage de l'appli, EN LIGNE (intégrateur, relecture point 6) : garde tout de suite sur l'appareil les modèles
 * LIVRÉS avec l'appli (le détecteur de voix, 2,2 Mo, depuis le site d'Arko lui-même, sans accord : il fait partie de
 * l'appli), pour qu'une 1ʳᵉ analyse hors ligne l'ait déjà. Jamais un modèle à télécharger ailleurs (CAM++). Rend les
 * ids gardés ; ne lève jamais.
 */
export async function garderModelesDeLAppli(enLigne: boolean): Promise<IdModele[]> {
  const res: IdModele[] = [];
  if (!enLigne) return res;
  for (const id of Object.keys(MODELES) as IdModele[]) {
    if (!MODELES[id].dansLAppli) continue;
    try {
      if ((await etatModele(id)).enCache) continue;
      if (await lireModele(id)) res.push(id);
    } catch {
      /* hors ligne en route, place : réessayé au prochain démarrage */
    }
  }
  return res;
}
