// File de son à 16 kHz (dev-vad), PURE : garde les morceaux pas encore donnés à la hauteur de la voix, pour ne les
// donner qu'une fois que la VAD a jugé leurs trames (la hauteur n'est calculée que là où p ≥ 0,5 : sans ce retard,
// les dernières 32 ms de chaque morceau seraient vues « sans voix »). Mémoire bornée : ≈ 1 trame de VAD.

import type { Sec } from '../../recette/types';
import type { Morceau16k } from './reechantillonnage';

const F = 16000;

export class FileSon16k {
  private morceaux: Morceau16k[] = [];

  pousser(pcm: Float32Array, t0: Sec): void {
    if (pcm.length > 0) this.morceaux.push({ pcm, t0 });
  }

  /** Sort tout le son d'avant `t` (s) ; un morceau à cheval est coupé (sa fin reste dans la file). */
  prendreJusqua(t: Sec): Morceau16k[] {
    const res: Morceau16k[] = [];
    while (this.morceaux.length > 0) {
      const m = this.morceaux[0]!;
      const n = Math.min(m.pcm.length, Math.max(0, Math.round((t - m.t0) * F)));
      if (n <= 0) break;
      if (n >= m.pcm.length) {
        res.push(m);
        this.morceaux.shift();
        continue;
      }
      res.push({ pcm: m.pcm.subarray(0, n), t0: m.t0 });
      this.morceaux[0] = { pcm: m.pcm.subarray(n), t0: m.t0 + n / F };
      break;
    }
    return res;
  }

  /** Tout ce qui reste. */
  vider(): Morceau16k[] {
    const res = this.morceaux;
    this.morceaux = [];
    return res;
  }
}
