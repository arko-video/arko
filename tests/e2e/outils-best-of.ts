// Outils de l'e2e « Best-of serré » : fichiers fabriqués (WAV, .zip stocké), mots d'une transcription posée à la main,
// lecture du projet enregistré, et temps de SORTIE où une seule voix parle (pour vérifier les avatars image par image).

import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, type Timbre, type TourVrai } from '../../src/auto/voix/voix-test';
import { CLE_CACHE, FICHIERS_MODELE, ORT_WASM, urlModele } from '../../src/sous-titres/config';

/**
 * La voix « Discord » (forte) des e2e du Best-of. Pas VOIX_B de voix-test.ts : le détecteur de voix de l'appli (Silero,
 * v4) n'entend que 9 à 12 % de cette voix fabriquée (mesuré par la QA le 7/11 : 20 tours sur 25 sans aucun segment),
 * alors qu'il entend 100 % de celle-ci, à −25 comme à −22 dB (et 99 % de VOIX_A à −40 dB).
 */
export const VOIX_DISCORD: Timbre = { f0: 140, formants: 1.04, pente: 0.85 };

/** Part des pixels « pas bleus » dans les coins bas (gauche, droite) ; part de pixels sombres au centre bas (boîte). */
export async function regions(fichier: string | Buffer): Promise<{ gauche: number; droite: number; boite: number }> {
  const { data } = await sharp(fichier).removeAlpha().resize(320, 180, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const part = (x0: number, x1: number, y0: number, y1: number, test: (r: number, g: number, b: number) => boolean) => {
    let n = 0;
    let oui = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * 320 + x) * 3;
        n++;
        if (test(data[i]!, data[i + 1]!, data[i + 2]!)) oui++;
      }
    return oui / n;
  };
  const pasBleu = (r: number, g: number, b: number) => Math.abs(r - 0x20) + Math.abs(g - 0x40) + Math.abs(b - 0xc0) > 90;
  const sombre = (r: number, g: number, b: number) => r + g + b < 120;
  // Avatars : le bas des coins (sous les punchlines, à 0,74 de la hauteur) ; boîte des sous-titres : centre, y ≈ 0,88.
  return { gauche: part(0, 58, 151, 175, pasBleu), droite: part(262, 320, 151, 175, pasBleu), boite: part(128, 192, 157, 164, sombre) };
}

/** PSNR (dB) entre deux images brutes de même taille. */
export function psnr(a: Buffer, b: Buffer): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  const mse = s / a.length;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/**
 * Module sous-titres SIMULÉ (rien n'est téléchargé) : des entrées factices dans le Cache Storage de transformers.js,
 * pour que `moduleSousTitres()` le dise présent. À utiliser avec une transcription déjà posée sur toute la vidéo
 * (`poserTranscription`) : aucune tranche n'est à refaire, Whisper n'est donc jamais lancé.
 */
export async function simulerModuleWhisper(page: Page): Promise<void> {
  const urls = [...FICHIERS_MODELE.map(([c]) => urlModele(c)), new URL(`ort/${ORT_WASM}?v=qa`, page.url()).href];
  await page.evaluate(
    async ({ cle, urls }) => {
      const cache = await caches.open(cle);
      for (const u of urls) await cache.put(u, new Response('module simulé (e2e)', { headers: { 'content-type': 'application/octet-stream' } }));
    },
    { cle: CLE_CACHE, urls },
  );
}

/** Transcription « déjà faite » (comme après « Couper les blancs ») : IndexedDB `arko.transcription.<empreinte>`. */
export async function poserTranscription(page: Page, emp: string, duree: number, mots: [string, number, number][]): Promise<void> {
  await page.evaluate(
    async ({ emp, duree, mots }) => {
      const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
      const db = await attendre(indexedDB.open('keyval-store'));
      const g = { version: 1, duree, langue: 'fr', plages: [{ de: 0, a: duree }], mots };
      await attendre(db.transaction('keyval', 'readwrite').objectStore('keyval').put(g, `arko.transcription.${emp}`));
    },
    { emp, duree, mots },
  );
}

