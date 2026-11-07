// Tests de MoteurVad (dev-vad) avec une FAUSSE session ONNX (jamais le vrai modèle) : état repris d'un appel à
// l'autre, contexte de 64 échantillons, grille de 32 ms quel que soit le découpage, silence numérique sauté.
import { describe, expect, it } from 'vitest';
import type { SessionOnnx, TenseurOnnx } from '../types-v4';
import { FileSon16k } from './file-son';
import { MoteurVad } from './silero';

/** p de la fausse session, telle qu'elle sort d'un Float32Array puis × 255. */
const P9 = Math.round(Math.fround(0.9) * 255);
const P1 = Math.round(Math.fround(0.1) * 255);

interface Appel {
  entree: Float32Array;
  etat: Float32Array;
  dims: readonly number[];
  sr: bigint;
}

/**
 * Fausse Silero : p = 0,9 si la trame (512 derniers échantillons) a du son au-dessus de −40 dBFS, sinon 0,1 ;
 * l'état sortant = état entrant + 1 (pour vérifier qu'il est bien repassé).
 */
function fausseSession(): SessionOnnx & { appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    async run(e: Readonly<Record<string, TenseurOnnx>>) {
      const entree = Float32Array.from(e.input!.data as Float32Array);
      const etat = Float32Array.from(e.state!.data as Float32Array);
      appels.push({ entree, etat, dims: e.input!.dims, sr: (e.sr!.data as BigInt64Array)[0]! });
      let s2 = 0;
      for (let i = 64; i < 576; i++) s2 += entree[i]! * entree[i]!;
      const p = 10 * Math.log10(s2 / 512 + 1e-20) > -40 ? 0.9 : 0.1;
      return {
        output: { type: 'float32', data: Float32Array.from([p]), dims: [1, 1] },
        stateN: { type: 'float32', data: etat.map((x) => x + 1), dims: [2, 1, 128] },
      };
    },
  };
}

/** Son de test à 16 kHz : sinus à −20 dBFS sur [de, a[, `fond` ailleurs. */
function son(duree: number, plages: [number, number][], fond = 0.001): Float32Array {
  const x = new Float32Array(Math.round(duree * 16000));
  for (let i = 0; i < x.length; i++) x[i] = fond * Math.sin(i * 0.37);
  for (const [de, a] of plages) for (let i = Math.round(de * 16000); i < Math.round(a * 16000); i++) x[i] = 0.14 * Math.sin((2 * Math.PI * 220 * i) / 16000);
  return x;
}

async function passer(m: MoteurVad, x: Float32Array, t0: number, tailles: number[]) {
  let i = 0;
  let j = 0;
  while (i < x.length) {
    const n = tailles[j++ % tailles.length]!;
    await m.ajouter(x.subarray(i, i + n), t0 + i / 16000);
    i += n;
  }
  await m.finir();
}

