// I-3 : le pré-décodage et le dessin ne relancent jamais le décodage en même temps,
// et aucune image (VideoSample) ne reste ouverte après fermeture.
import type { VideoSample } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { CurseurImages, type SinkImages } from './curseur-images';

function fauxSink() {
  const stats = { ouvertes: 0, iterateursActifs: 0, maxIterateurs: 0, relances: 0 };
  const sink: SinkImages = {
    samples(debut = 0, fin = Infinity) {
      stats.relances++;
      return (async function* () {
        stats.iterateursActifs++;
        stats.maxIterateurs = Math.max(stats.maxIterateurs, stats.iterateursActifs);
        try {
          // Images à 30 i/s, en partant de l'image clé (multiple de 1 s) avant `debut`.
          for (let k = Math.floor(debut) * 30; k / 30 < fin; k++) {
            await new Promise((ok) => setTimeout(ok, 0)); // décodage « lent »
            if ((k + 1) / 30 <= debut) continue;
            stats.ouvertes++;
            let fermee = false;
            yield { timestamp: k / 30, close: () => !fermee && ((fermee = true), stats.ouvertes--) } as unknown as VideoSample;
          }
        } finally {
          stats.iterateursActifs--;
        }
      })();
    },
  };
  return { sink, stats };
}

describe('CurseurImages (I-3)', () => {
  it('donne la bonne image et la garde ouverte pendant le dessin', async () => {
    const { sink, stats } = fauxSink();
    const c = new CurseurImages(sink, 10);
    const t = await c.avecImage(2.5, (img) => img?.timestamp);
    expect(t).toBeCloseTo(2.5);
    expect(await c.avecImage(2.6, (img) => img?.timestamp)).toBeCloseTo(2.6);
    await c.fermer();
    expect(stats.ouvertes).toBe(0);
  });

  it('pré-décodage et dessins croisés : jamais deux décodages à la fois, rien d\'oublié', async () => {
    const { sink, stats } = fauxSink();
    const c = new CurseurImages(sink, 10);
    c.prechauffer(5);
    const dessins = [c.avecImage(1.2, (i) => i?.timestamp), c.avecImage(0.4, (i) => i?.timestamp)];
    c.prechauffer(7); // déjà lancé : sans effet
    const ts = await Promise.all([...dessins, c.avecImage(8.1, (i) => i?.timestamp)]);
    expect(ts[0]).toBeCloseTo(1.2);
    expect(ts[1]).toBeCloseTo(0.4);
    expect(ts[2]).toBeCloseTo(8.1);
    expect(stats.maxIterateurs).toBe(1);
    await c.fermer();
    expect(stats.ouvertes).toBe(0);
    expect(stats.iterateursActifs).toBe(0);
  });

  it('fermer pendant un pré-décodage ne laisse aucune image ouverte', async () => {
    const { sink, stats } = fauxSink();
    const c = new CurseurImages(sink, 10);
    c.prechauffer(3);
    const d = c.avecImage(3.5, (i) => i);
    await c.fermer();
    expect(await d).toBeNull();
    expect(stats.ouvertes).toBe(0);
    expect(await c.avecImage(1, (i) => i)).toBeNull();
  });
});
