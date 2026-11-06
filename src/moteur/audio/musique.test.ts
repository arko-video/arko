// F. Musique de fond (boucle, fondus 1,2 s / 1,5 s, plusieurs morceaux) et baisse quand on parle, mesurées dans le
// vrai mixeur ; E. bruitages coupés (dur + fondu) au mixage. PCM synthétique, aucun fichier.
import { describe, expect, it } from 'vitest';
import { BAISSE, gainsBaisse, voixDuBloc } from '../../auto/son/baisse';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import type { Recette } from '../../recette/types';
import { bornerPcm, importesDuBloc } from './effets';
import { mixerBloc, morceauxDuBloc } from './mixeur';
import { gainMusique, placerMorceaux, preparerMusique } from './musique';
import type { Pcm } from './reechantillonner';

const F = 48000;
const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const audio = (id: string, duree: number) => ({ id, nom: `${id}.mp3`, taille: 1, emp: id, duree, type: 'audio' as const });

function recetteMusique(musique: unknown, autres: Record<string, unknown> = {}): Recette {
  return normaliserRecette({ plans: [{ de: 0, a: 20 }], musique, ...autres }, { sources: [v, audio('a1', 2), audio('a2', 5)] });
}

/** Lecture « fichier » : un son constant de 0,5 (a1, 2 s) ou de 0,25 (a2, 5 s), à 48 kHz. */
async function lire(id: string, de: number, a: number): Promise<Pcm | null> {
  const duree = id === 'a1' ? 2 : 5;
  const fin = Math.min(a, duree);
  if (fin <= de) return null;
  const k0 = Math.floor(de * F);
  const c = new Float32Array(Math.round(fin * F) - k0).fill(id === 'a1' ? 0.5 : 0.25);
  return { frequence: F, debut: k0 / F, canaux: [c, c.slice()] };
}

/** Musique seule de [t0, t0 + duree[ (mixée par le vrai mixeur, sans plan). */
async function musiqueSeule(r: Recette, t0: number, duree: number): Promise<Float32Array> {
  const sc = compiler(r);
  const m = preparerMusique(r, sc, lire)!;
  const n = Math.round(duree * F);
  const bloc = await m.bloc(t0, n);
  const sortie = mixerBloc({ scenario: sc, t0, n, pcmMorceaux: morceauxDuBloc(sc, t0, n).map(() => null), musique: bloc });
  return sortie[0]!;
}

describe('musique de fond', () => {
  it('chaque morceau dure jusqu\'au suivant ; boucle sur la longueur du fichier', () => {
    const r = recetteMusique({ morceaux: [{ src: 'a1', t: 0 }, { src: 'a2', t: 8, debut: 1 }, { src: 'a1', t: 15, boucle: false }] });
    expect(placerMorceaux(r, 20)).toEqual([
      { src: 'a1', t: 0, fin: 8, debut: 0, periode: 2 },
      { src: 'a2', t: 8, fin: 15, debut: 1, periode: 4 },
      { src: 'a1', t: 15, fin: 20, debut: 0, periode: Infinity },
    ]);
  });

  it('fondus 1,2 s à l\'entrée et 1,5 s à la sortie, volume −17 dB (0,14)', () => {
    const m = { src: 'a1', t: 0, fin: 8, debut: 0, periode: 2 };
    expect(gainMusique(m, 0.6, 0.14, 1.2, 1.5)).toBeCloseTo(0.07, 5);
    expect(gainMusique(m, 3, 0.14, 1.2, 1.5)).toBeCloseTo(0.14, 5);
    expect(gainMusique(m, 7.25, 0.14, 1.2, 1.5)).toBeCloseTo(0.07, 5);
    expect(gainMusique(m, 8, 0.14, 1.2, 1.5)).toBe(0);
    // Raccord de boucle à 4 s : petit fondu de 20 ms de chaque côté, jamais de clic.
    expect(gainMusique(m, 3.995, 0.14, 1.2, 1.5)).toBeLessThan(0.04);
    expect(gainMusique(m, 4.005, 0.14, 1.2, 1.5)).toBeLessThan(0.04);
    expect(20 * Math.log10(0.14)).toBeCloseTo(-17.1, 1);
  });

  it('dans le mixeur : boucle au-delà de la fin du fichier, fondus, morceau suivant', async () => {
    const r = recetteMusique({ morceaux: [{ src: 'a1', t: 0 }, { src: 'a2', t: 8 }] });
    const s = await musiqueSeule(r, 0, 12);
    const a = (t: number) => s[Math.round(t * F)]!;
    expect(a(0.6)).toBeCloseTo(0.5 * 0.14 * 0.5, 3); // milieu du fondu d'entrée
    expect(a(3)).toBeCloseTo(0.5 * 0.14, 3); // 2e passage de la boucle (fichier de 2 s)
    expect(a(5.5)).toBeCloseTo(0.5 * 0.14, 3);
    expect(a(7.25)).toBeCloseTo(0.5 * 0.14 * 0.5, 3); // milieu du fondu de sortie
    expect(a(8.6)).toBeCloseTo(0.25 * 0.14 * 0.5, 3); // morceau suivant, fondu d'entrée
    expect(a(10)).toBeCloseTo(0.25 * 0.14, 3);
  });

  it('pas de musique : rien n\'est préparé', () => {
    const r = recetteMusique(undefined);
    expect(preparerMusique(r, compiler(r), lire)).toBeNull();
  });
});

