// Worker « voix au son » (dev 1) : lit le son de la source morceau par morceau et mesure l'énergie de la bande
// voix (300–3400 Hz) toutes les 20 ms (voix.ts). Rien n'est gardé en mémoire à part ces mesures ; rien n'est envoyé.
// La page l'arrête net (terminate) pour annuler.

import { ErreurArko } from '../../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../../moteur/media';
import { AccumulateurVoix } from './voix';

export interface DemandeVoix {
  fichier: Blob;
  duree: number;
  de: number;
  a: number;
}

export type DepuisWorkerVoix =
  | { type: 'progression'; p: number; fait: number }
  | { type: 'fini'; pas: number; db: Float32Array }
  | { type: 'erreur'; message: string; code: string };

function envoyer(m: DepuisWorkerVoix, transfert: Transferable[] = []) {
  (self as unknown as Worker).postMessage(m, transfert);
}

async function mesurer(d: DemandeVoix) {
  const media = await ouvrirMedia(d.fichier, 'video');
  try {
    const acc = new AccumulateurVoix(d.duree);
    const sink = media.sinkAudio;
    if (sink) {
      let canal = new Float32Array(4096);
      let mono = new Float32Array(4096);
      let dernier = 0;
      for await (const s of sink.samples(d.de, d.a)) {
        try {
          const n = s.numberOfFrames;
          if (canal.length < n) {
            canal = new Float32Array(n);
            mono = new Float32Array(n);
          }
          const m = mono.subarray(0, n);
          const nc = s.numberOfChannels;
          s.copyTo(m, { planeIndex: 0, format: 'f32-planar' });
          for (let c = 1; c < nc; c++) {
            s.copyTo(canal.subarray(0, n), { planeIndex: c, format: 'f32-planar' });
            for (let i = 0; i < n; i++) m[i]! += canal[i]!;
          }
          if (nc > 1) for (let i = 0; i < n; i++) m[i]! /= nc;
          acc.ajouter(m, s.sampleRate, s.timestamp);
          const maintenant = performance.now();
          if (maintenant - dernier > 200) {
            dernier = maintenant;
            const fait = Math.max(0, s.timestamp - d.de);
            envoyer({ type: 'progression', p: Math.min(1, fait / Math.max(0.01, d.a - d.de)), fait });
          }
        } finally {
          s.close();
        }
      }
    }
    const r = acc.resultat();
    envoyer({ type: 'fini', pas: r.pas, db: r.db }, [r.db.buffer]);
  } finally {
    fermerMedia(media);
  }
}

self.onmessage = (ev: MessageEvent<DemandeVoix>) => {
  mesurer(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu écouter le son de ta vidéo. Réessaie.', code: 'analyse' });
    }
  });
};
