// D. Petits outils de couleur des chibis (dev 3) : mélange, assombrir, saturer (style Paint). Purs, avec un cache.

function lire(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ecrire(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mélange a → b (t = 0 : a, t = 1 : b). */
export function melanger(a: string, b: string, t: number): string {
  if (!a.startsWith('#') || !b.startsWith('#')) return a;
  const x = lire(a);
  const y = lire(b);
  return ecrire(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Plus sombre (t = 0,2 : 20 % vers le noir). */
export function assombrir(c: string, t = 0.25): string {
  return melanger(c, '#000000', t);
}

/** Plus clair. */
export function eclaircir(c: string, t = 0.25): string {
  return melanger(c, '#FFFFFF', t);
}

/** Clair (pour choisir un trait ou un motif lisible par-dessus) ? */
export function estClaire(c: string): boolean {
  if (!c.startsWith('#')) return true;
  const [r, g, b] = lire(c);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

const SATURES = new Map<string, string>();

/** Couleur plus saturée (style Paint, couleurs « de logiciel de dessin »). */
export function saturer(c: string): string {
  if (!c.startsWith('#') || c.length !== 7) return c;
  const deja = SATURES.get(c);
  if (deja) return deja;
  const [r, g, b] = lire(c);
  const m = (r + g + b) / 3;
  const f = 1.45;
  const res = ecrire(m + (r - m) * f, m + (g - m) * f, m + (b - m) * f);
  if (SATURES.size > 256) SATURES.clear();
  SATURES.set(c, res);
  return res;
}