describe('MoteurVad (Silero sur une session ONNX)', () => {
  it('entrée [1, 576] = 64 échantillons de la trame d\'avant + 512 nouveaux ; état repris ; sr = 16000', async () => {
    const s = fausseSession();
    const m = new MoteurVad(s, 1);
    const x = son(1, [[0, 1]]);
    await passer(m, x, 0, [700]);
    expect(s.appels.length).toBe(Math.ceil(16000 / 512));
    expect(s.appels[0]!.dims).toEqual([1, 576]);
    expect(s.appels[0]!.sr).toBe(16000n);
    // 1er appel : contexte et état à zéro.
    expect(Array.from(s.appels[0]!.entree.subarray(0, 64)).every((v) => v === 0)).toBe(true);
    expect(s.appels[0]!.etat.every((v) => v === 0)).toBe(true);
    for (let k = 1; k < 10; k++) {
      // Contexte = 64 derniers échantillons de la trame d'avant ; trame = son de [512 k, 512 (k + 1)[.
      expect(Array.from(s.appels[k]!.entree.subarray(0, 64))).toEqual(Array.from(x.subarray(512 * k - 64, 512 * k)));
      expect(Array.from(s.appels[k]!.entree.subarray(64))).toEqual(Array.from(x.subarray(512 * k, 512 * (k + 1))));
      expect(s.appels[k]!.etat[0]).toBe(k);
    }
  });

  it('les probabilités ne dépendent pas du découpage du son ; cases de 32 ms en temps source', async () => {
    const x = son(4, [[1, 2.5]]);
    const a = new MoteurVad(fausseSession(), 14);
    const b = new MoteurVad(fausseSession(), 14);
    await passer(a, x, 10, [16000 * 4]);
    await passer(b, x, 10, [7, 341, 1365, 4096, 1, 512]);
    expect(Array.from(b.p)).toEqual(Array.from(a.p));
    // t0 = 10 s : case 312 (9,984–10,016 s) incomplète au début (sautée), voix de 11 à 12,5 s.
    expect(a.p[Math.floor(10.5 / 0.032)]).toBe(P1);
    expect(a.p[Math.floor(11.5 / 0.032)]).toBe(P9);
    expect(a.p[Math.floor(13 / 0.032)]).toBe(P1);
    expect(a.p[100]).toBe(0); // jamais calculée
    expect(a.fait).toBeGreaterThanOrEqual(13.99);
  });

  it('silence numérique (< −90 dBFS) : sauté après 1 s, p = 0, état du début du saut repris', async () => {
    const x = son(6, [[0, 1], [4, 5]]);
    x.fill(0, 1.5 * 16000, 3.8 * 16000); // 2,3 s de silence numérique
    const s = fausseSession();
    const m = new MoteurVad(s, 6);
    await passer(m, x, 0, [1024]);
    const tot = Math.ceil((6 * 16000) / 512);
    expect(m.bilan.trames).toBe(tot);
    // 2,3 s de silence : la 1ʳᵉ seconde passe dans le modèle, le reste (≈ 1,3 s ≈ 40 trames) est sauté.
    expect(m.bilan.sautees).toBeGreaterThan(35);
    expect(m.bilan.sautees).toBeLessThan(45);
    expect(m.bilan.calculees + m.bilan.sautees).toBe(tot);
    expect(s.appels.length).toBe(m.bilan.calculees);
    expect(m.p[Math.floor(3 / 0.032)]).toBe(0);
    // Reprise : l'état continue (pas de remise à zéro) ; voix entendue à 4,5 s.
    const etats = s.appels.map((a) => a.etat[0]!);
    expect(etats.every((v, i) => v === i)).toBe(true);
    expect(m.p[Math.floor(4.5 / 0.032)]).toBe(P9);
    // Plages passées dans le modèle : le saut de 1,3 s les coupe en deux.
    expect(m.plages().length).toBe(2);
  });

  it('sans saut (banc) : toutes les trames passent dans le modèle', async () => {
    const x = son(3, [[0, 0.5]]);
    x.fill(0, 16000, 3 * 16000);
    const m = new MoteurVad(fausseSession(), 3, { sauterSilence: false });
    await passer(m, x, 0, [4096]);
    expect(m.bilan.sautees).toBe(0);
    expect(m.bilan.calculees).toBe(Math.ceil((3 * 16000) / 512));
    expect(m.plages()).toEqual([{ de: 0, a: 3 }]);
  });

  it('un trou dans le son reçu : nouveau départ, calé sur la grille, état remis à zéro', async () => {
    const s = fausseSession();
    const m = new MoteurVad(s, 20);
    await m.ajouter(son(1, [[0, 1]]), 0);
    await m.ajouter(son(1, [[0, 1]]), 10.01);
    await m.finir();
    expect(m.bilan.reinitialisations).toBe(1);
    // La 1ʳᵉ trame après le trou commence sur la grille (case ⌈10,01 / 0,032⌉ = 313), état à zéro.
    const iTrou = s.appels.findIndex((a, i) => i > 0 && a.etat[0] === 0);
    expect(iTrou).toBeGreaterThan(0);
    expect(m.p[312]).toBe(0);
    expect(m.p[313]).toBe(P9);
  });

  it('une sortie inattendue lève (la passe du son continue sans la VAD)', async () => {
    const casse: SessionOnnx = { run: async () => ({ autre: { type: 'float32', data: new Float32Array(1), dims: [1] } }) };
    const m = new MoteurVad(casse, 1);
    await expect(m.ajouter(son(0.1, [[0, 0.1]]), 0)).rejects.toThrow(/Silero/);
  });
});

describe('FileSon16k (son retenu pour la hauteur jusqu\'au jugement de la VAD)', () => {
  it('rend le son d\'avant t, coupe un morceau à cheval, garde le reste', () => {
    const f = new FileSon16k();
    f.pousser(Float32Array.from({ length: 1600 }, (_, i) => i), 1);
    f.pousser(Float32Array.from({ length: 1600 }, (_, i) => 1600 + i), 1.1);
    const a = f.prendreJusqua(1.05);
    expect(a.length).toBe(1);
    expect(a[0]!.pcm.length).toBe(800);
    const b = f.prendreJusqua(1.15);
    expect(b.map((x) => [x.t0, x.pcm.length])).toEqual([[1.05, 800], [1.1, 800]]);
    const c = f.vider();
    expect(c.length).toBe(1);
    expect(c[0]!.pcm[0]).toBe(2400);
    expect(f.prendreJusqua(99)).toEqual([]);
  });
});
