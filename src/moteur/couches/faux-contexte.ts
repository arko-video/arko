// POUR LES TESTS SEULEMENT : un faux contexte 2D qui note ce qui est dessiné (texte, couleur, position finale
// après translate / scale / rotate). Il permet de vérifier le dessin dans Node, sans navigateur.

import type { Ctx2D } from '../canevas';

type Matrice = [number, number, number, number, number, number];

export interface Trace {
  op: 'fillText' | 'strokeText' | 'fill' | 'stroke';
  txt?: string;
  /** Point d'ancrage en pixels de la destination. */
  x: number;
  y: number;
  /** Agrandissement total et rotation (degrés) au moment du dessin. */
  echelle: number;
  rotation: number;
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  shadowBlur: number;
  /** Pour 'fill' et 'stroke' : boîte englobante du chemin (pixels de la destination). */
  boite?: { x0: number; y0: number; x1: number; y1: number };
}

const ETAT = { font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, shadowBlur: 0, shadowColor: '', shadowOffsetY: 0 };

export class FauxContexte {
  traces: Trace[] = [];
  font = ETAT.font;
  fillStyle = ETAT.fillStyle;
  strokeStyle = ETAT.strokeStyle;
  lineWidth = ETAT.lineWidth;
  globalAlpha = ETAT.globalAlpha;
  shadowBlur = ETAT.shadowBlur;
  shadowColor = ETAT.shadowColor;
  shadowOffsetY = ETAT.shadowOffsetY;
  textAlign = 'start';
  textBaseline = 'alphabetic';
  lineJoin = 'miter';
  miterLimit = 10;
  imageSmoothingEnabled = true;
  imageSmoothingQuality = 'low';
  lineCap = 'butt';
  globalCompositeOperation = 'source-over';
  /** Nombre de drawImage (chibis du cache, etc.). */
  images = 0;
  private m: Matrice = [1, 0, 0, 1, 0, 0];
  private pile: { m: Matrice; etat: typeof ETAT }[] = [];
  private chemin: [number, number][] = [];

  get ctx(): Ctx2D {
    return this as unknown as Ctx2D;
  }
  save() {
    const etat = { font: this.font, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur, shadowColor: this.shadowColor, shadowOffsetY: this.shadowOffsetY };
    this.pile.push({ m: [...this.m], etat });
  }
  restore() {
    const p = this.pile.pop();
    if (p) {
      this.m = p.m;
      Object.assign(this, p.etat);
    }
  }
  private multiplier(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x: number, y: number) {
    this.multiplier(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.multiplier(x, 0, 0, y, 0, 0);
  }
  rotate(r: number) {
    this.multiplier(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
  }
  private point(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  private noter(op: Trace['op'], x: number, y: number, txt?: string): Trace {
    const [px, py] = this.point(x, y);
    const t: Trace = {
      op, x: px, y: py, echelle: Math.hypot(this.m[0], this.m[1]), rotation: (Math.atan2(this.m[1], this.m[0]) * 180) / Math.PI,
      font: this.font, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur,
    };
    if (txt !== undefined) t.txt = txt;
    this.traces.push(t);
    return t;
  }
  fillText(txt: string, x: number, y: number) {
    this.noter('fillText', x, y, txt);
  }
  strokeText(txt: string, x: number, y: number) {
    this.noter('strokeText', x, y, txt);
  }
  beginPath() {
    this.chemin = [];
  }
  moveTo(x: number, y: number) {
    this.chemin.push(this.point(x, y));
  }
  arcTo(x1: number, y1: number, x2: number, y2: number) {
    this.chemin.push(this.point(x1, y1), this.point(x2, y2));
  }
  closePath() {}
  fill() {
    const t = this.noter('fill', 0, 0);
    const xs = this.chemin.map((p) => p[0]);
    const ys = this.chemin.map((p) => p[1]);
    t.boite = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  fillRect() {}
  drawImage() {
    this.images++;
  }
  // Ajouts pour les chibis (dev 3) : lignes, arcs, contours, découpe.
  lineTo(x: number, y: number) {
    this.chemin.push(this.point(x, y));
  }
  arc(x: number, y: number, r: number) {
    this.chemin.push(this.point(x - r, y - r), this.point(x + r, y + r));
  }
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.chemin.push(this.point(x - rx, y - ry), this.point(x + rx, y + ry));
  }
  rect(x: number, y: number, l: number, h: number) {
    this.chemin.push(this.point(x, y), this.point(x + l, y + h));
  }
  clip() {}
  clearRect() {}
  setLineDash() {}
  stroke() {
    const t = this.noter('stroke', 0, 0);
    const xs = this.chemin.map((p) => p[0]);
    const ys = this.chemin.map((p) => p[1]);
    t.boite = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
}

/** Textes écrits (fillText) dans l'ordre. */
export function textesEcrits(f: FauxContexte): Trace[] {
  return f.traces.filter((t) => t.op === 'fillText');
}
