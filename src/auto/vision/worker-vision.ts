// Worker « Arko regarde l'image » (nom « arko-regard ») : une image clé toutes les 3 s environ, recadrée au centre en
// 224 × 224, passe dans CLIP vision (modèle « vision », lu sur l'appareil : jamais de téléchargement ici). Rend, pour
// chaque image, la probabilité que ce soit du jeu (regard.ts). Rien n'est envoyé ; un modèle à la fois.

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import { ErreurArko } from '../../moteur/erreurs';
import { tempsImagesCles } from '../../ia/lecture-analyse';
import { lireModele } from '../modeles/modeles';
import { ouvrirSessionWeb } from '../modeles/onnx-web';
import type { DemandeRegard, DepuisWorkerRegard } from './messages-vision';
import { entreeClip, genresImage, REGARD, type GenreImage, type ImageRegardee } from './regard';

function envoyer(m: DepuisWorkerRegard) {
  (self as unknown as Worker).postMessage(m);
}

async function regarder(d: DemandeRegard) {
  const octets = await lireModele('vision');
  if (!octets) throw new ErreurArko('Le regard sur l\'image n\'est pas sur cet appareil.', 'module');
  let session;
  try {
    session = await ouvrirSessionWeb(octets);
  } catch {
    throw new ErreurArko('Le regard sur l\'image est abîmé. Retélécharge-le.', 'module');
  }
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(d.fichier, { maxCacheSize: 16 * 1024 * 1024 }) });
  try {
    const piste = await input.getPrimaryVideoTrack();
    if (!piste) throw new ErreurArko('Cette vidéo n\'a pas d\'image.', 'piste');
    if (!(await piste.canDecode())) throw new ErreurArko('Ton navigateur ne sait pas lire l\'image de cette vidéo.', 'codec_video');
    const temps = await tempsImagesCles(piste, 0, REGARD.ecart);
    const sink = new VideoSampleSink(piste);
    const T = REGARD.taille;
    const canevas = new OffscreenCanvas(T, T);
    const ctx = canevas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ErreurArko('Impossible de regarder l\'image dans ce navigateur.', 'analyse');
    // Recadrage au centre (comme CLIP) : le petit côté fait 224.
    const l = piste.displayWidth || 16;
    const h = piste.displayHeight || 9;
    const k = T / Math.min(l, h);
    const dl = l * k;
    const dh = h * k;
    const images: ImageRegardee[] = [];
    let i = 0;
    let dernier = 0;
    for await (const s of sink.samplesAtTimestamps(temps)) {
      const t = temps[i++]!;
      if (!s) continue;
      try {
        s.draw(ctx, (T - dl) / 2, (T - dh) / 2, dl, dh);
      } finally {
        s.close();
      }
      const x = entreeClip(ctx.getImageData(0, 0, T, T).data, T);
      const r = await session.run({ pixel_values: { type: 'float32', data: x, dims: [1, 3, T, T] } });
      const emb = r['image_embeds'];
      if (!emb) throw new ErreurArko('Le regard sur l\'image n\'a rien rendu.', 'analyse');
      const g = genresImage(emb.data as Float32Array);
      const genre = (Object.entries(g).sort((a, b) => b[1] - a[1])[0]![0]) as GenreImage;
      images.push({ t: Math.round(t * 100) / 100, jeu: g.jeu, genre });
      const maintenant = performance.now();
      if (maintenant - dernier > 300) {
        dernier = maintenant;
        envoyer({ type: 'progression', p: Math.min(1, i / Math.max(1, temps.length)) });
      }
    }
    envoyer({ type: 'fini', images });
  } finally {
    input.dispose();
    await session.release?.().catch(() => undefined);
  }
}

self.onmessage = (ev: MessageEvent<DemandeRegard>) => {
  regarder(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu regarder l\'image. Réessaie.', code: 'analyse' });
    }
  });
};
