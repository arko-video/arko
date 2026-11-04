// Briques de base de la synthèse : oscillateurs, bruit à graine fixe, enveloppes, courbes, mélange.
// Tout est en JavaScript pur (aucune API Web Audio) : le même code tourne dans la page ET dans le Worker d'export.
// Un « signal » est un Float32Array mono, à 48 000 échantillons par seconde.
// Règle d'or : aucune part de hasard réel. Le « bruit » vient d'un générateur à graine fixe,
// donc le même appel donne toujours exactement les mêmes échantillons.

export const FREQ = 48000;

/** Une valeur fixe, ou une courbe qui dépend du temps t (en secondes depuis le début du signal). */
export type Valeur = number | ((t: number) => number);

/** Nombre d'échantillons pour une durée en secondes. */
export function nbEchantillons(duree: number): number {
  return Math.max(1, Math.round(duree * FREQ));
}

/** Calcule une Valeur pour chaque échantillon (plus rapide quand plusieurs oscillateurs suivent la même courbe). */
export function tableau(v: Valeur, duree: number): Float32Array {
  const sortie = new Float32Array(nbEchantillons(duree));
  for (let i = 0; i < sortie.length; i++) sortie[i] = lire(v, i / FREQ);
  return sortie;
}

/** Lit une Valeur au temps t. */
export function lire(v: Valeur, t: number): number {
  return typeof v === 'number' ? v : v(t);
}

/* ------------------------------------------------------------------ oscillateurs */

export type Forme = 'sinus' | 'carre' | 'scie' | 'triangle';

/**
 * Oscillateur : une forme d'onde à la fréquence `freq` (en Hz, fixe ou qui change avec le temps).
 * `freq` peut aussi être un tableau (une fréquence par échantillon, voir tableau()), multiplié par `rapport`.
 * La phase avance échantillon par échantillon : une fréquence qui glisse ne fait jamais de « clic ».
 */
export function oscillateur(forme: Forme, duree: number, freq: Valeur | Float32Array, rapport = 1): Float32Array {
  const n = nbEchantillons(duree);
  const sortie = new Float32Array(n);
  let phase = 0; // en tours : de 0 à 1
  for (let i = 0; i < n; i++) {
    let f: number;
    if (typeof freq === 'number') f = freq;
    else if (freq instanceof Float32Array) f = i < freq.length ? freq[i] : 0;
    else f = freq(i / FREQ);
    f *= rapport;
    const pas = f > 0 ? f / FREQ : 0;
    sortie[i] = onde(forme, phase, pas);
    phase += pas;
    if (phase >= 1) phase -= Math.floor(phase);
  }
  return sortie;
}

/** Valeur de l'onde à la phase p (0 à 1). `pas` sert à adoucir les sauts (PolyBLEP : moins de sifflements parasites). */
function onde(forme: Forme, p: number, pas: number): number {
  switch (forme) {
    case 'sinus':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 'scie':
      return 2 * p - 1 - adoucirSaut(p, pas);
    case 'carre':
      return (p < 0.5 ? 1 : -1) + adoucirSaut(p, pas) - adoucirSaut((p + 0.5) % 1, pas);
  }
}

/** PolyBLEP : arrondit le saut brutal d'une onde scie ou carrée juste autour du saut. */
function adoucirSaut(p: number, pas: number): number {
  if (pas <= 0) return 0;
  if (p < pas) {
    const x = p / pas;
    return x + x - x * x - 1;
  }
  if (p > 1 - pas) {
    const x = (p - 1) / pas;
    return x * x + x + x + 1;
  }
  return 0;
}

/* ------------------------------------------------------------------ bruit à graine fixe */

/** Générateur pseudo-aléatoire mulberry32 : même graine → même suite de nombres (entre 0 et 1). */
export function mulberry32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bruit blanc entre −1 et 1, toujours le même pour une graine donnée.
 * `tenue` (Hz) : si on la donne, la valeur ne change que `tenue` fois par seconde (bruit « 8-bit » granuleux).
 */
export function bruit(duree: number, graine: number, tenue = FREQ): Float32Array {
  const n = nbEchantillons(duree);
  const hasard = mulberry32(graine);
  const sortie = new Float32Array(n);
  const tous = Math.max(1, Math.round(FREQ / tenue));
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i % tous === 0) v = hasard() * 2 - 1;
    sortie[i] = v;
  }
  return sortie;
}

/* ------------------------------------------------------------------ enveloppes */

