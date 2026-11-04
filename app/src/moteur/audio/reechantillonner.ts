// Rééchantillonnage linéaire (pur) : PCM source quelconque → stéréo 48 kHz, avec changement de vitesse.
// Au ralenti la hauteur du son baisse (assumé, comme une bande qu'on ralentit).

export const FREQUENCE_SORTIE = 48000;

/** Morceau de PCM décodé, en canaux séparés (f32). */
export interface Pcm {
  frequence: number;
  /** Temps source (s) du premier échantillon. */
  debut: number;
  canaux: Float32Array[];
}

/** Nombre d'échantillons par canal. */
export function longueurPcm(p: Pcm): number {
  return p.canaux[0]?.length ?? 0;
}

/**
 * Remplit `sortie` (2 canaux) à partir de l'index `k0`, sur `n` échantillons, en lisant `pcm`
 * à partir du temps source `ts0`, à la vitesse `vit`. Les zones hors du PCM restent silencieuses.
 * Mono → les deux canaux ; plus de 2 canaux → les deux premiers.
 */
export function reechantillonnerDans(
  sortie: Float32Array[],
  k0: number,
  n: number,
  pcm: Pcm,
  ts0: number,
  vit: number,
  frequenceSortie = FREQUENCE_SORTIE,
): void {
  const len = longueurPcm(pcm);
  if (len === 0 || n <= 0) return;
  const g = pcm.canaux[0]!;
  const d = pcm.canaux[1] ?? g;
  const pas = (vit * pcm.frequence) / frequenceSortie;
  const pos0 = (ts0 - pcm.debut) * pcm.frequence;
  const sg = sortie[0]!;
  const sd = sortie[1]!;
  for (let k = 0; k < n; k++) {
    const pos = pos0 + k * pas;
    const i = Math.floor(pos);
    if (i < 0 || i >= len) continue;
    const f = pos - i;
    const j = i + 1 < len ? i + 1 : i;
    sg[k0 + k] = g[i]! + (g[j]! - g[i]!) * f;
    sd[k0 + k] = d[i]! + (d[j]! - d[i]!) * f;
  }
}

/** Version qui crée le tampon de sortie (pratique pour les tests). */
export function reechantillonner(pcm: Pcm, ts0: number, vit: number, n: number, frequenceSortie = FREQUENCE_SORTIE): Float32Array[] {
  const sortie = [new Float32Array(n), new Float32Array(n)];
  reechantillonnerDans(sortie, 0, n, pcm, ts0, vit, frequenceSortie);
  return sortie;
}
