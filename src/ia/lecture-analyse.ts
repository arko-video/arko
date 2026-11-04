// Côté Worker : les deux « passes » de l'analyse, qui lisent la vidéo morceau par morceau.
//  - le son : décodé par petits morceaux, mis en mono, versé dans l'enveloppe (jamais tout le son en mémoire) ;
//  - les images : seulement les images clés (au plus une toutes les 2 s), réduites à 32 × 18, fermées tout de suite.
// `auPoint(B)` est appelé quand la passe franchit un multiple de 60 s : tout ce qui est avant B est fini.

import { EncodedPacketSink, type AudioSampleSink, type InputVideoTrack, type VideoSampleSink } from 'mediabunny';
import type { Sec } from '../recette/types';
import { difference, enGris, IMAGE_H, IMAGE_L, type Difference } from './images';
import { INTERVALLE_REPRISE } from './messages-analyse';
import type { Enveloppe } from './signaux';

/** Prochain point de reprise (multiple de 60 s) strictement après t. */
function prochainPoint(t: Sec): Sec {
  return (Math.floor(t / INTERVALLE_REPRISE + 1e-9) + 1) * INTERVALLE_REPRISE;
}

export interface SuiviPasse {
  /** La passe a fini tout ce qui est avant `t` (multiple de 60 s) : moment d'écrire un point de reprise. */
  auPoint(t: Sec): void;
  /** Où en est la passe (temps source). */
  avance(t: Sec): void;
}

/** Passe du son : remplit l'enveloppe de `tDebut` jusqu'à la fin. */
export async function passeSon(sink: AudioSampleSink, env: Enveloppe, tDebut: Sec, duree: Sec, suivi: SuiviPasse): Promise<void> {
  let point = prochainPoint(tDebut);
  let canal = new Float32Array(4096);
  let mono = new Float32Array(4096);
  for await (const s of sink.samples(tDebut, duree)) {
    try {
      while (s.timestamp >= point) {
        suivi.auPoint(point);
        point += INTERVALLE_REPRISE;
      }
      const n = s.numberOfFrames;
      if (canal.length < n) {
        canal = new Float32Array(n);
        mono = new Float32Array(n);
      }
      const nc = s.numberOfChannels;
      const m = mono.subarray(0, n);
      // Mono = moyenne des canaux. Un seul canal : on le copie directement.
      s.copyTo(nc === 1 ? m : canal.subarray(0, n), { planeIndex: 0, format: 'f32-planar' });
      if (nc > 1) {
        m.set(canal.subarray(0, n));
        for (let c = 1; c < nc; c++) {
          s.copyTo(canal.subarray(0, n), { planeIndex: c, format: 'f32-planar' });
          for (let i = 0; i < n; i++) m[i]! += canal[i]!;
        }
        for (let i = 0; i < n; i++) m[i]! /= nc;
      }
      env.ajouter(m, s.sampleRate, s.timestamp, tDebut);
      suivi.avance(s.timestamp + s.duration);
    } finally {
      // Le morceau décodé est toujours libéré, même si un calcul échoue.
      s.close();
    }
  }
}

/** Temps des images clés à partir de `tDebut`, au plus une toutes les `ecart` secondes (sans lire les images). */
export async function tempsImagesCles(piste: InputVideoTrack, tDebut: Sec, ecart: Sec = 2): Promise<Sec[]> {
  const paquets = new EncodedPacketSink(piste);
  const meta = { metadataOnly: true };
  let k = await paquets.getKeyPacket(tDebut, meta);
  if (!k) k = await paquets.getFirstKeyPacket(meta);
  else if (k.timestamp < tDebut - 1e-6) k = await paquets.getNextKeyPacket(k, meta);
  const temps: Sec[] = [];
  while (k) {
    temps.push(k.timestamp);
    const voulu = k.timestamp + ecart;
    // On saute directement vers la 1re image clé à au moins 2 s de la précédente.
    let c = await paquets.getKeyPacket(voulu, meta);
    if (c && c.timestamp < voulu - 1e-3) c = await paquets.getNextKeyPacket(c, meta);
    if (c && c.timestamp <= k.timestamp) break; // sécurité : jamais en arrière
    k = c;
  }
  return temps;
}

export interface EtatImages {
  diffs: Difference[];
  /** Dernière petite image en gris. */
  derniere: Uint8Array | null;
  /** Nombre d'images clés lues. */
  lues: number;
}

/** Passe des images : différence de chaque image clé (réduite à 32 × 18) avec la précédente. */
export async function passeImages(
  piste: InputVideoTrack,
  sink: VideoSampleSink,
  tDebut: Sec,
  etat: EtatImages,
  suivi: SuiviPasse,
): Promise<void> {
  const temps = await tempsImagesCles(piste, tDebut);
  const canevas = new OffscreenCanvas(IMAGE_L, IMAGE_H);
  const ctx = canevas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  let point = prochainPoint(tDebut);
  let i = 0;
  for await (const s of sink.samplesAtTimestamps(temps)) {
    const t = temps[i++]!;
    while (t >= point) {
      suivi.auPoint(point);
      point += INTERVALLE_REPRISE;
    }
    if (!s) continue;
    try {
      s.draw(ctx, 0, 0, IMAGE_L, IMAGE_H);
    } finally {
      s.close();
    }
    const gris = enGris(ctx.getImageData(0, 0, IMAGE_L, IMAGE_H).data);
    if (etat.derniere) etat.diffs.push({ t, d: Math.round(difference(etat.derniere, gris) * 1000) / 1000 });
    etat.derniere = gris;
    etat.lues++;
    suivi.avance(t);
  }
}
