// Outils de l'e2e « Best-of serré » : fichiers fabriqués (WAV, .zip stocké), mots d'une transcription posée à la main,
// lecture du projet enregistré, et temps de SORTIE où une seule voix parle (pour vérifier les avatars image par image).

import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { FREQ_TEST, type TourVrai } from '../../src/auto/voix/voix-test';

export interface RecetteLue {
  titre?: string;
  sources: { emp: string; duree: number }[];
  plans: { de: number; a: number; vit?: number; fige?: number }[];
  textes: unknown[];
  sons: { role?: string }[];
  personnes?: { id: string; nom: string; chibi?: unknown }[];
  paroles?: { ts: number; fin: number; p: string }[];
  avatars?: unknown;
  sousTitres?: { mode?: string; pour?: string; punchlines?: { ts: number; fin: number }[] };
  derush?: { passages: unknown[] };
  bips?: unknown;
  musique?: { morceaux: unknown[] };
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
function versSource(plans: RecetteLue['plans'], t: number): number | null {
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