export interface RecetteLue {
  titre?: string;
  sources: { id: string; emp: string; duree: number; nom: string; type?: string }[];
  plans: { de: number; a: number; src?: string; vit?: number; fige?: number }[];
  textes: unknown[];
  sons: { role?: string }[];
  personnes?: { id: string; nom: string; chibi?: unknown }[];
  paroles?: { ts: number; fin: number; p: string; emo?: string }[];
  chapitres?: { t: number; nom: string }[];
  blancs?: { niveau?: string };
  avatars?: unknown;
  sousTitres?: { mode?: string; pour?: string; punchlines?: { ts: number; fin: number }[] };
  derush?: { passages: unknown[] };
  bips?: unknown;
  musique?: { morceaux: { src: string; t: number; fin?: number; debut?: number }[]; baisseSur?: string; vol?: number; baisse?: boolean };
  volumeFinal?: unknown;
}

/** Projet courant enregistré (IndexedDB de idb-keyval). */
export async function lireRecette(page: Page): Promise<RecetteLue | null> {
  const p = await page.evaluate(async () => {
    const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
    const db = await attendre(indexedDB.open('keyval-store'));
    const index = await attendre(db.transaction('keyval', 'readonly').objectStore('keyval').get('arko.projets'));
    if (!index?.courant) return null;
    return attendre(db.transaction('keyval', 'readonly').objectStore('keyval').get(`arko.projet.${index.courant}`));
  });
  return (p as { recette?: RecetteLue } | null)?.recette ?? null;
}

/** WAV mono 16 bits à 16 kHz. */
export function wav16k(son: Float32Array): Buffer {
  const n = son.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  [16].forEach((v) => b.writeUInt32LE(v, 16));
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(FREQ_TEST, 24);
  b.writeUInt32LE(FREQ_TEST * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(son[i]! * 32767))), 44 + i * 2);
  return b;
}

/** WAV stéréo 48 kHz : somme de sinus. */
export function wavStereo(freqs: number[], duree: number, amplitude = 0.5): Buffer {
  const n = Math.round(duree * 48000);
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  [16, 0x20001, 48000, 192000, 0x100004].forEach((v, k) => b.writeUInt32LE(v, 16 + k * 4));
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = freqs.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / 48000), 0) / freqs.length;
    const x = Math.round(32767 * amplitude * v * Math.min(1, i / 480, (n - i) / 480));
    b.writeInt16LE(x, 44 + i * 4);
    b.writeInt16LE(x, 46 + i * 4);
  }
  return b;
}

/** .zip « stocké » (sans compression). */
export function zipStocke(entrees: { nom: string; donnees: Buffer }[]): Buffer {
  const parties: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(e.nom);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(e.donnees.length, 18);
    local.writeUInt32LE(e.donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(e.donnees.length, 20);
    central.writeUInt32LE(e.donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    parties.push(local, nom, e.donnees);
    centraux.push(central, nom);
    decalage += 30 + nom.length + e.donnees.length;
  }
  const rep = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(rep.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...parties, rep, fin]);
}

const PHRASES_FAIBLE = ['attends', 'je', 'regarde', 'le', 'coffre', 'il', 'y', 'a', 'des', 'diamants', 'on', 'va', 'où', 'maintenant'];
const PHRASES_FORTE = ['non!', 'putain', 'le', 'creeper', 'mdr', 'il', 'a', 'tout', 'explosé!'];
const PHRASES_CALME = ['bon', 'alors', 'tu', 'prends', 'le', 'bois', 'et', 'moi', 'je', 'fais', 'la', 'maison', 'ok'];

/**
 * Mots de chaque tour (0,3 s, tous les 0,45 s), comme une transcription : voix 0 calme ; voix 1 calme aussi, avec des
 * phrases fortes (punchlines) un tour sur quatre.
 */
export function motsDesTours(tours: readonly TourVrai[]): [string, number, number][] {
  const r = (x: number) => Math.round(x * 100) / 100;
  const res: [string, number, number][] = [];
  const k = [0, 0, 0];
  let n1 = 0;
  for (const t of tours) {
    const fort = t.v === 1 && n1++ % 4 === 0;
    const liste = t.v === 0 ? PHRASES_FAIBLE : fort ? PHRASES_FORTE : PHRASES_CALME;
    const i = t.v === 0 ? 0 : fort ? 1 : 2;
    for (let x = t.de + 0.05; x + 0.3 <= t.a; x += 0.45) res.push([liste[k[i]!++ % liste.length]!, r(x), r(x + 0.3)]);
  }
  return res.sort((a, b) => a[1] - b[1]);
}

