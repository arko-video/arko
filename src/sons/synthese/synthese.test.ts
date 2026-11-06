// Tests de la synthèse : déterminisme, niveau, absence de NaN, durées, catalogue.
import { describe, expect, it } from 'vitest';
import { CATALOGUE, catalogueIds, FAMILLES } from '../catalogue';
import { chargerSon, viderCacheSons } from '../chargeur';
import { bruit, FREQ, mulberry32, oscillateur } from './briques';
import { filtrer, panoramique } from './effets';
import { CRETE } from './finition';
import { creteVraie, enDb, rmsActif } from './mesures';
import { idsSynthese, synthetiser } from './index';

describe('briques', () => {
  it('le bruit à graine fixe est toujours le même', () => {
    expect(bruit(0.1, 7)).toEqual(bruit(0.1, 7));
    expect(bruit(0.1, 7)).not.toEqual(bruit(0.1, 8));
    const h = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = h();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });

  it('un oscillateur sinus à 1000 Hz passe par zéro 2000 fois par seconde', () => {
    const s = oscillateur('sinus', 1, 1000);
    let passages = 0;
    for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) passages++;
    expect(Math.abs(passages - 2000)).toBeLessThanOrEqual(2);
  });

  it('le passe-bas atténue les aigus et laisse passer les graves', () => {
    const energie = (x: Float32Array) => x.slice(4800).reduce((a, v) => a + v * v, 0);
    const grave = oscillateur('sinus', 0.5, 100);
    const aigu = oscillateur('sinus', 0.5, 8000);
    expect(energie(filtrer(grave, 'passe-bas', 1000)) / energie(grave)).toBeGreaterThan(0.9);
    expect(energie(filtrer(aigu, 'passe-bas', 1000)) / energie(aigu)).toBeLessThan(0.01);
  });

  it('le panoramique garde le niveau au centre et coupe un côté aux extrêmes', () => {
    const s = oscillateur('sinus', 0.01, 440);
    const [g, d] = panoramique(s, 0);
    expect(g).toEqual(s);
    expect(d).toEqual(s);
    const [g2, d2] = panoramique(s, 1);
    expect(g2.every((v) => v === 0)).toBe(true);
    expect(d2).toEqual(s);
  });
});

describe('catalogue', () => {
  it('a 22 sons (20 + 2 des bruitages auto), tous au format famille.nom, avec une famille connue', () => {
    const familles = new Set(FAMILLES.map((f) => f.id));
    expect(CATALOGUE).toHaveLength(22);
    for (const s of CATALOGUE) {
      expect(s.id).toMatch(/^[a-z]+\.[a-z0-9-]+$/);
      expect(s.id.split('.')[0]).toBe(s.famille);
      expect(familles.has(s.famille)).toBe(true);
      expect(s.licence).toBe('CC0');
      expect(s.version).toBe(2);
      expect(s.nom.length).toBeGreaterThan(0);
    }
    expect(new Set(catalogueIds()).size).toBe(22);
  });

  it('chaque son du catalogue a sa fabrique, et inversement', () => {
    expect([...idsSynthese()].sort()).toEqual([...catalogueIds()].sort());
    expect(synthetiser('inconnu.son')).toBeNull();
    expect(synthetiser('constructor')).toBeNull();
  });
});

describe('sons', () => {
  for (const s of CATALOGUE) {
    it(`${s.id} : déterministe, sans NaN, sonie −15 dBFS, crête vraie ≤ −1 dBTP, durée ${s.duree} s, fondu final, calcul rapide`, () => {
      // Temps de calcul : le meilleur de 3 essais, après 2 appels pour « chauffer » le moteur JavaScript.
      synthetiser(s.id);
      const a = synthetiser(s.id)!;
      let ms = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        synthetiser(s.id);
        ms = Math.min(ms, performance.now() - t0);
      }
      const b = synthetiser(s.id)!;
      expect(a).toEqual(b);
      expect(a.length).toBe(Math.round(s.duree * FREQ));
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
      // QA I-2 / M-5 : tous les sons à peu près aussi forts (RMS actif ≈ −15 dBFS), crête vraie ≤ −1 dBTP.
      expect(creteVraie(a)).toBeLessThanOrEqual(CRETE * 1.0001);
      const sonie = enDb(rmsActif(a));
      expect(sonie).toBeGreaterThan(-18.5);
      expect(sonie).toBeLessThan(-14);
      expect(Math.abs(a[a.length - 1])).toBe(0);
      // Le son n'est pas « presque vide » : au moins 3 % de son énergie maximale en moyenne.
      const rms = Math.sqrt(a.reduce((x, v) => x + v * v, 0) / a.length);
      expect(rms).toBeGreaterThan(0.03);
      // Objectif : < 50 ms sur une machine libre. Marge × 4 : le test ne doit pas échouer sur une machine chargée.
      expect(ms).toBeLessThan(200);
    });
  }
});

describe('mesures', () => {
  it('la crête vraie voit le pic ENTRE deux échantillons (sinus à fs/4 décalé de 45°)', () => {
    const x = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
    expect(Math.max(...x.map(Math.abs))).toBeCloseTo(Math.SQRT1_2, 3);
    expect(creteVraie(x)).toBeGreaterThan(0.97);
  });
});

describe('chargerSon', () => {
  it('renvoie du stéréo 48 kHz, garde le son en cache et refuse un id inconnu', async () => {
    viderCacheSons();
    const a = await chargerSon('impact.boom');
    expect(a.frequence).toBe(48000);
    expect(a.canaux).toHaveLength(2);
    expect(a.canaux[0].length).toBe(Math.round(1.5 * 48000));
    const b = await chargerSon('impact.boom');
    expect(b.canaux[0]).toBe(a.canaux[0]); // même tableau : pris dans le cache
    await expect(chargerSon('impact.inconnu')).rejects.toMatchObject({ code: 'son_inconnu' });
  });
});
