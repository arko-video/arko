// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// QA phase 4 :
// (p4-c) Modèles : Top 3 grisé avec 2 plans (aucun plan supprimé), Top 3 sur 4 plans (aucun plan supprimé),
//        « Le meilleur d'abord » : textes, sons et zooms existants décalés au bon endroit.
// (p4-d) Alerte de rythme : un seul repère, sur le PIRE passage.
// (p4-e) Mes montages : 3 projets, ouvrir, renommer, dupliquer, supprimer ; sons d'un autre projet pas effacés.
// (p4-f) Migration de l'ancienne clé arko.projet (écrite dans IndexedDB AVANT de charger l'appli).
import { expect, test } from '@playwright/test';
import { allerAEtape, importer, projetSauve, repartirDeZero, surveiller, teteA } from './outils';
import { fermerPanneau, GRIS, injecter } from './p2-outils';
import { BIP_WAV, MIRE } from './p3-outils';
import { BOITE, clesIdb, recetteSauvee, tete } from './p4-outils';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
});

test('(p4-c) modèles : Top 3 grisé, rien supprimé ; « Le meilleur d’abord » décale tout', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, BOITE);
  await teteA(page, 5);
  await page.getByTestId('scinder').click();
  await recetteSauvee(page, (r) => r.plans.length === 2);
  await allerAEtape(page, 4);
  await page.getByTestId('outil-modeles').click();
  const grise = { desactive: await page.getByTestId('appliquer-top3').isDisabled(), texte: await page.getByTestId('top3-impossible').textContent() };
  await page.getByTestId('appliquer-top3').click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const plansApresGrise = (await projetSauve(page)).recette.plans.length;
  await fermerPanneau(page);

  // Existant : un texte (t 2), un son en temps de SORTIE (t 6), un son en temps SOURCE (ts 7), un zoom en sortie (t 4).
  const r0 = (await projetSauve(page)).recette;
  await injecter(page, BOITE, {
    textes: [{ txt: 'Salut', t: 2, dur: 1, style: 'bulle' }],
    sons: [
      { id: 'interface.ding', t: 6, vol: 1 },
      { id: 'impact.boom', ts: 7, src: r0.sources[0].id, vol: 1 },
    ],
    zooms: [{ t: 4, dur: 0.5, force: 1.3, style: 'punch' }],
  });
  await teteA(page, 7);
  const t = await tete(page);
  await page.getByTestId('outil-modeles').click();
  await page.getByTestId('meilleur-tete').click();
  const r1 = await recetteSauvee(page, (r) => r.plans.length === 3);
  const meilleur = { tete: t, plans: r1.plans, textes: r1.textes, sons: r1.sons, zooms: r1.zooms };
  // Annuler d'un coup.
  await page.getByTestId('annuler').click();
  const r2 = await recetteSauvee(page, (r) => r.plans.length === 2);
  const annule = { textes: r2.textes.map((x) => [x.txt, x.t]), sons: r2.sons, zooms: r2.zooms };

  // Top 3 sur 4 plans : aucun plan supprimé.
  for (const s of [2, 8]) {
    await page.getByTestId('retour').click({ timeout: 3000 }).catch(() => undefined);
  }
  await allerAEtape(page, 2).catch(() => undefined);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await teteA(page, 2);
  await page.getByTestId('scinder').click();
  await teteA(page, 8);
  await page.getByTestId('scinder').click();
  await recetteSauvee(page, (r) => r.plans.length === 4);
  await allerAEtape(page, 4);
  await page.getByTestId('outil-modeles').click();
  await page.getByTestId('appliquer-top3').click();
  const r3 = await recetteSauvee(page, (r) => r.textes.some((x) => x.txt === '#1'));
  const top3 = { plans: r3.plans.length, textes: r3.textes.map((x) => [x.txt, x.t]), trans: r3.plans.map((p) => p.trans ?? null) };
  testInfo.annotations.push({ type: 'modèles', description: JSON.stringify({ grise, plansApresGrise, meilleur, annule, top3 }) });

  expect(journal.erreurs).toEqual([]);
  expect.soft(grise.desactive).toBe(true);
  expect.soft(plansApresGrise).toBe(2);
  // Copie de 1,5 s autour de 7 s au début : [6,25 ; 7,75].
  expect.soft(meilleur.plans[0]).toMatchObject({ de: 6.25, a: 7.75 });
  expect.soft(meilleur.plans[1].trans).toBe('glitch');
  const txt = (s) => meilleur.textes.find((x) => x.txt === s);
  expect.soft(txt('ATTENDS…')?.t).toBe(0);
  expect.soft(txt('Salut')?.t, 'texte décalé de 1,5 s').toBe(3.5);
  expect.soft(meilleur.sons.find((s) => s.id === 'interface.ding')?.t, 'son en sortie décalé').toBe(7.5);
  expect.soft(meilleur.sons.find((s) => s.id === 'impact.boom')?.ts, 'son en source inchangé').toBe(7);
  expect.soft(meilleur.zooms[0]?.t, 'zoom décalé').toBe(5.5);
  expect.soft(annule.textes).toEqual([['Salut', 2]]);
  expect.soft(top3.plans).toBe(4);
});

