// Tests de Vers16k (dev-vad) : son ramené à 16 kHz pour Silero, au fil de la lecture.
import { describe, expect, it } from 'vitest';
import { Vers16k, type Morceau16k } from './reechantillonnage';

function sinus(f: number, frequence: number, duree: number, amp = 0.5): Float32Array {
  return Float32Array.from({ length: Math.round(duree * frequence) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / frequence));
}

function tout(v: Vers16k, x: Float32Array, frequence: number, debut: number, morceau: number): Morceau16k[] {
  const res: Morceau16k[] = [];
  for (let i = 0; i < x.length; i += morceau) {
    const r = v.ajouter(x.subarray(i, i + morceau), frequence, debut + i / frequence);
    if (r) res.push(r);
  }
  return res;
}

const coller = (m: Morceau16k[]) => {
  const n = m.reduce((t, x) => t + x.pcm.length, 0);
  const res = new Float32Array(n);
  let i = 0;
  for (const x of m) {
    res.set(x.pcm, i);
    i += x.pcm.length;
  }
  return res;
};

const rmsDb = (x: Float32Array, de = 0) => {
  let s = 0;
  for (let i = de; i < x.length; i++) s += x[i]! * x[i]!;
  return 10 * Math.log10(s / Math.max(1, x.length - de));
};

describe('Vers16k', () => {
  it('48 kHz : 1 échantillon sur 3, la voix (1 kHz) intacte, les aigus du jeu (10 kHz) coupés', () => {
    const voix = coller(tout(new Vers16k(), sinus(1000, 48000, 1), 48000, 0, 1024));
    expect(voix.length).toBe(16000);
    expect(Math.abs(rmsDb(voix, 800) - rmsDb(sinus(1000, 16000, 1), 800))).toBeLessThan(0.3);
    // 10 kHz se replierait sur 6 kHz : il doit être bien plus faible.
    const aigu = coller(tout(new Vers16k(), sinus(10000, 48000, 1), 48000, 0, 1024));
    expect(rmsDb(aigu, 800) - rmsDb(sinus(1000, 16000, 1), 800)).toBeLessThan(-15);
  });

  it('le découpage ne change rien ; le temps du 1er échantillon est sur la grille 1 / 16000 depuis t = 0', () => {
    const x = sinus(440, 48000, 2);
    const a = tout(new Vers16k(), x, 48000, 3.00002, x.length);
    const b = tout(new Vers16k(), x, 48000, 3.00002, 1000);
    expect(Array.from(coller(b))).toEqual(Array.from(coller(a)));
    expect(a[0]!.t0 * 16000).toBeCloseTo(Math.ceil(3.00002 * 16000), 6);
    // Morceaux suivants : t0 = suite exacte des échantillons.
    let n = Math.round(b[0]!.t0 * 16000);
    for (const m of b) {
      expect(Math.round(m.t0 * 16000)).toBe(n);
      n += m.pcm.length;
    }
  });

  it('44,1 kHz : vraie fréquence de 16 kHz (pas 14,7), même niveau', () => {
    const r = coller(tout(new Vers16k(), sinus(800, 44100, 2), 44100, 0, 1024));
    expect(Math.abs(r.length - 32000)).toBeLessThanOrEqual(1);
    expect(Math.abs(rmsDb(r, 800) - rmsDb(sinus(800, 16000, 2), 800))).toBeLessThan(0.3);
    // La fréquence est juste : 800 Hz → 1600 passages par zéro en 1 s (environ).
    let z = 0;
    for (let i = 16001; i < 32000; i++) if (r[i - 1]! < 0 !== r[i]! < 0) z++;
    expect(Math.abs(z - 1600)).toBeLessThan(5);
  });

  it('16 kHz : recopié tel quel ; un trou > 50 ms ou une autre fréquence : nouveau flux', () => {
    const x = sinus(300, 16000, 0.5);
    const v = new Vers16k();
    const a = v.ajouter(x, 16000, 1)!;
    expect(Array.from(a.pcm)).toEqual(Array.from(x));
    expect(a.t0).toBe(1);
    const b = v.ajouter(x, 16000, 5)!;
    expect(b.t0).toBe(5);
    expect(v.ajouter(new Float32Array(0), 16000, 6)).toBeNull();
  });
});
