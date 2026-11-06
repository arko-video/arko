// Fond vert : le détourage mesuré sur des images FABRIQUÉES (banc-chroma.ts), jamais sur un vrai clip.
// Vert compressé bruité → alpha propre, pas de liseré vert, peau et vêtements gardés ; fond bleu ; détection du fond.

import { describe, expect, it } from 'vitest';
import { imageFondVert, mesurerDetourage } from './banc-chroma';
import { CHROMA_DEFAUT, chromaCpu, detecterFond, ressemblanceBrute, teinteNette, type ReglagesChroma, type Rvb } from './chroma';

function detourer(fond: Rvb, o: Parameters<typeof imageFondVert>[2] = {}, reglages: Partial<Omit<ReglagesChroma, 'couleur'>> = {}) {
  const banc = imageFondVert(320, 240, { fond, ...o });
  const f = detecterFond(banc.px, banc.l, banc.h);
  expect(f).not.toBeNull();
  const sortie = chromaCpu(banc.px, banc.l, banc.h, { couleur: f!.couleur, ...CHROMA_DEFAUT, ...reglages });
  return { banc, f: f!, sortie, m: mesurerDetourage(sortie, banc) };
}

describe('détourage sur le processeur (référence du shader)', () => {
  it('vert YouTube compressé et bruité (dégradé, ombre, blocs 8 × 8, 4:2:0) : fond enlevé, personnage gardé, aucun liseré vert', () => {
    const { m, f } = detourer([40, 185, 70]);
    expect(f.type).toBe('vert');
    expect(m.fondRestant).toBe(0); // plus aucun pixel du fond visible (alpha ≤ 8)
    expect(m.sujetEfface).toBe(0); // peau, cheveux noirs, t-shirt, pantalon, chaussures blanches : intacts
    expect(m.vertBord).toBeLessThanOrEqual(6); // excès de vert sur les bords ≤ 6 / 255 (invisible)
    expect(m.vertMax).toBeLessThanOrEqual(6);
    expect(m.ecartBord).toBeLessThan(0.08); // l'alpha suit la vraie couverture du bord
  });

  it('vert pur (0, 177, 64) et vert terne (90, 170, 100) très bruité : même résultat', () => {
    for (const [fond, bruit] of [[[0, 177, 64], 22], [[90, 170, 100], 40]] as const) {
      const { m } = detourer([...fond] as Rvb, { bruit });
      expect(m.fondRestant).toBeLessThan(0.002);
      expect(m.sujetEfface).toBe(0);
      expect(m.vertBord).toBeLessThanOrEqual(8);
    }
  });

  it('fond bleu (personnage en rouge) : détecté et enlevé', () => {
    const { m, f } = detourer([30, 90, 200], { habit: [150, 30, 30] });
    expect(f.type).toBe('bleu');
    expect(m.fondRestant).toBe(0);
    expect(m.sujetEfface).toBe(0);
  });

  it('l\'ombre verte sous le personnage part avec le fond (la lumière ne compte presque pas)', () => {
    expect(ressemblanceBrute(21 / 255, 96 / 255, 36 / 255, 1)).toBeCloseTo(ressemblanceBrute(40 / 255, 185 / 255, 70 / 255, 1), 1);
    // Un noir à peine verdâtre (bruit dans des cheveux) n'est PAS du fond : plancher du dénominateur.
    expect(ressemblanceBrute(8 / 255, 16 / 255, 8 / 255, 1)).toBeLessThan(0.15);
  });

  it('anti-débordement à 0 : le reflet est quand même retiré tout près du fond, pas à l\'intérieur', () => {
    const { m } = detourer([40, 185, 70], {}, { debordement: 0 });
    expect(m.vertBord).toBeLessThan(40);
    expect(m.sujetEfface).toBe(0);
  });

  it('tolérance plus haute = plus de fond enlevé ; douceur = bord plus progressif', () => {
    const banc = imageFondVert(160, 120);
    const f = detecterFond(banc.px, banc.l, banc.h)!;
    const opaques = (t: number, d: number) =>
      chromaCpu(banc.px, banc.l, banc.h, { couleur: f.couleur, tolerance: t, douceur: d, debordement: 0.7 }).filter((_, i) => i % 4 === 3 && _ === 255).length;
    expect(opaques(0.6, 0.25)).toBeLessThan(opaques(0.2, 0.25));
    expect(opaques(0.35, 0.5)).toBeLessThan(opaques(0.35, 0.05));
  });
});

describe('anti-poussière', () => {
  it('des points de bruit isolés (2 × 2, cyan) au milieu du fond disparaissent ; une mèche de 2 px du sujet reste', () => {
    const l = 60;
    const h = 40;
    const px = new Uint8ClampedArray(l * h * 4);
    for (let i = 0; i < l * h; i++) px.set([40, 185, 70, 255], i * 4);
    // Poussières : 2 × 2 pixels cyan (bruit des couleurs d'une vidéo compressée).
    for (const [x0, y0] of [[10, 10], [30, 20], [45, 8]]) for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 2; x++) px.set([60, 190, 185, 255], (y * l + x) * 4);
    // Mèche : trait vertical de 2 px de large, brun foncé, de y = 5 à 35, à x = 52.
    for (let y = 5; y < 35; y++) for (let x = 52; x < 54; x++) px.set([70, 45, 30, 255], (y * l + x) * 4);
    const s = chromaCpu(px, l, h, { couleur: [40, 185, 70], ...CHROMA_DEFAUT });
    const alpha = (x: number, y: number) => s[(y * l + x) * 4 + 3]!;
    for (const [x, y] of [[10, 10], [11, 11], [30, 20], [46, 9]]) expect(alpha(x, y)).toBeLessThanOrEqual(8);
    for (let y = 8; y < 32; y++) expect(alpha(52, y) + alpha(53, y)).toBeGreaterThan(300);
  });
});

describe('couleur du fond trouvée sur les bords', () => {
  it('une image sans fond vert ni bleu → null ; un bandeau en bas ne gêne pas', () => {
    const gris = new Uint8ClampedArray(64 * 64 * 4).fill(120);
    expect(detecterFond(gris, 64, 64)).toBeNull();
    const banc = imageFondVert(200, 150);
    // Bandeau « breaking news » rouge sur tout le bas : le reste du bord est vert.
    for (let y = 120; y < 150; y++) for (let x = 0; x < 200; x++) banc.px.set([200, 20, 20, 255], (y * 200 + x) * 4);
    const f = detecterFond(banc.px, 200, 150)!;
    expect(f.type).toBe('vert');
    expect(f.part).toBeGreaterThan(0.5);
    expect(f.couleur[1]).toBeGreaterThan(120);
  });

  it('teinte nette : vert, bleu, ou rien (peau, gris, noir)', () => {
    expect(teinteNette(40, 185, 70)).toBe(1);
    expect(teinteNette(30, 90, 200)).toBe(2);
    expect(teinteNette(224, 172, 140)).toBe(0);
    expect(teinteNette(10, 20, 10)).toBe(0);
  });
});
