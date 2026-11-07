// Worker « Empreinte de voix » (dev-voix, nom « arko-empreintes ») : 2ᵉ passe FACULTATIVE de qui parle, sur quelques
// morceaux de parole seulement (≈ 150 + les ambigus, 300 au plus). Lit le modèle CAM++ sur l'appareil (jamais de
// téléchargement ici : il a eu lieu après le geste de l'utilisateur), ouvre onnxruntime-web WASM 1 fil, lit chaque
// morceau du fichier (Mediabunny), le ramène à 16 kHz (vad/reechantillonnage.ts), calcule l'empreinte
// (empreinte-neurale.ts, le même code que le banc avec onnxruntime-node). Rien n'est envoyé ; un modèle à la fois.
// Protocole (types-v4.ts) : DemandeEmpreintesNeurales → DepuisWorkerEmpreintesNeurales.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { ErreurArko } from '../../moteur/erreurs';
import { lireModele } from '../modeles/modeles';
import { ouvrirSessionWeb } from '../modeles/onnx-web';
import type { PlageTemps } from '../types';
import type { DemandeEmpreintesNeurales, DepuisWorkerEmpreintesNeurales } from '../types-v4';
import { FREQUENCE_VAD, Vers16k } from '../vad/reechantillonnage';
import { calculerEmpreintes, MODELE_EMPREINTE } from './empreinte-neurale';

function envoyer(m: DepuisWorkerEmpreintesNeurales, transfert: Transferable[] = []) {
  (self as unknown as Worker).postMessage(m, transfert);
}

/** Avant le morceau, on lit un peu plus tôt pour que le filtre de la réduction soit chaud. */
const AVANT = 0.05;

/** Son mono 16 kHz de [de, a[ (temps source) : exactement round((a − de) × 16000) échantillons (silence s'il manque). */
async function lireMorceau(sink: AudioSampleSink, p: PlageTemps): Promise<Float32Array> {
  const n = Math.max(0, Math.round((p.a - p.de) * FREQUENCE_VAD));
  const res = new Float32Array(n);
  const vers = new Vers16k();
  let canal = new Float32Array(4096);
  let mono = new Float32Array(4096);
  for await (const s of sink.samples(Math.max(0, p.de - AVANT), p.a)) {
    try {
      const nb = s.numberOfFrames;
      if (canal.length < nb) {
        canal = new Float32Array(nb);
        mono = new Float32Array(nb);
      }
      const m = mono.subarray(0, nb);
      const nc = s.numberOfChannels;
      s.copyTo(m, { planeIndex: 0, format: 'f32-planar' });
      for (let c = 1; c < nc; c++) {
        s.copyTo(canal.subarray(0, nb), { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < nb; i++) m[i]! += canal[i]!;
      }
      if (nc > 1) for (let i = 0; i < nb; i++) m[i]! /= nc;
      const r = vers.ajouter(m, s.sampleRate, s.timestamp);
      if (!r) continue;
      const k0 = Math.round((r.t0 - p.de) * FREQUENCE_VAD);
      for (let i = 0; i < r.pcm.length; i++) {
        const k = k0 + i;
        if (k >= 0 && k < n) res[k] = r.pcm[i]!;
      }
    } finally {
      s.close();
    }
  }
  return res;
}

async function calculer(d: DemandeEmpreintesNeurales) {
  const octets = await lireModele('empreinte');
  if (!octets) throw new ErreurArko('L\'empreinte de voix n\'est pas sur cet appareil.', 'module');
  let session;
  try {
    session = await ouvrirSessionWeb(octets);
  } catch {
    throw new ErreurArko('L\'empreinte de voix est abîmée. Retélécharge-la.', 'module');
  }
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(d.fichier, { maxCacheSize: 16 * 1024 * 1024 }) });
  try {
    const piste = await input.getPrimaryAudioTrack();
    if (!piste) throw new ErreurArko('Cette vidéo n\'a pas de son.', 'piste');
    if (!(await piste.canDecode())) throw new ErreurArko('Ton navigateur ne sait pas lire le son de cette vidéo.', 'codec_audio');
    const sink = new AudioSampleSink(piste);
    let dernier = 0;
    const r = await calculerEmpreintes(session, (p) => lireMorceau(sink, p), d.morceaux, {
      surProgression: (p) => {
        const maintenant = performance.now();
        if (maintenant - dernier < 200 && p < 1) return;
        dernier = maintenant;
        envoyer({ type: 'progression', p });
      },
    });
    envoyer({ type: 'fini', modele: MODELE_EMPREINTE, dim: r.dim, v: r.v }, [r.v.buffer]);
  } finally {
    input.dispose();
    await session.release?.().catch(() => undefined);
  }
}

self.onmessage = (ev: MessageEvent<DemandeEmpreintesNeurales>) => {
  calculer(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu écouter les voix de plus près. Réessaie.', code: 'analyse' });
    }
  });
};
