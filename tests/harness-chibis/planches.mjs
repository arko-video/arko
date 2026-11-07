// Fabrique les planches des chibis dans Chrome (Playwright) et les écrit en PNG dans le dossier donné.
//   node tests/harness-chibis/planches.mjs <dossier> [port]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const dossier = process.argv[2] ?? 'planches-chibis';
const port = Number(process.argv[3] ?? process.env.ARKO_PORT_BANC ?? 4281);
const racine = new URL('../..', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });
const serveur = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/harness-chibis/vite.config.ts'], { cwd: racine, env: { ...process.env, ARKO_PORT_BANC: String(port) }, stdio: 'ignore' });
const url = `http://localhost:${port}/tests/harness-chibis/index.html`;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const nav = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await nav.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('etat')?.textContent === 'prêt', null, { timeout: 60000 });
  const ecrire = (nom, data) => writeFileSync(`${dossier}/${nom}.png`, Buffer.from(data.split(',')[1], 'base64'));
  const quoi = (process.env.PLANCHES ?? 'tout').split(',');
  if (quoi.includes('tout') || quoi.includes('persos6')) ecrire('persos-6', await page.evaluate(() => window.persos6()));
  if (quoi.includes('tout') || quoi.includes('situations')) ecrire('situations', await page.evaluate(() => window.situations(0)));
  if (quoi.includes('tout') || quoi.includes('emotions')) ecrire('emotions', await page.evaluate(() => window.emotions()));
  if (quoi.includes('tout') || quoi.includes('avatar')) ecrire('taille-avatar', await page.evaluate(() => window.tailleAvatar()));
  if (quoi.includes('tout') || quoi.includes('situations6')) ecrire('situations-6-persos', await page.evaluate(() => window.situations6()));
  if (quoi.includes('tout') || quoi.includes('emotions6')) ecrire('emotions-6-persos', await page.evaluate(() => window.emotions6()));
  if (quoi.includes('papier')) ecrire('apercu-papier-goofy', await page.evaluate(() => window.apercuPapier()));
  if (quoi.includes('apercu')) ecrire('apercu-6-styles', await page.evaluate(() => window.apercu(0, 'rit', true)));
  if (quoi.includes('tout') || quoi.includes('comparatif')) for (const p of [0, 1]) ecrire(`comparatif-perso${p + 1}`, await page.evaluate((p) => window.comparatif(p), p));
  const styles = (process.env.STYLES ?? 'bd,cartoon,rate,mascotte,pixel,papier,feutre,crayon,paint').split(',');
  for (const style of styles) {
    for (const p of [0, 1]) if (quoi.includes('tout') || quoi.includes('variantes')) ecrire(`variantes-${style}-perso${p + 1}`, await page.evaluate(([p, s]) => window.planche(p, s), [p, style]));
    if (quoi.includes('tout') || quoi.includes('catalogue')) ecrire(`catalogue-${style}`, await page.evaluate((s) => window.catalogue(s), style));
    if (quoi.includes('tout') || quoi.includes('mesure')) {
      console.log(`temps ${style} :`, (await page.evaluate((s) => window.mesurer(s), style)).toFixed(2), 'ms / chibi de 300 px (sans cache)');
      const c = await page.evaluate((s) => window.mesurerCache(s), style);
      console.log(`temps ${style} avec cache : 1re image ${c.premier.toFixed(2)} ms, puis ${c.suivants.toFixed(3)} ms par image (2 avatars de 324 px)`);
    }
  }
  if (process.env.ZOOM) {
    const [p, s, ...emos] = process.env.ZOOM.split(';');
    const perso = p.startsWith('{') ? JSON.parse(p) : Number(p);
    ecrire(`zoom-${s}`, await page.evaluate(([p, s, e]) => window.zoom(p, s, e.flatMap((emo) => [{ emo, bouche: false }, { emo, bouche: true }])), [perso, s, emos]));
  }
  await nav.close();
  serveur.kill("SIGKILL");
  process.exit(0);
} finally {
  serveur.kill();
}
