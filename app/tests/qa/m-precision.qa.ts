// @ts-nocheck — utilise node:child_process (pas de @types/node dans le projet).
// (m) Précision à l'image : source avec une valeur de gris différente à chaque image (n × 8 mod 256).
// Recette : Commencer ici à 0,5 s → sortie[0] doit être l'image source n=15 (gris 120).
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { allerAEtape, exporterEtTelecharger, FIX, importer, repartirDeZero } from './outils';

function gris(chemin: string, n: number, x: number, y: number): number {
  const s = execFileSync('ffmpeg', ['-v', 'error', '-i', chemin, '-vf', `select=eq(n\\,${n}),crop=w=2:h=2:x=${x}:y=${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  return s[0]!;
}

test('(m) Commencer ici à 0,5 s : première image exportée = image source 15', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, FIX + 'images-30ips.mp4');
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let k = 0; k < 15; k++) await tete.press('ArrowRight');
  const v = await tete.getAttribute('aria-valuenow');
  await page.getByTestId('commencer-ici').click();
  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'precision.mp4');
  const res = [0, 1, 2, 15, 30].map((n) => ({ n, sortie: gris(chemin, n, 540, 960), attendu: ((n + 15) * 8) % 256 }));
  testInfo.annotations.push({ type: 'précision', description: JSON.stringify({ tete: v, res }) });
  for (const r of res) expect.soft(Math.abs(r.sortie - r.attendu), `image ${r.n}`).toBeLessThan(6);
});
