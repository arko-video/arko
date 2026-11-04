// Fichiers : empreinte d'un fichier (pour le retrouver après un rechargement) et contrôle « même source ».
// Empreinte = SHA-256 de (64 Kio du début + 64 Kio de la fin + taille), en hexadécimal (32 caractères).

import type { Source } from '../recette/types';

const MORCEAU = 64 * 1024;

/** Calcule l'empreinte d'un fichier sans le lire en entier. */
export async function calculerEmpreinte(fichier: Blob): Promise<string> {
  const debut = new Uint8Array(await fichier.slice(0, MORCEAU).arrayBuffer());
  const fin = new Uint8Array(await fichier.slice(Math.max(0, fichier.size - MORCEAU)).arrayBuffer());
  const taille = new TextEncoder().encode(String(fichier.size));
  const tout = new Uint8Array(debut.length + fin.length + taille.length);
  tout.set(debut, 0);
  tout.set(fin, debut.length);
  tout.set(taille, debut.length + fin.length);
  return hacher(tout);
}

async function hacher(octets: Uint8Array<ArrayBuffer>): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
    return [...h.slice(0, 16)].map((o) => o.toString(16).padStart(2, '0')).join('');
  }
  // Repli (contexte non sécurisé) : FNV-1a 64 bits deux fois, moins solide mais suffisant pour reconnaître un fichier.
  return fnv(octets, 0xcbf29ce484222325n) + fnv(octets, 0x84222325cbf29ce4n);
}

function fnv(octets: Uint8Array, graine: bigint): string {
  let h = graine;
  for (const o of octets) {
    h ^= BigInt(o);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Vérifie qu'un fichier re-choisi est bien la source attendue (même taille et même empreinte). */
export async function memeSource(fichier: File, source: Source): Promise<boolean> {
  if (fichier.size !== source.taille) return false;
  return (await calculerEmpreinte(fichier)) === source.emp;
}
