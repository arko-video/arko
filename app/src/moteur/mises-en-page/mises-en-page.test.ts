import { describe, expect, it } from 'vitest';
import { FLOU_H, FLOU_L, placementFlou, placementFond } from './flou';
import { dessinerJeuCam, placementJeuCam } from './jeu-cam';
import { bornesX, cadrageRecadre } from './recadre';

describe('fond flou', () => {
  it('vidéo 16:9 ajustée à la largeur et centrée', () => {
    expect(placementFlou(1920, 1080, 1080, 1920)).toEqual({ x: 0, y: 656.25, l: 1080, h: 607.5 });
  });
  it('y déplace la vidéo sans la faire sortir', () => {
    expect(placementFlou(1920, 1080, 1080, 1920, 0).y).toBe(0);
    expect(placementFlou(1920, 1080, 1080, 1920, 1).y).toBeCloseTo(1920 - 607.5);
  });
  it('le fond couvre le petit canevas fixe 90 × 160', () => {
    const r = placementFond(1920, 1080);
    expect(r.h).toBeCloseTo(160 * 1.08);
    expect(r.x).toBeLessThan(0);
    expect(r.x + r.l).toBeGreaterThan(FLOU_L);
    expect(FLOU_H).toBe(160);
  });
  it('même proportions en aperçu (540) et en export (1080)', () => {
    const a = placementFlou(1920, 1080, 540, 960);
    const b = placementFlou(1920, 1080, 1080, 1920);
    expect(a.y * 2).toBeCloseTo(b.y);
  });
});

describe('recadré', () => {
  it('x = centre horizontal, borné aux bords', () => {
    const c = cadrageRecadre(1920, 1080, 1080, 1920, 0.5);
    expect(c.l).toBeCloseTo(607.5);
    expect(c.x).toBeCloseTo(656.25);
    expect(cadrageRecadre(1920, 1080, 1080, 1920, 0).x).toBe(0);
    expect(cadrageRecadre(1920, 1080, 1080, 1920, 1).x).toBeCloseTo(1920 - 607.5);
    expect(cadrageRecadre(1920, 1080, 1080, 1920, 0.25).x).toBeCloseTo(480 - 303.75);
  });
  it('1072 de large : même rapport que la destination', () => {
    const c = cadrageRecadre(1920, 1080, 1072, 1920, 0.5);
    expect(c.l / c.h).toBeCloseTo(1072 / 1920);
  });
  it('source déjà verticale : coupe en haut et en bas', () => {
    const c = cadrageRecadre(1080, 2400, 1080, 1920);
    expect(c).toEqual({ x: 0, y: 240, l: 1080, h: 1920 });
  });
  it('bornes utiles de x', () => {
    const b = bornesX(1920, 1080, 1080, 1920);
    expect(b.min).toBeCloseTo(0.158, 3);
    expect(b.max).toBeCloseTo(0.842, 3);
  });
});

describe('jeu + webcam', () => {
  const cam = { x: 0.72, y: 0.04, l: 0.26, h: 0.3 };
  it('webcam en haut : bande de partCam × hauteur, séparation de 6 px, le jeu dessous', () => {
    const p = placementJeuCam(1920, 1080, { type: 'jeuCam', cam, partCam: 0.35 }, 1080, 1920);
    expect(p.cam.dst).toEqual({ x: 0, y: 0, l: 1080, h: 672 - 3 });
    expect(p.jeu.dst.y).toBeCloseTo(675);
    expect(p.jeu.dst.y + p.jeu.dst.h).toBeCloseTo(1920);
    // Le cadre webcam est recadré (sans déformation) pour remplir la bande.
    expect(p.cam.src.l / p.cam.src.h).toBeCloseTo(p.cam.dst.l / p.cam.dst.h);
    expect(p.cam.src.x).toBeGreaterThanOrEqual(0.72 * 1920 - 1e-6);
    expect(p.cam.src.x + p.cam.src.l).toBeLessThanOrEqual(0.98 * 1920 + 1e-6);
    expect(p.jeu.src.l / p.jeu.src.h).toBeCloseTo(p.jeu.dst.l / p.jeu.dst.h);
  });
  it('webcam en bas', () => {
    const p = placementJeuCam(1920, 1080, { type: 'jeuCam', cam, partCam: 0.4, camEnHaut: false }, 1080, 1920);
    expect(p.jeu.dst).toMatchObject({ x: 0, y: 0 });
    expect(p.jeu.dst.h).toBeCloseTo(1152 - 3);
    expect(p.cam.dst.y).toBeCloseTo(1155);
    expect(p.cam.dst.y + p.cam.dst.h).toBeCloseTo(1920);
  });
  it('le jeu est centré sur x et ne sort pas de la source', () => {
    const centre = placementJeuCam(1920, 1080, { type: 'jeuCam', cam, x: 0.5 }, 1080, 1920).jeu.src;
    expect(centre.x + centre.l / 2).toBeCloseTo(960);
    const bord = placementJeuCam(1920, 1080, { type: 'jeuCam', cam, x: 1 }, 1080, 1920).jeu.src;
    expect(bord.x + bord.l).toBeCloseTo(1920);
  });
  it('aperçu et export : mêmes proportions', () => {
    const a = placementJeuCam(1920, 1080, { type: 'jeuCam', cam }, 540, 960);
    const b = placementJeuCam(1920, 1080, { type: 'jeuCam', cam }, 1080, 1920);
    expect(a.jeu.dst.y * 2).toBeCloseTo(b.jeu.dst.y);
    expect(a.cam.src).toEqual(b.cam.src);
  });
  it('seulement deux drawImage de rectangles', () => {
    const appels: number[][] = [];
    const img = { largeur: 1920, hauteur: 1080, dessiner: (_c: unknown, ...r: number[]) => void appels.push(r) };
    const ctx = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low' } as never;
    dessinerJeuCam(ctx, img, { type: 'jeuCam', cam }, { l: 1080, h: 1920, echelle: 1 });
    expect(appels).toHaveLength(2);
  });
});
