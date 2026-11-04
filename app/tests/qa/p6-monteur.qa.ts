// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// QA phase 6 (monteur IA) et phase 5 (aide) :
// (p6-a) Sans IA sur 6 min (bruit faible + 3 bips forts à 1:00, 3:00, 5:00 + une voix à 2:00) : clips autour des bips,
//        garder / jeter, « Reprendre ma revue », clips gardés dans Mes montages, ouverts puis exportés (MP4 vérifié).
// (p6-b) Avec l'IA, FAUX fournisseurs (page.route sur les 3 domaines, AUCUNE vraie clé) : Tester ma clé, Voir ce qui
//        est envoyé, 401, 429, réponse en markdown, réponse coupée, texte de l'IA injecté (HTML) jamais interprété.
// (p6-c) Sécurité de la clé : jamais dans localStorage ni la console, envoyée au seul bon domaine, « Oublier ma clé »
//        l'efface d'IndexedDB, la CSP bloque un fetch vers un autre domaine.
// (p6-d) Vidéo de 2 h : temps et mémoire de l'analyse ; Annuler puis Reprendre ; Worker fermé, Wake Lock relâché.
// (p5-a) Aide : 3 conseils au 1er lancement, écran Aide accessible.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { exporterEtTelecharger, FIX, surveiller } from './outils';
import { crete, sonMono } from './p3-outils';
import { dureeMp4 } from './p4-outils';

const SIX = 'tests/qa/fixtures/p6-bips-voix-6min.mp4';
const LONGUE = FIX + 'long-2h-320x180.mp4';
const BIPS = [60, 180, 300];
const CLE_ANT = 'sk-ant-qa-FACTICE-aaaa1111bbbb';
const CLE_OAI = 'sk-qa-FACTICE-openai-cccc2222';
const CLE_GEM = 'AIzaQA-FACTICE-gemini-dddd3333';

/** Espionne le Wake Lock (nombre de verrous pris et relâchés). */
async function espionWakeLock(page) {
  await page.addInitScript(() => {
    const w = (window as any);
    w.__verrous = { pris: 0, relaches: 0 };
    const faux = {
      request: async () => {
        w.__verrous.pris++;
        const ecouteurs: any[] = [];
        let relache = false;
        return {
          released: false,
          type: 'screen',
          addEventListener: (_: string, f: any) => ecouteurs.push(f),
          removeEventListener: () => {},
          release: async () => {
            if (relache) return;
            relache = true;
            w.__verrous.relaches++;
            ecouteurs.forEach((f) => f());
          },
        };
      },
    };
    Object.defineProperty(navigator, 'wakeLock', { value: faux, configurable: true });
  });
}

async function ouvrirMonteur(page, video = SIX) {
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
  await page.goto('./');
  await page.evaluate(async () => {
    for (const nom of ['keyval-store', 'arko-cles']) {
      await new Promise<void>((ok) => {
        const r = indexedDB.deleteDatabase(nom);
        r.onsuccess = r.onerror = r.onblocked = () => ok();
      });
    }
  });
  await page.reload();
  await page.getByTestId('fichier').setInputFiles(video);
  await expect(page.getByTestId('choix-monteur')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('choix-monteur-ia').click();
  await expect(page.getByTestId('monteur-demande')).toBeVisible();
}

async function nombreDeClips(page, n: number) {
  for (let i = 10; i > n; i--) await page.getByTestId('nombre-moins').click();
  await expect(page.getByTestId('nombre-valeur')).toHaveText(`${n} clips`);
}

async function plage(page): Promise<[number, number]> {
  const c = page.getByTestId('revue-carte');
  return [Number(await c.getAttribute('data-de')), Number(await c.getAttribute('data-a'))];
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.dismiss());
});

