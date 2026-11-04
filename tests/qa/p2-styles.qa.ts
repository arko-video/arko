// (p2-c) Les 5 styles de texte et les 3 styles de sous-titres, sur une vidéo chargée (mire testsrc2 très colorée,
// le pire cas pour la lisibilité). Un export par style de sous-titres ; planches de 5 images (une par style de texte)
// dans captures/p2-c-planche-<style>.png, à regarder comme sur TikTok.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { allerAEtape, CAPTURES, exporterEtTelecharger, surveiller, teteA } from './outils';
import { ajouterTexte, allerAHabiller, apercuStable, CHARGE, energie, fermerPanneau, imageRgb, injecter } from './p2-outils';

const STYLES_TEXTE = ['accroche', 'bulle', 'citron', 'alerte', 'discret'];
const STYLES_ST = ['karaoke', 'pop', 'boite'];
const PHRASE = 'attends regarde ça non mais QUOI il est incroyable le gars gg wesh mdr jamais vu un clutch pareil franchement on y retourne demain soir avec toute l\'équipe';

test('(p2-c) 5 styles de texte et 3 styles de sous-titres', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const journal = surveiller(page);
  await allerAHabiller(page, CHARGE);
  for (let k = 0; k < 5; k++) {
    await teteA(page, 2 * k);
    await ajouterTexte(page, `${STYLES_TEXTE[k]} : 1v4 avec 8 PV`, STYLES_TEXTE[k]);
    await page.getByTestId('curseur-duree-texte').fill('2');
    await expect(page.getByTestId('duree-texte')).toContainText(k < 4 ? '2' : 'Jusqu\'à la fin');
    await page.screenshot({ path: `${CAPTURES}p2-c-texte-${STYLES_TEXTE[k]}.png` });
    await fermerPanneau(page);
  }
  const mots = PHRASE.split(' ').map((w, k) => [w, Math.round((0.2 + k * 0.36) * 100) / 100, Math.round((0.2 + k * 0.36 + 0.3) * 100) / 100]);
  await injecter(page, CHARGE, { sousTitres: { style: 'karaoke', mots } });

  const mesures: Record<string, unknown> = {};
  for (const st of STYLES_ST) {
    await page.getByTestId('outil-sousTitres').click();
    await page.getByTestId(`style-sous-titres-${st}`).click();
    await expect(page.getByTestId(`style-sous-titres-${st}`)).toHaveAttribute('aria-checked', 'true');
    await fermerPanneau(page);
    await teteA(page, 3);
    await apercuStable(page);
    await page.screenshot({ path: `${CAPTURES}p2-c-apercu-st-${st}.png` });
    await allerAEtape(page, 5);
    const { chemin, ms } = await exporterEtTelecharger(page, testInfo, `styles-${st}.mp4`);
    // Planche : une image au milieu de chaque texte (1, 3, 5, 7, 9 s).
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', chemin,
      '-vf', "select='eq(n\\,30)+eq(n\\,90)+eq(n\\,150)+eq(n\\,210)+eq(n\\,270)',scale=360:-1,tile=5x1",
      '-vsync', '0', '-frames:v', '1', `${CAPTURES}p2-c-planche-${st}.png`,
    ]);
    const img = imageRgb(chemin, 3);
    mesures[st] = { exportMs: ms, energieSousTitres: energie(img, 0.6, 0.76).toFixed(1) };
    await page.getByTestId('retour').click();
    await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  }
  testInfo.annotations.push({ type: 'mesures', description: JSON.stringify(mesures) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
