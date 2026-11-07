// E. Pistes audio (mixage, lecture d'un plan, fichier à 2 pistes fabriqué par ffmpeg) et gros mots (bips).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compiler } from '../../../recette/chronologie';
import { normaliserRecette } from '../../../recette/normaliser';
import { choisirBips, choisirPistes, insererElement } from '../../../recette/operations';
import type { Recette, Source } from '../../../recette/types';
import { BIP, gainBips, pcmBip, plagesBip, preparerBips } from '../../../moteur/audio/bips';
import { mixerBloc, morceauxDuBloc } from '../../../moteur/audio/mixeur';
import { lireSonDuPlan, mixerPistes, pistesDuFichier } from '../../../moteur/audio/pistes';
import type { Pcm } from '../../../moteur/audio/reechantillonner';
import { CacheDecodage } from '../../../moteur/cache-decodage';
import type { MediaOuvert } from '../../../moteur/media';

const v: Source = {
  id: 's1',
  nom: 'obs.mp4',
  taille: 1,
  emp: 'e1',
  duree: 60,
  type: 'video',
  l: 1920,
  h: 1080,
  pistes: 2,
};
const constant = (val: number, n: number, frequence = 48000, debut = 0): Pcm => ({
  frequence,
  debut,
  canaux: [new Float32Array(n).fill(val)],
});

describe('mixerPistes', () => {
  it('somme pondérée par les volumes, en stéréo', () => {
    const m = mixerPistes([constant(0.1, 480), constant(0.2, 480)], [1, 0.5])!;
    expect(m.canaux).toHaveLength(2);
    expect(m.canaux[0]![100]).toBeCloseTo(0.2, 6);
    expect(m.canaux[1]![100]).toBeCloseTo(0.2, 6);
  });
  it('longueurs et débuts différents : du plus tôt début à la plus tardive fin, silence ailleurs', () => {
    const m = mixerPistes([constant(0.1, 480, 48000, 1), constant(0.3, 960, 48000, 1.005)], [1, 1])!;
    expect(m.debut).toBe(1);
    expect(m.canaux[0]!.length).toBe(Math.round(0.025 * 48000));
    expect(m.canaux[0]![100]).toBeCloseTo(0.1, 6); // avant le début de la 2ᵉ
    expect(m.canaux[0]![300]).toBeCloseTo(0.4, 6); // les deux
    expect(m.canaux[0]![1000]).toBeCloseTo(0.3, 6); // après la fin de la 1re
  });
  it('fréquences différentes : rééchantillonnées vers celle de la 1re', () => {
    const m = mixerPistes([constant(0.1, 441, 44100), constant(0.2, 480, 48000)], [1, 1])!;
    expect(m.frequence).toBe(44100);
    expect(m.canaux[0]!.length).toBe(441);
    expect(m.canaux[0]![200]).toBeCloseTo(0.3, 5);
  });
  it('aucune piste ou volume nul', () => {
    expect(mixerPistes([null, null], [1, 1])).toBeNull();
    expect(mixerPistes([constant(0.5, 10)], [0])!.canaux[0]!.every((x) => x === 0)).toBe(true);
  });
});

describe('lireSonDuPlan', () => {
  const lecteur = (val: number, demandes: number[]) => ({
    lire: async (a: number, b: number) => (
      demandes.push(val),
      constant(val, Math.round((b - a) * 48000), 48000, a)
    ),
    fermer: async () => undefined,
  });
  it('avec un réglage : les pistes gardées mélangées à leur volume (lecteur par piste, créé une fois)', async () => {
    const demandes: number[] = [];
    const crees: number[] = [];
    const cache = new CacheDecodage({
      video: () => null,
      audio: () => lecteur(0.05, demandes) as never,
      piste: (_m, n) => (crees.push(n), lecteur(n === 0 ? 0.1 : 0.2, demandes) as never),
    });
    cache.preparer(new Map([['s1', {} as MediaOuvert]]));
    const r = choisirPistes(normaliserRecette({ plans: [{ de: 0, a: 10 }] }, { sources: [v] }), 's1', [
      { n: 0 },
      { n: 1, vol: 1.5 },
    ]);
    const pcm = (await lireSonDuPlan(cache, r, 's1', 2, 2.01))!;
    expect(pcm.canaux[0]![10]).toBeCloseTo(0.1 + 0.3, 6);
    await lireSonDuPlan(cache, r, 's1', 2.01, 2.02);
    expect(crees).toEqual([0, 1]);
    expect(demandes).not.toContain(0.05); // la piste principale seule n'est plus lue
    const seule = choisirPistes(r, 's1', [{ n: 1, vol: 0.5 }]);
    expect((await lireSonDuPlan(cache, seule, 's1', 3, 3.01))!.canaux[0]![5]).toBeCloseTo(0.1, 6);
  });
});

describe('pistesDuFichier (MP4 à 2 pistes fabriqué par ffmpeg)', () => {
  it('2 pistes, noms écrits par OBS', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'arko-pistes-'));
    const f = join(dossier, 'obs.mp4');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=gray:s=64x36:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=f=880:d=1',
      '-map',
      '0',
      '-map',
      '1',
      '-map',
      '2',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-metadata:s:a:0',
      'title=Micro',
      '-metadata:s:a:1',
      'title=Discord',
      '-shortest',
      f,
    ]);
    const pistes = await pistesDuFichier(new Blob([readFileSync(f)]));
    expect(pistes.map((p) => [p.n, p.nom])).toEqual([
      [0, 'Micro'],
      [1, 'Discord'],
    ]);
    expect(pistes.every((p) => p.canaux === 1)).toBe(true);
  });
});

