// D. Rendus des styles « Persos » (7/11/2026), dessinés au vecteur (Canvas 2D) :
// - BD : encre nette, plus épaisse en bas à droite (trait d'épaisseur variable), traits ouverts effilés aux bouts,
//   aplats et une ombre simple (un croissant plus sombre en bas à droite des formes « ombrées ») ;
// - dessin animé : contour épais régulier, couleurs vives ;
// - bonhomme raté : trait fin très tremblé qui ne se referme pas bien, couleurs saturées qui débordent ;
// - mascotte : contour doux (couleur foncée de la forme, pas noir), couleurs douces ;
// - papier découpé : pas d'encre, bords un peu irréguliers, petite ombre portée sous chaque pièce.
// Toutes les mesures sont en unités du pinceau ; les épaisseurs suivent `pi.kt` (pixels par unité de trait).

import { assombrir, eclaircir, estClaire, melanger, saturer } from '../couleurs';
import { centre, trembler, type Pt } from '../courbes';
import type { OptionsForme, Pinceau, Rendu } from '../pinceau';

type StyleVecteur = 'bd' | 'cartoon' | 'rate' | 'mascotte' | 'papier';

/** Réglages chiffrés : `trait` = épaisseur (unités de trait), `encre` = couleur des traits. */
export const RENDUS_PERSOS = {
  bd: { trait: 0.95, encre: '#15111B' },
  cartoon: { trait: 1.9, encre: '#1E1633' },
  rate: { trait: 0.8, encre: '#121212', tremble: 1.15, deborde: 2.3 },
  mascotte: { trait: 1.15, encre: '#4A3550' },
  papier: { trait: 1.05, encre: '#2A211E', ombre: 0.9 },
} as const;

const OMBRE_PAPIER = 'rgba(40, 24, 8, 0.34)';

const memo = new Map<string, string>();
export function teinte(style: StyleVecteur, c: string): string {
  if (!c.startsWith('#')) return c;
  const cle = style + c;
  let r = memo.get(cle);
  if (r) return r;
  if (style === 'cartoon') r = melanger(c, saturer(c), 0.7);
  else if (style === 'rate') r = saturer(c);
  else if (style === 'mascotte') r = melanger(c, '#FFF6EE', 0.14);
  else if (style === 'papier') r = melanger(c, '#F1E6CF', 0.1);
  else r = c;
  if (memo.size > 512) memo.clear();
  memo.set(cle, r);
  return r;
}

export class RenduPerso implements Rendu {
  constructor(readonly style: StyleVecteur) {}

  /** Unités du pinceau pour une unité de trait (les décalages suivent l'épaisseur, pas la taille de la forme). */
  private u(pi: Pinceau): number {
    return pi.kt / pi.k;
  }

