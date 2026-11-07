// Instruments de la musique de fond fabriquée par Arko (CC0) : corde pincée (Karplus-Strong accordé, pour le
// pizzicato et la basse), maillets (marimba, célesta, xylophone), basses (tuba, douce), petites percussions douces,
// filtres et réverbération. JavaScript pur, à n'importe quelle fréquence d'échantillonnage, SANS hasard réel : le
// « bruit » vient d'un générateur à graine fixe, donc le même appel donne toujours les mêmes échantillons.
// Chaque fonction renvoie un signal MONO (Float32Array) qui commence et finit à zéro (pas de clic).

import { mulberry32 } from '../synthese/briques';

/* ------------------------------------------------------------------ filtres (biquads, formules RBJ) */

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export type TypeFiltre = 'passe-bas' | 'passe-haut' | 'passe-bande' | 'plateau-aigu' | 'cloche';

/** Coefficients d'un biquad (fc en Hz, q, gain en dB pour le plateau). */
export function biquad(type: TypeFiltre, fc: number, q: number, fs: number, gainDb = 0): Biquad {
  const w = (2 * Math.PI * Math.min(fc, fs * 0.45)) / fs;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'passe-bas') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === 'passe-haut') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === 'passe-bande') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === 'cloche') {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    const A = Math.pow(10, gainDb / 40);
    const r = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cos + r);
    b1 = -2 * A * (A - 1 + (A + 1) * cos);
    b2 = A * (A + 1 + (A - 1) * cos - r);
    a0 = A + 1 - (A - 1) * cos + r;
    a1 = 2 * (A - 1 - (A + 1) * cos);
    a2 = A + 1 - (A - 1) * cos - r;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Filtre `x` sur place (forme directe transposée). `etat` (2 valeurs) permet d'enchaîner des morceaux. */
export function filtrerSurPlace(x: Float32Array, c: Biquad, etat: Float64Array = new Float64Array(2), de = 0, a = x.length): Float64Array {
  let z1 = etat[0]!;
  let z2 = etat[1]!;
  for (let i = de; i < a; i++) {
    const v = x[i]!;
    const y = c.b0 * v + z1;
    z1 = c.b1 * v - c.a1 * y + z2;
    z2 = c.b2 * v - c.a2 * y;
    x[i] = y;
  }
  etat[0] = z1;
  etat[1] = z2;
  return etat;
}

/** Biquads en cascade, sur place, en une seule passe (états dans `etats`, 2 valeurs par filtre). */
function cascade(x: Float32Array, filtres: readonly Biquad[], etats: Float64Array): void {
  for (let f = 0; f < filtres.length; f++) {
    const { b0, b1, b2, a1, a2 } = filtres[f]!;
    let z1 = etats[2 * f]!;
    let z2 = etats[2 * f + 1]!;
    for (let i = 0; i < x.length; i++) {
      const v = x[i]!;
      const y = b0 * v + z1;
      z1 = b1 * v - a1 * y + z2;
      z2 = b2 * v - a2 * y;
      x[i] = y;
    }
    etats[2 * f] = z1;
    etats[2 * f + 1] = z2;
  }
}

/**
 * Filtre un signal qui tourne en BOUCLE (biquads en cascade) : les filtres sont d'abord « chauffés » sur la fin du
 * signal (ce qui précède le début quand la boucle repart), puis appliqués au signal entier. Le début s'enchaîne donc
 * sans saut avec la fin.
 */
export function filtrerEnBoucle(x: Float32Array, filtres: Biquad | readonly Biquad[], fs: number, chauffe = 0.5): void {
  const liste = Array.isArray(filtres) ? (filtres as readonly Biquad[]) : [filtres as Biquad];
  const etats = new Float64Array(2 * liste.length);
  cascade(x.slice(x.length - Math.min(x.length, Math.round(chauffe * fs))), liste, etats);
  cascade(x, liste, etats);
}

/* ------------------------------------------------------------------ enveloppes */

