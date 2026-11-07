// v4 : la musique baisse sur la PAROLE (`musique.baisseSur: 'parole'`), même pour une voix faible (Romain arrive à
// −40 dBFS dans le mélange) ; champ absent = exactement comme avant. Mesuré dans le VRAI mixeur (celui de l'aperçu ET
// de l'export), PCM synthétique ; plus le normaliseur et le schéma.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gainsBaisse, NIVEAU_PAROLE, voixDuBloc } from '../../auto/son/baisse';
import { compiler } from '../../recette/chronologie';
import { normaliser, normaliserRecette } from '../../recette/normaliser';
import { definirMusique } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import { mixerBloc, morceauxDuBloc } from './mixeur';
import { momentsParoleV4, preparerMusique } from './musique';
import type { Pcm } from './reechantillonner';

const F = 48000;
const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const a2 = { id: 'a2', nom: 'a2.mp3', taille: 1, emp: 'a2', duree: 5, type: 'audio' as const };
const PERSONNES = [{ id: 'p1', nom: 'Romain' }, { id: 'p2', nom: 'Guts' }];

function recette(musique: Record<string, unknown>, autres: Record<string, unknown> = {}): Recette {
  return normaliserRecette({ plans: [{ de: 0, a: 20 }], musique: { morceaux: [{ src: 'a2', t: 0 }], fonduEntree: 0, ...musique }, ...autres }, { sources: [v, a2] });
}

/** Musique : un son constant de 0,25. */
async function lire(_id: string, de: number, a: number): Promise<Pcm | null> {
  const fin = Math.min(a, 5);
  if (fin <= de) return null;
  const k0 = Math.floor(de * F);
  const c = new Float32Array(Math.round(fin * F) - k0).fill(0.25);
  return { frequence: F, debut: k0 / F, canaux: [c, c.slice()] };
}

/** Voix : sinus 300 Hz d'amplitude `amp` de `de` à `a`. */
function voix(amp: number, de: number, a: number, duree = 20): Pcm {
  const c = new Float32Array(duree * F);
  for (let k = Math.round(de * F); k < Math.round(a * F); k++) c[k] = amp * Math.sin((2 * Math.PI * 300 * k) / F);
  return { frequence: F, debut: 0, canaux: [c, c.slice()] };
}

/** Musique seule après la baisse, sur [0, 10 s[, mixée par blocs de 0,25 s par le vrai mixeur. */
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

const niveauA = (x: Float32Array, t: number) => {
  let s = 0;
  const k0 = Math.round(t * F);
  for (let k = k0; k < k0 + 2400; k++) s += Math.abs(x[k]!);
  return 20 * Math.log10(s / 2400);
};

// Romain : −40 dBFS crête (amplitude 0,01) de 3 à 6 s, avec un tour de parole qui le dit.
const ROMAIN = voix(0.01, 3, 6);
const TOURS = { personnes: PERSONNES, paroles: [{ ts: 3, fin: 6, p: 'p1' }] };