test('(p6-a) sans IA : clips autour des bips, garder / jeter, reprendre la revue, ouvrir et exporter', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await espionWakeLock(page);
  await ouvrirMonteur(page);
  await nombreDeClips(page, 4);
  const t0 = Date.now();
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 300_000 });
  const msAnalyse = Date.now() - t0;
  const pics = await page.locator('[data-testid^="moment-"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pic'))));
  const verrous = await page.evaluate(() => (window as any).__verrous);
  const workers = page.workers().map((w) => w.url()).filter((u) => /analyse/.test(u));
  await page.getByTestId('voir-clips').click();
  const compteur1 = await page.getByTestId('revue-compteur').textContent();
  const plages = [await plage(page)];
  const titres = [await page.getByTestId('revue-titre').textContent()];
  await page.getByTestId('garder').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText(/^2 \//);
  plages.push(await plage(page));
  await page.getByTestId('jeter').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText(/^3 \//);
  await page.waitForTimeout(500); // écriture de la revue dans IndexedDB
  // Retour jusqu'à Importer, rechargement : « Reprendre ma revue ».
  for (let k = 0; k < 3; k++) await page.goBack();
  await page.reload();
  await expect(page.getByTestId('reprendre-revue')).toBeVisible({ timeout: 15_000 });
  const reprendre = await page.getByTestId('reprendre-revue').textContent();
  await page.getByTestId('fichier-revue').setInputFiles(SIX);
  await expect(page.getByTestId('revue-compteur')).toHaveText(/3 \/ [34]/, { timeout: 60_000 });
  const compteurRepris = await page.getByTestId('revue-compteur').textContent();
  while (await page.getByTestId('garder').isVisible().catch(() => false)) {
    plages.push(await plage(page));
    titres.push(await page.getByTestId('revue-titre').textContent());
    await page.getByTestId('garder').click();
    await page.waitForTimeout(600);
  }
  const fin = await page.getByTestId('revue-fin-titre').textContent();
  await page.getByTestId('voir-montages').click();
  await expect(page.getByTestId('mes-montages')).toBeVisible();
  const liste = await page.locator('[data-testid^="montage-titre-"]').allTextContents();
  // Ouvrir le plus récent : re-choisir la vidéo, puis exporter.
  const [sel] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await sel.setFiles(SIX);
  await expect(page.getByTestId('etape')).toHaveText(/Étape 2 sur 5/, { timeout: 60_000 });
  const recette = await page.evaluate(
    () =>
      new Promise<any>((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const st = req.result.transaction('keyval').objectStore('keyval');
          const gi = st.get('arko.projets');
          gi.onsuccess = () => {
            const g = st.get(`arko.projet.${gi.result.courant}`);
            g.onsuccess = () => ok(g.result?.recette);
          };
        };
      }),
  );
  for (let k = 0; k < 4 && !((await page.getByTestId('etape').textContent()) ?? '').includes('5 sur 5'); k++) await page.getByTestId('suivant').click();
  const ex = await exporterEtTelecharger(page, testInfo, 'clip-garde.mp4', 400_000);
  const duree = dureeMp4(ex.chemin);
  const dureeAttendue = recette.plans.reduce((s, p) => s + (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0), 0);
  const x = sonMono(ex.chemin);
  const bip = BIPS.find((b) => recette.plans[0].de <= b && b <= recette.plans[0].a);
  const tBip = bip !== undefined ? bip - recette.plans[0].de : null;
  const sonBip = tBip !== null ? { pendant: crete(x, tBip, tBip + 0.4), avant: crete(x, Math.max(0, tBip - 3), Math.max(0.1, tBip - 1)) } : null;
  testInfo.annotations.push({
    type: 'sans IA',
    description: JSON.stringify({ msAnalyse, pics, verrous, workers, compteur1, plages, titres, reprendre, compteurRepris, fin, liste, recette: { plans: recette.plans, textes: recette.textes, sons: recette.sons, zooms: recette.zooms, statut: recette.statut }, duree, dureeAttendue, sonBip }),
  });
  expect(journal.erreurs).toEqual([]);
  for (const b of BIPS) expect.soft(pics.some((p) => Math.abs(p - b) < 3), `moment près de ${b} s : ${pics}`).toBe(true);
  for (const b of BIPS) expect.soft(plages.some(([de, a]) => de <= b && b <= a), `clip couvrant ${b} s`).toBe(true);
  expect.soft(verrous.pris).toBeGreaterThan(0);
  expect.soft(verrous.relaches, 'Wake Lock relâché').toBe(verrous.pris);
  expect.soft(workers, 'Worker d’analyse fermé').toEqual([]);
  expect.soft(Math.abs(duree - dureeAttendue)).toBeLessThan(0.1);
  if (sonBip) expect.soft(sonBip.pendant, 'le bip est dans le MP4').toBeGreaterThan(sonBip.avant * 3);
});