/** Voix : sinus 300 Hz d'amplitude a, de `de` à `a` (temps source = temps de sortie ici). */
function voix(amplitude: number, de: number, a: number, duree = 20): Pcm {
  const c = new Float32Array(duree * F);
  for (let k = Math.round(de * F); k < Math.round(a * F); k++) c[k] = amplitude * Math.sin((2 * Math.PI * 300 * k) / F);
  return { frequence: F, debut: 0, canaux: [c, c.slice()] };
}

/** Mixe [0, 10 s[ par blocs de 0,25 s, avec et sans musique ; renvoie la musique seule (différence). */
async function musiqueApresBaisse(r: Recette, plan: Pcm): Promise<Float32Array> {
  const sc = compiler(r);
  const m = preparerMusique(r, sc, lire)!;
  const n = 12000;
  const res = new Float32Array(10 * F);
  for (let t0k = 0; t0k < res.length; t0k += n) {
    const t0 = t0k / F;
    const pcmMorceaux = morceauxDuBloc(sc, t0, n).map(() => plan);
    const avec = mixerBloc({ scenario: sc, t0, n, pcmMorceaux, musique: await m.bloc(t0, n) });
    const sans = mixerBloc({ scenario: compiler(r), t0, n, pcmMorceaux });
    for (let k = 0; k < n; k++) res[t0k + k] = avec[0]![k]! - sans[0]![k]!;
  }
  return res;
}

/** Niveau (dB) de la musique autour de t (moyenne de |x| sur 50 ms). */
function niveauA(x: Float32Array, t: number): number {
  let s = 0;
  const k0 = Math.round(t * F);
  for (let k = k0; k < k0 + 2400; k++) s += Math.abs(x[k]!);
  return 20 * Math.log10(s / 2400);
}

