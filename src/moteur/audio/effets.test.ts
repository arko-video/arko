// Effets sonores du rendu : on mixe comme l'EXPORT (rendu.audio par blocs de 0,25 s, guide: false)
// et on cherche le son dans le PCM obtenu. Aucun fichier vidéo : le son des plans est muet ici.
import { describe, expect, it } from 'vitest';
import { normaliser } from '../../recette/normaliser';
import type { Recette } from '../../recette/types';
import { chargerSon } from '../../sons/chargeur';
import { CacheDecodage } from '../cache-decodage';
import type { MediaOuvert } from '../media';
import { rendre } from '../rendre';
import { instantFort, preparerEffets, sonDeTransition, type ChargeurCatalogue } from './effets';
import { LecteurAudio } from './lecteur-audio';

const F = 48000;
const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const g1 = { id: 'g1', nom: 'tendance.mp3', taille: 1, emp: '', duree: 30, type: 'audio' as const };

/** Le vrai son du dev sons s'il existe déjà ; sinon un « boom » de secours (attaque nette, décroissance). */
const chargeur: ChargeurCatalogue = async (id) => {
  try {
    return await chargerSon(id);
  } catch {
    const n = Math.round(0.6 * F);
    const c = new Float32Array(n);
    for (let k = 0; k < n; k++) c[k] = Math.sin((2 * Math.PI * 60 * k) / F) * Math.exp(-k / (0.15 * F)) * 0.9;
    return { id, frequence: F, canaux: [c, c] };
  }
};

function recette(brut: object): Recette {
  return normaliser({ plans: [{ de: 0, a: 3 }], ...brut }, { sources: [v, g1] }, { sonsConnus: ['impact.boom', 'whoosh.rapide'] }).recette;
}

/** Mixe toute la vidéo comme l'export (blocs de 12 000 échantillons). */
async function mixerTout(r: Recette, guide: boolean, cache?: CacheDecodage, medias = new Map<string, MediaOuvert>()) {
  const rendu = rendre(r, medias, cache, { chargerSon: chargeur });
  const total = Math.round(rendu.duree * F);
  const g = new Float32Array(total);
  for (let k = 0; k < total; k += 12_000) {
    const n = Math.min(12_000, total - k);
    g.set((await rendu.audio(k / F, n, { guide }))[0]!, k);
  }
  await rendu.fermer();
  return g;
}

/** Premier instant où le signal dépasse 10 % de sa crête. */
function attaque(c: Float32Array): number {
  let crete = 0;
  for (const x of c) crete = Math.max(crete, Math.abs(x));
  const k = c.findIndex((x) => Math.abs(x) > 0.1 * crete);
  return k / F;
}