test('(p4-d) alerte de rythme : un seul repère, sur le pire passage', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, MIRE); // 10 s, son muet : aucun pic sonore
  await allerAEtape(page, 4);
  // Événements : texte à 0,5 s et zoom à 5 s ⇒ passages 0,5→5 (4,5 s) et 5→10 (5 s, le pire).
  await injecter(page, MIRE, {
    textes: [{ txt: 'A', t: 0.5, dur: 1, style: 'bulle' }],
    zooms: [{ t: 5, dur: 0.5, force: 1.3, style: 'punch' }],
  });
  await page.waitForTimeout(1500); // pics calculés (aucun)
  const n = await page.getByTestId('repere-rythme').count();
  await page.getByTestId('repere-rythme').first().click();
  await page.waitForTimeout(400);
  const t = await tete(page);
  const toast = await page.getByTestId('toast').allTextContents();
  // Couper : même repère.
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click({ timeout: 3000 }).catch(() => undefined);
  await allerAEtape(page, 2).catch(() => undefined);
  const nCouper = await page.getByTestId('repere-rythme').count();
  testInfo.annotations.push({ type: 'rythme', description: JSON.stringify({ n, t, toast, nCouper }) });
  expect(journal.erreurs).toEqual([]);
  expect.soft(n).toBe(1);
  expect.soft(nCouper).toBe(1);
  expect.soft(t).toBe(5);
  expect.soft(toast.join(' ')).toContain('Ça traîne ici');
});

test('(p4-e) Mes montages : 3 projets, ouvrir, renommer, dupliquer, supprimer ; sons des autres projets gardés', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  // Projet B (MIRE) avec un son importé et posé.
  await importer(page, MIRE);
  await allerAEtape(page, 4);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('importer-son-fichier').setInputFiles(BIP_WAV);
  await expect.poll(() => page.locator('[data-testid^="son-ajouter-a"]').count(), { timeout: 20_000 }).toBe(1);
  await teteA(page, 2);
  await page.locator('[data-testid^="son-ajouter-a"]').first().click();
  const rB = await recetteSauvee(page, (r) => r.sons.length === 1 && r.sources.some((s) => s.type === 'audio'));
  const empSon = rB.sources.find((s) => s.type === 'audio').emp;
  await fermerPanneau(page);
  // Le son a été importé il y a 2 h (hors délai de grâce) : seul son usage par le projet B le protège.
  const vieillir = () =>
    page.evaluate(
      (emp) =>
        new Promise<void>((ok) => {
          const req = indexedDB.open('arko-sons');
          req.onsuccess = () => {
            const st = req.result.transaction('fichiers', 'readwrite').objectStore('fichiers');
            const g = st.get(`fiche:${emp}`);
            g.onsuccess = () => {
              if (g.result) st.put({ ...g.result, utiliseLe: Date.now() - 2 * 3600_000 }, `fiche:${emp}`);
              ok();
            };
          };
        }),
      empSon,
    );
  const sonPresent = () =>
    page.evaluate(
      (emp) =>
        new Promise<boolean>((ok) => {
          const req = indexedDB.open('arko-sons');
          req.onsuccess = () => {
            const g = req.result.transaction('fichiers').objectStore('fichiers').get(`fichier:${emp}`);
            g.onsuccess = () => ok(!!g.result);
          };
        }),
      empSon,
    );
  await vieillir();
  // Projets A (BOITE) et C (GRIS) : chaque enregistrement lance le nettoyage.
  for (let k = 0; k < 3; k++) await page.getByTestId('retour').click({ timeout: 3000 }).catch(() => undefined);
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await importer(page, BOITE);
  await teteA(page, 3);
  await page.getByTestId('scinder').click();
  await recetteSauvee(page, (r) => r.plans.length === 2);
  await page.waitForTimeout(1500);
  await page.getByTestId('retour').click();
  await importer(page, GRIS);
  await page.waitForTimeout(2000);
  const sonApresAutres = await sonPresent();
  await page.getByTestId('retour').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(3);
  const titres = await page.locator('[data-testid^="montage-titre-"]').allTextContents();

  // Renommer le plus ancien (B), dupliquer, supprimer la copie.
  const idx = async (titre) => Number(((await page.locator('[data-testid^="montage-titre-"]', { hasText: titre }).first().getAttribute('data-testid')) ?? '').split('-').pop());
  let i = await idx('p3-mire');
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-renommer').click();
  await page.getByTestId('champ-titre').fill('  Mon   <b>clutch</b>  ');
  await page.getByTestId('renommer-valider').click();
  await expect(page.getByTestId('mes-montages')).toContainText('Mon <b>clutch</b>');
  i = await idx('Mon <b>clutch</b>');
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-dupliquer').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(4);
  const titres4 = await page.locator('[data-testid^="montage-titre-"]').allTextContents();
  const iCopie = await idx('(copie)');
  await page.getByTestId(`montage-menu-${iCopie}`).click();
  await page.getByTestId('action-supprimer').click();
  await page.getByTestId('dialogue-confirmer').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(3);
  await page.waitForTimeout(1500);
  const sonApresSuppressionCopie = await sonPresent();

  // Rechargement, puis ouvrir B en re-choisissant sa vidéo : le son revient.
  await page.reload();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(3);
  i = await idx('Mon <b>clutch</b>');
  const [sel] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId(`montage-ouvrir-${i}`).click()]);
  await sel.setFiles(MIRE);
  await expect(page.getByTestId('etape')).toHaveText(/Étape [24] sur 5/, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const rOuvert = (await projetSauve(page)).recette;
  const toasts = (await page.getByTestId('toast').allTextContents()).join(' | ');
  // Supprimer B : son son n'est plus utilisé, il est effacé (il a plus d'1 h).
  for (let k = 0; k < 4; k++) await page.getByTestId('retour').click({ timeout: 3000 }).catch(() => undefined);
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await vieillir();
  i = await idx('Mon <b>clutch</b>');
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-supprimer').click();
  await page.getByTestId('dialogue-confirmer').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(2);
  await page.waitForTimeout(2000);
  const sonApresSuppressionB = await sonPresent();
  const cles = await clesIdb(page);
  testInfo.annotations.push({
    type: 'montages',
    description: JSON.stringify({ titres, titres4, sonApresAutres, sonApresSuppressionCopie, sonsOuvert: rOuvert.sons, toasts, sonApresSuppressionB, cles }),
  });
  expect(journal.erreurs).toEqual([]);
  expect.soft(sonApresAutres, 'son du projet B gardé après le nettoyage des autres projets').toBe(true);
  expect.soft(sonApresSuppressionCopie, 'son gardé après suppression de la copie').toBe(true);
  expect.soft(rOuvert.sons.length).toBe(1);
  expect.soft(toasts).not.toContain("n'a pas été retrouvé");
  expect.soft(sonApresSuppressionB, 'son effacé quand plus aucun projet ne l’utilise').toBe(false);
  expect.soft(cles.filter((k) => k.startsWith('arko.projet.')).length).toBe(2);
});

