import { describe, expect, it } from 'vitest';
import { normaliserRecette } from '../../recette/normaliser';
import type { Recette, Texte } from '../../recette/types';
import type { Env } from '../canevas';
import { textesActifs } from '../etat-image';
import { FauxContexte, textesEcrits } from './faux-contexte';
import { mesurer } from './mesure';
import { boitesTextes, contientEmoji, dessinerTextes, LARGEUR_MAX, mettreEnPageTexte } from './textes';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const, l: 1920, h: 1080 };
const APERCU: Env = { l: 540, h: 960, echelle: 0.5 };
const EXPORT: Env = { l: 1080, h: 1920, echelle: 1 };

const recette = (textes: Partial<Texte>[]): Recette => normaliserRecette({ plans: [{ de: 0, a: 20 }], textes }, { sources: [v] });

/** Dessine les textes visibles au temps t et renvoie le faux contexte. */
function dessiner(r: Recette, t: number, env: Env = APERCU): FauxContexte {
  const f = new FauxContexte();
  dessinerTextes(f.ctx, textesActifs(r, t), env);
  return f;
}

describe('les 5 styles de texte', () => {
  it('accroche : Space Grotesk 700, 84 px, blanc, contour noir 10 px', () => {
    const [trait, texte] = dessiner(recette([{ txt: 'Attends la fin', t: 0, style: 'accroche' }]), 1, EXPORT).traces;
    expect(texte).toMatchObject({ op: 'fillText', txt: 'Attends la fin', fillStyle: '#FFFFFF' });
    expect(texte!.font).toBe('700 84px "Arko Grotesk", "Space Grotesk", sans-serif');
    expect(trait).toMatchObject({ op: 'strokeText', strokeStyle: '#000000', lineWidth: 20 });
  });
  it('bulle : Inter 800, 64 px, texte noir sur fond blanc arrondi', () => {
    const [fond, texte] = dessiner(recette([{ txt: 'GG', t: 0, style: 'bulle' }]), 1).traces;
    expect(fond).toMatchObject({ op: 'fill', fillStyle: '#FFFFFF' });
    expect(texte).toMatchObject({ op: 'fillText', fillStyle: '#000000' });
    expect(texte!.font).toContain('800 64px "Arko Inter"');
  });
  it('citron : texte #0F1115 sur fond #C8FF4D', () => {
    const [fond, texte] = dessiner(recette([{ txt: 'GG', t: 0, style: 'citron' }]), 1).traces;
    expect(fond).toMatchObject({ op: 'fill', fillStyle: '#C8FF4D' });
    expect(texte).toMatchObject({ fillStyle: '#0F1115' });
  });
  it('alerte : jaune #FFE14D, contour noir, penché de −3°', () => {
    const traces = dessiner(recette([{ txt: 'ALERTE', t: 0, style: 'alerte' }]), 1).traces;
    expect(traces[1]).toMatchObject({ op: 'fillText', fillStyle: '#FFE14D' });
    expect(traces[0]).toMatchObject({ op: 'strokeText', strokeStyle: '#000000' });
    expect(traces[1]!.rotation).toBeCloseTo(-3);
  });
  it('discret : Inter 600, 52 px, ombre douce mise à l\'échelle et léger contour (lisible sur fond chargé)', () => {
    const [trait, texte] = dessiner(recette([{ txt: 'petit mot', t: 0, style: 'discret' }]), 1).traces;
    expect(texte!.font).toContain('600 52px');
    expect(texte!.shadowBlur).toBe(7); // 14 px × échelle 0,5
    expect(trait).toMatchObject({ op: 'strokeText', lineWidth: 8, strokeStyle: 'rgba(0, 0, 0, 0.85)' });
  });
});

describe('mise en page', () => {
  it('retour à la ligne : largeur ≤ 840 px, 3 lignes au plus', () => {
    const mp = mettreEnPageTexte('Il ne s\'attendait pas du tout à ça', 'accroche')!;
    expect(mp.lignes.length).toBeGreaterThan(1);
    expect(mp.lignes.length).toBeLessThanOrEqual(3);
    for (const l of mp.lignes) expect(mesurer(l, mp.police)).toBeLessThanOrEqual(LARGEUR_MAX);
    expect(mp.taille).toBe(84);
  });
  it('réduction automatique quand ça ne tient pas en 3 lignes', () => {
    const long = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept';
    const mp = mettreEnPageTexte(long, 'accroche')!;
    expect(mp.taille).toBeLessThan(84);
    expect(mp.lignes.length).toBeLessThanOrEqual(3);
  });
  it('émojis retirés au dessin (et signalés)', () => {
    expect(contientEmoji('GG 🔥')).toBe(true);
    expect(contientEmoji('GG !')).toBe(false);
    const textes = textesEcrits(dessiner(recette([{ txt: 'GG 🔥🔥 wp 👍🏽', t: 0 }]), 1));
    expect(textes.map((t) => t.txt)).toEqual(['GG wp']);
    expect(dessiner(recette([{ txt: '🔥🔥', t: 0 }]), 1).traces).toEqual([]);
  });
  it('mêmes retours à la ligne et positions dans l\'aperçu et dans l\'export', () => {
    const r = recette([{ txt: 'Le one-shot le plus sale de toute ma vie', t: 0, x: 0.3, y: 0.4 }]);
    const a = textesEcrits(dessiner(r, 1, APERCU));
    const e = textesEcrits(dessiner(r, 1, EXPORT));
    expect(a.map((t) => t.txt)).toEqual(e.map((t) => t.txt));
    a.forEach((t, k) => {
      expect(t.x / 540).toBeCloseTo(e[k]!.x / 1080, 6);
      expect(t.y / 960).toBeCloseTo(e[k]!.y / 1920, 6);
    });
  });
});

