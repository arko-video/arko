// « ARKO ÉCOUTE TES SONS » (10/11/2026, demande de Romain : « code un truc qui dit quel son serait bien où »).
// Jusqu'ici Arko choisissait un son de Ma bibliothèque d'après son NOM seulement. CLAP (LAION, partie audio
// quantifiée, modèle « ecoute » du catalogue) écoute chaque son UNE fois et le range : whoosh, pop, impact, rire, fail,
// victoire, cri, parole, suspense (comparaison avec des phrases calculées une fois : phrases-sons.json).
// Essai sur 48 sons de Romain : 32 bien rangés (impacts, rires, cris, fails, victoires : très bien ; whoosh et pops très
// courts : moins bien). Donc le NOM passe toujours d'abord ; l'écoute sert quand le nom ne dit rien. Pur.
// Préparation du son = celle de CLAP (ClapFeatureExtractor) : 48 kHz mono, 10 s (son court répété), spectre de 1024
// points tous les 480 (fenêtre de Hann, bords en miroir), 64 bandes « mel » (Slaney, 50 à 14 000 Hz), en dB.

import PHRASES from './phrases-sons.json';

export const GENRES_SON = ['whoosh', 'pop', 'impact', 'rire', 'fail', 'victoire', 'cri', 'parole', 'suspense'] as const;
export type GenreSon = (typeof GENRES_SON)[number];

export const ECOUTE = {
  frequence: 48000,
  echantillons: 480000,
  nFft: 1024,
  pas: 480,
  bandes: 64,
  fMin: 50,
  fMax: 14000,
  /** Un genre n'est retenu que si sa note dépasse `noteMin` et le 2e de `marge` au moins. */
  noteMin: 0.25,
  marge: 0.02,
} as const;

export const NB_TRAMES = 1 + ECOUTE.echantillons / ECOUTE.pas; // 1001

function hzVersMel(f: number): number {
  const fMinLog = 1000;
  const melMinLog = 15;
  const pente = 27 / Math.log(6.4);
  return f < fMinLog ? (3 * f) / 200 : melMinLog + Math.log(f / fMinLog) * pente;
}
function melVersHz(m: number): number {
  const melMinLog = 15;
  const pente = 27 / Math.log(6.4);
  return m < melMinLog ? (200 * m) / 3 : 1000 * Math.exp((m - melMinLog) / pente);
}

let banc: Float64Array | null = null;
/** Bandes mel Slaney normalisées [513 × 64] (comme mel_filter_bank de transformers). */
export function bandesMel(): Float64Array {
  if (banc) return banc;
  const nb = ECOUTE.nFft / 2 + 1;
  const B = ECOUTE.bandes;
  const fft = Array.from({ length: nb }, (_, i) => (i * ECOUTE.frequence) / 2 / (nb - 1));
  const m0 = hzVersMel(ECOUTE.fMin);
  const m1 = hzVersMel(ECOUTE.fMax);
  const f = Array.from({ length: B + 2 }, (_, i) => melVersHz(m0 + ((m1 - m0) * i) / (B + 1)));
  const res = new Float64Array(nb * B);
  for (let i = 0; i < nb; i++) {
    for (let j = 0; j < B; j++) {
      const bas = (fft[i]! - f[j]!) / (f[j + 1]! - f[j]!);
      const haut = (f[j + 2]! - fft[i]!) / (f[j + 2]! - f[j + 1]!);
      const v = Math.max(0, Math.min(bas, haut));
      res[i * B + j] = v * (2 / (f[j + 2]! - f[j]!));
    }
  }
  banc = res;
  return res;
}

/** FFT en place (radix 2). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let l = 2; l <= n; l <<= 1) {
    const a = (-2 * Math.PI) / l;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += l) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < l / 2; k++) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + l / 2]! * cr - im[i + k + l / 2]! * ci;
        const vi = re[i + k + l / 2]! * ci + im[i + k + l / 2]! * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + l / 2] = ur - vr;
        im[i + k + l / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Son mono 48 kHz → 10 s exactement (coupé, ou répété s'il est plus court), comme CLAP. */
export function dixSecondes(pcm: Float32Array): Float32Array {
  const N = ECOUTE.echantillons;
  if (pcm.length >= N) return pcm.subarray(0, N);
  const res = new Float32Array(N);
  if (pcm.length === 0) return res;
  for (let i = 0; i < N; i += pcm.length) res.set(pcm.subarray(0, Math.min(pcm.length, N - i)), i);
  return res;
}

