// D. Le « pinceau » des chibis et des persos (dev 3) : dessine des formes et des lignes dans le style choisi, en
// Canvas 2D seulement (page ET Worker d'export). Les formes sont décrites dans un repère de 100 unités = la hauteur
// du perso, pieds en (0, 0), y vers le HAUT négatif. Chaque forme a un nom : son bruit (trait tremblé,
// irrégularités) est tiré de (graine, nom), donc identique d'une image à l'autre (aucun Math.random, aucune horloge).
// La façon de remplir et de tracer appartient au RENDU du style (rendu-classique.ts : feutre, crayon, paint ;
// persos/rendus.ts : BD, dessin animé, raté, mascotte, papier ; persos/pixel.ts : grille de pixels).
// Un SOUS-REPÈRE (`repere`) dessine les coiffures, visages et chapeaux des chibis sur une tête d'une autre taille.

import type { Ctx2D } from '../moteur/canevas';
import type { StyleChibi } from './catalogue';
import { densifier, hacher, type Pt } from './courbes';
import { aleatoire } from './hasard';
import { renduPour } from './rendus';

export { densifier, hacher, PAS_TRAIT, trembler, type Pt } from './courbes';
export { STYLES_DESSIN } from './rendu-classique';

/** Irrégularité des formes (± part de la taille), tirée de la graine. */
export const IRREGULARITE = 0.04;

export interface OptionsForme {
  /** false = sans contour. */
  trait?: boolean;
  /** Épaisseur du contour (× celle du style). */
  epais?: number;
  /** Ombre (hachures du crayon, ombre portée de la BD). */
  ombre?: boolean;
  /** false = segments droits entre les points (sinon courbe lisse qui passe par les points). */
  lisse?: boolean;
  /** Opacité du remplissage. */
  alpha?: number;
  /** Couleur du contour (défaut : encre du style). */
  encre?: string;
}

/** Façon de remplir et de tracer d'un style. `base` = points déjà densifiés (repère du pinceau). */
export interface Rendu {
  remplir(pi: Pinceau, nom: string, base: Pt[], fond: string, o: OptionsForme): void;
  contour(pi: Pinceau, nom: string, base: Pt[], ferme: boolean, f: number, encre: string | undefined, fond: string | null): void;
  rond(pi: Pinceau, cx: number, cy: number, r: number, couleur: string): void;
  epaisseur(pi: Pinceau, f: number): number;
}

interface Rotation {
  a: number;
  px: number;
  py: number;
}

export class Pinceau {
  private rot: Rotation[] = [];
  private parent: Pinceau | null = null;
  /** Sous-repère : point (x, y) → (cx + x × ex, cy + y × ey) dans le repère du parent. */
  private af: [number, number, number, number] = [0, 0, 1, 1];
  /** Pixels par unité pour l'épaisseur des traits (= k, sauf dans un sous-repère). */
  kt: number;
  readonly rendu: Rendu;

  /**
   * @param ox, oy  pieds du chibi en pixels ; @param k pixels par unité ; @param s 1, ou −1 = retourné.
   */
  constructor(
    readonly ctx: Ctx2D,
    readonly style: StyleChibi,
    readonly graine: number,
    readonly ox: number,
    readonly oy: number,
    readonly k: number,
    readonly s: 1 | -1,
    rendu?: Rendu,
  ) {
    this.kt = k;
    this.rendu = rendu ?? renduPour(style);
  }

  /**
   * Sous-repère : mêmes style, graine et rendu ; ses points (x, y) sont posés en (cx + x × ex, cy + y × ey) chez
   * ce pinceau (avec ses rotations en cours). `trait` = épaisseur des traits par rapport à ce pinceau.
   */
  repere(cx: number, cy: number, ex: number, ey: number, trait = 1): Pinceau {
    const p = new Pinceau(this.ctx, this.style, this.graine, 0, 0, this.k * Math.sqrt(Math.abs(ex * ey)), this.s, this.rendu);
    p.parent = this;
    p.af = [cx, cy, ex, ey];
    p.kt = this.kt * trait;
    return p;
  }