/** Montée en `attaque` s, puis gain 1 jusqu'à `tenue` s, puis descente en cosinus jusqu'à 0 en `relache` s. */
export function enveloppe(n: number, fs: number, attaque: number, tenue: number, relache: number): Float32Array {
  const e = new Float32Array(n);
  const na = Math.max(1, Math.round(attaque * fs));
  const nt = Math.round(tenue * fs);
  const nr = Math.max(1, Math.round(relache * fs));
  for (let i = 0; i < n; i++) {
    let g = i < na ? i / na : 1;
    if (i >= nt) g *= i - nt >= nr ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (i - nt)) / nr);
    e[i] = g;
  }
  return e;
}

function multiplierSurPlace(x: Float32Array, e: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * (e[i] ?? 0);
  return x;
}

/* ------------------------------------------------------------------ corde pincée (Karplus-Strong) */

export interface OptionsCorde {
  /** Temps pour perdre 60 dB (s) : la corde sonne d'autant plus longtemps. */
  t60: number;
  /** 0 (sourd, feutré) à 1 (clair) : couleur de l'attaque et du son. */
  brillance: number;
  /** Graine du bruit d'attaque (même graine → même son). */
  graine: number;
  /** Durée tenue (s) avant l'étouffement ; la note dure `tenue + relache`. */
  tenue: number;
  /** Étouffement final (s), défaut 0,06. */
  relache?: number;
  /** Position du pincement (0,1 à 0,5) : creuse certaines harmoniques, comme un doigt près du chevalet. */
  pincement?: number;
}

/**
 * Corde pincée de Karplus-Strong ACCORDÉE : boucle de retard + moyenne de deux échantillons + passe-tout fractionnaire
 * (la hauteur est juste à quelques centièmes de demi-ton près, même dans l'aigu).
 */
export function corde(freq: number, fs: number, o: OptionsCorde): Float32Array {
  const relache = o.relache ?? 0.06;
  const n = Math.max(2, Math.round((o.tenue + relache) * fs));
  const y = new Float32Array(n);
  const periode = fs / freq;
  const N = Math.max(2, Math.floor(periode - 0.5 - 0.05));
  const delta = periode - 0.5 - N; // retard fractionnaire du passe-tout, entre 0,05 et 1,05
  const C = (1 - delta) / (1 + delta);
  const rho = Math.pow(10, -3 / (Math.max(0.05, o.t60) * freq));
  // Attaque : bruit à graine fixe, passé dans un passe-bas d'autant plus fermé que la corde est sourde, sans continu.
  const hasard = mulberry32(o.graine);
  const exc = new Float32Array(N);
  const a = 0.08 + 0.75 * Math.max(0, Math.min(1, o.brillance));
  let lp = 0;
  let moyenne = 0;
  for (let i = 0; i < N; i++) {
    lp += a * (hasard() * 2 - 1 - lp);
    exc[i] = lp;
    moyenne += lp;
  }
  moyenne /= N;
  const p = Math.round((o.pincement ?? 0) * N);
  let crete = 1e-9;
  const brut = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    brut[i] = exc[i]! - moyenne - (p > 0 && i >= p ? exc[i - p]! - moyenne : 0);
    crete = Math.max(crete, Math.abs(brut[i]!));
  }
  let apEntree = 0;
  let apSortie = 0;
  for (let k = 0; k < n; k++) {
    let v = k < N ? brut[k]! / crete : 0;
    if (k >= N) {
      const moy = 0.5 * (y[k - N]! + (k - N - 1 >= 0 ? y[k - N - 1]! : 0));
      const ap = C * moy + apEntree - C * apSortie;
      apEntree = moy;
      apSortie = ap;
      v += rho * ap;
    }
    y[k] = v;
  }
  // Couleur : passe-bas doux selon la brillance (jamais d'aigus agressifs), puis enveloppe sans clic. Le gain
  // remet la corde au niveau des autres instruments (le bruit d'attaque filtré est bien plus faible qu'un sinus).
  filtrerSurPlace(y, biquad('passe-bas', 1800 + 4200 * o.brillance, 0.6, fs));
  const e = enveloppe(n, fs, 0.0015, o.tenue, relache);
  const gain = 2.6 / Math.sqrt(0.15 + o.brillance);
  for (let i = 0; i < n; i++) y[i] = y[i]! * e[i]! * gain;
  return y;
}

/* ------------------------------------------------------------------ maillets */

