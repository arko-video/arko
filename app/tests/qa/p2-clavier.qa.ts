// (p2-h) Clavier ouvert (simulé : visualViewport réduit à 400 px de haut, comme Chrome Android avec le clavier) :
// le panneau du bas se réduit au champ de saisie et l'aperçu reste visible au-dessus.
import { expect, test, type Page } from '@playwright/test';
import { CAPTURES, surveiller } from './outils';
import { allerAHabiller, GRIS } from './p2-outils';

const HAUTEUR_VISIBLE = 400;

async function clavier(page: Page, ouvert: boolean) {
  await page.evaluate(
    ({ ouvert, h }) => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => (ouvert ? h : window.innerHeight) });
      vv.dispatchEvent(new Event('resize'));
    },
    { ouvert, h: HAUTEUR_VISIBLE },
  );
}

async function visible(page: Page, testid: string) {
  const b = await page.getByTestId(testid).boundingBox();
  if (!b) return null;
  return { haut: Math.round(b.y), bas: Math.round(b.y + b.height), h: Math.round(b.height) };
}

test('(p2-h) clavier ouvert : panneau réduit, aperçu visible', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await allerAHabiller(page, GRIS);
  const mesures: Record<string, unknown> = {};
  for (const outil of ['accroche', 'texte'] as const) {
    await page.getByTestId(`outil-${outil}`).click();
    const champ = `champ-${outil}`;
    await page.getByTestId(champ).focus();
    if (outil === 'texte') {
      await page.getByTestId(champ).fill('Salut');
      await page.getByTestId(champ).press('Enter');
      await page.getByTestId(champ).focus();
    }
    await clavier(page, true);
    await expect(page.getByTestId('habiller')).toHaveAttribute('data-clavier', '1');
    await page.screenshot({ path: `${CAPTURES}p2-h-clavier-${outil}.png` });
    const m = {
      apercu: await visible(page, 'apercu'),
      champ: await visible(page, champ),
      panneau: await visible(page, `panneau-${outil}`),
      suggestionsVisibles: await page.locator('[data-testid^="suggestion-"]').count(),
      stylesVisibles: await page.locator('[data-testid^="style-texte-"]').count(),
      miniFrise: await page.locator('.mini-frise, [data-testid="mini-frise"]').count(),
      defilement: await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight })),
    };
    mesures[outil] = m;
    // Le champ et au moins 120 px d'aperçu tiennent dans les 400 px visibles.
    expect.soft(m.champ!.bas, `${outil} : champ au-dessus du clavier`).toBeLessThanOrEqual(HAUTEUR_VISIBLE);
    const apercuVisible = Math.min(m.apercu!.bas, HAUTEUR_VISIBLE) - Math.max(m.apercu!.haut, 0);
    expect.soft(apercuVisible, `${outil} : aperçu visible au-dessus du clavier`).toBeGreaterThanOrEqual(120);
    expect.soft(m.suggestionsVisibles + m.stylesVisibles, `${outil} : panneau réduit au champ`).toBe(0);
    await clavier(page, false);
    await expect(page.getByTestId('habiller')).toHaveAttribute('data-clavier', '0');
    await page.getByTestId('panneau-fermer').click();
  }
  testInfo.annotations.push({ type: 'clavier ouvert (400 px visibles)', description: JSON.stringify(mesures) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