describe('animation', () => {
  const echelle = (r: Recette, t: number) => textesEcrits(dessiner(r, t, EXPORT))[0]!;
  it('pop à l\'entrée : 0,6 → 1,08 → 1 en 0,25 s', () => {
    const r = recette([{ txt: 'Boum', t: 2, dur: 3 }]);
    expect(echelle(r, 2).echelle).toBeCloseTo(0.6);
    expect(echelle(r, 2.15).echelle).toBeCloseTo(1.08);
    expect(echelle(r, 2.3).echelle).toBeCloseTo(1);
  });
  it('un texte qui commence à 0 est entier dès la 1re image', () => {
    const t = echelle(recette([{ txt: 'Accroche', t: 0, dur: 2.5 }]), 0);
    expect(t.echelle).toBe(1);
    expect(t.globalAlpha).toBe(1);
  });
  it('fondu de sortie de 0,15 s', () => {
    const r = recette([{ txt: 'Fin', t: 0, dur: 2 }]);
    expect(echelle(r, 1.925).globalAlpha).toBeCloseTo(0.5);
    expect(textesEcrits(dessiner(r, 2))).toEqual([]);
  });
});

describe('boîtes = dessin', () => {
  const r = recette([
    { txt: 'Attends la fin, il ne s\'attendait pas à ça', t: 0, style: 'accroche' },
    { txt: 'GG', t: 0, style: 'bulle', x: 0.05, y: 0.5 },
    { txt: 'clutch 1v4', t: 0, style: 'citron', x: 0.9, y: 0.3 },
    { txt: 'petit mot discret', t: 0, style: 'discret', y: 0.6 },
  ]);
  it('chaque texte dessiné est dans sa boîte (aperçu et export)', () => {
    const boites = boitesTextes(r, 1);
    expect(boites.map((b) => b.i)).toEqual([0, 1, 2, 3]);
    for (const env of [APERCU, EXPORT]) {
      for (const ta of textesActifs(r, 1)) {
        const f = new FauxContexte();
        dessinerTextes(f.ctx, [ta], env);
        const b = boites.find((x) => x.i === ta.i)!;
        for (const t of textesEcrits(f)) {
          const demi = (mesurer(t.txt!, t.font) * t.echelle) / 2 / env.l;
          expect(t.x / env.l - demi).toBeGreaterThanOrEqual(b.x - 1e-6);
          expect(t.x / env.l + demi).toBeLessThanOrEqual(b.x + b.l + 1e-6);
          expect(t.y / env.h).toBeGreaterThan(b.y);
          expect(t.y / env.h).toBeLessThan(b.y + b.h);
        }
        const fond = f.traces.find((t) => t.op === 'fill');
        if (fond) {
          expect(fond.boite!.x0 / env.l).toBeCloseTo(b.x, 6);
          expect(fond.boite!.x1 / env.l).toBeCloseTo(b.x + b.l, 6);
          expect(fond.boite!.y0 / env.h).toBeCloseTo(b.y, 6);
          expect(fond.boite!.y1 / env.h).toBeCloseTo(b.y + b.h, 6);
        }
      }
    }
  });
  it('les boîtes restent dans la zone sûre des côtés', () => {
    for (const b of boitesTextes(r, 1)) {
      expect(b.x).toBeGreaterThanOrEqual(120 / 1080 - 1e-9);
      expect(b.x + b.l).toBeLessThanOrEqual(960 / 1080 + 1e-9);
    }
  });
  it('la boîte ENTIÈRE reste dans la zone sûre (haut ≥ 0,125, bas ≤ 0,65625), même dessinée', () => {
    const long = 'Il ne s\'attendait pas du tout à ça regarde bien la fin';
    const bas = recette([{ txt: long, t: 0, style: 'bulle', y: 0.62 }]);
    const [b] = boitesTextes(bas, 1);
    expect(b!.y + b!.h).toBeCloseTo(1 - 0.34375, 6);
    expect(b!.y + b!.h / 2).toBeLessThan(0.62);
    // Le fond dessiné est exactement la boîte renvoyée.
    const fond = dessiner(bas, 1).traces.find((t) => t.op === 'fill')!;
    expect(fond.boite!.y1 / 960).toBeCloseTo(b!.y + b!.h, 6);
    const haut = boitesTextes(recette([{ txt: long, t: 0, style: 'accroche', y: 0.15 }]), 1)[0]!;
    expect(haut.y).toBeCloseTo(0.125, 6);
  });
  it('aucune boîte pour un texte invisible à ce moment', () => {
    expect(boitesTextes(recette([{ txt: 'Plus tard', t: 5, dur: 1 }]), 1)).toEqual([]);
    expect(boitesTextes(recette([{ txt: 'Plus tard', t: 5, dur: 1 }]), 5.5)).toHaveLength(1);
  });
});