export type TypeMaillet = 'marimba' | 'celesta' | 'xylophone';

/** Partiels (rapport de fréquence, niveau, temps de décroissance en s à 440 Hz) de chaque maillet. */
const PARTIELS: Record<TypeMaillet, [number, number, number][]> = {
  marimba: [
    [1, 1, 0.55],
    [3.93, 0.16, 0.12],
    [9.2, 0.03, 0.04],
  ],
  celesta: [
    [1, 1, 0.9],
    [2, 0.3, 0.45],
    [3, 0.06, 0.2],
    [4, 0.03, 0.12],
  ],
  xylophone: [
    [1, 1, 0.22],
    [3, 0.22, 0.07],
    [6.1, 0.04, 0.03],
  ],
};

/** Somme de sinus (oscillateurs récursifs, rapides) qui s'éteignent chacun à leur vitesse. */
export function maillet(freq: number, fs: number, type: TypeMaillet, tenue: number, relache = 0.08): Float32Array {
  const n = Math.max(2, Math.round((tenue + relache) * fs));
  const y = new Float32Array(n);
  // Les notes aiguës s'éteignent plus vite (comme les vraies lames).
  const echelle = Math.pow(440 / freq, 0.45);
  for (const [r, niveau, tau] of PARTIELS[type]) {
    const f = freq * r;
    if (f > Math.min(7000, fs * 0.4)) continue;
    const w = (2 * Math.PI * f) / fs;
    const k = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = -Math.sin(w); // sin(−w) : la suite démarre à sin(0)
    const amort = Math.exp(-1 / (tau * echelle * fs));
    let g = niveau;
    for (let i = 0; i < n; i++) {
      const s = k * s1 - s2;
      s2 = s1;
      s1 = s;
      y[i] = y[i]! + g * s;
      g *= amort;
    }
  }
  return multiplierSurPlace(y, enveloppe(n, fs, 0.002, tenue, relache));
}

/* ------------------------------------------------------------------ basses */

export type TypeBasse = 'pizz' | 'tuba' | 'douce';

/** Basse : pizz (corde grave + un peu de fondamentale), tuba (« oum » rond et rebondi) ou douce (presque un sinus). */
export function basse(freq: number, fs: number, type: TypeBasse, tenue: number, graine: number): Float32Array {
  if (type === 'pizz') {
    const c = corde(freq, fs, { t60: 1.1, brillance: 0.22, graine, tenue, relache: 0.07, pincement: 0.18 });
    const n = c.length;
    const w = (2 * Math.PI * freq) / fs;
    const amort = Math.exp(-1 / (0.32 * fs));
    let g = 0.45;
    const e = enveloppe(n, fs, 0.004, tenue, 0.07);
    for (let i = 0; i < n; i++) {
      c[i] = c[i]! * 0.7 + g * Math.sin(w * i) * e[i]!;
      g *= amort;
    }
    return c;
  }
  const harm: [number, number][] = type === 'tuba' ? [[1, 1], [2, 0.42], [3, 0.2], [4, 0.07]] : [[1, 1], [2, 0.2], [3, 0.05]];
  const n = Math.max(2, Math.round((tenue + (type === 'tuba' ? 0.06 : 0.15)) * fs));
  const y = new Float32Array(n);
  // Tuba : la note « glisse » un peu vers sa hauteur (−25 centièmes → juste en 40 ms), c'est ce qui le rend rigolo.
  let phase = 0;
  const tauDecr = type === 'tuba' ? 0.5 : 0.9;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const glisse = type === 'tuba' ? Math.pow(2, (-25 * Math.max(0, 1 - t / 0.04)) / 1200) : 1;
    phase += (2 * Math.PI * freq * glisse) / fs;
    let v = 0;
    for (const [r, a] of harm) v += a * Math.sin(r * phase);
    y[i] = v * (0.55 + 0.45 * Math.exp(-t / tauDecr));
  }
  const e = type === 'tuba' ? enveloppe(n, fs, 0.025, tenue, 0.06) : enveloppe(n, fs, 0.035, tenue, 0.15);
  if (type === 'tuba') filtrerSurPlace(y, biquad('passe-bas', 1400, 0.7, fs));
  return multiplierSurPlace(y, e);
}

