// Mesures LENTES du dev 1 sur une source ouverte (navigateur) : énergie de la voix sur toute la source (pour Couper
// les blancs sans transcription, dans un Worker) et 20 petites images réparties (pour détecter les bords).
// Les calculs sont dans les fichiers purs voix.ts et rognage-detection.ts. Rien n'est envoyé.

import { enGris } from '../../ia/images';
import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../../moteur/media';
import { imageDeSample } from '../../moteur/rendre';
import { TA } from '../../textes-auto';
import type { OptionsTache, PlageTemps } from '../types';
import type { ImageGrise } from './rognage-detection';
import type { EnergieVoix } from './voix';
import type { DemandeVoix, DepuisWorkerVoix } from './worker-voix';

function annule() {
  return new ErreurArko('Analyse annulée.', 'annule');
}

function enMinutes(s: number): string {
  return s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min`;
}

/** Énergie de la voix de la source (ou de `plage`), avec progression et annulation. */
export function mesurerVoix(source: SourceOuverte, options: OptionsTache & { plage?: PlageTemps } = {}): Promise<EnergieVoix> {
  const { signal, surProgression } = options;
  const duree = source.infos.duree;
  const demande: DemandeVoix = { fichier: source.fichier, duree, de: Math.max(0, options.plage?.de ?? 0), a: Math.min(duree, options.plage?.a ?? duree) };
  if (signal?.aborted) return Promise.reject(annule());
  return new Promise((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-voix.ts', import.meta.url), { type: 'module', name: 'arko-voix' });
    } catch {
      rejeter(new ErreurArko('Impossible d\'écouter la vidéo dans ce navigateur. Mets Chrome à jour.', 'analyse'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', arreter);
    };
    const arreter = () => {
      if (termine) return;
      finir();
      rejeter(annule());
    };
    signal?.addEventListener('abort', arreter);
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (termine) return;
      finir();
      rejeter(new ErreurArko('L\'écoute de la voix a planté. Réessaie.', 'analyse'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorkerVoix>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') surProgression?.(m.p, TA.coupes.blancs.voix(enMinutes(m.fait), enMinutes(demande.a - demande.de)));
      else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre({ pas: m.pas, db: m.db });
      }
    };
    worker.postMessage(demande);
  });
}

/** `n` images réparties dans toute la source, réduites à `largeur` px de large, en gris (image ENTIÈRE, sans bandes). */
export async function imagesReparties(source: SourceOuverte, n = 20, largeur = 320): Promise<ImageGrise[]> {
  const media = await ouvrirMedia(source.fichier, 'video');
  try {
    const sink = media.sinkVideo;
    const L = media.largeur || source.infos.l || 16;
    const H = media.hauteur || source.infos.h || 9;
    const l = Math.max(2, Math.round(largeur));
    const h = Math.max(2, Math.round((largeur * H) / L));
    if (!sink) return [];
    const canevas = new OffscreenCanvas(l, h);
    const ctx = canevas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const duree = Math.max(0.01, media.duree);
    const temps = Array.from({ length: n }, (_, i) => Math.min(duree - 0.01, (duree * (i + 0.5)) / n));
    const res: ImageGrise[] = [];
    for (const t of temps) {
      const s = await sink.getSample(Math.max(0, t));
      if (!s) continue;
      try {
        // L'image entière est étirée sur tout le canevas : aucune bande noire ajoutée par nous.
        imageDeSample(s).dessiner(ctx, 0, 0, s.displayWidth, s.displayHeight, 0, 0, l, h);
      } finally {
        s.close();
      }
      res.push({ l, h, px: enGris(ctx.getImageData(0, 0, l, h).data) });
    }
    return res;
  } finally {
    fermerMedia(media);
  }
}
