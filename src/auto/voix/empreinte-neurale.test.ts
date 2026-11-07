// Empreinte de voix (dev-voix) avec une FAUSSE session ONNX (aucun modèle n'est chargé) et un faux Worker :
// entrées / sorties du modèle, empreintes normées, deux voix fabriquées → deux centres (cosinus < 0,68), une voix → un
// centre ; le client (lanceur injecté, protocole du Worker, erreurs, annulation).
import { afterEach, describe, expect, it } from 'vitest';
import { ErreurArko } from '../../moteur/erreurs';
import type { SourceOuverte } from '../../moteur/api';
import type { DemandeEmpreintesNeurales, SessionOnnx, TenseurOnnx } from '../types-v4';
import { calculerEmpreintesNeurales, definirLanceurEmpreintes, lanceurWorker } from './client-empreintes';
import { calculerEmpreintes, empreinteDuSon } from './empreinte-neurale';
import { cosinus, groupesDEmpreintes } from './groupes';
import { fabriquerVoix, FREQ_TEST, VOIX_A, VOIX_B } from './voix-test';

/**
 * Fausse session : « empreinte » de 192 valeurs = maximum de chaque bande de la fbank dans le temps (80), moins leur
 * moyenne, puis des zéros. Elle garde les appels pour vérifier les entrées.
 */
function fausseSession(): SessionOnnx & { appels: { nom: string; dims: readonly number[] }[] } {
  const appels: { nom: string; dims: readonly number[] }[] = [];
  return {
    appels,
    async run(entrees: Readonly<Record<string, TenseurOnnx>>) {
      const [nom, t] = Object.entries(entrees)[0]!;
      appels.push({ nom, dims: t.dims });
      const T = t.dims[1]!;
      const x = t.data as Float32Array;
      const v = new Float32Array(192);
      let m = 0;
      for (let b = 0; b < 80; b++) {
        let max = -Infinity;
        for (let k = 0; k < T; k++) max = Math.max(max, x[k * 80 + b]!);
        v[b] = max;
        m += max / 80;
      }
      // Moins la moyenne (sinon tout se ressemble), et pas normée exprès (le vrai modèle ne l'est pas non plus).
      for (let b = 0; b < 80; b++) v[b] = 7 * (v[b]! - m);
      return { embedding: { type: 'float32', data: v, dims: [1, 192] } };
    },
  };
}

/** Une voix très différente de VOIX_A (aiguë, claire) : la fausse empreinte doit les séparer. */
const VOIX_AIGUE = { f0: 320, formants: 1.45, pente: 0.3 };

/** Le son d'une voix fabriquée sur [de, a[ (une seule voix parle tout le temps). */
function sonDe(timbre: typeof VOIX_A, de: number, a: number, graine: number): Float32Array {
  return fabriquerVoix(timbre, [{ de: 0, a: a - de }], a - de, -30, graine);
}

describe('empreinte neuronale (fausse session)', () => {
  it('entrée « x » [1, T, 80] (fbank 80 de 10 ms), sortie normée', async () => {
    const s = fausseSession();
    const v = await empreinteDuSon(s, sonDe(VOIX_A, 0, 1.5, 1));
    expect(s.appels).toEqual([{ nom: 'x', dims: [1, 148, 80] }]);
    expect(v.length).toBe(192);
    expect(cosinus(v, v)).toBeCloseTo(1, 6);
    let n = 0;
    for (const x of v) n += x * x;
    expect(n).toBeCloseTo(1, 5);
  });

  it('un son trop court est répété jusqu\'à 0,5 s ; un son vide donne un vecteur nul', async () => {
    const s = fausseSession();
    await empreinteDuSon(s, sonDe(VOIX_B, 0, 0.2, 2));
    expect(s.appels[0]!.dims).toEqual([1, 48, 80]);
    const vide = await empreinteDuSon(s, new Float32Array(0));
    expect(vide.every((x) => x === 0)).toBe(true);
  });

  it('deux voix fabriquées → deux centres (cosinus < 0,68) ; une seule → un centre', async () => {
    const s = fausseSession();
    const plages = Array.from({ length: 16 }, (_, i) => ({ de: i * 4, a: i * 4 + 3 }));
    const voixDe = (i: number) => (i % 2 === 0 ? VOIX_A : VOIX_AIGUE);
    const r = await calculerEmpreintes(s, async (p) => sonDe(voixDe(Math.round(p.de / 4)), p.de, p.a, 10 + p.de), plages);
    expect(r.dim).toBe(192);
    expect(r.v.length).toBe(16 * 192);
    const vecteurs = plages.map((_, i) => r.v.subarray(i * 192, (i + 1) * 192));
    const g = groupesDEmpreintes(vecteurs);
    expect(g.centres).toHaveLength(2);
    expect(g.cosinusCentres!).toBeLessThan(0.68);
    for (let i = 2; i < 16; i++) expect(g.groupes[i] === g.groupes[i % 2]).toBe(true);
    const une = await calculerEmpreintes(s, async (p) => sonDe(VOIX_A, p.de, p.a, 30 + p.de), plages);
    const g1 = groupesDEmpreintes(plages.map((_, i) => une.v.subarray(i * 192, (i + 1) * 192)));
    expect(g1.centres).toHaveLength(1);
  });

  it('progression jusqu\'à 1, annulation (ErreurArko « annule »)', async () => {
    const s = fausseSession();
    const vus: number[] = [];
    const plages = [{ de: 0, a: 1 }, { de: 1, a: 2 }, { de: 2, a: 3 }];
    await calculerEmpreintes(s, async () => sonDe(VOIX_A, 0, 1, 3), plages, { surProgression: (p) => vus.push(p) });
    expect(vus[vus.length - 1]).toBe(1);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(calculerEmpreintes(s, async () => new Float32Array(16000), plages, { signal: ctrl.signal })).rejects.toMatchObject({ code: 'annule' });
  });
});

