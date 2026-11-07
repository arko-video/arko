// Banc réel — accès au son de la session, décodé UNE fois par ffmpeg (hors dépôt) en PCM float 32 bits mono.
// Le navigateur lit le son avec Mediabunny (AudioSampleSink, WebCodecs) : il reçoit des morceaux décodés à la
// fréquence de la piste (48 kHz pour une capture OBS) et chaque module les ramène lui-même à 16 kHz. On reproduit
// CE chemin : le banc lit du 48 kHz et donne aux fonctions d'Arko de faux « AudioSample » de 1024 images
// (taille d'un paquet AAC), comme le ferait le décodeur du navigateur.
//
// ÉCART connu : la session n'existe ici qu'en Opus 16 kHz (bande coupée à 8 kHz) ; ffmpeg la redécode à 48 kHz.
// Le fichier de Romain (OBS) avait toute la bande. Voir le rapport.

import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';

export const DOSSIER_CACHE = process.env.BANC_CACHE ?? '/home/claude/banc-cache';
/** Fréquence du son décodé donné aux fonctions d'Arko : 48 kHz comme une capture OBS (BANC_FREQUENCE=16000 pour comparer). */
export const FREQUENCE_PCM = Number(process.env.BANC_FREQUENCE ?? 48000);
export const FICHIER_PCM = `${DOSSIER_CACHE}/son-${FREQUENCE_PCM / 1000}k.f32`;
/** Images par morceau décodé (paquet AAC). */
export const IMAGES_PAR_MORCEAU = 1024;

/** Le son de la session, lu à la demande dans le fichier PCM (pas tout en mémoire : 2,3 Go). */
export class SonPcm {
  readonly fd: number;
  readonly images: number;
  readonly duree: number;

  constructor(
    chemin = FICHIER_PCM,
    readonly frequence = FREQUENCE_PCM,
  ) {
    if (!existsSync(chemin)) {
      throw new Error(
        `Son décodé absent (${chemin}). Le refaire : pour i dans 0 1 2 : ffmpeg -i part$i.ogg -t 3000 -ac 1 -ar 48000 -f f32le -, ` +
          'puis part3.ogg en entier, le tout collé dans ce fichier (voir tests/banc-reel/LISEZ-MOI.md).',
      );
    }
    this.fd = openSync(chemin, 'r');
    this.images = Math.floor(statSync(chemin).size / 4);
    this.duree = this.images / this.frequence;
  }

  /** Images [i0, i1[ (bornées au fichier). */
  lireImages(i0: number, i1: number): Float32Array {
    const a = Math.max(0, Math.min(this.images, Math.floor(i0)));
    const b = Math.max(a, Math.min(this.images, Math.floor(i1)));
    const tampon = Buffer.alloc((b - a) * 4);
    let lu = 0;
    while (lu < tampon.length) {
      const n = readSync(this.fd, tampon, lu, tampon.length - lu, a * 4 + lu);
      if (n <= 0) break;
      lu += n;
    }
    return new Float32Array(tampon.buffer, tampon.byteOffset, lu / 4).slice();
  }

  /** Son entre `de` et `a` secondes. */
  lire(de: number, a: number): Float32Array {
    return this.lireImages(Math.round(de * this.frequence), Math.round(a * this.frequence));
  }

  fermer(): void {
    closeSync(this.fd);
  }
}

/** Ce que les fonctions d'Arko utilisent d'un AudioSample de Mediabunny. */
export interface FauxAudioSample {
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  timestamp: number;
  duration: number;
  copyTo(dest: Float32Array, options: { planeIndex: number; format?: string }): void;
  close(): void;
}

function morceau(son: SonPcm, k: number): FauxAudioSample {
  const i0 = k * IMAGES_PAR_MORCEAU;
  const donnees = son.lireImages(i0, i0 + IMAGES_PAR_MORCEAU);
  return {
    numberOfChannels: 1,
    numberOfFrames: donnees.length,
    sampleRate: son.frequence,
    timestamp: i0 / son.frequence,
    duration: donnees.length / son.frequence,
    copyTo(dest) {
      dest.set(donnees.subarray(0, dest.length));
    },
    close() {},
  };
}

/**
 * Faux AudioSampleSink de Mediabunny : `samples(de, a)` donne, dans l'ordre, les morceaux qui touchent [de, a[
 * (le premier commence au plus tard à `de`, comme le décodeur qui part du paquet qui contient `de`).
 */
export function fauxSink(son: SonPcm) {
  return {
    async *samples(de = 0, a = Infinity): AsyncGenerator<FauxAudioSample> {
      const kMax = Math.ceil(son.images / IMAGES_PAR_MORCEAU);
      const k0 = Math.max(0, Math.floor((de * son.frequence) / IMAGES_PAR_MORCEAU));
      const fin = Math.min(a, son.duree);
      for (let k = k0; k < kMax && (k * IMAGES_PAR_MORCEAU) / son.frequence < fin; k++) yield morceau(son, k);
    },
  };
}

/** Morceaux décodés de toute la source, par blocs plus gros (lecture rapide pour les analyses complètes). */
export function* morceauxGros(son: SonPcm, de = 0, a = son.duree, taille = 48000 * 10): Generator<FauxAudioSample> {
  const i1 = Math.min(son.images, Math.round(a * son.frequence));
  for (let i0 = Math.max(0, Math.round(de * son.frequence)); i0 < i1; i0 += taille) {
    const donnees = son.lireImages(i0, Math.min(i1, i0 + taille));
    yield {
      numberOfChannels: 1,
      numberOfFrames: donnees.length,
      sampleRate: son.frequence,
      timestamp: i0 / son.frequence,
      duration: donnees.length / son.frequence,
      copyTo(dest) {
        dest.set(donnees.subarray(0, dest.length));
      },
      close() {},
    };
  }
}
