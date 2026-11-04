// Cache des vignettes de la frise : une demande à la fois au moteur (pour ne pas saturer le décodeur),
// les plus récentes d'abord, au plus 240 images gardées en mémoire.

import { vignette, type SourceOuverte } from '../moteur/api';

const MAX = 240;
const cache = new Map<string, ImageBitmap | null>();
const enAttente = new Map<string, { source: SourceOuverte; ts: number; l: number; h: number; cbs: Set<Rappel> }>();
type Rappel = (img: ImageBitmap | null) => void;
let occupe = false;

function cle(source: SourceOuverte, ts: number, h: number) {
  return `${source.infos.id}|${source.infos.emp}|${ts.toFixed(1)}|${h}`;
}

/** Demande la vignette au temps source ts (arrondi au 1/10 s). Renvoie une fonction pour se désabonner. */
export function demanderVignette(source: SourceOuverte, ts: number, h: number, cb: Rappel): () => void {
  const t = Math.round(ts * 10) / 10;
  const k = cle(source, t, h);
  if (cache.has(k)) {
    const img = cache.get(k) ?? null;
    // On remet l'entrée en fin de Map (la plus récente).
    cache.delete(k);
    cache.set(k, img);
    cb(img);
    return () => undefined;
  }
  let attente = enAttente.get(k);
  if (!attente) {
    const ls = source.infos.l ?? 16;
    const hs = source.infos.h ?? 9;
    attente = { source, ts: t, l: Math.max(1, Math.round((h * ls) / hs)), h, cbs: new Set() };
    enAttente.set(k, attente);
  } else {
    // Plus récent = prioritaire.
    enAttente.delete(k);
    enAttente.set(k, attente);
  }
  attente.cbs.add(cb);
  void suivante();
  const a = attente;
  return () => {
    a.cbs.delete(cb);
  };
}

async function suivante() {
  if (occupe) return;
  // On saute les demandes abandonnées.
  for (const [k, a] of enAttente) if (a.cbs.size === 0) enAttente.delete(k);
  const derniere = [...enAttente.entries()].pop();
  if (!derniere) return;
  const [k, a] = derniere;
  enAttente.delete(k);
  occupe = true;
  let img: ImageBitmap | null = null;
  try {
    img = await vignette(a.source, a.ts, a.l, a.h);
  } catch {
    img = null;
  }
  ranger(k, img);
  for (const cb of a.cbs) cb(img);
  occupe = false;
  void suivante();
}

function ranger(k: string, img: ImageBitmap | null) {
  cache.set(k, img);
  while (cache.size > MAX) {
    const [ancienne, bitmap] = cache.entries().next().value as [string, ImageBitmap | null];
    cache.delete(ancienne);
    bitmap?.close();
  }
}

/** Vide le cache (nouvelle vidéo). */
export function viderVignettes() {
  for (const b of cache.values()) b?.close();
  cache.clear();
  enAttente.clear();
}

/** Largeur de la vignette de la carte « Reprendre ». */
const LARGEUR_REPRISE = 120;
/** Taille maximale de la data URL sauvegardée avec le projet. */
const MAX_DATA_URL = 24_000;

/** Petite image JPEG (qualité 0,6, ~120 px de large) au temps source ts, en data URL. null si impossible. */
export function vignetteJpeg(source: SourceOuverte, ts: number): Promise<string | null> {
  const ratio = (source.infos.l ?? 16) / (source.infos.h ?? 9);
  const h = Math.max(16, Math.round(LARGEUR_REPRISE / ratio));
  return new Promise((resoudre) => {
    demanderVignette(source, ts + 0.05, h, (img) => {
      if (!img) return resoudre(null);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(h * ratio);
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.6);
        resoudre(url.length <= MAX_DATA_URL ? url : null);
      } catch {
        resoudre(null);
      }
    });
  });
}
