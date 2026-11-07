// Qui parle v4 (dev-voix), fonctions PURES : le NIVEAU d'un morceau de parole = 98ᵉ centile de l'énergie de la bande
// voix (300–3400 Hz, trames de 20 ms) sur ses parties, ≈ sa crête : elle dépend du gain de la chaîne du micro (ce qui
// sépare deux voix d'un même mélange), pas des syllabes calmes ni des pauses. Jugé par morceau (≤ 1,5 s), et non trame
// par trame : à 20 ms les deux voix de la session de Romain se recouvrent (une seule bosse, diagnostic 1.1).
// Le contrat disait 90ᵉ : sur la vraie session (segments de la VAD du 7/11 vers 15 h), le creux entre les 2 voix vaut
// 0,79 du plus petit sommet au 90ᵉ (pas de « 2 voix »), 0,61 au 95ᵉ, 0,50 au 98ᵉ ; phrases bien attribuées 92,7 /
// 93,1 / 94,9 %. Aussi : le TIMBRE moyen d'un morceau (8 bandes moins leur moyenne), pour le repli « même niveau ».

import type { EmpreintesVoix, EnveloppeDb } from '../types-v3';
import type { MorceauParole } from './morceaux-parole';

/** Centile du niveau d'un morceau. */
export const CENTILE_NIVEAU = 0.98;
/** Niveau d'un morceau sans aucune trame (dB). */
export const NIVEAU_VIDE = -100;

/** Indices [k0, k1[ des trames dont le milieu tombe dans [de, a[. */
function trames(e: EnveloppeDb, de: number, a: number): [number, number] {
  const k0 = Math.max(0, Math.ceil(de / e.pas - 0.5));
  const k1 = Math.min(e.db.length, Math.ceil(a / e.pas - 0.5));
  return [k0, Math.max(k0, k1)];
}

/** Valeur au centile q (0 à 1) d'une liste (copie triée ; vide → NIVEAU_VIDE). */
export function centile(x: readonly number[] | Float64Array, q: number): number {
  if (x.length === 0) return NIVEAU_VIDE;
  const t = Float64Array.from(x).sort();
  const i = Math.min(t.length - 1, Math.max(0, Math.round(q * (t.length - 1))));
  return t[i]!;
}

/** Niveau de chaque morceau (dB) : 90ᵉ centile de l'énergie de ses trames. */
export function niveauxDesMorceaux(morceaux: readonly MorceauParole[], e: EnveloppeDb, q = CENTILE_NIVEAU): Float64Array {
  const res = new Float64Array(morceaux.length);
  const tampon: number[] = [];
  morceaux.forEach((m, j) => {
    tampon.length = 0;
    for (const p of m.parties) {
      const [k0, k1] = trames(e, p.de, p.a);
      for (let k = k0; k < k1; k++) tampon.push(e.db[k]!);
    }
    res[j] = centile(tampon, q);
  });
  return res;
}

/**
 * Timbre moyen de chaque morceau (8 valeurs) : énergies des 8 bandes moyennées sur ses trames les plus fortes (au
 * plus 12 dB sous son niveau), en dB, moins leur moyenne (le volume ne compte pas). null s'il n'a aucune trame.
 */
export function timbresDesMorceaux(morceaux: readonly MorceauParole[], e: EmpreintesVoix, niveaux: ArrayLike<number>): (Float64Array | null)[] {
  return morceaux.map((m, j) => {
    const s = new Float64Array(8);
    let n = 0;
    const seuil = niveaux[j]! - 12;
    for (const p of m.parties) {
      const [k0, k1] = trames(e, p.de, p.a);
      for (let k = k0; k < k1; k++) {
        if (e.db[k]! < seuil) continue;
        for (let b = 0; b < 8; b++) s[b]! += 10 ** (e.bandes[k * 8 + b]! / 10);
        n++;
      }
    }
    if (n === 0) return null;
    let moy = 0;
    for (let b = 0; b < 8; b++) {
      s[b] = 10 * Math.log10(s[b]! / n + 1e-12);
      moy += s[b]! / 8;
    }
    for (let b = 0; b < 8; b++) s[b]! -= moy;
    return s;
  });
}