/* ------------------------------------------------------------------ percussions douces */

export type TypePercu = 'grosse-caisse' | 'shaker' | 'claquement' | 'bois' | 'balai';

/** Percussions courtes et douces (jamais de cymbale : rien de strident sous une voix). */
export function percu(type: TypePercu, fs: number, graine: number, hauteur = 1): Float32Array {
  const hasard = mulberry32(graine);
  const bruitN = (n: number) => {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = hasard() * 2 - 1;
    return b;
  };
  const decroissance = (x: Float32Array, attaque: number, tau: number) => {
    const na = Math.max(1, Math.round(attaque * fs));
    for (let i = 0; i < x.length; i++) {
      const fin = Math.min(1, (x.length - 1 - i) / Math.max(1, Math.round(0.004 * fs))); // dernier 4 ms : vers 0
      x[i] = x[i]! * Math.min(1, i / na) * Math.exp(-(i / fs) / tau) * fin;
    }
    return x;
  };
  switch (type) {
    case 'grosse-caisse': {
      const n = Math.round(0.32 * fs);
      const y = new Float32Array(n);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / fs;
        phase += (2 * Math.PI * (52 + 60 * Math.exp(-t / 0.03))) / fs;
        y[i] = Math.sin(phase);
      }
      return decroissance(y, 0.0015, 0.09);
    }
    case 'shaker': {
      const y = bruitN(Math.round(0.12 * fs));
      filtrerSurPlace(y, biquad('passe-bande', 5200, 0.9, fs));
      filtrerSurPlace(y, biquad('passe-bas', 8000, 0.7, fs));
      return decroissance(y, 0.006, 0.03);
    }
    case 'claquement': {
      const y = bruitN(Math.round(0.1 * fs));
      filtrerSurPlace(y, biquad('passe-bande', 1900, 1.3, fs));
      return decroissance(y, 0.0005, 0.022);
    }
    case 'balai': {
      const y = bruitN(Math.round(0.22 * fs));
      filtrerSurPlace(y, biquad('passe-bas', 3600, 0.7, fs));
      filtrerSurPlace(y, biquad('passe-haut', 450, 0.7, fs));
      return decroissance(y, 0.004, 0.06);
    }
    case 'bois': {
      const n = Math.round(0.14 * fs);
      const y = new Float32Array(n);
      const f = 820 * hauteur;
      for (let i = 0; i < n; i++) {
        const t = i / fs;
        y[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.045) + 0.22 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.018);
      }
      return decroissance(y, 0.0005, 1);
    }
  }
}

/* ------------------------------------------------------------------ réverbération (Freeverb allégé) */

export interface OptionsReverb {
  /** 0 à 1 : taille de la pièce (durée de la queue). */
  piece: number;
  /** 0 à 1 : amortissement des aigus dans la queue. */
  amorti: number;
}

const PEIGNES_44K = [1116, 1188, 1277, 1356, 1422, 1491];
const PASSE_TOUT_44K = [556, 441, 341];
const ECART_STEREO_44K = 23;

/**
 * Réverbération stéréo à partir d'une entrée mono : 6 filtres en peigne amortis en parallèle (communs aux deux
 * côtés), puis 3 passe-tout en série par côté (le côté droit a des retards un peu décalés : de l'espace sans coûter
 * deux fois les peignes). Calculée à la MOITIÉ de la fréquence (la queue d'une réverbération n'a pas d'aigus : elle
 * est plus douce, et 4 fois moins chère), puis remise à `fs`. La sortie dure `entree.length + queue × fs`.
 */