describe('baisse sur la parole (v4)', () => {
  it('voix à −40 dBFS : avant ≈ 0 dB de baisse ; avec baisseSur « parole » ≈ −5 dB (≥ 4 dB), puis remontée', async () => {
    const avant = await musiqueApresBaisse(recette({}, TOURS), ROMAIN);
    expect(niveauA(avant, 4.5) - niveauA(avant, 2)).toBeGreaterThan(-1);
    const apres = await musiqueApresBaisse(recette({ baisseSur: 'parole' }, TOURS), ROMAIN);
    const ref = niveauA(apres, 2);
    expect(niveauA(apres, 4.5) - ref).toBeLessThan(-4);
    expect(niveauA(apres, 4.5) - ref).toBeGreaterThan(-7);
    expect(niveauA(apres, 3.15) - ref).toBeLessThan(-4); // attaque 20 ms (marge de 50 ms avant le tour)
    expect(niveauA(apres, 7.5) - ref).toBeGreaterThan(-0.5); // relâche 400 ms
  });

  it('les tours de parole commandent la baisse même sans aucun son : c\'est la parole détectée qui compte', async () => {
    const r = recette({ baisseSur: 'parole' }, TOURS);
    const m = await musiqueApresBaisse(r, voix(0, 0, 0));
    expect(niveauA(m, 4.5) - niveauA(m, 2)).toBeLessThan(-4);
    // Commande fixe : 6 dB au-dessus du seuil × (1 − 1/6) ≈ 5,02 dB.
    const etat = { energie: 0, reductionDb: 0 };
    const g = gainsBaisse(new Float32Array(F).fill(NIVEAU_PAROLE), F, etat);
    expect(20 * Math.log10(g[F - 1]!)).toBeCloseTo(-5.02, 1);
  });

  it('une voix FORTE pendant la parole baisse un peu plus (comme avant) ; le jeu hors parole ne baisse rien', async () => {
    const fort = await musiqueApresBaisse(recette({ baisseSur: 'parole' }, TOURS), voix(0.17, 3, 6));
    expect(niveauA(fort, 4.5) - niveauA(fort, 2)).toBeLessThan(-8);
    const jeu = voix(0.17, 0, 10); // fort tout le temps, mais un seul tour de parole (3–6 s)
    const m = await musiqueApresBaisse(recette({ baisseSur: 'parole' }, TOURS), jeu);
    expect(niveauA(m, 1) - niveauA(m, 8.5)).toBeLessThan(0.5);
    expect(niveauA(m, 4.5) - niveauA(m, 8.5)).toBeLessThan(-8);
  });

  it('tours ∪ mots des sous-titres (marges 0,1 / 0,3, trous < 0,6 s bouchés) ; sans rien : comme avant (la voix des plans)', () => {
    const avecMots = recette({ baisseSur: 'parole' }, { sousTitres: { mots: [['salut', 3, 3.4], ['les', 3.5, 3.9], ['ok', 8, 8.2]] }, ...TOURS, paroles: [{ ts: 5, fin: 6, p: 'p1' }] });
    const sc = compiler(avecMots);
    expect(momentsParoleV4(avecMots, sc)).toEqual([{ t0: 2.9, t1: 4.2 }, { t0: 4.9, t1: 6.3 }, { t0: 7.9, t1: 8.5 }]);
    return preparerMusique(avecMots, sc, lire)!.bloc(2, F * 3).then((b) => {
      expect(b!.niveauParole).toBe(NIVEAU_PAROLE);
      expect(b!.parole).toEqual([{ t0: 2.9, t1: 4.2 }, { t0: 4.9, t1: 6.3 }]);
      const rien = recette({ baisseSur: 'parole' });
      return preparerMusique(rien, compiler(rien), lire)!.bloc(2, F).then((x) => {
        expect(x!.parole).toBeUndefined();
        expect(x!.niveauParole).toBeUndefined();
      });
    });
  });

  it('les tours suivent les coupes (temps de sortie, vitesse) et pas les arrêts sur image', () => {
    const r = normaliserRecette(
      { plans: [{ de: 10, a: 14 }, { de: 20, a: 22, vit: 2, fige: 1 }], ...TOURS, paroles: [{ ts: 12, fin: 21, p: 'p1' }], musique: { morceaux: [{ src: 'a2', t: 0 }], baisseSur: 'parole' } },
      { sources: [v, a2] },
    );
    const sc = compiler(r);
    // Plan 1 : sortie 0–4 s (tour 12–14 → 2–4) ; plan 2 : sortie 4–5 s à ×2 (tour 20–21 → 4–4,5), arrêt 5–6 s.
    expect(momentsParoleV4(r, sc)).toEqual([{ t0: 1.9, t1: 4.8 }]);
  });

  it('voixDuBloc : niveau minimal pendant la parole seulement', () => {
    const x = voixDuBloc([new Float32Array([0, 0.001, 0.5, 0])], 0, 4, [{ t0: 0.25, t1: 0.75 }], 0.09);
    expect(Array.from(x)).toEqual([0, Math.fround(0.09), 0.5, 0]);
  });
});

describe('recette : musique.baisseSur (seul champ nouveau de la v4)', () => {
  it('normaliseur : gardé s\'il vaut « parole », retiré sinon (signalé), absent = absent', () => {
    expect(recette({ baisseSur: 'parole' }).musique?.baisseSur).toBe('parole');
    const res = normaliser({ plans: [{ de: 0, a: 20 }], musique: { morceaux: [{ src: 'a2', t: 0 }], baisseSur: 'mots' } }, { sources: [v, a2] });
    expect(res.recette.musique?.baisseSur).toBeUndefined();
    expect(res.problemes.some((p) => p.chemin === 'musique.baisseSur')).toBe(true);
    expect('baisseSur' in recette({}).musique!).toBe(false);
  });

  it('gardé par definirMusique, relu à l\'identique ; schéma : enum ["parole"]', () => {
    const r = definirMusique(recette({}), { morceaux: [{ src: 'a2', t: 0 }], baisseSur: 'parole' }, [a2]);
    expect(r.musique?.baisseSur).toBe('parole');
    expect(normaliserRecette(JSON.parse(JSON.stringify(r)), { sources: r.sources }).musique).toEqual(r.musique);
    const schema = JSON.parse(readFileSync('src/recette/schema.json', 'utf8'));
    const prop = JSON.stringify(schema).includes('"baisseSur":{"type":"string","enum":["parole"]');
    expect(prop).toBe(true);
  });
});