describe('effets sonores dans le mixage', () => {
  it('impact.boom posé à t = 1 s apparaît dans le PCM exporté à ±10 ms', async () => {
    const pcm = await mixerTout(recette({ sons: [{ id: 'impact.boom', t: 1 }] }), false);
    expect(Math.abs(attaque(pcm) - 1)).toBeLessThanOrEqual(0.01);
    expect(pcm.slice(0, Math.round(0.99 * F)).every((x) => x === 0)).toBe(true);
  });

  it('son posé en temps source : suit le plan (ts 12 dans le plan [10 ; 14] → t = 1 + 2 = 3 s)', async () => {
    const r = normaliser(
      { plans: [{ de: 0, a: 1 }, { de: 10, a: 14 }], sons: [{ id: 'impact.boom', ts: 12 }] },
      { sources: [v] },
      { sonsConnus: ['impact.boom'] },
    ).recette;
    expect(Math.abs(attaque(await mixerTout(r, false)) - 3)).toBeLessThanOrEqual(0.01);
  });

  it('son de transition : par défaut, coupé par son: false, ou remplacé', async () => {
    const trans = (t: object | string) => ({ plans: [{ de: 0, a: 2 }, { de: 5, a: 7, trans: t }] });
    const sc = (t: object | string) => rendre(recette(trans(t)), new Map(), undefined, { chargerSon: chargeur }).scenario;
    expect(sonDeTransition(sc('secousse').plans[1]!.trans)).toBe('impact.boom');
    expect(sonDeTransition(sc({ type: 'secousse', son: false }).plans[1]!.trans)).toBeNull();
    expect(sonDeTransition(sc({ type: 'noir', son: 'whoosh.rapide' }).plans[1]!.trans)).toBe('whoosh.rapide');
    expect(sonDeTransition(sc('noir').plans[1]!.trans)).toBeNull();
    // Le moment fort du son tombe sur la coupe (t = 2 s).
    const r = recette(trans('secousse'));
    const [pose] = await preparerEffets(rendre(r, new Map()).scenario, r, { chargerSon: chargeur });
    expect(pose!.t + instantFort(pose!.pcm)).toBeCloseTo(2, 2);
    const pcm = await mixerTout(r, false);
    expect(attaque(pcm)).toBeLessThanOrEqual(2.001);
    expect(attaque(pcm)).toBeGreaterThan(1.5);
  });

  it('volume : vol 0 → silence ; un son inconnu du chargeur est ignoré sans erreur', async () => {
    const muet = await mixerTout(recette({ sons: [{ id: 'impact.boom', t: 1, vol: 0 }] }), false);
    expect(muet.every((x) => x === 0)).toBe(true);
    const r = recette({ sons: [{ id: 'whoosh.rapide', t: 1 }] });
    const rendu = rendre(r, new Map(), undefined, { chargerSon: () => Promise.reject(new Error('absent')) });
    expect((await rendu.audio(0, 48_000))[0]!.every((x) => x === 0)).toBe(true);
  });

  it('son importé (id = sa source audio) : lu par morceaux, placé à son temps, avec son volume', async () => {
    const a1 = { id: 'a1', nom: 'rire.mp3', taille: 1, emp: '', duree: 0.5, type: 'audio' as const };
    const r = normaliser({ plans: [{ de: 0, a: 3 }], sons: [{ id: 'a1', t: 2, vol: 0.5 }] }, { sources: [v, a1] }, { sonsConnus: [] }).recette;
    expect(r.sons).toEqual([{ id: 'a1', t: 2, vol: 0.5 }]);
    const demandes: [string, number, number][] = [];
    // Faux fichier : 0,5 s de valeur 0,4, à 44,1 kHz ; le PCM rendu commence 10 ms AVANT ce qui est demandé.
    const lireImporte = async (id: string, de: number, a: number) => {
      demandes.push([id, de, a]);
      const debut = Math.max(0, de - 0.01);
      const n = Math.max(0, Math.round((Math.min(0.5, a) - debut) * 44_100));
      return { frequence: 44_100, debut, canaux: [new Float32Array(n).fill(0.4)] };
    };
    const rendu = rendre(r, new Map(), undefined, { chargerSon: chargeur, lireImporte });
    const g = new Float32Array(3 * F);
    for (let k = 0; k < g.length; k += 12_000) g.set((await rendu.audio(k / F, 12_000))[0]!, k);
    expect(Math.abs(attaque(g) - 2)).toBeLessThanOrEqual(0.001);
    expect(g[Math.round(2.2 * F)]).toBeCloseTo(0.2, 5);
    expect(g[Math.round(2.6 * F)]).toBe(0);
    expect(demandes.every(([id]) => id === 'a1')).toBe(true);
    expect(demandes.length).toBeLessThanOrEqual(3); // seuls les blocs où le son s'entend
  });

  it('le son guide est joué dans l\'aperçu (guide: true) et JAMAIS dans l\'export (guide: false)', async () => {
    // Faux fichier audio : un la (440 Hz) continu, 44,1 kHz mono, lu par morceaux de 0,1 s.
    const frequence = 44_100;
    const sink = {
      async *samples(debut: number) {
        for (let t = Math.floor(debut * 10) / 10; t < 30; t += 0.1) {
          const n = 4410;
          yield {
            timestamp: t, numberOfFrames: n, numberOfChannels: 1, sampleRate: frequence,
            copyTo(d: Float32Array) {
              for (let k = 0; k < n; k++) d[k] = 0.5 * Math.sin(2 * Math.PI * 440 * (t + k / frequence));
            },
            close() {},
          };
        }
      },
    };
    const cache = new CacheDecodage({ video: () => null, audio: () => new LecteurAudio(sink as never) });
    const medias = new Map([['g1', {} as MediaOuvert]]);
    const r = recette({ guide: { src: 'g1', t: 1, debut: 12 } });
    expect(r.guide).toEqual({ src: 'g1', t: 1, debut: 12, vol: 0.6 });
    const apercu = await mixerTout(r, true, cache, medias);
    expect(Math.abs(attaque(apercu) - 1)).toBeLessThanOrEqual(0.01);
    const exporte = await mixerTout(r, false, cache, medias);
    expect(exporte.every((x) => x === 0)).toBe(true);
    await cache.fermer();
  });
});
