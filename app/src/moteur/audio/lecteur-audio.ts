// Lecture du son d'une source par plages de temps : décode à la demande (AudioSampleSink.samples),
// garde un petit tampon des derniers morceaux, et renvoie du PCM f32 par canal. Jamais tout le fichier en mémoire.

import type { AudioSample, AudioSampleSink } from 'mediabunny';
import { creerFile } from '../file';
import type { Pcm } from './reechantillonner';

interface Morceau {
  debut: number;
  fin: number;
  frequence: number;
  canaux: Float32Array[];
}

/** On garde au plus ~4 s de son décodé derrière la position demandée. */
const GARDE_S = 4;
/** Petite marge avant la plage demandée (pré-roulage du décodeur). */
const MARGE_S = 0.05;

export class LecteurAudio {
  private iter: AsyncGenerator<AudioSample, void, unknown> | null = null;
  private tampon: Morceau[] = [];
  private fini = false;
  private ferme = false;
  /** Verrou : le lecteur peut être partagé par deux rendus successifs (aperçu), jamais deux lectures croisées. */
  private readonly verrou = creerFile();

  constructor(private readonly sink: Pick<AudioSampleSink, 'samples'>) {}

  /** PCM couvrant au moins [ts0, ts1] (silence là où la source n'a pas de son). */
  lire(ts0: number, ts1: number): Promise<Pcm | null> {
    return this.verrou(() => this.lireInterne(ts0, ts1));
  }

  private async lireInterne(ts0: number, ts1: number): Promise<Pcm | null> {
    if (this.ferme) return null;
    const premier = this.tampon[0];
    const dernier = this.tampon[this.tampon.length - 1];
    const horsTampon = !premier || ts0 < premier.debut - 1e-3 || (!!dernier && ts0 > dernier.fin + 1);
    if (!this.iter || horsTampon) await this.relancer(ts0);
    while (!this.fini && (this.tampon.length === 0 || this.tampon[this.tampon.length - 1]!.fin < ts1)) {
      const r = await this.iter!.next();
      if (r.done) {
        this.fini = true;
        break;
      }
      try {
        this.tampon.push(versMorceau(r.value));
      } finally {
        r.value.close(); // toujours libérer l'échantillon, même si la copie échoue
      }
    }
    this.tampon = this.tampon.filter((m) => m.fin >= ts0 - GARDE_S);
    return assembler(this.tampon, ts0, ts1);
  }

  private async relancer(ts0: number) {
    await this.iter?.return(undefined).catch(() => undefined);
    this.tampon = [];
    this.fini = false;
    this.iter = this.sink.samples(Math.max(0, ts0 - MARGE_S));
  }

  async fermer() {
    this.ferme = true;
    await this.verrou(async () => {
      await this.iter?.return(undefined).catch(() => undefined);
      this.iter = null;
      this.tampon = [];
    });
  }
}

function versMorceau(s: AudioSample): Morceau {
  const canaux: Float32Array[] = [];
  for (let c = 0; c < s.numberOfChannels; c++) {
    const dest = new Float32Array(s.numberOfFrames);
    s.copyTo(dest, { planeIndex: c, format: 'f32-planar' });
    canaux.push(dest);
  }
  return { debut: s.timestamp, fin: s.timestamp + s.numberOfFrames / s.sampleRate, frequence: s.sampleRate, canaux };
}

/** Recolle les morceaux qui touchent [ts0, ts1] dans un seul PCM, placé selon leurs temps (pur). */
export function assembler(morceaux: Morceau[], ts0: number, ts1: number): Pcm | null {
  const utiles = morceaux.filter((m) => m.fin > ts0 && m.debut < ts1 + 0.01);
  if (utiles.length === 0) return null;
  const f = utiles[0]!.frequence;
  const nbCanaux = Math.max(...utiles.map((m) => m.canaux.length));
  const debut = utiles[0]!.debut;
  const fin = Math.max(...utiles.map((m) => m.fin));
  const len = Math.max(1, Math.round((fin - debut) * f));
  const canaux = Array.from({ length: nbCanaux }, () => new Float32Array(len));
  for (const m of utiles) {
    const k = Math.round((m.debut - debut) * f);
    m.canaux.forEach((c, i) => {
      const place = Math.min(c.length, len - k);
      if (place > 0 && k >= 0) canaux[i]!.set(c.subarray(0, place), k);
    });
  }
  return { frequence: f, debut, canaux };
}
