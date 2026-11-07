// Worker « Qui parle » (dev 1) : lit le son de la source (une ou plusieurs pistes audio, ouvertes ici avec mediabunny :
// getAudioTracks()[n]) morceau par morceau et calcule les empreintes de voix (empreintes.ts). Rien n'est gardé en
// mémoire à part ces mesures ; rien n'est envoyé. La page l'arrête net (terminate) pour annuler.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { ErreurArko } from '../../moteur/erreurs';
import { AccumulateurEmpreintes } from './empreintes';

export interface DemandeEmpreintes {
  fichier: Blob;
  duree: number;
  de: number;
  a: number;
  /** Pistes à mesurer (null = la piste principale). */
  pistes: (number | null)[];
}

export type DepuisWorkerEmpreintes =
  | { type: 'progression'; p: number; fait: number }
  | { type: 'fini'; resultats: { piste: number | null; nom: string | null; pas: number; duree: number; db: Float32Array; bandes: Float32Array }[] }
  | { type: 'erreur'; message: string; code: string };

function envoyer(m: DepuisWorkerEmpreintes, transfert: Transferable[] = []) {
  (self as unknown as Worker).postMessage(m, transfert);
}

async function mesurer(d: DemandeEmpreintes) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(d.fichier, { maxCacheSize: 16 * 1024 * 1024 }) });
  try {
    const toutes = await input.getAudioTracks();
    const resultats: Extract<DepuisWorkerEmpreintes, { type: 'fini' }>['resultats'] = [];
    const longueur = Math.max(0.01, d.a - d.de) * d.pistes.length;
    let dernier = 0;
    for (const [j, piste] of d.pistes.entries()) {
      const piste0 = piste === null ? await input.getPrimaryAudioTrack() : toutes[piste];
      if (!piste0) throw new ErreurArko('Cette piste de son n\'existe pas dans la vidéo.', 'piste');
      if (!(await piste0.canDecode())) throw new ErreurArko('Ton navigateur ne sait pas lire le son de cette piste.', 'codec_audio');
      const acc = new AccumulateurEmpreintes(d.duree);
      const sink = new AudioSampleSink(piste0);
      let canal = new Float32Array(4096);
      let mono = new Float32Array(4096);
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
            const fait = j * (d.a - d.de) + Math.max(0, s.timestamp - d.de);
            envoyer({ type: 'progression', p: Math.min(1, fait / longueur), fait });
          }
        } finally {
          s.close();
        }
      }
      const r = acc.resultat(piste ?? undefined);
      const nom = ((await piste0.getName().catch(() => null)) ?? '').trim().slice(0, 24) || null;
      resultats.push({ piste, nom, pas: r.pas, duree: r.duree, db: r.db, bandes: r.bandes });
    }
    envoyer({ type: 'fini', resultats }, resultats.flatMap((r) => [r.db.buffer, r.bandes.buffer]));
  } finally {
    input.dispose();
  }
}

self.onmessage = (ev: MessageEvent<DemandeEmpreintes>) => {
  mesurer(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu écouter les voix de ta vidéo. Réessaie.', code: 'analyse' });
    }
  });
};