/* ------------------------------------------------------------------ faux fournisseurs */

function recettesJson(injection = false) {
  const titre = (i) => (injection && i === 0 ? '<img src=x onerror="window.__xss=1">Bip 1' : `Bip ${i + 1}`);
  return {
    recettes: BIPS.map((b, i) => ({
      titre: titre(i),
      raison: injection && i === 0 ? '<script>window.__xss=2</script><b>gras</b>' : `Le bip ${i + 1} surprend.`,
      plans: [{ de: b - 5, a: b + 12 }],
      textes: [{ txt: 'ATTENDS', role: 'accroche', t: 0, dur: 2, style: 'alerte' }],
      sons: [{ id: 'impact.boom', ts: b }],
      zooms: [{ ts: b, dur: 0.5, force: 1.4, style: 'punch' }],
      sousTitres: { mots: 'auto' },
    })),
  };
}

type Mode = 'ok' | '401' | '429' | 'markdown' | 'coupee' | 'injection';

function texteReponse(mode: Mode): string {
  const json = JSON.stringify(recettesJson(mode === 'injection'));
  if (mode === 'markdown') return 'Voici tes clips 😄\n\n```json\n' + JSON.stringify(recettesJson(), null, 2) + '\n```\nBonne chance !';
  if (mode === 'coupee') return json.slice(0, Math.floor(json.length * 0.8));
  return json;
}

/** Faux fournisseurs (Anthropic, OpenAI, Gemini). Journal : domaine, chemin, en-têtes et corps de chaque requête. */
async function fauxFournisseurs(page, etat: { mode: Mode }) {
  const journal: { domaine: string; chemin: string; entetes: Record<string, string>; corps: string; url: string }[] = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const repondre = async (route, domaine: string) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    journal.push({ domaine, chemin: url.pathname, entetes: req.headers(), corps: req.postData() ?? '', url: req.url() });
    const json = (status: number, j: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(j) });
    const liste = /models/.test(url.pathname) && !/generateContent/.test(url.pathname);
    if (liste) {
      if (domaine === 'gemini') return json(200, { models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
      return json(200, { data: [{ id: domaine === 'openai' ? 'gpt-5-mini' : 'claude-haiku-5-5' }, { id: 'modele-2' }] });
    }
    if (etat.mode === '401') return json(401, { error: { message: 'invalid x-api-key' } });
    if (etat.mode === '429') return json(429, { error: { message: 'rate_limit_error: too many requests' } });
    const texte = texteReponse(etat.mode);
    const coupee = etat.mode === 'coupee';
    if (domaine === 'anthropic') return json(200, { content: [{ type: 'text', text: texte }], stop_reason: coupee ? 'max_tokens' : 'end_turn' });
    if (domaine === 'openai') return json(200, { choices: [{ message: { role: 'assistant', content: texte }, finish_reason: coupee ? 'length' : 'stop' }] });
    return json(200, { candidates: [{ content: { parts: [{ text: texte }] }, finishReason: coupee ? 'MAX_TOKENS' : 'STOP' }] });
  };
  await page.route('https://api.anthropic.com/**', (r) => repondre(r, 'anthropic'));
  await page.route('https://api.openai.com/**', (r) => repondre(r, 'openai'));
  await page.route('https://generativelanguage.googleapis.com/**', (r) => repondre(r, 'gemini'));
  return journal;
}

