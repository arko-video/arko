// D. Outils de courbes des chibis et des persos (dev 3) : point, hachage (graine, nom), courbe lisse qui passe par
// des points, trait tremblé. Purs, sans Canvas.

export type Pt = readonly [number, number];

/** Hachage FNV-1a de (graine, nom) → graine d'une forme. */
export function hacher(graine: number, nom: string): number {
  let h = (2166136261 ^ graine) >>> 0;
  for (let i = 0; i < nom.length; i++) h = Math.imul(h ^ nom.charCodeAt(i), 16777619) >>> 0;
  return Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
}

/** Pas des points d'un contour (unités) : assez serré pour un trait tremblé, assez lâche pour rester rapide. */
export const PAS_TRAIT = 3.5;

/** Courbe de Catmull-Rom qui passe par les points, échantillonnée tous les ~3,5 unités (ou segments droits). */
export function densifier(ctrl: readonly Pt[], ferme: boolean, lisse: boolean): Pt[] {
  const n = ctrl.length;
  const res: Pt[] = [];
  const segs = ferme ? n : n - 1;
  const at = (i: number) => ctrl[ferme ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const pas = Math.max(1, Math.min(12, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / PAS_TRAIT)));
    for (let j = 0; j < pas; j++) {
      const t = j / pas;
      if (!lisse) {
        res.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]);
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      res.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!ferme) res.push(ctrl[n - 1]!);
  return res;
}

/** Trait tremblé : chaque point bouge d'un bruit (± amp unités), tiré du générateur. */
export function trembler(pts: readonly Pt[], h: () => number, amp: number): Pt[] {
  if (amp <= 0) return [...pts];
  return pts.map(([x, y]) => [x + (h() * 2 - 1) * amp, y + (h() * 2 - 1) * amp] as Pt);
}

/** Centre (moyenne) des points. */
export function centre(pts: readonly Pt[]): Pt {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
