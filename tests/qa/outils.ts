// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// Outils communs aux scénarios de QA.
import { expect, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';

export const FIX = 'tests/qa/fixtures/';
export const VIDEO_TEST = 'tests/fixtures/test-1920x1080.mp4';
export const CAPTURES = 'tests/qa/captures/';
mkdirSync(CAPTURES, { recursive: true });

/** Journalise erreurs console / page, et les renvoie pour contrôle. */
export function surveiller(page: Page) {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
    if (m.type() === 'warning') avertissements.push(m.text());
  });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  return { erreurs, avertissements };
}

/** Efface la sauvegarde IndexedDB et l'OPFS pour repartir de zéro. */
export async function repartirDeZero(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase('keyval-store');
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    });
    try {
      const racine = await navigator.storage.getDirectory();
      await racine.removeEntry('exports', { recursive: true });
    } catch {
      /* rien */
    }
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
}

export async function importer(page: Page, chemin: string, timeout = 60_000) {
  const t0 = Date.now();
  await page.getByTestId('fichier').setInputFiles(chemin);
  // Phase 6 : une vidéo de plus de 5 min propose d'abord le monteur IA ; on choisit « Je monte moi-même ».
  const deux = page.getByTestId('etape').filter({ hasText: 'Étape 2 sur 5' });
  await expect(deux.or(page.getByTestId('choix-monteur'))).toBeVisible({ timeout });
  if (await page.getByTestId('choix-monteur').isVisible()) await page.getByTestId('choix-moi-meme').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout });
  return Date.now() - t0;
}

/**
 * Phase 2 : le parcours a 5 étapes (Importer → Couper → Vertical → Habiller → Exporter).
 * Touche « Suivant » jusqu'à l'étape n (Vertical est sautée pour une vidéo verticale).
 */
export async function allerAEtape(page: Page, n: number) {
  for (let k = 0; k < 5; k++) {
    const txt = (await page.getByTestId('etape').textContent()) ?? '';
    if (txt.includes(`Étape ${n} sur 5`)) return;
    await page.getByTestId('suivant').click();
  }
  await expect(page.getByTestId('etape')).toHaveText(`Étape ${n} sur 5`);
}

/** Place la tête de lecture à t secondes (Début puis PageUp = +1 s, flèches = ±1 image). */
export async function teteA(page: Page, secondes: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < secondes; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(secondes));
}

/** Recette sauvegardée (IndexedDB idb-keyval). */
export async function projetSauve(page: Page): Promise<any> {
  return page.evaluate(
    () =>
      new Promise((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const db = req.result;
          // Phase 4 (« Mes montages ») : l'index arko.projets désigne le projet courant arko.projet.<id>.
          // Repli sur l'ancienne clé arko.projet (phases 1 à 3, avant migration).
          const st = db.transaction('keyval').objectStore('keyval');
          const gi = st.get('arko.projets');
          gi.onsuccess = () => {
            const index = gi.result as { courant: string | null; projets: { id: string }[] } | undefined;
            const id = index ? (index.courant ?? index.projets?.[0]?.id ?? null) : null;
            const g = st.get(id ? `arko.projet.${id}` : 'arko.projet');
            g.onsuccess = () => ok(g.result ?? null);
            g.onerror = () => ok(null);
          };
          gi.onerror = () => ok(null);
        };
        req.onerror = () => ok(null);
      }),
  );
}

export async function exporterEtTelecharger(page: Page, testInfo: TestInfo, nom: string, timeout = 300_000) {
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout });
  const ms = Date.now() - t0;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const chemin = testInfo.outputPath(nom);
  await dl.saveAs(chemin);
  return { chemin, ms, nomPropose: dl.suggestedFilename() };
}

export async function analyserMp4(chemin: string) {
  const input = new Input({ source: new FilePathSource(chemin), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    return {
      duree: await input.computeDuration(),
      l: v ? v.displayWidth : 0,
      h: v ? v.displayHeight : 0,
      audio: !!a,
      codecA: a ? await a.getCodec() : null,
    };
  } finally {
    input.dispose();
  }
}

/** Pixel RGB (x, y) de l'image au temps t d'une vidéo (ffmpeg). */
export function pixel(chemin: string, t: number, x: number, y: number): number[] {
  const sortie = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(t), '-i', chemin, '-frames:v', '1',
    '-vf', `crop=w=2:h=2:x=${x}:y=${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]);
  return [sortie[0]!, sortie[1]!, sortie[2]!];
}

/** Contrôle d'ergonomie : défilement horizontal et cibles tactiles trop petites. */
export async function auditEcran(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const petits: string[] = [];
    const sansNom: string[] = [];
    const els = document.querySelectorAll<HTMLElement>('button, a[href], [role="slider"], [role="radio"], input:not([type="file"]), label');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const id = el.dataset.testid || el.className || el.tagName;
      if (el.tagName === 'INPUT' && el.closest('label')) continue; // la cible est le libellé
      if (r.width < 44 || r.height < 44) petits.push(`${id} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (el.tagName !== 'LABEL') {
        const nom = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!nom) sansNom.push(String(id));
      }
    }
    return {
      defilementHorizontal: de.scrollWidth > de.clientWidth,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      hauteurPage: de.scrollHeight,
      petits,
      sansNom,
    };
  });
}

/** Clé IndexedDB du projet courant (phase 4 : arko.projet.<id>, sinon l'ancienne arko.projet). */
export async function cleCourante(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const g = req.result.transaction('keyval').objectStore('keyval').get('arko.projets');
          g.onsuccess = () => {
            const index = g.result as { courant: string | null; projets: { id: string }[] } | undefined;
            const id = index ? (index.courant ?? index.projets?.[0]?.id ?? null) : null;
            ok(id ? `arko.projet.${id}` : 'arko.projet');
          };
          g.onerror = () => ok('arko.projet');
        };
        req.onerror = () => ok('arko.projet');
      }),
  );
}

/** Phase 4 : rouvre le dernier montage (Mes montages, carte 0) en re-choisissant sa vidéo. */
export async function rouvrirDernier(page: Page, fichier: string) {
  await expect(page.getByTestId('montage-0')).toBeVisible({ timeout: 15_000 });
  const [sel] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await sel.setFiles(fichier);
}