  remplir(pi: Pinceau, nom: string, base: Pt[], fond: string, o: OptionsForme) {
    const ctx = pi.ctx;
    const c = teinte(this.style, fond);
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    if (this.style === 'rate') {
      const h = pi.hasard(`f:${nom}`);
      const d = RENDUS_PERSOS.rate.deborde * this.u(pi);
      const dx = (h() * 2 - 1) * d;
      const dy = (h() * 2 - 1) * d;
      const [cx, cy] = centre(base);
      pi.chemin(base.map(([x, y]) => [cx + (x - cx) * 1.04 + dx, cy + (y - cy) * 1.04 + dy] as Pt), true);
    } else if (this.style === 'papier') {
      const pts = this.decoupe(pi, nom, base);
      if ((o.alpha ?? 1) > 0.5) {
        const d = RENDUS_PERSOS.papier.ombre * pi.kt;
        ctx.save();
        ctx.translate(d * 0.6, d);
        pi.chemin(pts, true);
        ctx.fillStyle = OMBRE_PAPIER;
        ctx.fill();
        ctx.restore();
      }
      pi.chemin(pts, true);
    } else pi.chemin(base, true);
    ctx.fillStyle = c;
    ctx.fill();
    if (this.style === 'bd' && o.ombre && (o.alpha ?? 1) === 1) {
      // Ombre simple : la forme en plus sombre, recouverte par elle-même décalée vers le haut à gauche.
      const d = 1.5 * this.u(pi);
      ctx.clip();
      ctx.fillStyle = assombrir(c, 0.24);
      ctx.fill();
      pi.chemin(base.map(([x, y]) => [x - d * pi.s * 0.8, y - d] as Pt), true);
      ctx.fillStyle = c;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Bords « coupés aux ciseaux » : chaque point bougé un peu ; et chaque pièce un peu mal posée (tournée de
   * ± 2,5° et décalée d'un demi-trait), comme collée à la main.
   */
  private decoupe(pi: Pinceau, nom: string, base: Pt[]): Pt[] {
    const m = pi.hasard(`m:${nom}`);
    const ang = ((m() * 2 - 1) * 2.5 * Math.PI) / 180;
    const u = this.u(pi);
    const dx = (m() * 2 - 1) * 0.5 * u;
    const dy = (m() * 2 - 1) * 0.5 * u;
    const [cx, cy] = centre(base);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const pose = (p: Pt): Pt => [cx + (p[0] - cx) * c - (p[1] - cy) * s + dx, cy + (p[0] - cx) * s + (p[1] - cy) * c + dy];
    if (base.length < 8) return base.map(pose);
    // Tous les points sont gardés (les pointes d'une étoile restent), chacun bougé un peu.
    const h = pi.hasard(`p:${nom}`);
    const a = 0.3 * u;
    return base.map(([x, y]) => pose([x + (h() * 2 - 1) * a, y + (h() * 2 - 1) * a]));
  }

  epaisseur(pi: Pinceau, f: number): number {
    return Math.max(0.8, RENDUS_PERSOS[this.style].trait * f * pi.kt);
  }

  contour(pi: Pinceau, nom: string, base: Pt[], ferme: boolean, f: number, encre: string | undefined, fond: string | null) {
    const ctx = pi.ctx;
    const w = this.epaisseur(pi, f);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (this.style) {
      case 'bd': {
        ctx.strokeStyle = encre ?? RENDUS_PERSOS.bd.encre;
        ctx.fillStyle = ctx.strokeStyle;
        if (!ferme && base.length >= 3) {
          this.effile(pi, base, w * 1.25);
          break;
        }
        ctx.lineWidth = w;
        pi.chemin(base, ferme);
        ctx.stroke();
        // Plus épais en bas à droite : le même trait, décalé, un peu plus fin.
        ctx.translate(w * 0.32, w * 0.42);
        ctx.lineWidth = w * 0.8;
        pi.chemin(base, ferme);
        ctx.stroke();
        break;
      }
      case 'rate': {
        ctx.strokeStyle = encre ?? RENDUS_PERSOS.rate.encre;
        ctx.lineWidth = Math.max(1, w);
        const u = this.u(pi);
        const h = pi.hasard(`t:${nom}`);
        let pts = trembler(base, h, RENDUS_PERSOS.rate.tremble * u * Math.min(1.2, f + 0.3));
        // Fermé « à la souris » : on dépasse le point de départ au lieu de le rejoindre.
        if (ferme && pts.length > 3) pts = [...pts, pts[0]!, [pts[1]![0] + (h() - 0.5) * 2 * u, pts[1]![1] + (h() - 0.3) * 2 * u]];
        pi.chemin(pts, false);
        ctx.stroke();
        break;
      }
      case 'mascotte': {
        ctx.strokeStyle = encre ?? (fond && fond.startsWith('#') ? assombrir(teinte('mascotte', fond), 0.58) : RENDUS_PERSOS.mascotte.encre);
        ctx.lineWidth = w;
        pi.chemin(base, ferme);
        ctx.stroke();
        break;
      }
      case 'papier': {
        if (ferme && fond) {
          // Pas d'encre sur une pièce de papier : juste un bord un peu plus foncé (plus clair si la pièce est sombre,
          // pour qu'elle se détache aussi sur une peau foncée).
          const c = fond.startsWith('#') ? teinte('papier', fond) : fond;
          ctx.strokeStyle = !c.startsWith('#') ? c : estClaire(c) ? assombrir(c, 0.28) : eclaircir(c, 0.38);
          ctx.lineWidth = Math.max(0.6, w * 0.3);
          pi.chemin(this.decoupe(pi, nom, base), true);
          ctx.stroke();
          break;
        }
        // Trait = une bande de papier foncé, avec son ombre et un liseré clair (lisible sur une peau foncée).
        const d = RENDUS_PERSOS.papier.ombre * pi.kt;
        if (!encre || !estClaire(encre)) {
          ctx.lineWidth = w + Math.max(1.2, w * 0.7);
          ctx.strokeStyle = 'rgba(255, 246, 228, 0.6)';
          pi.chemin(base, ferme);
          ctx.stroke();
        }
        ctx.lineWidth = w;
        ctx.strokeStyle = OMBRE_PAPIER;
        ctx.save();
        ctx.translate(d * 0.5, d * 0.8);
        pi.chemin(base, ferme);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = encre ?? RENDUS_PERSOS.papier.encre;
        pi.chemin(base, ferme);
        ctx.stroke();
        break;
      }
      default: {
        ctx.strokeStyle = encre ?? RENDUS_PERSOS.cartoon.encre;
        ctx.lineWidth = w;
        pi.chemin(base, ferme);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Trait ouvert effilé (BD) : plein au milieu, fin aux deux bouts. */
  private effile(pi: Pinceau, base: Pt[], w: number) {
    const ctx = pi.ctx;
    const px = base.map((p) => pi.vers(p));
    const n = px.length;
    const g: [number, number][] = [];
    const d: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = px[Math.max(0, i - 1)]!;
      const b = px[Math.min(n - 1, i + 1)]!;
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      const e = (w / 2) * (0.3 + 0.7 * Math.sin((Math.PI * i) / (n - 1)));
      const p = px[i]!;
      g.push([p[0] - (ty / l) * e, p[1] + (tx / l) * e]);
      d.push([p[0] + (ty / l) * e, p[1] - (tx / l) * e]);
    }
    ctx.beginPath();
    [...g, ...d.reverse()].forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  rond(pi: Pinceau, cx: number, cy: number, r: number, couleur: string) {
    const ctx = pi.ctx;
    const [x, y] = pi.vers([cx, cy]);
    const rr = Math.max(0.4, r * pi.k);
    ctx.save();
    if (this.style === 'papier' && rr > 2) {
      const d = RENDUS_PERSOS.papier.ombre * pi.kt;
      ctx.fillStyle = OMBRE_PAPIER;
      ctx.beginPath();
      ctx.arc(x + d * 0.5, y + d * 0.8, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = teinte(this.style, couleur);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