/**
 * Enveloppe ADSR : montée (a), descente (d) vers le niveau tenu (s, de 0 à 1), puis relâchement (r)
 * qui finit pile à la fin de la durée. Temps en secondes.
 */
export function adsr(duree: number, a: number, d: number, s: number, r: number): Float32Array {
  const n = nbEchantillons(duree);
  const sortie = new Float32Array(n);
  const debutRelache = Math.max(0, duree - r);
  for (let i = 0; i < n; i++) {
    const t = i / FREQ;
    let g: number;
    if (t < a) g = t / a;
    else if (t < a + d) g = 1 - ((t - a) / d) * (1 - s);
    else g = s;
    if (t >= debutRelache && r > 0) g *= Math.max(0, 1 - (t - debutRelache) / r);
    sortie[i] = g;
  }
  return sortie;
}

/** Décroissance exponentielle : monte en `attaque` secondes, puis le niveau est divisé par e toutes les `tau` secondes. */
export function expo(duree: number, tau: number, attaque = 0.002): Float32Array {
  const n = nbEchantillons(duree);
  const sortie = new Float32Array(n);
  const nAttaque = Math.round(attaque * FREQ);
  const facteur = Math.exp(-1 / (tau * FREQ)); // multiplier par ce facteur à chaque échantillon = décroissance expo
  let g = 1;
  for (let i = 0; i < n; i++) {
    if (i < nAttaque) sortie[i] = i / nAttaque;
    else {
      sortie[i] = g;
      g *= facteur;
    }
  }
  return sortie;
}

/* ------------------------------------------------------------------ courbes (pour faire glisser une fréquence) */

/** Courbe exponentielle de `de` à `a` en `duree` secondes, puis reste à `a` (idéal pour les hauteurs de son). */
export function courbeExpo(de: number, a: number, duree: number): (t: number) => number {
  const vitesse = Math.log(a / de) / duree;
  return (t) => (t >= duree ? a : t <= 0 ? de : de * Math.exp(vitesse * t));
}

/** Courbe en ligne droite de `de` à `a` en `duree` secondes, puis reste à `a`. */
export function courbeLin(de: number, a: number, duree: number): (t: number) => number {
  return (t) => (t >= duree ? a : de + ((a - de) * Math.max(0, t)) / duree);
}

/** Cloche : 0 au début, 1 au temps `pic`, retour à 0 à `duree` (forme douce). */
export function cloche(t: number, pic: number, duree: number): number {
  if (t <= 0 || t >= duree) return 0;
  const x = t < pic ? t / pic : 1 - (t - pic) / (duree - pic);
  return Math.sin((Math.PI / 2) * x) ** 2;
}

/* ------------------------------------------------------------------ opérations sur les signaux */

/** Multiplie un signal par un autre (une enveloppe) ou par une Valeur. Renvoie un nouveau signal. */
export function multiplier(signal: Float32Array, par: Float32Array | Valeur): Float32Array {
  const sortie = new Float32Array(signal.length);
  if (par instanceof Float32Array) {
    for (let i = 0; i < signal.length; i++) sortie[i] = i < par.length ? signal[i] * par[i] : 0;
  } else if (typeof par === 'number') {
    for (let i = 0; i < signal.length; i++) sortie[i] = signal[i] * par;
  } else {
    for (let i = 0; i < signal.length; i++) sortie[i] = signal[i] * par(i / FREQ);
  }
  return sortie;
}

/** Une piste à mélanger : un signal, posé à `debut` secondes, multiplié par `gain`. */
export interface Piste {
  signal: Float32Array;
  debut?: number;
  gain?: number;
}

/** Mélange des pistes dans un nouveau signal de `duree` secondes (ce qui dépasse est coupé). */
export function melanger(duree: number, pistes: Piste[]): Float32Array {
  const sortie = new Float32Array(nbEchantillons(duree));
  for (const p of pistes) {
    const k0 = Math.round((p.debut ?? 0) * FREQ);
    const g = p.gain ?? 1;
    for (let i = 0; i < p.signal.length; i++) {
      const k = k0 + i;
      if (k >= 0 && k < sortie.length) sortie[k] += p.signal[i] * g;
    }
  }
  return sortie;
}

/** Fréquence (Hz) d'une note : 0 = la 440 Hz, +12 = une octave plus haut. */
export function note(demiTons: number): number {
  return 440 * Math.pow(2, demiTons / 12);
}