/** Entrée de CLAP [1001 × 64] (dB) pour un son mono 48 kHz. */
export function entreeClap(pcm: Float32Array): Float32Array {
  const x = dixSecondes(pcm);
  const n = ECOUTE.nFft;
  const demi = n / 2;
  const nb = demi + 1;
  const B = ECOUTE.bandes;
  const mel = bandesMel();
  const fenetre = new Float64Array(n);
  for (let i = 0; i < n; i++) fenetre[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const L = x.length;
  // Bords en miroir (« reflect ») de 512 échantillons.
  const lire = (k: number) => x[k < 0 ? -k : k >= L ? 2 * (L - 1) - k : k]!;
  const res = new Float32Array(NB_TRAMES * B);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const p = new Float64Array(nb);
  for (let t = 0; t < NB_TRAMES; t++) {
    const debut = t * ECOUTE.pas - demi;
    for (let i = 0; i < n; i++) {
      re[i] = lire(debut + i) * fenetre[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < nb; k++) p[k] = re[k]! * re[k]! + im[k]! * im[k]!;
    for (let j = 0; j < B; j++) {
      let s = 0;
      for (let k = 0; k < nb; k++) {
        const w = mel[k * B + j]!;
        if (w !== 0) s += w * p[k]!;
      }
      res[t * B + j] = 10 * Math.log10(Math.max(1e-10, s));
    }
  }
  return res;
}

export interface Ecoute {
  /** Genre retenu, ou null si l'écoute n'est pas sûre. */
  genre: GenreSon | null;
  /** Note de chaque genre (meilleure phrase, de −1 à 1). */
  notes: Record<GenreSon, number>;
}

/** Genre d'un son d'après son empreinte CLAP (512 nombres, pas forcément normée). */
export function genreDuSon(emb: ArrayLike<number>): Ecoute {
  let norme = 0;
  for (let i = 0; i < emb.length; i++) norme += emb[i]! * emb[i]!;
  norme = Math.sqrt(norme) || 1;
  const notes = Object.fromEntries(GENRES_SON.map((g) => [g, -1])) as Record<GenreSon, number>;
  for (const p of PHRASES as { genre: GenreSon; v: number[] }[]) {
    let s = 0;
    for (let i = 0; i < p.v.length; i++) s += (emb[i]! / norme) * p.v[i]!;
    notes[p.genre] = Math.max(notes[p.genre], Math.round(s * 1000) / 1000);
  }
  const tries = [...GENRES_SON].sort((a, b) => notes[b] - notes[a]);
  const [g1, g2] = [tries[0]!, tries[1]!];
  const sur = notes[g1] >= ECOUTE.noteMin && notes[g1] - notes[g2] >= ECOUTE.marge;
  return { genre: sur ? g1 : null, notes };
}

/** Ce qu'un genre entendu peut jouer : accents (whoosh / pop / impact) et catégories de bruitage. */
export const GENRE_VERS: Readonly<Record<GenreSon, { accents: readonly string[]; categories: readonly string[] }>> = {
  whoosh: { accents: ['whoosh'], categories: [] },
  pop: { accents: ['pop'], categories: ['wow'] },
  impact: { accents: ['impact'], categories: ['explosion', 'boom'] },
  rire: { accents: [], categories: ['rire'] },
  fail: { accents: [], categories: ['rate', 'triste', 'wasted'] },
  victoire: { accents: [], categories: ['reussite', 'wow'] },
  cri: { accents: [], categories: ['ohnon'] },
  parole: { accents: [], categories: [] },
  suspense: { accents: [], categories: ['destin'] },
};

/** Un son ENTENDU comme allant à cette famille d'accent / catégorie de bruitage (l'écoute est sûre). */
export const entenduPour = (ecoute: string | null | undefined, cible: { accent?: string; categorie?: string }): boolean => {
  if (!ecoute || !(ecoute in GENRE_VERS)) return false;
  const v = GENRE_VERS[ecoute as GenreSon];
  return (cible.accent !== undefined && v.accents.includes(cible.accent)) || (cible.categorie !== undefined && v.categories.includes(cible.categorie));
};
