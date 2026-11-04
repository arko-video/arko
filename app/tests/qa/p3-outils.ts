// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// Outils communs aux scénarios de QA de la phase 3 (sons, transitions, zooms, son guide).
import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { allerAEtape, importer, projetSauve, repartirDeZero, teteA } from './outils';

export const MIRE = 'tests/qa/fixtures/p3-mire-silence-10s.mp4'; // 10 s, 3 couleurs (rouge 0–3, vert 3–6, bleu 6–10), son muet
export const GUIDE_WAV = 'tests/qa/fixtures/p3-guide-120bpm.wav'; // 20 s, un « tic » à 0,25 + 0,5 k
export const BIP_WAV = 'tests/qa/fixtures/p3-bip.wav'; // 440 Hz pendant 0,4 s
export const BIP_MP3 = 'tests/qa/fixtures/p3-bip.mp3';
export const SON_VIDEO = 'tests/qa/fixtures/p3-son-video.mp4'; // vidéo grise, 2 kHz pendant 0,3 s

/** Repart de zéro, importe et va jusqu'à l'étape n. */
export async function demarrer(page: Page, fichier: string, etape: number) {
  await repartirDeZero(page);
  await importer(page, fichier);
  await allerAEtape(page, etape);
}

/** Dans Couper : scinde aux temps (secondes entières) donnés. */
export async function scinderA(page: Page, temps: number[]) {
  for (const t of temps) {
    await teteA(page, t);
    await page.getByTestId('scinder').click();
  }
  await expect.poll(async () => (await projetSauve(page))?.recette?.plans?.length ?? 0, { timeout: 8000 }).toBe(temps.length + 1);
}

/** Règle un curseur (input range) comme au doigt : input puis change. */
export async function regler(page: Page, testid: string, valeur: number) {
  await page.getByTestId(testid).evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, valeur);
}

/** Son de la vidéo en mono 48 kHz (f32). */
export function sonMono(chemin: string): Float32Array {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', chemin, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

/** Enveloppe RMS par fenêtres de `fen` s. */
export function enveloppe(x: Float32Array, fen = 0.005): number[] {
  const n = Math.round(48000 * fen);
  const res: number[] = [];
  for (let k = 0; k + n <= x.length; k += n) {
    let s = 0;
    for (let j = k; j < k + n; j++) s += x[j] * x[j];
    res.push(Math.sqrt(s / n));
  }
  return res;
}

/** Attaques : instants (s) où l'enveloppe passe au-dessus de `seuil` après au moins `silence` s en dessous. */
export function attaquesAudio(x: Float32Array, seuil = 0.01, silence = 0.3): number[] {
  const fen = 0.002;
  const env = enveloppe(x, fen);
  const res: number[] = [];
  let calme = silence;
  for (let k = 0; k < env.length; k++) {
    if (env[k] > seuil) {
      if (calme >= silence) {
        // instant précis : premier échantillon > seuil/2 dans la fenêtre
        let i0 = k * 96;
        for (let j = Math.max(0, i0 - 96); j < i0 + 96; j++) if (Math.abs(x[j]) > seuil / 2) { i0 = j; break; }
        res.push(i0 / 48000);
      }
      calme = 0;
    } else calme += fen;
  }
  return res;
}

/** Crête (valeur absolue max) du son entre t0 et t1. */
export function crete(x: Float32Array, t0: number, t1: number): number {
  let m = 0;
  for (let i = Math.max(0, Math.round(t0 * 48000)); i < Math.min(x.length, Math.round(t1 * 48000)); i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

/** Fréquence dominante (passages par zéro) entre t0 et t1. */
export function frequence(x: Float32Array, t0: number, t1: number): number {
  let n = 0;
  const a = Math.round(t0 * 48000), b = Math.round(t1 * 48000);
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / (t1 - t0);
}

/** Durée (ffprobe, format). */
export function dureeFichier(chemin: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', chemin]).toString().trim());
}

/** Planche d'images (n° d'image à 30 i/s) côte à côte, réduites, en une ligne : PNG. */
export function planche(chemin: string, images: number[], sortie: string, largeur = 180) {
  const sel = images.map((n) => `eq(n\\,${n})`).join('+');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', chemin, '-vf', `select='${sel}',scale=${largeur}:-1,tile=${images.length}x1:padding=4:color=white`, '-vsync', '0', '-frames:v', '1', sortie]);
}

/** Empile verticalement plusieurs PNG (même largeur). */
export function empiler(entrees: string[], sortie: string) {
  const args = ['-v', 'error', '-y'];
  entrees.forEach((e) => args.push('-i', e));
  args.push('-filter_complex', `vstack=inputs=${entrees.length}`, sortie);
  execFileSync('ffmpeg', args);
}

/** Extrait du JSON de la recette qui ne regarde que les effets de la phase 3 (pour Annuler / Rétablir). */
export function effets(r: any): string {
  return JSON.stringify({
    sons: r?.sons ?? [],
    zooms: r?.zooms ?? [],
    // Pas encore de sauvegarde (projet tout neuf) = un seul plan, sans transition.
    trans: (r?.plans ?? [{}]).map((p: any) => p.trans ?? null),
    guide: r?.guide ?? null,
  });
}

/** Attend que la recette sauvegardée ait l'état d'effets attendu. */
export async function attendreEffets(page: Page, attendu: string, timeout = 8000) {
  await expect.poll(async () => effets((await projetSauve(page))?.recette), { timeout, intervals: [200] }).toBe(attendu);
}

/** Annule n fois puis rétablit n fois, en vérifiant chaque état (états[0] = avant la 1re action). Renvoie le nombre d'étapes justes. */
export async function verifierAnnulerRetablir(page: Page, etats: string[]): Promise<{ ok: number; total: number; erreurs: string[] }> {
  const erreurs: string[] = [];
  let ok = 0;
  for (let k = etats.length - 2; k >= 0; k--) {
    await page.getByTestId('annuler').click();
    try {
      await attendreEffets(page, etats[k]!, 6000);
      ok++;
    } catch {
      erreurs.push(`annuler → état ${k} : attendu ${etats[k]} ; obtenu ${effets((await projetSauve(page))?.recette)}`);
    }
  }
  for (let k = 1; k < etats.length; k++) {
    await page.getByTestId('retablir').click();
    try {
      await attendreEffets(page, etats[k]!, 6000);
      ok++;
    } catch {
      erreurs.push(`rétablir → état ${k}`);
    }
  }
  return { ok, total: 2 * (etats.length - 1), erreurs };
}

/** Note l'état des effets après une action. */
export async function noter(page: Page, etats: string[]) {
  await expect
    .poll(async () => effets((await projetSauve(page))?.recette), { timeout: 8000, intervals: [200] })
    .not.toBe(etats[etats.length - 1]);
  await page.waitForTimeout(300);
  etats.push(effets((await projetSauve(page))?.recette));
}
