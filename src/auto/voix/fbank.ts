// Empreinte de voix (dev-voix), fonction PURE : fbank 80 « Kaldi » (comme torchaudio.compliance.kaldi.fbank, dither 0),
// l'entrée du modèle CAM++ (3D-Speaker) et des modèles WeSpeaker. Traduction du code de référence vérifié contre
// kaldi-native-fbank (/home/claude/modeles/essais/outils-audio.cjs, `fbankKaldi`) ; testée contre sa sortie sur un
// signal fabriqué (fbank.test.ts, écart ≤ 1e-4). Par trame :
//  1. 400 échantillons (25 ms), pas de 160 (10 ms), seulement les trames entières (« snip edges ») ;
//  2. moyenne de la trame retirée ; 3. pré-accentuation 0,97 (le 1er échantillon avec lui-même) ;
//  4. fenêtre povey ((0,5 − 0,5 cos(2πi/399))^0,85, 3D-Speaker) ou hamming (WeSpeaker) ;
//  5. complétée à 512, FFT, puissance |X|² ; 6. 80 triangles mel (1127 ln(1 + f/700)) de 20 à 8000 Hz ;
//  7. log(max(énergie, ε float32)) ; 8. (CMN) moyenne de chaque bande retirée sur tout le morceau.
// Son mono 16 kHz entre −1 et 1. CAM++ : povey, son NON multiplié (echelle 1), CMN.

export const FBANK = { frequence: 16000, longueur: 400, pas: 160, nfft: 512, bandes: 80, basse: 20, haute: 8000 } as const;

export interface OptionsFbank {
  /** 'povey' (3D-Speaker, CAM++ : défaut), 'hamming' (WeSpeaker), 'hann'. */
  fenetre?: 'povey' | 'hamming' | 'hann';
  /** Retirer la moyenne de chaque bande sur le morceau (défaut : oui). */
  cmn?: boolean;
  /** Le son est multiplié par `echelle` (WeSpeaker : 32768 ; CAM++ : 1, défaut). */
  echelle?: number;
}

export interface Fbank {
  /** Nombre de trames (T). */
  trames: number;
  /** T × 80 valeurs, trame par trame. */
  donnees: Float32Array;
}

/** Plancher du log : epsilon de float32 (comme torchaudio). */
const EPS = 1.1920928955078125e-7;

const melDe = (f: number) => 1127 * Math.log(1 + f / 700);

/** Un banc mel = [première case, poids…] (cases non nulles seulement, la case de Nyquist ignorée). */
interface Banc {
  k0: number;
  w: Float64Array;
}

let bancs: Banc[] | null = null;
const fenetres = new Map<string, Float64Array>();
let tables: { cos: Float64Array; sin: Float64Array; inverse: Uint16Array } | null = null;

function bancsMel(): Banc[] {
  if (bancs) return bancs;
  const { nfft, bandes, basse, haute, frequence } = FBANK;
  const mBas = melDe(basse);
  const delta = (melDe(haute) - mBas) / (bandes + 1);
  const largeur = frequence / nfft;
  bancs = [];
  for (let b = 0; b < bandes; b++) {
    const g = mBas + b * delta;
    const c = g + delta;
    const d = c + delta;
    const w: number[] = [];
    let k0 = -1;
    for (let i = 0; i < nfft / 2; i++) {
      const m = melDe(largeur * i);
      const v = Math.min((m - g) / (c - g), (d - m) / (d - c));
      if (v > 0) {
        if (k0 < 0) k0 = i;
        w[i - k0] = v;
      } else if (k0 >= 0) w[i - k0] = 0;
    }
    // Les zéros de fin ne servent à rien.
    while (w.length > 0 && w[w.length - 1] === 0) w.pop();
    bancs.push({ k0: Math.max(0, k0), w: Float64Array.from(w) });
  }
  return bancs;
}

function fenetre(type: NonNullable<OptionsFbank['fenetre']>): Float64Array {
  const deja = fenetres.get(type);
  if (deja) return deja;
  const L = FBANK.longueur;
  const w = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
    w[i] = type === 'povey' ? Math.pow(hann, 0.85) : type === 'hann' ? hann : 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (L - 1));
  }
  fenetres.set(type, w);
  return w;
}

/** Tables de la FFT de 512 (cosinus, sinus, permutation « bits inversés »). */
function tablesFft() {
  if (tables) return tables;
  const n = FBANK.nfft;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((-2 * Math.PI * k) / n);
    sin[k] = Math.sin((-2 * Math.PI * k) / n);
  }
  const inverse = new Uint16Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    inverse[i] = j;
  }
  tables = { cos, sin, inverse };
  return tables;
}

/** FFT en place (radix 2) de re + i·im (n = 512), puis puissance des n/2 + 1 premières cases dans `p`. */
function puissance(re: Float64Array, im: Float64Array, p: Float64Array) {
  const n = re.length;
  const { cos, sin, inverse } = tablesFft();
  for (let i = 1; i < n; i++) {
    const j = inverse[i]!;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const demi = len >> 1;
    const saut = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < demi; k++) {
        const wr = cos[k * saut]!;
        const wi = sin[k * saut]!;
        const a = i + k;
        const b = a + demi;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
  for (let k = 0; k <= n / 2; k++) p[k] = re[k]! * re[k]! + im[k]! * im[k]!;
}

/** fbank 80 « Kaldi » d'un son mono 16 kHz. Moins de 400 échantillons : 0 trame. */
export function fbank80(x: Float32Array, o: OptionsFbank = {}): Fbank {
  const { longueur: L, pas: P, nfft: N, bandes: B } = FBANK;
  const cmn = o.cmn ?? true;
  const echelle = o.echelle ?? 1;
  const w = fenetre(o.fenetre ?? 'povey');
  const mel = bancsMel();
  const trames = x.length < L ? 0 : 1 + Math.floor((x.length - L) / P);
  const sortie = new Float32Array(trames * B);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const p = new Float64Array(N / 2 + 1);
  for (let t = 0; t < trames; t++) {
    const o0 = t * P;
    let m = 0;
    for (let i = 0; i < L; i++) m += x[o0 + i]!;
    m /= L;
    re.fill(0);
    im.fill(0);
    let prec = (x[o0]! - m) * echelle;
    for (let i = 0; i < L; i++) {
      const v = (x[o0 + i]! - m) * echelle;
      re[i] = (v - 0.97 * (i === 0 ? v : prec)) * w[i]!;
      prec = v;
    }
    puissance(re, im, p);
    for (let b = 0; b < B; b++) {
      const { k0, w: poids } = mel[b]!;
      let s = 0;
      for (let k = 0; k < poids.length; k++) s += poids[k]! * p[k0 + k]!;
      sortie[t * B + b] = Math.log(Math.max(s, EPS));
    }
  }
  if (cmn && trames > 0) {
    for (let b = 0; b < B; b++) {
      let s = 0;
      for (let t = 0; t < trames; t++) s += sortie[t * B + b]!;
      s /= trames;
      for (let t = 0; t < trames; t++) sortie[t * B + b] = sortie[t * B + b]! - s;
    }
  }
  return { trames, donnees: sortie };
}