/** Image de la vidéo au temps t (PNG). */
export function png(mp4: string, t: number, chemin: string): string {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', mp4, '-frames:v', '1', chemin]);
  return chemin;
}

/** Temps source d'un temps de sortie (null hors plans), d'après les plans de la recette. */
export function versSource(plans: RecetteLue['plans'], t: number): number | null {
  let t0 = 0;
  for (const p of plans) {
    const vit = p.vit ?? 1;
    const d = (p.a - p.de) / vit + (p.fige ?? 0);
    if (t >= t0 && t < t0 + d) return Math.min(p.a, p.de + (t - t0) * vit);
    t0 += d;
  }
  return null;
}

/**
 * Temps de SORTIE où une seule voix parle depuis au moins 0,9 s (sans autre voix),
 * à au moins `marge` s d'un bord de plan. `motFaible` : un mot de la voix 0 est en train d'être dit.
 */
export function sortieVersSource(r: RecetteLue, tours: readonly TourVrai[], marge: number): { t: number; ts: number; qui: 0 | 1; motFaible: boolean }[] {
  const punch = r.sousTitres?.punchlines ?? [];
  const mots = motsDesTours(tours.filter((t) => t.v === 0));
  const qui = (ts: number | null) => (ts === null ? [] : tours.filter((t) => ts >= t.de && ts < t.a).map((t) => t.v));
  const res: { t: number; ts: number; qui: 0 | 1; motFaible: boolean }[] = [];
  let t0 = 0;
  for (const p of r.plans) {
    const d = (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0);
    for (let t = t0 + marge; t < t0 + d - marge; t += 0.7) {
      const ts = versSource(r.plans, t)!;
      const ici = qui(ts);
      if (ici.length !== 1 || !tours.some((x) => x.v === ici[0] && ts >= x.de + 0.3 && ts < x.a - 0.2)) continue;
      let seul = true;
      for (let u = t - 0.9; u <= t + 0.15 && seul; u += 0.05) if (qui(versSource(r.plans, u)).some((v) => v !== ici[0])) seul = false;
      if (!seul) continue;
      // Un mot de la voix faible, hors punchline (une punchline a la priorité sur ses sous-titres).
      const dansPunch = punch.some((q) => ts >= q.ts - 0.3 && ts <= q.fin + 0.5);
      res.push({ t: Math.round(t * 1000) / 1000, ts, qui: ici[0] as 0 | 1, motFaible: ici[0] === 0 && !dansPunch && mots.some((m) => ts >= m[1] && ts <= m[2]) });
    }
    t0 += d;
  }
  return res;
}

/* ------------------------------------------------------------------ session fabriquée du parcours v4 (best-of-v4.spec.ts) */

/** Plage de temps (s). */
export interface Plage {
  de: number;
  a: number;
}

export interface SessionV4 {
  /** Son mono à 16 kHz (FREQ_TEST). */
  son: Float32Array;
  duree: number;
  /** Qui parle quand : voix 0 = la voix faible (« micro », −40 dB), voix 1 = la voix forte (« Discord », −25 dB). */
  tours: TourVrai[];
  /** Le son fort du jeu (explosion), hors parole. */
  explosion: Plage;
  /** Les scènes (temps source) ; entre elles, 30 s sans parole (jeu et musique de jeu seulement). */
  scenes: Plage[];
}

