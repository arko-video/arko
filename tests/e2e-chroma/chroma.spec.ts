// « Fond vert » dans Chrome (sans écran ; la carte graphique est ici SwiftShader, émulée par le processeur : les temps
// sont bien plus lents que sur un vrai téléphone ou un PC). Le shader WebGL2 = la référence processeur (repli), et
// le détourage d'images fabriquées est propre (pas de fond restant, pas de liseré vert, personnage intact).

import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const port = Number(process.env.ARKO_PORT_BANC) || 4197;

interface Mesures { fondRestant: number; sujetEfface: number; vertMax: number; vertBord: number; ecartBord: number }
interface Cas { fond: unknown; ecart: { max: number; moyen: number }; gpu: Mesures; cpu: Mesures }

test('carte graphique = processeur, détourage propre, temps par image', async ({ page }, testInfo) => {
  await page.goto(`http://localhost:${port}/tests/harness-chroma/index.html`);
  await expect(page.locator('#etat')).toHaveText('fini', { timeout: 300_000 });
  const r = (await page.evaluate(() => (window as unknown as { resultatBanc: unknown }).resultatBanc)) as Record<string, unknown> & {
    webgl2: boolean;
    erreur?: string;
    vitesse: Record<string, { gpu: number; cpu: number }>;
    images: Record<string, string>;
  };
  expect(r.erreur).toBeUndefined();
  expect(r.webgl2).toBe(true);
  for (const [nom, png] of Object.entries(r.images)) writeFileSync(testInfo.outputPath(`${nom}.png`), Buffer.from(png, 'base64'));
  for (const nom of ['vert-youtube', 'vert-terne-bruite', 'bleu']) {
    const c = r[nom] as Cas;
    console.log(`[fond vert] ${nom} : écart carte graphique / processeur max ${c.ecart.max} / 255, moyen ${c.ecart.moyen} ; GPU ${JSON.stringify(c.gpu)}`);
    expect(c.ecart.max).toBeLessThanOrEqual(2);
    expect(c.ecart.moyen).toBeLessThan(0.05);
    expect(c.gpu.fondRestant).toBeLessThan(0.002);
    expect(c.gpu.sujetEfface).toBe(0);
    expect(c.gpu.vertBord).toBeLessThanOrEqual(8);
  }
  for (const [taille, v] of Object.entries(r.vitesse)) console.log(`[fond vert] ${taille} : ${v.gpu} ms par image (carte graphique), ${v.cpu} ms (processeur)`);
});
