// (p2-i) Annuler / Rétablir sur chaque action de Habiller (la recette sauvegardée revient exactement à l'état d'avant,
// puis à l'état d'après), puis reprise après rechargement à l'étape Habiller.
import { expect, test } from '@playwright/test';
import { CAPTURES, projetSauve, surveiller, teteA } from './outils';
import { allerAHabiller, GRIS, injecter, recetteQuand } from './p2-outils';

const json = (r: unknown) => JSON.stringify(r);

test('(p2-i) annuler / rétablir sur toutes les actions de Habiller, puis reprise', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  await allerAHabiller(page, GRIS);
  const mots = [['jlb', 0.2, 0.5], ['est', 0.5, 0.7], ['là', 0.7, 1.0], ['gg', 1.2, 1.5], ['jlb', 1.6, 1.9], ['bravo', 2.0, 2.5]];
  await injecter(page, GRIS, { sousTitres: { style: 'karaoke', mots } });
  // Après une reprise, la sauvegarde n'est réécrite (normalisée) qu'à la 1re modification : on en fait une, puis Annuler.
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('suggestion-3').click();
  await recetteQuand(page, (r) => r.textes.length === 1);
  await page.getByTestId('annuler').click();
  let courant = json(await recetteQuand(page, (r) => r.textes.length === 0 && r.sousTitres?.y !== undefined));
  await page.getByTestId('panneau-fermer').click();
  const resultats: { action: string; change: boolean; annule: boolean; retabli: boolean; detail?: string }[] = [];

  async function verifier(action: string, faire: () => Promise<void>) {
    const res = { action, change: false, annule: false, retabli: false } as (typeof resultats)[number];
    resultats.push(res);
    try {
      await faire();
      const apres = json(await recetteQuand(page, (r) => json(r) !== courant));
      res.change = true;
      await page.getByTestId('annuler').click();
      await recetteQuand(page, (r) => json(r) === courant);
      res.annule = true;
      await page.getByTestId('retablir').click();
      await recetteQuand(page, (r) => json(r) === apres);
      res.retabli = true;
      courant = apres;
    } catch (e) {
      res.detail = String(e).slice(0, 200);
      courant = json((await projetSauve(page))?.recette);
    }
  }

  // Accroche.
  await page.getByTestId('outil-accroche').click();
  await verifier('accroche : suggestion', () => page.getByTestId('suggestion-1').click());
  await verifier('accroche : texte tapé', async () => {
    await page.getByTestId('champ-accroche').fill('Regarde bien');
    await page.getByTestId('champ-accroche').press('Enter');
  });
  await verifier('accroche : retirer', () => page.getByTestId('retirer-accroche').click());
  await page.getByTestId('panneau-fermer').click();

  // Texte.
  await teteA(page, 4);
  await page.getByTestId('outil-texte').click();
  await verifier('texte : ajouter', async () => {
    await page.getByTestId('champ-texte').fill('Annule-moi');
    await page.getByTestId('champ-texte').press('Enter');
  });
  await verifier('texte : style', () => page.getByTestId('style-texte-alerte').click());
  await verifier('texte : durée', () => page.getByTestId('curseur-duree-texte').fill('5'));
  await verifier('texte : jusqu\'à la fin', () => page.getByTestId('jusqu-a-la-fin').click());
  await page.getByTestId('panneau-fermer').click();
  await verifier('texte : glisser', async () => {
    const b = (await page.locator('[data-testid^="texte-boite-"]').first().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
  });
  await page.locator('[data-testid^="texte-boite-"]').first().click();
  await expect(page.getByTestId('panneau-texte')).toBeVisible();
  await verifier('texte : supprimer', () => page.getByTestId('supprimer-texte').click());
  await page.getByTestId('panneau-fermer').click();

  // Sous-titres.
  await page.getByTestId('outil-sousTitres').click();
  await verifier('sous-titres : style', () => page.getByTestId('style-sous-titres-pop').click());
  await verifier('sous-titres : corriger un mot', async () => {
    await page.getByTestId('mot-1').click();
    await page.getByTestId('champ-mot').fill('était');
    await page.getByTestId('mot-corriger').click();
  });
  await verifier('sous-titres : corriger partout', async () => {
    await page.getByTestId('mot-0').click();
    await page.getByTestId('champ-mot').fill('JLB');
    await page.getByTestId('corriger-identiques').check(); // (après la QA p2 : « corriger partout » est devenu 2 choix)
    await page.getByTestId('mot-corriger').click();
  });
  await verifier('sous-titres : mettre en valeur', async () => {
    await page.getByTestId('mot-3').click();
    await page.getByTestId('mot-en-valeur').click();
  });
  await page.getByTestId('mot-retour').click().catch(() => undefined);
  await verifier('sous-titres : supprimer un mot', async () => {
    await page.getByTestId('mot-2').click();
    await page.getByTestId('mot-supprimer').click();
  });
  await verifier('sous-titres : retirer', () => page.getByTestId('sous-titres-retirer').click());
  // Remettre les sous-titres pour la reprise.
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('lignes-sous-titres')).toBeVisible();
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-texte').click();
  await page.getByTestId('champ-texte').fill('Je reste');
  await page.getByTestId('champ-texte').press('Enter');
  await page.getByTestId('panneau-fermer').click();
  const avant = await recetteQuand(page, (r) => r.textes.some((x: any) => x.txt === 'Je reste') && !!r.sousTitres);

  testInfo.annotations.push({ type: 'annuler / rétablir', description: JSON.stringify(resultats) });
  for (const r of resultats) expect.soft(r.change && r.annule && r.retabli, `${r.action} ${r.detail ?? ''}`).toBe(true);

  // Reprise après rechargement.
  await page.reload();
  await expect(page.getByTestId('montage-0')).toContainText('Habiller');
  await page.screenshot({ path: CAPTURES + 'p2-i-reprise.png' });
  const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await selecteur.setFiles(GRIS);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('barre-outils')).toBeVisible();
  const apres = (await projetSauve(page))?.recette;
  expect(json(apres)).toBe(json(avant));
  await page.getByTestId('outil-sousTitres').click();
  await expect(page.getByTestId('lignes-sous-titres')).toBeVisible();
  // L'historique repart à zéro après une reprise (Annuler grisé) : attendu.
  testInfo.annotations.push({ type: 'après reprise', description: JSON.stringify({ annulerActif: await page.getByTestId('annuler').isEnabled(), textes: apres.textes.length }) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
