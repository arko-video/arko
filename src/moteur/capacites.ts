// Ce que le navigateur sait faire (WebCodecs, OPFS, partage, Wake Lock), et message bloquant s'il manque l'essentiel.

import type { Capacites } from './api';

export async function capacites(): Promise<Capacites> {
  const g = globalThis as unknown as Record<string, unknown>;
  const webcodecs = typeof g.VideoEncoder === 'function' && typeof g.VideoDecoder === 'function' && typeof g.VideoFrame === 'function';
  const contexteSecurise = globalThis.isSecureContext === true;
  let opfs = false;
  try {
    opfs = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  } catch {
    opfs = false;
  }
  let partageFichiers = false;
  try {
    const essai = new File([new Uint8Array(1)], 'essai.mp4', { type: 'video/mp4' });
    partageFichiers = typeof navigator.canShare === 'function' && navigator.canShare({ files: [essai] });
  } catch {
    partageFichiers = false;
  }
  const wakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  let bloquant: string | null = null;
  if (!contexteSecurise) {
    bloquant = 'Arko doit être ouvert en https:// (ou sur localhost) pour fonctionner. Ouvre l\'adresse officielle d\'Arko.';
  } else if (!webcodecs) {
    bloquant = 'Ton navigateur ne sait pas encoder de vidéo (WebCodecs manquant). Utilise Chrome à jour, sur Android ou sur ordinateur.';
  } else if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
    bloquant = 'Ton navigateur est trop ancien pour Arko. Mets Chrome à jour.';
  }
  return { webcodecs, contexteSecurise, opfs, partageFichiers, wakeLock, bloquant };
}
