import { describe, expect, it } from 'vitest';
import { FREQUENCE } from './config';
import { couperFenetre, ecouterPlages, type Reconnaissance } from './ecoute';
import type { SonOuvert } from './lecture-son';
import type { FenetreSautee } from './messages';

/** Faux son ouvert (comme l'AudioSampleSink de Mediabunny) : morceaux de 1024 images d'un tampon 16 kHz. */
function sonDe(pcm: Float32Array): SonOuvert {
  const n = 1024;
  const sink = {
    async *samples(de = 0, a = Infinity) {
      for (let k = Math.floor((de * FREQUENCE) / n); k * n < pcm.length && (k * n) / FREQUENCE < a; k++) {
        const d = pcm.subarray(k * n, Math.min(pcm.length, (k + 1) * n));
        yield {
          numberOfChannels: 1,
          numberOfFrames: d.length,
          sampleRate: FREQUENCE,
          timestamp: (k * n) / FREQUENCE,
          copyTo: (dest: Float32Array) => dest.set(d.subarray(0, dest.length)),
          close() {},
        };
      }
    },
  };
  return { sink, duree: pcm.length / FREQUENCE, fermer() {} } as unknown as SonOuvert;
}

/** Son fabriqué : bruit de « voix » à 0,1 partout, sauf du silence numérique sur [silDe, silA[. */
function sonFabrique(duree: number, silences: [number, number][] = []): Float32Array {
  const pcm = new Float32Array(Math.round(duree * FREQUENCE));
  let x = 1;
  for (let i = 0; i < pcm.length; i++) {
    x = (x * 16807) % 2147483647;
    pcm[i] = ((x / 2147483647) * 2 - 1) * 0.17;
  }
  for (const [a, b] of silences) pcm.fill(0, Math.round(a * FREQUENCE), Math.round(b * FREQUENCE));
  return pcm;
}

/** Fausse reconnaissance : un « mot » de 0,3 s toutes les 2 s de la fenêtre ; `plante(duree)` dit quand lever. */
function fausseReco(plante: (dureeFenetre: number, appel: number) => boolean = () => false): { reco: Reconnaissance; appels: number[] } {
  const appels: number[] = [];
  const reco: Reconnaissance = async (pcm) => {
    const d = pcm.length / FREQUENCE;
    appels.push(Math.round(d * 10) / 10);
    if (plante(d, appels.length)) throw new Error('token_ids must be a non-empty array of integers.');
    const chunks = [];
    for (let t = 0.5; t + 0.3 < d; t += 2) chunks.push({ text: ' mot', timestamp: [t, t + 0.3] as [number, number | null] });
    return { text: '', chunks };
  };
  return { reco, appels };
}

describe('couperFenetre', () => {
  it('coupe le son et la table des pièces au temps donné', () => {
    const pcm = new Float32Array(10 * FREQUENCE);
    const [a, b] = couperFenetre(pcm, [{ decalage: 0, de: 100, a: 104 }, { decalage: 4.2, de: 200, a: 205.8 }], 6);
    expect(a.pcm.length).toBe(6 * FREQUENCE);
    expect(b.pcm.length).toBe(4 * FREQUENCE);
    expect(a.pieces).toEqual([{ decalage: 0, de: 100, a: 104 }, { decalage: 4.2, de: 200, a: expect.closeTo(201.8, 6) }]);
    expect(b.pieces).toEqual([{ decalage: 0, de: expect.closeTo(201.8, 6), a: 205.8 }]);
  });
});

describe('ecouterPlages', () => {
  it('écoute tout, fenêtre par fenêtre, et rend les mots en temps source', async () => {
    const { reco, appels } = fausseReco();
    const mots = await ecouterPlages(sonDe(sonFabrique(60)), [{ de: 0, a: 60 }], reco, { langue: 'fr' });
    expect(appels.length).toBe(3);
    expect(mots.length).toBeGreaterThan(20);
    expect(mots.every((m) => m.ts >= 0 && m.fin <= 60 && m.fin > m.ts)).toBe(true);
  });

  it("une fenêtre où Whisper plante est réessayée en deux moitiés : l'écoute ne s'arrête pas", async () => {
    const sautees: FenetreSautee[] = [];
    // La 2ᵉ fenêtre entière (≈ 28 s) plante ; ses moitiés passent.
    const { reco, appels } = fausseReco((d, n) => n === 2 && d > 20);
    const mots = await ecouterPlages(sonDe(sonFabrique(60)), [{ de: 0, a: 60 }], reco, { langue: 'fr', sautees });
    expect(appels.length).toBe(5);
    expect(sautees).toEqual([]);
    // Des mots partout, y compris dans la fenêtre qui a planté.
    expect(mots.some((m) => m.ts > 30 && m.ts < 50)).toBe(true);
  });

  it('une fenêtre qui plante toujours est sautée et notée, les autres gardent leurs mots', async () => {
    const sautees: FenetreSautee[] = [];
    // Appel 2 = la 2ᵉ fenêtre entière, appels 3 et 4 = ses deux moitiés : tout plante.
    const { reco } = fausseReco((_d, n) => n >= 2 && n <= 4);
    const mots = await ecouterPlages(sonDe(sonFabrique(60)), [{ de: 0, a: 60 }], reco, { langue: 'fr', sautees });
    expect(sautees.length).toBe(2);
    expect(sautees[0]!.message).toMatch(/token_ids/);
    expect(mots.length).toBeGreaterThan(10);
  });

  it('lève seulement si aucune fenêtre ne passe (module vraiment cassé)', async () => {
    const { reco } = fausseReco(() => true);
    await expect(ecouterPlages(sonDe(sonFabrique(30)), [{ de: 0, a: 30 }], reco, { langue: 'fr' })).rejects.toThrow(/token_ids/);
  });

  it("ne donne pas le silence numérique à Whisper (il y invente des phrases)", async () => {
    const { reco, appels } = fausseReco();
    const mots = await ecouterPlages(sonDe(sonFabrique(90, [[20, 90]])), [{ de: 0, a: 90 }], reco, { langue: 'fr' });
    expect(appels.length).toBe(1);
    expect(mots.every((m) => m.ts < 28)).toBe(true);
  });

  it('gain : la voix faible arrive remontée à Whisper, le niveau des mots le dit', async () => {
    const faible = sonFabrique(20).map((x) => x * 0.1); // ≈ −40 dBFS
    const niveaux: number[] = [];
    const reco: Reconnaissance = async (pcm) => {
      let s = 0;
      for (const x of pcm) s += x * x;
      niveaux.push(Math.sqrt(s / pcm.length));
      return { chunks: [{ text: ' mot', timestamp: [1, 1.3] }] };
    };
    const sans = await ecouterPlages(sonDe(faible), [{ de: 0, a: 20 }], reco, { langue: 'fr' });
    const avec = await ecouterPlages(sonDe(faible), [{ de: 0, a: 20 }], reco, { langue: 'fr', gain: true });
    expect(20 * Math.log10(niveaux[0]!)).toBeCloseTo(-40, 0);
    expect(20 * Math.log10(niveaux[1]!)).toBeCloseTo(-20, 0);
    expect(avec[0]!.niveau).toBeGreaterThan(sans[0]!.niveau * 5);
  });
});