const source = { infos: { id: 's1', duree: 60 }, fichier: new Blob(['x']) } as unknown as SourceOuverte;

describe('client des empreintes', () => {
  afterEach(() => {
    definirLanceurEmpreintes(null);
    delete (globalThis as { Worker?: unknown }).Worker;
  });

  it('lanceur injecté (banc) : une empreinte par morceau, dans l\'ordre ; aucun appel sans morceau', async () => {
    const demandes: DemandeEmpreintesNeurales[] = [];
    definirLanceurEmpreintes(async (d) => {
      demandes.push(d);
      const v = new Float32Array(d.morceaux.length * 4);
      d.morceaux.forEach((p, i) => v.set([p.de, p.a, 0, 1], i * 4));
      return { modele: 'campplus-zh-en', dim: 4, v };
    });
    const r = await calculerEmpreintesNeurales(source, [{ de: 1, a: 2 }, { de: 5, a: 6.5 }]);
    expect(r.modele).toBe('campplus-zh-en');
    expect(r.morceaux.map((m) => [m.de, m.a, Array.from(m.v)])).toEqual([[1, 2, [1, 2, 0, 1]], [5, 6.5, [5, 6.5, 0, 1]]]);
    expect(demandes[0]!.duree).toBe(60);
    expect((await calculerEmpreintesNeurales(source, [])).morceaux).toEqual([]);
    expect(demandes).toHaveLength(1);
  });

  it('mauvaise taille → erreur ; modèle absent → ErreurArko « module »', async () => {
    definirLanceurEmpreintes(async () => ({ modele: 'm', dim: 4, v: new Float32Array(3) }));
    await expect(calculerEmpreintesNeurales(source, [{ de: 1, a: 2 }])).rejects.toBeInstanceOf(ErreurArko);
    definirLanceurEmpreintes(async () => {
      throw new ErreurArko('L\'empreinte de voix n\'est pas sur cet appareil.', 'module');
    });
    await expect(calculerEmpreintesNeurales(source, [{ de: 1, a: 2 }])).rejects.toMatchObject({ code: 'module' });
  });

  it('Worker « arko-empreintes » (faux) : progression, fini, erreur, annulation', async () => {
    const crees: { nom: string; termine: boolean; w: FauxWorker }[] = [];
    let reponse: (w: FauxWorker, d: DemandeEmpreintesNeurales) => void = () => {};
    class FauxWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((ev: { preventDefault(): void }) => void) | null = null;
      constructor(url: URL, o: { name: string }) {
        expect(String(url)).toContain('worker-empreintes');
        crees.push({ nom: o.name, termine: false, w: this });
      }
      postMessage(d: DemandeEmpreintesNeurales) {
        setTimeout(() => reponse(this, d), 0);
      }
      terminate() {
        crees.find((c) => c.w === this)!.termine = true;
      }
    }
    (globalThis as { Worker?: unknown }).Worker = FauxWorker;
    const progres: number[] = [];
    reponse = (w, d) => {
      w.onmessage?.({ data: { type: 'progression', p: 0.5 } });
      w.onmessage?.({ data: { type: 'fini', modele: 'campplus-zh-en', dim: 2, v: new Float32Array(d.morceaux.length * 2).fill(0.5) } });
    };
    const r = await calculerEmpreintesNeurales(source, [{ de: 0, a: 1 }], { surProgression: (p) => progres.push(p) });
    expect(r.morceaux[0]!.v.length).toBe(2);
    expect(progres).toEqual([0.5]);
    expect(crees[0]).toMatchObject({ nom: 'arko-empreintes', termine: true });
    reponse = (w) => w.onmessage?.({ data: { type: 'erreur', message: 'pas là', code: 'module' } });
    await expect(lanceurWorker({ fichier: new Blob([]), duree: 1, morceaux: [{ de: 0, a: 1 }] }, {})).rejects.toMatchObject({ code: 'module' });
    reponse = () => {};
    const ctrl = new AbortController();
    const p = lanceurWorker({ fichier: new Blob([]), duree: 1, morceaux: [{ de: 0, a: 1 }] }, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: 'annule' });
    expect(crees[crees.length - 1]!.termine).toBe(true);
  });
});

void FREQ_TEST;