describe('gros mots', () => {
  const base = (): Recette =>
    normaliserRecette(
      {
        plans: [
          { de: 0, a: 10 },
          { de: 20, a: 30 },
        ],
        sousTitres: {
          mots: [
            ['putain', 2, 2.4],
            ['de', 2.4, 2.5],
            ['merde', 2.45, 2.9],
            ['salut', 5, 5.4],
            ['merde', 25, 25.3],
          ],
        },
      },
      { sources: [{ ...v, pistes: undefined }] },
    );

  it('plagesBip : jurons ± 0,03 s, fusionnés, en temps de sortie (passage réutilisé compris)', () => {
    const r = base();
    expect(plagesBip(r, compiler(r))).toEqual([
      { t0: expect.closeTo(1.97, 6), t1: expect.closeTo(2.93, 6) }, // « putain » et « merde » : plages fusionnées (elles se touchent avec ± 0,03 s)
      { t0: expect.closeTo(14.97, 6), t1: expect.closeTo(15.33, 6) },
    ]);
    const decale = insererElement(r, 10, { type: 'carton', txt: 'Plus tard' }, { dur: 2 }).recette;
    expect(plagesBip(decale, compiler(decale))[1]!.t0).toBeCloseTo(16.97, 6);
    const reutilise = normaliserRecette(
      { ...r, plans: [...r.plans, { de: 1, a: 3 }] },
      { sources: r.sources },
    );
    expect(plagesBip(reutilise, compiler(reutilise))).toHaveLength(3);
    expect(preparerBips(r, compiler(r))).toBeNull(); // sans réglage : rien
  });

  it('gain : 0 dans la plage, fondus de 10 ms autour', () => {
    const p = [{ t0: 1, t1: 2 }];
    expect(gainBips(p, 1.5)).toBe(0);
    expect(gainBips(p, 0.995)).toBeCloseTo(0.5, 6);
    expect(gainBips(p, 0.98)).toBe(1);
    expect(gainBips(p, 2.005)).toBeCloseTo(0.5, 6);
  });

  it('appliquer : son des plans nul pendant le juron (±10 ms), bip à −12 dBFS, musique et sons posés intacts', () => {
    for (const son of ['bip', 'muet'] as const) {
      const r = choisirBips(base(), { son });
      const sc = compiler(r);
      const bips = preparerBips(r, sc)!;
      const t0 = 1.5;
      const n = 96000; // 2 s
      const morceaux = morceauxDuBloc(sc, t0, n);
      const pcmMorceaux = morceaux.map((m) =>
        constant(0.25, Math.ceil((m.ts1 - m.ts0) * 48000) + 2, 48000, m.ts0),
      );
      const musique = { t: 0, vol: 1, pcm: constant(0.1, 48000 * 4) };
      const entree = { scenario: sc, t0, n, pcmMorceaux, sons: [musique] };
      const e = bips.appliquer(entree);
      expect(entree.pcmMorceaux[0]!.canaux[0]![30000]).toBe(0.25); // l'entrée n'est pas modifiée
      const plan = e.pcmMorceaux[0]!.canaux[0]!;
      const k = (t: number) => Math.round((t - t0) * 48000);
      for (const t of [1.98, 2.3, 2.92]) expect(plan[k(t)]).toBe(0);
      for (const t of [1.6, 1.95, 2.96]) expect(plan[k(t)]).toBeCloseTo(0.25, 6);
      expect(e.sons![0]).toBe(musique); // sons posés intacts
      if (son === 'muet') {
        expect(e.sons).toHaveLength(1);
        continue;
      }
      const bip = e.sons![1]!;
      expect(bip.t).toBeCloseTo(1.97, 6);
      const crete = Math.max(...bip.pcm.canaux[0]!);
      expect(20 * Math.log10(crete)).toBeGreaterThan(BIP.db - 0.5);
      expect(20 * Math.log10(crete)).toBeLessThan(BIP.db + 0.5);
      // Le mixage complet : pendant le juron, il ne reste que la musique et le bip.
      const sortie = mixerBloc(e)[0]!;
      const fenetre = sortie.slice(k(2.3), k(2.3) + 480);
      expect(Math.min(...fenetre)).toBeGreaterThan(0.1 - 0.26);
      expect(Math.max(...fenetre)).toBeLessThan(0.1 + 0.26);
      expect(sortie[k(1.8)]).toBeCloseTo(0.35, 2);
    }
  });

  it('pcmBip : 1 kHz (passages par zéro), fondus', () => {
    const p = pcmBip(0.1).canaux[0]!;
    let passages = 0;
    for (let k = 1; k < p.length; k++) if (p[k - 1]! <= 0 && p[k]! > 0) passages++;
    expect(passages).toBeGreaterThanOrEqual(99);
    expect(passages).toBeLessThanOrEqual(101);
    expect(Math.abs(p[0]!)).toBeLessThan(1e-6);
  });
});

describe('pistesGardees (pour Qui parle)', () => {
  it('numéros gardés, vide sans réglage', async () => {
    const { pistesGardees } = await import('../../../recette/operations');
    const r = normaliserRecette({ plans: [{ de: 0, a: 10 }] }, { sources: [v] });
    expect(pistesGardees(r, 's1')).toEqual([]);
    expect(pistesGardees(choisirPistes(r, 's1', [{ n: 1 }, { n: 0, vol: 0.5 }]), 's1')).toEqual([1, 0]);
  });
});