test('(p4-f) migration de l’ancienne clé arko.projet', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, BOITE);
  await teteA(page, 4);
  await page.getByTestId('scinder').click();
  const r = await recetteSauvee(page, (r) => r.plans.length === 2);
  const ancien = { recette: r, etape: 'vertical', modifieLe: Date.now() - 86_400_000 };
  // Page de la même origine SANS l'appli : on vide la base, on écrit l'ancienne clé, puis on charge l'appli.
  await page.goto('./manifest.webmanifest');
  await page.evaluate(async (ancien) => {
    await new Promise<void>((ok) => {
      const d = indexedDB.deleteDatabase('keyval-store');
      d.onsuccess = d.onerror = d.onblocked = () => ok();
    });
    await new Promise<void>((ok, ko) => {
      const req = indexedDB.open('keyval-store');
      req.onupgradeneeded = () => req.result.createObjectStore('keyval');
      req.onsuccess = () => {
        const tx = req.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(ancien, 'arko.projet');
        tx.oncomplete = () => {
          req.result.close();
          ok();
        };
        tx.onerror = () => ko(tx.error);
      };
    });
  }, ancien);
  journal.erreurs.length = 0; // (la page du manifeste n'a pas de favicon : 404 sans rapport)
  await page.goto('./');
  await expect(page.getByTestId('montage-0')).toBeVisible({ timeout: 15_000 });
  const carte = await page.getByTestId('montage-0').textContent();
  await page.waitForTimeout(500);
  const cles = await clesIdb(page);
  const [sel] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await sel.setFiles(BOITE);
  await expect(page.getByTestId('etape')).toHaveText(/Étape [23] sur 5/, { timeout: 30_000 });
  const etape = await page.getByTestId('etape').textContent();
  await page.waitForTimeout(1500);
  const apres = (await projetSauve(page)).recette;
  testInfo.annotations.push({ type: 'migration', description: JSON.stringify({ carte, cles, etape, plans: apres.plans }) });
  expect(journal.erreurs).toEqual([]);
  expect.soft(cles).not.toContain('arko.projet');
  expect.soft(cles).toContain('arko.projets');
  expect.soft(cles.filter((k) => k.startsWith('arko.projet.')).length).toBe(1);
  expect.soft(apres.plans).toEqual(r.plans);
});
