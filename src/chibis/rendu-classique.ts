// D. Rendu des 3 styles d'origine des chibis (dev 3), sorti de pinceau.ts sans rien changer (mêmes appels Canvas,
// même ordre : vérifié par anciens-styles.test.ts). « Feutre raté » (trait noir épais tremblé, double trait, aplats
// qui débordent), « crayon » (3 passes grises, hachures d'ombre, aplats à 85 %), « paint » (trait net de 1 pixel,
// couleurs saturées : dessiné petit puis agrandi).

import { saturer } from './couleurs';
import { centre, trembler, type Pt } from './courbes';
import type { OptionsForme, Pinceau, Rendu } from './pinceau';

/** Réglages chiffrés de chaque style (unités = % de la hauteur du chibi). */
export const STYLES_DESSIN = {
  feutre: { trait: 3.5, tremble: 1.2, encre: '#18181C' },
  crayon: { trait: 1.5, tremble: 0.8, encre: '#2E2E35', passes: 3 },
  paint: { trait: 0, tremble: 0, encre: '#000000' },
} as const;

type StyleClassique = keyof typeof STYLES_DESSIN;

export class RenduClassique implements Rendu {
  readonly reglage: (typeof STYLES_DESSIN)[StyleClassique];
  constructor(readonly style: StyleClassique) {
    this.reglage = STYLES_DESSIN[style];
  }

  remplir(pi: Pinceau, nom: string, base: Pt[], fond: string, o: OptionsForme) {
    const ctx = pi.ctx;
    const h = pi.hasard(`f:${nom}`);
    ctx.save();
    if (this.style === 'feutre') {
      // L'aplat déborde un peu : décalé et grossi de 2 %.
      const dx = (h() * 2 - 1) * 0.9;
      const dy = (h() * 2 - 1) * 0.9;
      const [cx, cy] = centre(base);
      pi.chemin(base.map(([x, y]) => [cx + (x - cx) * 1.02 + dx, cy + (y - cy) * 1.02 + dy] as Pt), true);
    } else pi.chemin(base, true);
    ctx.fillStyle = this.style === 'paint' ? saturer(fond) : fond;
    ctx.globalAlpha = (o.alpha ?? 1) * (this.style === 'crayon' ? 0.85 : 1);
    ctx.fill();
    if (o.ombre && this.style === 'crayon') this.hachures(pi, base);
    ctx.restore();
  }

  rond(pi: Pinceau, cx: number, cy: number, r: number, couleur: string) {
    const ctx = pi.ctx;
    const [x, y] = pi.vers([cx, cy]);
    ctx.save();
    ctx.fillStyle = this.style === 'paint' ? saturer(couleur) : couleur;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(this.style === 'paint' ? 0.5 : 0.3, r * pi.k), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  epaisseur(pi: Pinceau, f: number): number {
    if (this.style === 'paint') return 1;
    return Math.max(1, this.reglage.trait * f * pi.kt);
  }

  contour(pi: Pinceau, nom: string, base: Pt[], ferme: boolean, f: number, encre?: string) {
    const ctx = pi.ctx;
    const r = this.reglage;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = encre ?? r.encre;
    if (this.style === 'paint') {
      ctx.lineWidth = 1;
      pi.chemin(base, ferme);
      ctx.stroke();
    } else if (this.style === 'feutre') {
      ctx.lineWidth = this.epaisseur(pi, f);
      pi.chemin(trembler(base, pi.hasard(`t:${nom}`), r.tremble * Math.min(1, f + 0.2)), ferme);
      ctx.stroke();
      // Léger double trait décalé.
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = this.epaisseur(pi, f * 0.4);
      const d = 0.7;
      pi.chemin(trembler(base, pi.hasard(`d:${nom}`), r.tremble).map(([x, y]) => [x + d, y - d * 0.6] as Pt), ferme);
      ctx.stroke();
    } else {
      ctx.lineWidth = this.epaisseur(pi, f);
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < STYLES_DESSIN.crayon.passes; i++) {
        pi.chemin(trembler(base, pi.hasard(`c${i}:${nom}`), r.tremble), ferme);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Hachures diagonales sur le côté droit / bas de la forme (crayon). */
  private hachures(pi: Pinceau, base: Pt[]) {
    const ctx = pi.ctx;
    const xs = base.map((p) => p[0]);
    const ys = base.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    ctx.save();
    pi.chemin(base, true);
    ctx.clip();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#26262C';
    ctx.lineWidth = Math.max(0.6, 0.55 * pi.k);
    ctx.beginPath();
    const debut = x0 + (x1 - x0) * 0.58;
    for (let x = debut; x < x1 + (y1 - y0); x += 2.4) {
      const [ax, ay] = pi.vers([x, y1]);
      const [bx, by] = pi.vers([x - (y1 - y0), y0]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.restore();
  }
}
