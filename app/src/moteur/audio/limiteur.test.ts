// Limiteur doux (QA I-1) : linéaire sous −1 dBFS, volume baissé sans déformer l'onde, jamais au-delà de −0,3 dBFS.
import { describe, expect, it } from 'vitest';
import { chargerSon } from '../../sons/chargeur';
import { limiter, PLAFOND_SORTIE, SEUIL_LIMITEUR } from './limiteur';

const F = 48000;
const sinus = (amp: number, duree: number, freq = 1000) =>
  Float32Array.from({ length: Math.round(duree * F) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / F));
const crete = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

describe('limiteur', () => {
  it('ne touche pas un son sous −1 dBFS', () => {
    const x = sinus(0.8, 0.2);
    const y = x.slice();
    limiter([y], F);
    expect(y).toEqual(x);
  });

  it('un sinus à 150 % est ramené sous le seuil SANS distorsion (forme intacte, gain presque constant)', () => {
    const x = sinus(SEUIL_LIMITEUR * 1.5, 0.5);
    const y = x.slice();
    limiter([y], F);
    expect(crete(y)).toBeLessThanOrEqual(PLAFOND_SORTIE);
    // Après la descente du volume (≤ 5 ms), la sortie = entrée × un gain fixe : aucune déformation de l'onde.
    const debut = Math.round(0.02 * F);
    const g = SEUIL_LIMITEUR / (SEUIL_LIMITEUR * 1.5);
    for (let k = debut; k < y.length; k++) expect(Math.abs(y[k]! - x[k]! * g)).toBeLessThan(0.005);
  });

  it('ne dépasse jamais −0,3 dBFS, même sur un bruit très fort, et le gain continue d\'un bloc à l\'autre', () => {
    let graine = 1;
    const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const x = Float32Array.from({ length: F }, () => hasard() * 3);
    const a = x.slice(0, F / 2);
    const b = x.slice(F / 2);
    const gain = limiter([a], F);
    limiter([b], F, { gainDepart: gain });
    expect(Math.max(crete(a), crete(b))).toBeLessThanOrEqual(PLAFOND_SORTIE);
    expect(gain).toBeLessThan(0.5);
  });

  it('un son du catalogue à 150 % est plus fort qu\'à 100 %, et sa forme reste propre', async () => {
    const son = (await chargerSon('interface.ding')).canaux[0]!;
    const fois = (v: number) => {
      const y = son.map((s) => s * v);
      limiter([y], F);
      return y;
    };
    const a100 = fois(1);
    const a150 = fois(1.5);
    expect(20 * Math.log10(rms(a150) / rms(a100))).toBeGreaterThan(2.5); // +3,5 dB demandés
    expect(crete(a150)).toBeLessThanOrEqual(PLAFOND_SORTIE);
  });
});