test('(p6-b) avec l’IA (faux fournisseur) : Tester ma clé, envoi, 401, 429, markdown, réponse coupée, injection', async ({ page }, testInfo) => {
  const journalPage = surveiller(page);
  const consoles: string[] = [];
  page.on('console', (m) => consoles.push(m.text()));
  page.on('worker', (w) => w.on('console', (m) => consoles.push(m.text())));
  const etat = { mode: 'ok' as Mode };
  const reseau = await fauxFournisseurs(page, etat);
  await ouvrirMonteur(page);
  await nombreDeClips(page, 3);
  await page.getByTestId('mode-ia').click();
  await page.getByTestId('cle').fill(CLE_ANT);
  await page.getByTestId('tester-cle').click();
  await expect(page.getByTestId('test-cle')).toHaveText(/Clé acceptée/, { timeout: 15_000 });
  const cleGardee = await page.getByTestId('cle-gardee').textContent();
  const cout = await page.getByTestId('cout').textContent();
  await page.getByTestId('voir-envoi').click();
  const envoiAvant = (await page.getByTestId('panneau-envoi').textContent()) ?? '';
  await page.getByTestId('envoi-fermer').click();

  // 1. 401 : message en français + « Continuer sans IA ».
  etat.mode = '401';
  await page.getByTestId('lancer').click();
  const t0 = Date.now();
  await expect(page.getByTestId('analyse-erreur-message')).toBeVisible({ timeout: 300_000 });
  const msAnalyse = Date.now() - t0;
  const m401 = await page.getByTestId('analyse-erreur-message').textContent();
  const sansIa401 = await page.getByTestId('passer-sans-ia').isVisible();
  // 2. 429 (Réessayer).
  etat.mode = '429';
  await page.getByTestId('reessayer-ia').click();
  await expect(page.getByTestId('analyse-erreur-message')).not.toHaveText(m401 ?? '', { timeout: 30_000 });
  const m429 = await page.getByTestId('analyse-erreur-message').textContent();
  const sansIa429 = await page.getByTestId('passer-sans-ia').isVisible();
  // 3. Réponse coupée.
  etat.mode = 'coupee';
  await page.getByTestId('reessayer-ia').click();
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 60_000 });
  const clipsCoupee = await page.getByTestId('voir-clips').textContent();
  const ecranCoupee = (await page.getByTestId('monteur-analyse').textContent()) ?? '';
  // Le texte exact envoyé.
  await page.getByTestId('voir-envoi').click();
  const envoi = (await page.getByTestId('envoi-texte').textContent()) ?? '';
  await page.getByTestId('envoi-fermer').click();
  // 4. Réponse en markdown, puis 5. injection HTML : on relance depuis la Demande.
  const resultats: Record<string, unknown> = {};
  for (const mode of ['markdown', 'injection'] as Mode[]) {
    etat.mode = mode;
    await page.getByTestId('retour').click();
    await expect(page.getByTestId('monteur-demande')).toBeVisible();
    await page.getByTestId('lancer').click();
    await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 300_000 });
    resultats[mode] = await page.getByTestId('voir-clips').textContent();
  }
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-titre')).toBeVisible();
  const titreInjecte = await page.getByTestId('revue-titre').textContent();
  const raisonInjectee = await page.getByTestId('revue-raison').innerHTML();
  await page.waitForTimeout(800);
  const xss = await page.evaluate(() => (window as any).__xss ?? null);
  const imgs = await page.locator('[data-testid="monteur-revue"] img[src="x"]').count();

  // Sécurité : la clé dans les requêtes, localStorage, console.
  const versAnthropic = reseau.filter((r) => r.domaine === 'anthropic');
  const cleAilleurs = reseau.filter((r) => r.domaine !== 'anthropic' && JSON.stringify(r).includes(CLE_ANT));
  const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  const cleConsole = consoles.filter((c) => c.includes(CLE_ANT) || c.includes('FACTICE'));
  const cleDansEnvoi = envoi.includes(CLE_ANT) || envoiAvant.includes(CLE_ANT);
  testInfo.annotations.push({
    type: 'IA',
    description: JSON.stringify({
      cleGardee, cout, envoiAvant: envoiAvant.slice(0, 200), msAnalyse, m401, sansIa401, m429, sansIa429, clipsCoupee,
      ecranCoupee: ecranCoupee.slice(0, 400), resultats, titreInjecte, raisonInjectee, xss, imgs,
      requetes: reseau.map((r) => `${r.domaine} ${r.chemin} cle=${r.entetes['x-api-key'] === CLE_ANT} ver=${r.entetes['anthropic-version']} direct=${r.entetes['anthropic-dangerous-direct-browser-access']}`),
      cleAilleurs: cleAilleurs.length, lsContientCle: ls.includes(CLE_ANT), cleConsole, cleDansEnvoi,
    }),
  });
  expect.soft(cleGardee).toContain('…');
  expect.soft(cleGardee).not.toContain(CLE_ANT);
  expect.soft(m401).toBe('Clé refusée : vérifie-la.');
  expect.soft(sansIa401).toBe(true);
  expect.soft(m429).toContain('Trop de demandes');
  expect.soft(sansIa429).toBe(true);
  expect.soft(clipsCoupee).toMatch(/Voir mes [12] clips?/);
  expect.soft(resultats.markdown).toBe('Voir mes 3 clips');
  expect.soft(xss, 'le HTML de l’IA n’est jamais exécuté').toBeNull();
  expect.soft(imgs).toBe(0);
  expect.soft(versAnthropic.every((r) => r.entetes['anthropic-version'] === '2023-06-01' && r.entetes['anthropic-dangerous-direct-browser-access'] === 'true')).toBe(true);
  expect.soft(cleAilleurs.length).toBe(0);
  expect.soft(ls.includes(CLE_ANT)).toBe(false);
  expect.soft(cleConsole).toEqual([]);
  expect.soft(cleDansEnvoi).toBe(false);
  expect(journalPage.erreurs.filter((e) => e.includes(CLE_ANT))).toEqual([]);
});