  /** Tire un générateur pour la forme `nom` (reproductible). */
  hasard(nom: string): () => number {
    return aleatoire(hacher(this.graine, nom));
  }

  /** Dessine `f` tourné de `deg` degrés autour de (px, py) (repère du chibi). */
  tourner(deg: number, px: number, py: number, f: () => void) {
    if (deg === 0) return f();
    this.rot.push({ a: (deg * Math.PI) / 180, px, py });
    try {
      f();
    } finally {
      this.rot.pop();
    }
  }

  /** Point du repère du chibi après les rotations en cours (toujours dans le repère du chibi). */
  tourne(p: Pt): [number, number] {
    let [x, y] = p;
    for (let i = this.rot.length - 1; i >= 0; i--) {
      const r = this.rot[i]!;
      const c = Math.cos(r.a);
      const sn = Math.sin(r.a);
      const dx = x - r.px;
      const dy = y - r.py;
      x = r.px + dx * c - dy * sn;
      y = r.py + dx * sn + dy * c;
    }
    return [x, y];
  }

  /** Point du repère du chibi → pixels. */
  vers(p: Pt): [number, number] {
    const [x, y] = this.tourne(p);
    if (this.parent) return this.parent.vers([this.af[0] + x * this.af[2], this.af[1] + y * this.af[3]]);
    return [this.ox + this.s * x * this.k, this.oy + y * this.k];
  }

  /** Points de contrôle d'un ovale, un peu inégal (± 4 % du rayon, tiré de la graine). */
  ovale(nom: string, cx: number, cy: number, rx: number, ry: number, n = 10, irr = IRREGULARITE): Pt[] {
    const h = this.hasard(`o:${nom}`);
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const f = 1 + (h() * 2 - 1) * irr;
      pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
    }
    return pts;
  }

  /** Forme fermée remplie (fond null = contour seul). */
  forme(nom: string, ctrl: readonly Pt[], fond: string | null, o: OptionsForme = {}) {
    if (ctrl.length < 2) return;
    const base = densifier(ctrl, true, o.lisse ?? true);
    if (fond) this.rendu.remplir(this, nom, base, fond, o);
    // Une forme presque transparente (verre de lunettes) se trace comme un contour seul.
    if (o.trait !== false) this.rendu.contour(this, nom, base, true, o.epais ?? 1, o.encre, (o.alpha ?? 1) < 0.3 ? null : fond);
  }

  /** Ligne ouverte (sourcils, bouches, plis…). */
  ligne(nom: string, ctrl: readonly Pt[], o: { epais?: number; encre?: string; lisse?: boolean } = {}) {
    if (ctrl.length < 2) return;
    this.rendu.contour(this, nom, densifier(ctrl, false, o.lisse ?? true), false, o.epais ?? 1, o.encre, null);
  }

  /** Rond plein sans contour (pupilles, reflets, gouttes). */
  rond(cx: number, cy: number, r: number, couleur: string) {
    this.rendu.rond(this, cx, cy, r, couleur);
  }

  /** Signe dessiné à l'endroit (jamais retourné : « ? », « ! », « z ») : traits en coordonnées relatives à l'ancre. */
  signe(nom: string, ancre: Pt, traits: readonly (readonly Pt[])[], o: { epais?: number; encre?: string } = {}) {
    const [ax, ay] = this.tourne(ancre);
    const sauve = this.rot;
    this.rot = [];
    try {
      // s × (ax + s × x) = s × ax + x : la position suit le chibi, la forme du signe ne se retourne pas.
      traits.forEach((t, i) => this.ligne(`${nom}:${i}`, t.map(([x, y]) => [ax + this.s * x, ay + y] as Pt), { ...o, lisse: false }));
    } finally {
      this.rot = sauve;
    }
  }

  /** Épaisseur d'un contour en pixels. */
  epaisseur(f = 1): number {
    return this.rendu.epaisseur(this, f);
  }

  /** Chemin Canvas (fermé ou non) des points donnés (repère du pinceau). */
  chemin(pts: readonly Pt[], ferme: boolean) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this.vers(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (ferme) ctx.closePath();
  }
}
