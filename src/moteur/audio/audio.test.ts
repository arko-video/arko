// Tests du mixage avec du PCM synthétique (aucun fichier, aucun décodeur).
import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import { assembler } from './lecteur-audio';
import { ecretageDoux, mixerBloc, morceauxDuBloc } from './mixeur';
import { reechantillonner, type Pcm } from './reechantillonner';

/** Rampe : la valeur d'un échantillon = son temps source / 100 (facile à vérifier). */
function rampe(frequence: number, debut: number, duree: number, canaux = 1): Pcm {
  const n = Math.round(duree * frequence);
  const c = new Float32Array(n);
  for (let k = 0; k < n; k++) c[k] = (debut + k / frequence) / 100;
  return { frequence, debut, canaux: Array.from({ length: canaux }, () => c.slice()) };
}

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const recette = (plans: unknown[]) => normaliserRecette({ plans }, { sources: [v] });

describe('rééchantillonnage', () => {
  it('44,1 kHz mono → 48 kHz stéréo, même temps', () => {
    const pcm = rampe(44100, 10, 1);
    const [g, d] = reechantillonner(pcm, 10.5, 1, 480);
    expect(g![0]).toBeCloseTo(0.105, 4);
    expect(g![479]).toBeCloseTo((10.5 + 479 / 48000) / 100, 4);
    expect(d).toEqual(g);
  });
  it('vitesse 2 : avance deux fois plus vite dans la source', () => {
    const [g] = reechantillonner(rampe(48000, 0, 2), 0, 2, 48000);
    expect(g![24000]).toBeCloseTo(1 / 100, 4);
  });
  it('silence hors du PCM', () => {
    const [g] = reechantillonner(rampe(48000, 5, 0.1), 4.9, 1, 14400);
    expect(g![0]).toBe(0);
    expect(g![4800]).toBeCloseTo(0.05, 4);
    expect(g![14399]).toBe(0);
  });
});

describe('morceaux et mixage', () => {
  it('découpe un bloc à cheval sur une coupe', () => {
    const s = compiler(recette([{ de: 0, a: 1 }, { de: 10, a: 12, vit: 2 }]));
    const m = morceauxDuBloc(s, 0.9, 9600);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ k0: 0, n: 4800, ts0: 0.9 });
    expect(m[1]!.k0).toBe(4800);
    expect(m[1]!.ts0).toBeCloseTo(10);
    expect(m[1]!.ts1).toBeCloseTo(10.2);
  });

  it('mixe deux plans avec fondu de 5 ms à la coupe', () => {
    const s = compiler(recette([{ de: 0, a: 1 }, { de: 10, a: 12 }]));
    const n = 9600;
    const morceaux = morceauxDuBloc(s, 0.9, n);
    const pcm = [rampe(48000, 0, 1.2), rampe(48000, 9.9, 0.5)];
    const [g] = mixerBloc({ scenario: s, t0: 0.9, n, pcmMorceaux: pcm.slice(0, morceaux.length) });
    expect(g![0]).toBeCloseTo(0.009, 4); // plan 1, ts = 0,9
    expect(g![4799]).toBeLessThan(0.0005); // fondu de sortie juste avant la coupe
    expect(Math.abs(g![4800]!)).toBeLessThan(0.002); // fondu d'entrée juste après
    expect(g![4800 + 480]).toBeCloseTo((10 + 0.01) / 100, 4); // 10 ms après la coupe : plein volume
  });

  it('le dernier plan et le premier n\'ont pas de fondu aux extrémités', () => {
    const s = compiler(recette([{ de: 1, a: 2 }]));
    const [g] = mixerBloc({ scenario: s, t0: 0, n: 48000, pcmMorceaux: [rampe(48000, 1, 1)] });
    expect(g![0]).toBeCloseTo(0.01, 4);
    expect(g![47999]).toBeCloseTo((2 - 1 / 48000) / 100, 4);
  });

  it('pas de son dans la source → silence', () => {
    const s = compiler(recette([{ de: 0, a: 1 }]));
    const [g, d] = mixerBloc({ scenario: s, t0: 0, n: 100, pcmMorceaux: [null] });
    expect(g!.every((x) => x === 0) && d!.every((x) => x === 0)).toBe(true);
  });

  it('effets sonores × vol, son guide seulement si demandé', () => {
    const s = compiler(recette([{ de: 0, a: 1 }]));
    const bip: Pcm = { frequence: 48000, debut: 0, canaux: [new Float32Array(480).fill(0.5)] };
    const base = { scenario: s, t0: 0, n: 4800, pcmMorceaux: [null] };
    const [a] = mixerBloc({ ...base, sons: [{ t: 0.05, vol: 0.8, pcm: bip }] });
    expect(a![2399]).toBe(0);
    expect(a![2400]).toBeCloseTo(0.4);
    const guide = { t: 0, vol: 0.6, pcm: bip };
    expect(mixerBloc({ ...base, guide, avecGuide: false })[0]![10]).toBe(0);
    expect(mixerBloc({ ...base, guide, avecGuide: true })[0]![10]).toBeCloseTo(0.3);
  });

  it('limiteur : linéaire sous −1 dBFS, jamais au-delà de −0,3 dBFS', () => {
    expect(ecretageDoux(0.5)).toBe(0.5);
    expect(ecretageDoux(0.89)).toBe(0.89);
    expect(ecretageDoux(1.2)).toBeLessThan(0.967);
    expect(ecretageDoux(1.2)).toBeGreaterThan(0.89);
    expect(ecretageDoux(3)).toBeLessThanOrEqual(0.967);
    expect(ecretageDoux(-3)).toBeGreaterThanOrEqual(-0.967);
    const s = compiler(recette([{ de: 0, a: 1 }]));
    const fort: Pcm = { frequence: 48000, debut: 0, canaux: [new Float32Array(48000).fill(0.9)] };
    const [g] = mixerBloc({ scenario: s, t0: 0, n: 1000, pcmMorceaux: [fort], sons: [{ t: 0, vol: 1.5, pcm: fort }] });
    expect(Math.max(...g!)).toBeLessThanOrEqual(0.967);
    expect(Math.max(...g!)).toBeGreaterThan(0.88);
  });
});

describe('assembler', () => {
  it('recolle des morceaux décodés à leur place', () => {
    const m = (debut: number, val: number) => ({ debut, fin: debut + 0.01, frequence: 1000, canaux: [new Float32Array(10).fill(val)] });
    const p = assembler([m(0, 1), m(0.01, 2), m(0.02, 3)], 0.005, 0.025)!;
    expect(p.debut).toBe(0);
    expect(p.canaux[0]!.length).toBe(30);
    expect([p.canaux[0]![0], p.canaux[0]![15], p.canaux[0]![29]]).toEqual([1, 2, 3]);
    expect(assembler([m(0, 1)], 5, 6)).toBeNull();
  });
});