describe('baisse quand on parle (seuil 0,03, ratio 6, attaque 20 ms, relâche 400 ms)', () => {
  it('voix à −18,5 dBFS RMS : la musique baisse de 10 dB ±2, puis revient en ~400 ms', async () => {
    const r = recetteMusique({ morceaux: [{ src: 'a2', t: 0 }], fonduEntree: 0 });
    // Amplitude 0,17 → RMS 0,12 = 12 dB au-dessus du seuil → réduction 12 × (1 − 1/6) = 10 dB.
    const m = await musiqueApresBaisse(r, voix(0.17, 3, 6));
    const avant = niveauA(m, 2);
    expect(niveauA(m, 4.5) - avant).toBeGreaterThan(-12);
    expect(niveauA(m, 4.5) - avant).toBeLessThan(-8);
    expect(niveauA(m, 3.1) - avant).toBeLessThan(-6); // attaque rapide (20 ms)
    expect(niveauA(m, 6.4) - avant).toBeGreaterThan(-5); // ~400 ms après : plus de la moitié du chemin
    expect(niveauA(m, 7.5) - avant).toBeGreaterThan(-0.5);
  });

  it('avec la transcription : seule la voix pendant les mots compte (le bruit du jeu ne baisse rien)', async () => {
    const mots = [['salut', 3, 3.4], ['les', 3.5, 3.7], ['gars', 3.8, 4.2]];
    const r = recetteMusique({ morceaux: [{ src: 'a2', t: 0 }], fonduEntree: 0 }, { sousTitres: { mots } });
    const jeu = voix(0.17, 0, 10); // son fort tout le temps
    const m = await musiqueApresBaisse(r, jeu);
    const avant = niveauA(m, 1);
    expect(avant).toBeCloseTo(20 * Math.log10(0.25 * 0.14 * (2 / Math.PI) * Math.PI / 2), 0);
    expect(niveauA(m, 4) - avant).toBeLessThan(-8);
    expect(niveauA(m, 6) - avant).toBeGreaterThan(-1.5);
  });

  it('pas de voix → pas de baisse ; voix sous le seuil → pas de baisse', () => {
    const etat = { energie: 0, reductionDb: 0 };
    const sous = new Float32Array(F).map((_, k) => 0.9 * BAISSE.seuil * Math.SQRT2 * Math.sin(k / 10));
    expect(Math.min(...gainsBaisse(sous, F, etat))).toBeGreaterThan(0.99);
    expect(voixDuBloc([new Float32Array([1, 1, 1, 1])], 0, 4, [{ t0: 0.5, t1: 0.75 }])).toEqual(new Float32Array([0, 0, 1, 0]));
  });
});

describe('bruitage coupé (dur + fondu 0,3 s)', () => {
  it('bornerPcm : copie, coupe à dur, fondu linéaire avant', () => {
    const c = new Float32Array(5 * F).fill(1);
    const pcm = { frequence: F, debut: 0, canaux: [c] };
    const b = bornerPcm(pcm, 3, 0.3);
    expect(b).not.toBe(pcm);
    expect(c[4 * F]).toBe(1); // l'original (cache) n'a pas bougé
    expect(b.canaux[0]![Math.round(2.5 * F)]).toBe(1);
    expect(b.canaux[0]![Math.round(2.85 * F)]).toBeCloseTo(0.5, 2);
    expect(b.canaux[0]![Math.round(3.1 * F)]).toBe(0);
    expect(bornerPcm(pcm, undefined)).toBe(pcm);
    expect(bornerPcm(pcm, 10)).toBe(pcm);
  });

  it('son importé coupé au mixage : rien après dur', async () => {
    const r = normaliserRecette(
      { plans: [{ de: 0, a: 20 }], sons: [{ id: 'a2', t: 1, vol: 1, role: 'bruitage', dur: 2, fondu: 0.3 }] },
      { sources: [v, audio('a2', 5)] },
    );
    const sc = compiler(r);
    const dans = await importesDuBloc(sc, r, 3.5, 4, lire);
    expect(dans).toEqual([]); // 1 + 2 s = 3 s : déjà fini
    const [p] = await importesDuBloc(sc, r, 2, 3.5, lire);
    const sortie = mixerBloc({ scenario: sc, t0: 2, n: 1.5 * F, pcmMorceaux: morceauxDuBloc(sc, 2, 1.5 * F).map(() => null), sons: [p!] });
    expect(sortie[0]![Math.round(0.5 * F)]).toBeCloseTo(0.25, 3); // 2,5 s
    expect(sortie[0]![Math.round(0.85 * F)]).toBeCloseTo(0.125, 2); // 2,85 s : milieu du fondu
    expect(sortie[0]![Math.round(1.2 * F)]).toBe(0); // 3,2 s
  });
});