export function reverberer(entree: Float32Array, fs: number, o: OptionsReverb, queue: number): [Float32Array, Float32Array] {
  const n = entree.length + Math.round(queue * fs);
  const m = Math.ceil(n / 2);
  const demi = new Float32Array(m);
  const ne = entree.length;
  for (let i = 0; i < m && 2 * i + 1 < ne; i++) demi[i] = 0.5 * (entree[2 * i]! + entree[2 * i + 1]!);
  const echelle = fs / 2 / 44100;
  const retour = 0.7 + 0.28 * o.piece;
  const amorti = 0.2 + 0.4 * o.amorti;
  const peignes = new Float32Array(m);
  for (const d44 of PEIGNES_44K) {
    const d = Math.max(1, Math.round(d44 * echelle));
    const tampon = new Float32Array(d);
    let filtre = 0;
    let j = 0;
    for (let i = 0; i < m; i++) {
      const v = tampon[j]!;
      filtre = v * (1 - amorti) + filtre * amorti;
      tampon[j] = demi[i]! + filtre * retour;
      peignes[i] = peignes[i]! + v;
      if (++j === d) j = 0;
    }
  }
  const cote = (decalage: number) => {
    const s = Float32Array.from(peignes);
    for (const d44 of PASSE_TOUT_44K) {
      const d = Math.max(1, Math.round((d44 + decalage) * echelle));
      const tampon = new Float32Array(d);
      let j = 0;
      for (let i = 0; i < m; i++) {
        const v = tampon[j]!;
        const x = s[i]!;
        s[i] = v - x;
        tampon[j] = x + v * 0.5;
        if (++j === d) j = 0;
      }
    }
    // Retour à fs (interpolation linéaire entre deux points de la moitié).
    const sortie = new Float32Array(n);
    for (let k = 0; k + 1 < m; k++) {
      const a = s[k]!;
      sortie[2 * k] = a;
      if (2 * k + 1 < n) sortie[2 * k + 1] = 0.5 * (a + s[k + 1]!);
    }
    return sortie;
  };
  return [cote(0), cote(ECART_STEREO_44K * 3)];
}

/** Replie un signal plus long que la boucle : ce qui dépasse la fin est ajouté au début (la boucle reste continue). */
export function replier(x: Float32Array, longueur: number): Float32Array {
  const y = new Float32Array(longueur);
  for (let i = 0; i < x.length; i++) y[i % longueur] = y[i % longueur]! + x[i]!;
  return y;
}

/* ------------------------------------------------------------------ limiteur (boucle) */

/**
 * Limiteur à anticipation pour un signal stéréo qui tourne en boucle : le gain descend AVANT chaque crête
 * (fenêtre `anticipation`), remonte doucement (`relache`), et la fin de la boucle s'enchaîne avec son début.
 * Après lui, aucun échantillon ne dépasse `plafond`. Modifie les canaux sur place.
 */
export function limiterEnBoucle(canaux: [Float32Array, Float32Array], fs: number, plafond: number, anticipation = 0.0015, relache = 0.08): void {
  const [cg, cd] = canaux;
  const n = cg.length;
  if (n === 0) return;
  const W = Math.max(1, Math.round(anticipation * fs));
  // Gain voulu, seulement là où ça dépasse (rare) ; puis minimum sur la fenêtre [i, i + W) en boucle : le gain
  // descend AVANT chaque crête.
  const mini = new Float32Array(n).fill(1);
  let besoin = false;
  for (let k = 0; k < n; k++) {
    const m = Math.max(Math.abs(cg[k]!), Math.abs(cd[k]!));
    if (m <= plafond) continue;
    besoin = true;
    const v = plafond / m;
    for (let j = k - W + 1; j <= k; j++) {
      const i = j < 0 ? j + n : j;
      if (v < mini[i]!) mini[i] = v;
    }
  }
  if (!besoin) return;
  // Remontée douce, deux tours (la fin de la boucle influence son début), puis lissage de l'attaque sur W.
  const coef = 1 - Math.exp(-1 / (relache * fs));
  const g = new Float32Array(n);
  let prec = 1;
  for (let tour = 0; tour < 2; tour++) {
    for (let i = 0; i < n; i++) {
      const r = prec + (1 - prec) * coef;
      prec = mini[i]! < r ? mini[i]! : r;
      g[i] = prec;
    }
  }
  let somme = 0;
  for (let k = n - W + 1; k < n; k++) somme += g[k]!;
  for (let i = 0; i < n; i++) {
    somme += g[i]!;
    const lisse = somme / W;
    const j = i - W + 1;
    somme -= g[j < 0 ? j + n : j]!;
    cg[i] = cg[i]! * lisse;
    cd[i] = cd[i]! * lisse;
  }
}