/** Petit générateur pseudo-aléatoire (reproductible). */
function hasardQa(graine: number): () => number {
  let x = graine >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** Une explosion (bruit grave qui décroît, 2,5 s), crête vers −6 dBFS. */
function explosion(duree: number, p: Plage): Float32Array {
  const r = hasardQa(21);
  const x = new Float32Array(Math.round(duree * FREQ_TEST));
  let y = 0;
  for (let i = Math.round(p.de * FREQ_TEST); i < Math.round(p.a * FREQ_TEST); i++) {
    const t = i / FREQ_TEST - p.de;
    y = 0.85 * y + 0.15 * (r() * 2 - 1);
    const env = Math.min(1, t / 0.01) * Math.exp(-t / 0.7);
    x[i] = 0.9 * env * (y * 2.2 + 0.4 * Math.sin(2 * Math.PI * 55 * t));
  }
  return x;
}

/** Musique de jeu (notes de « piano » douces, une toutes les 0,5 s), RMS ≈ `db` dBFS, sur toute la session. */
function musiqueDeJeu(duree: number, db: number): Float32Array {
  const r = hasardQa(5);
  const notes = [262, 294, 330, 392, 440, 523, 587, 659];
  const x = new Float32Array(Math.round(duree * FREQ_TEST));
  for (let t0 = 0; t0 < duree; t0 += 0.5) {
    const f = notes[Math.floor(r() * notes.length)]!;
    const i0 = Math.round(t0 * FREQ_TEST);
    for (let i = i0; i < Math.min(x.length, i0 + 1.4 * FREQ_TEST); i++) {
      const t = (i - i0) / FREQ_TEST;
      x[i]! += Math.exp(-t / 0.35) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
    }
  }
  let s2 = 0;
  for (const v of x) s2 += v * v;
  const g = 10 ** (db / 20) / Math.sqrt(s2 / x.length);
  for (let i = 0; i < x.length; i++) x[i]! *= g;
  return x;
}

/**
 * La session du parcours v4 (4 min) : 2 voix dans UN mélange (−40 / −25 dB, comme Romain et Guts), 3 scènes séparées
 * par 30 s sans parole, une explosion entre deux tours (≥ 1,5 s sans parole autour), bruit de jeu et musique de jeu
 * (−46 dBFS) partout. Tout est fabriqué ici (aucune donnée privée).
 */
export function sessionV4(): SessionV4 {
  const duree = 240;
  const dec = (l: TourVrai[], d: number) => l.map((t) => ({ ...t, de: Math.round((t.de + d) * 100) / 100, a: Math.round((t.a + d) * 100) / 100 }));
  const scenes: Plage[] = [{ de: 0, a: 40 }, { de: 70, a: 131.5 }, { de: 165, a: 235 }];
  const ex: Plage = { de: 99, a: 101.5 };
  const tours = [...dec(toursAlternes(40, 11), 0), ...dec(toursAlternes(28, 12), 70), ...dec(toursAlternes(28.5, 13), 103), ...dec(toursAlternes(70, 14), 165)];
  const faible = fabriquerVoix(VOIX_A, tours.filter((t) => t.v === 0), duree, -40, 1);
  const forte = fabriquerVoix(VOIX_DISCORD, tours.filter((t) => t.v === 1), duree, -25, 2);
  const son = mixer(faible, forte, explosion(duree, ex), musiqueDeJeu(duree, -46), bruitDeJeu(duree, -52));
  return { son, duree, tours, explosion: ex, scenes };
}

/** Une image à vérifier (sortieVersSource). */
export type Echantillon = ReturnType<typeof sortieVersSource>[number];

export interface BilanPersos {
  /** Images où la voix faible (voix 0) parle seule : combien, et combien avec SON perso à droite seulement. */
  faible: { n: number; ok: number };
  /** Images où la voix forte (voix 1) parle seule : combien, et combien avec SON perso à gauche seulement. */
  forte: { n: number; ok: number };
  /** Images de la voix forte avec la boîte des sous-titres (qui est pour la voix faible). */
  boiteSurForte: number;
  /** Images d'un mot de la voix faible (hors punchline), et combien avec la boîte. */
  motsFaibles: number;
  boite: number;
  rates: string[];
  mesures: string[];
}

/**
 * Avatars et boîte des sous-titres image par image (v4 : voix forte = p1 à GAUCHE, voix faible = p2 à DROITE).
 * Les e2e tolèrent 10 % de ratés : aux changements de tour, un morceau de 1,5 s à cheval sur les 2 voix (qui parle
 * v4) peut donner la fin d'une phrase à l'autre perso (≈ 0,5 s ; vraie session : 92 % des phrases justes).
 */
export async function verifierPersos(sortie: string, echantillons: readonly Echantillon[], chemin: (t: number) => string, max = 40): Promise<BilanPersos> {
  const b: BilanPersos = { faible: { n: 0, ok: 0 }, forte: { n: 0, ok: 0 }, boiteSurForte: 0, motsFaibles: 0, boite: 0, rates: [], mesures: [] };
  for (const e of echantillons.filter((x) => x.t > 6.5).slice(0, max)) {
    const m = await regions(png(sortie, e.t, chemin(e.t)));
    b.mesures.push(`${e.t.toFixed(1)}:${e.qui}:${m.gauche.toFixed(2)}/${m.droite.toFixed(2)}/${m.boite.toFixed(2)}`);
    if (e.qui === 0) {
      b.faible.n++;
      const ok = m.droite > 0.04 && m.gauche < 0.01;
      if (ok) b.faible.ok++;
      else b.rates.push(`voix faible à ${e.t} s (source ${e.ts.toFixed(2)}) : gauche ${m.gauche.toFixed(2)}, droite ${m.droite.toFixed(2)}`);
      // Une ligne de la voix faible qui toucherait une punchline est retirée : on compte, sans exiger 100 %.
      if (e.motFaible) {
        b.motsFaibles++;
        if (m.boite > 0.05) b.boite++;
      }
    } else {
      b.forte.n++;
      const ok = m.gauche > 0.04 && m.droite < 0.01;
      if (ok) b.forte.ok++;
      else b.rates.push(`voix forte à ${e.t} s (source ${e.ts.toFixed(2)}) : gauche ${m.gauche.toFixed(2)}, droite ${m.droite.toFixed(2)}`);
      if (m.boite >= 0.01) {
        b.boiteSurForte++;
        b.rates.push(`boîte sur la voix forte à ${e.t} s`);
      }
    }
  }
  return b;
}

/** Son mono d'un fichier (ffmpeg), à `ar` Hz, passé dans le filtre ffmpeg `filtre` s'il est donné. */
export function decoderMono(fichier: string, filtre?: string, ar = 48000): Float32Array {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', fichier, '-vn', '-ac', '1', '-ar', String(ar), ...(filtre ? ['-af', filtre] : []), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const ab = new ArrayBuffer(b.length - (b.length % 4));
  new Uint8Array(ab).set(b.subarray(0, ab.byteLength));
  return new Float32Array(ab);
}

/** Niveau RMS (dBFS) de x sur [de, a[ (s) ; −120 si vide. */
export function rmsDb(x: Float32Array, de: number, a: number, fs = 48000): number {
  const i0 = Math.max(0, Math.round(de * fs));
  const i1 = Math.min(x.length, Math.round(a * fs));
  if (i1 <= i0) return -120;
  let s = 0;
  for (let i = i0; i < i1; i++) s += x[i]! * x[i]!;
  return s > 0 ? 10 * Math.log10(s / (i1 - i0)) : -120;
}

/**
 * La VAD de l'appli (MoteurVad, modèle public/modeles/silero-vad-v5.onnx) dans Node, avec onnxruntime-node 1 fil, sur
 * le son du fichier décodé par ffmpeg à 48 kHz et donné par morceaux de 1024 comme dans le Worker « Qui parle » :
 * c'est ce que fait le banc réel. Probabilités × 255 par case de 32 ms ; null si onnxruntime-node manque.
 */
export async function vadDuBanc(fichier: string, duree: number): Promise<Uint8Array | null> {
  let ort: typeof import('onnxruntime-node');
  try {
    ort = await import('onnxruntime-node');
  } catch {
    return null;
  }
  const { MoteurVad } = await import('../../src/auto/vad/silero');
  const { Vers16k } = await import('../../src/auto/vad/reechantillonnage');
  const s = await ort.InferenceSession.create('public/modeles/silero-vad-v5.onnx', { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: 'sequential' });
  const session = {
    async run(entrees: Record<string, { type: 'float32' | 'int64'; data: Float32Array | BigInt64Array; dims: readonly number[] }>) {
      const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
      for (const [k, t] of Object.entries(entrees)) feeds[k] = new ort.Tensor(t.type, t.data, [...t.dims]);
      const r = await s.run(feeds);
      const res: Record<string, { type: 'float32' | 'int64'; data: Float32Array | BigInt64Array; dims: number[] }> = {};
      for (const [k, v] of Object.entries(r)) res[k] = { type: v.type === 'int64' ? 'int64' : 'float32', data: v.data as Float32Array, dims: [...v.dims] };
      return res;
    },
  };
  const x = decoderMono(fichier);
  const moteur = new MoteurVad(session, duree);
  const vers = new Vers16k();
  for (let j = 0; j < x.length; j += 1024) {
    const r16 = vers.ajouter(x.subarray(j, Math.min(x.length, j + 1024)), 48000, j / 48000);
    if (r16) await moteur.ajouter(r16.pcm, r16.t0);
  }
  await moteur.finir();
  await s.release();
  return moteur.p;
}