test('(p6-c) clé : bon domaine seulement, changement de fournisseur, « Oublier ma clé », CSP', async ({ page }, testInfo) => {
  const etat = { mode: 'ok' as Mode };
  const reseau = await fauxFournisseurs(page, etat);
  const toutes: string[] = [];
  page.on('request', (r) => toutes.push(`${r.method()} ${r.url()} ${JSON.stringify(r.headers())}`));
  const csp: string[] = [];
  page.on('console', (m) => /Content Security Policy|\[CSP\]/i.test(m.text()) && csp.push(m.text()));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`[CSP] ${e.violatedDirective} ${e.blockedURI}`)));
  await ouvrirMonteur(page);
  await page.getByTestId('mode-ia').click();
  // Clé OpenAI et Gemini testées chacune chez son fournisseur.
  await page.getByTestId('fournisseur-openai').click();
  await page.getByTestId('cle').fill(CLE_OAI);
  await page.getByTestId('tester-cle').click();
  await expect(page.getByTestId('test-cle')).toHaveText(/Clé acceptée/, { timeout: 15_000 });
  await page.getByTestId('fournisseur-gemini').click();
  await page.getByTestId('cle').fill(CLE_GEM);
  await page.getByTestId('tester-cle').click();
  await expect(page.getByTestId('test-cle')).toHaveText(/Clé acceptée/, { timeout: 15_000 });
  // Clé Anthropic TAPÉE (pas encore gardée), puis on change de fournisseur avant de tester.
  await page.getByTestId('fournisseur-anthropic').click();
  await page.getByTestId('cle').fill(CLE_ANT);
  await page.getByTestId('fournisseur-openai').click();
  const champOpenai = await page.getByTestId('cle').inputValue().catch(() => '(pas de champ)');
  const gardeeOpenai = await page.getByTestId('cle-gardee').textContent().catch(() => null);
  await page.getByTestId('fournisseur-anthropic').click();
  const champAnthropic = await page.getByTestId('cle').inputValue().catch(() => '(pas de champ)');
  // Oublier la clé Gemini : effacée d'IndexedDB.
  const lireCles = () =>
    page.evaluate(
      () =>
        new Promise<Record<string, unknown>>((ok) => {
          const req = indexedDB.open('arko-cles');
          req.onsuccess = () => {
            const st = req.result.transaction('cles').objectStore('cles');
            const k = st.getAllKeys();
            k.onsuccess = () => {
              const v = st.getAll();
              v.onsuccess = () => ok(Object.fromEntries((k.result as string[]).map((c, i) => [c, String(v.result[i]).slice(0, 6) + '…'])));
            };
          };
          req.onerror = () => ok({});
        }),
    );
  const avantOubli = await lireCles();
  await page.getByTestId('fournisseur-gemini').click();
  await page.getByTestId('oublier-cle').click();
  await page.waitForTimeout(500);
  const apresOubli = await lireCles();
  // Rechargement : les clés gardées reviennent masquées.
  // CSP : un fetch vers un autre domaine depuis la page.
  const fetchAutre = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/vol?cle=1');
      return 'passé';
    } catch (e) {
      return 'bloqué : ' + (e as Error).message;
    }
  });
  const fetchHttp = await page.evaluate(async () => {
    try {
      await fetch('http://localhost:1234/lm-studio');
      return 'passé';
    } catch (e) {
      return 'bloqué : ' + (e as Error).message;
    }
  });
  await page.waitForTimeout(500);
  const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  const cleOaiAilleurs = toutes.filter((r) => r.includes(CLE_OAI) && !r.includes('api.openai.com'));
  const cleGemAilleurs = toutes.filter((r) => r.includes(CLE_GEM) && !r.includes('generativelanguage.googleapis.com'));
  const cleAntAilleurs = toutes.filter((r) => r.includes(CLE_ANT) && !r.includes('api.anthropic.com'));
  const cleDansUrl = toutes.filter((r) => /key=|cle=AIza/.test(r.split(' ')[1] ?? ''));
  testInfo.annotations.push({
    type: 'clé',
    description: JSON.stringify({
      requetes: reseau.map((r) => `${r.domaine} ${r.chemin}`), champOpenai: champOpenai === CLE_ANT ? 'LA CLÉ ANTHROPIC' : champOpenai, gardeeOpenai, champAnthropic: champAnthropic === CLE_ANT ? 'clé anthropic' : champAnthropic,
      avantOubli, apresOubli, fetchAutre, fetchHttp, csp, lsContientCle: [CLE_ANT, CLE_OAI, CLE_GEM].some((c) => ls.includes(c)),
      cleOaiAilleurs: cleOaiAilleurs.length, cleGemAilleurs: cleGemAilleurs.length, cleAntAilleurs: cleAntAilleurs.length, cleDansUrl,
    }),
  });
  expect.soft(cleOaiAilleurs).toEqual([]);
  expect.soft(cleGemAilleurs).toEqual([]);
  expect.soft(cleAntAilleurs).toEqual([]);
  expect.soft(cleDansUrl).toEqual([]);
  expect.soft(champOpenai, 'la clé tapée pour Anthropic ne doit pas rester dans le champ OpenAI').not.toBe(CLE_ANT);
  expect.soft(Object.keys(apresOubli)).not.toContain('cle:gemini');
  expect.soft(Object.keys(avantOubli)).toContain('cle:gemini');
  expect.soft(fetchAutre).toMatch(/^bloqué/);
  expect.soft(csp.join(' ')).toContain('example.com');
  expect.soft(fetchHttp).toMatch(/^bloqué/);
});

test('(p6-d) vidéo de 2 h : temps, mémoire, Annuler puis Reprendre, Worker et Wake Lock', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const journal = surveiller(page);
  await espionWakeLock(page);
  await ouvrirMonteur(page, LONGUE);
  await nombreDeClips(page, 3);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const memoire: { t: number; tas: number; rss: number }[] = [];
  const rssChrome = () => {
    try {
      return Math.round(Number(execFileSync('bash', ['-c', "ps -C chrome -o rss= | awk '{s+=$1} END {print s}'"]).toString().trim()) / 1024);
    } catch {
      return -1;
    }
  };
  let echantillonner = true;
  const t0 = Date.now();
  const boucle = (async () => {
    while (echantillonner) {
      try {
        const m = await cdp.send('Performance.getMetrics');
        const tas = m.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0;
        memoire.push({ t: Math.round((Date.now() - t0) / 100) / 10, tas: Math.round(tas / 1048576), rss: rssChrome() });
      } catch {
        /* page occupée */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  // 1. Analyse complète, sans interruption : temps et mémoire.
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('moments')).toBeVisible({ timeout: 1_500_000 }); // (fini : avec ou sans moment)
  const msAnalyse = Date.now() - t0;
  echantillonner = false;
  await boucle;
  await page.waitForTimeout(500);
  const verrous1 = await page.evaluate(() => ({ ...(window as any).__verrous }));
  const workers1 = page.workers().map((w) => w.url()).filter((u) => /analyse/.test(u));
  const clips = await page.getByTestId('moments').textContent();
  const repris1 = await page.getByTestId('repris').textContent({ timeout: 1000 }).catch(() => null);
  const nbMoments = await page.locator('[data-testid^="moment-"]').count();

  // 2. Annuler puis Reprendre : on efface le point de reprise, on relance, on annule dès le 1er pourcentage.
  await page.evaluate(
    () =>
      new Promise<void>((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const st = req.result.transaction('keyval', 'readwrite').objectStore('keyval');
          const k = st.getAllKeys();
          k.onsuccess = () => {
            for (const c of k.result as string[]) if (String(c).startsWith('arko.analyse')) st.delete(c);
            ok();
          };
        };
      }),
  );
  await page.getByTestId('retour').click({ timeout: 5000 });
  await expect(page.getByTestId('monteur-demande')).toBeVisible();
  const t1 = Date.now();
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('analyse-pourcent')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(Math.min(4000, msAnalyse / 4));
  const pourcentAnnule = await page.getByTestId('analyse-pourcent').textContent({ timeout: 2000 }).catch(() => 'fini avant');
  await page.getByTestId('annuler-analyse').click({ timeout: 5000 }).catch(() => undefined);
  const interrompue = await page.getByTestId('analyse-interrompue').isVisible({ timeout: 5000 }).catch(() => false);
  await page.waitForTimeout(800);
  const workersApresAnnuler = page.workers().map((w) => w.url()).filter((u) => /analyse/.test(u));
  const verrousApresAnnuler = await page.evaluate(() => ({ ...(window as any).__verrous }));
  let msReprise = null;
  let reprise = null;
  let premierPourcentReprise = null;
  if (interrompue) {
    await page.getByTestId('retour-reglages').click();
    reprise = await page.getByTestId('reprise-dispo').textContent({ timeout: 5000 }).catch(() => null);
    const t2 = Date.now();
    await page.getByTestId('lancer').click();
    premierPourcentReprise = await page.getByTestId('analyse-pourcent').textContent({ timeout: 5000 }).catch(() => null);
    await expect(page.getByTestId('moments')).toBeVisible({ timeout: 1_500_000 }); // (fini : avec ou sans moment)
    msReprise = Date.now() - t2;
    reprise = `${reprise} | ${await page.getByTestId('repris').textContent({ timeout: 1000 }).catch(() => 'pas de « repris »')} | ${await page.getByTestId('moments').textContent()}`;
  }
  await page.waitForTimeout(500);
  const verrous = await page.evaluate(() => ({ ...(window as any).__verrous }));
  const workers = page.workers().map((w) => w.url()).filter((u) => /analyse/.test(u));
  const maxTas = Math.max(...memoire.map((m) => m.tas));
  const maxRss = Math.max(...memoire.map((m) => m.rss));
  testInfo.annotations.push({
    type: '2 h',
    description: JSON.stringify({ msAnalyse, clips, repris1, nbMoments, maxTas, maxRss, verrous1, workers1, msAvantAnnuler: Date.now() - t1, pourcentAnnule, interrompue, reprise, premierPourcentReprise, msReprise, verrousApresAnnuler, verrous, workersApresAnnuler, workers, memoire: memoire.filter((_, i) => i % 4 === 0) }),
  });
  expect(journal.erreurs).toEqual([]);
  expect.soft(workers1, 'Worker fermé à la fin').toEqual([]);
  expect.soft(verrous1.relaches, 'Wake Lock relâché').toBe(verrous1.pris);
  expect.soft(interrompue, 'Annuler interrompt l’analyse').toBe(true);
  expect.soft(workersApresAnnuler, 'Worker fermé après Annuler').toEqual([]);
  expect.soft(verrous.relaches, 'Wake Lock relâché (après reprise)').toBe(verrous.pris);
  });

test('(p5-a) aide : 3 conseils au 1er lancement, écran Aide accessible', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('conseils')).toBeVisible();
  const etapes: string[] = [];
  for (let k = 0; k < 6; k++) {
    if (!(await page.getByTestId('conseils').isVisible().catch(() => false))) break;
    etapes.push(((await page.getByTestId('conseils').textContent()) ?? '').slice(0, 90));
    await page.getByTestId('conseils-suivant').click();
  }
  await page.reload();
  const revient = await page.getByTestId('conseils').count();
  // Écran Aide : bouton « ? » au clavier, titre, cartes, lien, retour.
  await page.getByTestId('ouvrir-aide').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('aide')).toBeVisible();
  const a11y = await page.evaluate(() => {
    const aide = document.querySelector('[data-testid="aide"]')!;
    return {
      lang: document.documentElement.lang,
      titres: [...aide.querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName} ${h.textContent?.trim()}`),
      cartes: aide.querySelectorAll('[data-testid^="aide-carte-"]').length,
      focus: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 30)),
      boutonsSansNom: [...aide.querySelectorAll('button, a')].filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())).length,
      lien: (aide.querySelector('[data-testid="code-source"]') as HTMLAnchorElement | null)?.rel ?? null,
    };
  });
  await page.screenshot({ path: 'tests/qa/captures/p5-aide.png', fullPage: true });
  await page.goBack();
  const retour = await page.getByTestId('choisir-video').isVisible();
  testInfo.annotations.push({ type: 'aide', description: JSON.stringify({ etapes, revient, a11y, retour }) });
  expect(journal.erreurs).toEqual([]);
  expect.soft(etapes.length).toBe(3);
  expect.soft(revient).toBe(0);
  expect.soft(a11y.cartes).toBe(5);
  expect.soft(a11y.lang).toBe('fr');
  expect.soft(a11y.boutonsSansNom).toBe(0);
  expect.soft(a11y.lien ?? '').toContain('noopener');
  expect.soft(retour).toBe(true);
});
