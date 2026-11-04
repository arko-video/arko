// Monteur IA (phase 6) sur une vidéo synthétique de 6 min (bruit faible, 3 gros bips à 1:00, 3:00, 5:00) : sans IA,
// avec l'IA (FAUX fournisseurs par page.route, réponses enregistrées, jamais de vraie clé), clé propre à chaque
// fournisseur, erreurs et réponse coupée, analyse annulée puis reprise ; et l'Aide (phase 5).
//   [CAPTURES=/un/dossier] npx playwright test --config playwright.interface.local.ts tests/e2e/monteur.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');
const VIDEO = join(tmpdir(), 'arko-monteur-bips-6min.mp4');
const BIPS = [60, 180, 300];
/** Une clé FACTICE : aucune vraie clé n'est jamais tapée dans les tests. */
const CLE = 'sk-ant-test-factice';
test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, serviceWorkers: 'block' });

test.beforeAll(() => {
  if (existsSync(VIDEO)) return;
  // Bruit rose faible pendant 6 min, et un bip de 1 kHz très fort (0,5 s) à 60, 180 et 300 s. Une image clé toutes les 2 s.
  const bips = BIPS.map((t) => `between(t,${t},${t + 0.5})`).join('+');
  const lavfi = (source: string) => ['-f', 'lavfi', '-i', source];
  const filtre = `[2:a]volume='if(${bips},6,0)':eval=frame[bip];[1:a][bip]amix=inputs=2:normalize=0[a]`;
  const sortie = '-map 0:v -map [a] -c:v libx264 -g 10 -pix_fmt yuv420p -c:a aac -ac 1 -b:a 64k'.split(' ');
  execFileSync('ffmpeg', [
    ...'-y -v error'.split(' '),
    ...lavfi('testsrc2=size=320x180:rate=5:duration=360'),
    ...lavfi('anoisesrc=color=pink:amplitude=0.01:duration=360:sample_rate=44100'),
    ...lavfi('sine=frequency=1000:sample_rate=44100:duration=360'),
    ...['-filter_complex', filtre, ...sortie, VIDEO],
  ]);
});

async function capture(page: Page, nom: string) {
  const d = process.env.CAPTURES;
  if (d) await page.waitForTimeout(400).then(() => page.screenshot({ path: join(d, `${nom}.png`) }));
}
/** Importer la longue vidéo, choisir « Monteur IA » : écran Demande, réglé sur 3 clips. */
async function ouvrirMonteur(page: Page) {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  // Les conseils du premier lancement ont déjà été vus (testés à part, en bas).
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('choix-monteur')).toBeVisible({ timeout: 30_000 });
  await capture(page, '1-choix');
  await page.getByTestId('choix-monteur-ia').click();
  await expect(page.getByTestId('monteur-demande')).toBeVisible();
  for (let i = 10; i > 3; i--) await page.getByTestId('nombre-moins').click();
  await expect(page.getByTestId('nombre-valeur')).toHaveText('3 clips');
}
/** Plage source (de, a) et titre du clip affiché dans la Revue. */
async function clip(page: Page) {
  const c = page.getByTestId('revue-carte');
  const [de, a] = [Number(await c.getAttribute('data-de')), Number(await c.getAttribute('data-a'))];
  return { de, a, titre: (await c.getAttribute('data-titre')) ?? '' };
}
/** Balayage au doigt (souris) sur la carte : dx > 0 = garder. */
async function balayer(page: Page, dx: number) {
  const b = (await page.getByTestId('revue-carte').boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 3];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

test('sans IA : 3 clips autour des bips, 2 gardés, revue reprise après rechargement', async ({ page }) => {
  await ouvrirMonteur(page);
  await expect(page.getByTestId('mode-sansIA')).toHaveAttribute('aria-checked', 'true');
  await capture(page, '2-demande');
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('analyse-pourcent')).toBeVisible();
  await capture(page, '3-analyse');
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 180_000 });
  await capture(page, '4-moments');
  const moments = page.locator('[data-testid^="moment-"]');
  const pics = await moments.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pic'))));
  expect(BIPS.filter((bip) => pics.some((p) => Math.abs(p - bip) < 3))).toEqual(BIPS);
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('1 / 3');
  await expect(page.getByTestId('revue-raison')).not.toBeEmpty();
  await page.waitForTimeout(800);
  await capture(page, '5-revue');
  const vus = [await clip(page)];
  await page.getByTestId('garder').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('2 / 3');
  // Retour Android jusqu'à Importer : « Reprendre ma revue (2 clips restants) ».
  for (const ecran of ['monteur-analyse', 'monteur-demande', 'reprendre-revue']) {
    await page.goBack();
    await expect(page.getByTestId(ecran)).toBeVisible();
  }
  // Après un rechargement : on re-choisit la même vidéo, la revue reprend au 2e clip.
  await page.reload();
  await expect(page.getByTestId('reprendre-revue')).toHaveText(/2 clips restants/, { timeout: 15_000 });
  await capture(page, '6-importer-reprendre');
  await page.getByTestId('fichier-revue').setInputFiles(VIDEO);
  await expect(page.getByTestId('revue-compteur')).toHaveText('2 / 3', { timeout: 30_000 });
  vus.push(await clip(page));
  await page.keyboard.press('ArrowLeft'); // jeter (clavier)
  await expect(page.getByTestId('revue-compteur')).toHaveText('3 / 3');
  vus.push(await clip(page));
  await balayer(page, 260); // garder (balayage à droite)
  await expect(page.getByTestId('revue-fin-titre')).toHaveText('2 clips gardés dans Mes montages');
  await capture(page, '7-fin');
  // Les 3 clips couvrent chacun un bip (15 s au moins), et tous les bips sont couverts.
  expect(BIPS.filter((bip) => vus.some(({ de, a }) => de <= bip && bip <= a))).toEqual(BIPS);
  for (const { de, a } of vus) expect(a - de).toBeGreaterThanOrEqual(14.9);
  await page.getByTestId('voir-montages').click();
  const titres = page.locator('[data-testid^="montage-titre-"]');
  await expect(titres).toHaveCount(2); // la liste se relit en arrière-plan
  expect((await titres.allTextContents()).sort()).toEqual([vus[0]!.titre, vus[2]!.titre].sort());
  await expect(page.getByTestId('carte-revue')).toHaveCount(0);
});

/** Réponse enregistrée (01-propre.txt), recalée sur les bips de la vidéo de 6 min. */
function reponseEnregistree(): string {
  const brut = readFileSync(join(RACINE, 'src/ia/fournisseurs/reponses-ia/01-propre.txt'), 'utf8');
  type Temps = { de?: number; a?: number; ts?: number };
  const json = JSON.parse(brut) as { recettes: { plans: Temps[]; sons: Temps[]; zooms: Temps[] }[] };
  json.recettes.forEach((r, i) => {
    const decalage = BIPS[i]! - 2 - r.plans[0]!.de!;
    const recaler = (v: number) => Math.round((v + decalage) * 10) / 10;
    for (const x of [...r.plans, ...r.sons, ...r.zooms])
      for (const k of ['de', 'a', 'ts'] as const) if (x[k] !== undefined) x[k] = recaler(x[k]);
  });
  return JSON.stringify(json);
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
type Mode = 'reponse' | 'cle_refusee' | 'coupee';
/** Faux Anthropic : liste des modèles, et messages (réponse enregistrée, coupée au 3e clip, ou clé refusée). */
async function fauxAnthropic(page: Page, mode: { messages: Mode }) {
  const envois: { cle: string | null; corps: string }[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const repondre = (status: number, json?: unknown) => route.fulfill({ status, headers: CORS, json });
    if (req.method() === 'OPTIONS') return repondre(204);
    const modeles = { data: [{ id: 'claude-sonnet-5' }, { id: 'claude-haiku-5-5' }] };
    if (req.url().includes('/v1/models')) return repondre(200, modeles);
    envois.push({ cle: req.headers()['x-api-key'] ?? null, corps: req.postData() ?? '' });
    const refus = { type: 'error', error: { message: 'invalid x-api-key' } };
    if (mode.messages === 'cle_refusee') return repondre(401, refus);
    const texte = reponseEnregistree();
    const coupe = mode.messages === 'coupee';
    const text = coupe ? texte.slice(0, texte.lastIndexOf('{"titre"') + 40) : texte;
    const corps = { content: [{ type: 'text', text }], stop_reason: coupe ? 'max_tokens' : 'end_turn' };
    return repondre(200, corps);
  });
  return envois;
}

test('avec l’IA (faux fournisseur) : Tester ma clé, Voir ce qui est envoyé, revue', async ({ page }) => {
  const envois = await fauxAnthropic(page, { messages: 'reponse' });
  await ouvrirMonteur(page);
  await page.getByTestId('consigne').fill('que des clutchs');
  await page.getByTestId('mode-ia').click();
  await expect(page.getByTestId('reglages-ia')).toBeVisible();
  await expect(page.getByTestId('fournisseur-anthropic')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('cle').fill(CLE);
  await page.getByTestId('tester-cle').click();
  await expect(page.getByTestId('test-cle')).toHaveText('Clé acceptée. 2 modèles disponibles.');
  await expect(page.getByTestId('cle-gardee')).toHaveText('Clé gardée : sk-…tice');
  await expect(page.getByTestId('modele').locator('option')).toHaveCount(2);
  await expect(page.getByTestId('cout')).toContainText('tokens');
  await capture(page, '8-demande-ia');
  await page.getByTestId('voir-envoi').click();
  await expect(page.getByTestId('panneau-envoi')).toContainText('Aucune image ni vidéo');
  await expect(page.getByTestId('envoi-texte')).toContainText('ARKO-MOMENTS/1');
  await page.getByTestId('envoi-fermer').click();
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 180_000 });
  expect(envois.map((e) => e.cle)).toEqual([CLE]);
  expect(envois[0]!.corps).toContain('ARKO-MOMENTS/1 src=s1 duree=360.0');
  await page.getByTestId('voir-envoi').click(); // le texte exact, après l'analyse
  const texte = page.getByTestId('envoi-texte');
  await expect(texte).toContainText('ARKO-MOMENTS/1 src=s1 duree=360.0');
  await expect(texte).toContainText('« Clips de 15 à 25 s. que des clutchs »');
  await expect(texte).not.toContainText(CLE);
  await capture(page, '9-envoi');
  await page.getByTestId('envoi-fermer').click();
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('1 / 3');
  await expect(page.getByTestId('revue-titre')).toHaveText("Il m'a one-shot");
  await expect(page.getByTestId('revue-raison')).toContainText('fou rire font une chute parfaite');
  await page.waitForTimeout(800);
  await capture(page, '10-revue-ia');
  await page.getByTestId('garder').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('2 / 3');
  await page.getByTestId('jeter').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('3 / 3');
  await expect(page.getByTestId('revue-titre')).toHaveText('Clutch 1 contre 3');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('revue-fin-titre')).toHaveText('2 clips gardés dans Mes montages');
  // « Retoucher le 1er » ouvre Couper sur le clip gardé.
  await page.getByTestId('retoucher-premier').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
});

test('erreur de l’IA (clé refusée), puis réponse coupée, puis « Continuer sans IA »', async ({ page }) => {
  const mode: { messages: Mode } = { messages: 'cle_refusee' };
  await fauxAnthropic(page, mode);
  await ouvrirMonteur(page);
  await page.getByTestId('mode-ia').click();
  await page.getByTestId('cle').fill(CLE);
  await page.getByTestId('lancer').click();
  const erreur = page.getByTestId('analyse-erreur-message');
  await expect(erreur).toHaveText('Clé refusée : vérifie-la.', { timeout: 180_000 });
  await capture(page, '11-erreur-ia');
  // Réponse coupée (max_tokens) : 2 clips sur 3, et c'est dit clairement (M-4).
  mode.messages = 'coupee';
  await page.getByTestId('reessayer-ia').click();
  await expect(page.getByTestId('reponse-coupee')).toContainText('coupée : 2 clips sur 3 récupérés');
  await expect(page.getByTestId('voir-clips')).toHaveText('Voir mes 2 clips');
  mode.messages = 'cle_refusee';
  await page.goBack();
  await page.getByTestId('lancer').click();
  await expect(erreur).toHaveText('Clé refusée : vérifie-la.', { timeout: 180_000 });
  await page.getByTestId('passer-sans-ia').click();
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('1 / 3');
});

test('clé propre à chaque fournisseur, en mémoire si l’appareil refuse (I-1, M-7)', async ({ page }) => {
  // Navigation privée simulée : la base des clés est inaccessible.
  await page.addInitScript(() => {
    const ouvrir = indexedDB.open.bind(indexedDB);
    indexedDB.open = (nom: string, v?: number) => {
      if (nom === 'arko-cles') throw new DOMException('bloqué', 'SecurityError');
      return ouvrir(nom, v);
    };
  });
  const openai: string[] = [];
  await page.route('https://api.openai.com/**', (route) => {
    openai.push(JSON.stringify(route.request().headers()) + (route.request().postData() ?? ''));
    return route.fulfill({ status: 200, headers: CORS, json: { data: [{ id: 'gpt-test' }] } });
  });
  await ouvrirMonteur(page);
  await page.getByTestId('mode-ia').click();
  await page.getByTestId('cle').fill(CLE); // clé A, pour Anthropic, ni testée ni gardée
  await page.getByTestId('fournisseur-openai').click();
  await expect(page.getByTestId('cle')).toHaveValue('');
  await page.getByTestId('lancer').click(); // aucune clé pour OpenAI : rien ne part
  await expect(page.getByTestId('toast')).toContainText('Colle d’abord ta clé API');
  await page.getByTestId('cle').fill('sk-openai-factice-B');
  await page.getByTestId('tester-cle').click();
  await expect(page.getByTestId('test-cle')).toHaveText('Clé acceptée. 1 modèle disponible.');
  await expect(page.getByTestId('cle-memoire')).toContainText('elle sera oubliée en fermant Arko');
  const envoye = openai.join(' ');
  expect([openai.length, envoye.includes('sk-openai-factice-B'), envoye.includes(CLE)]).toEqual([
    1,
    true,
    false,
  ]);
  await page.getByTestId('fournisseur-anthropic').click(); // retour : sa propre saisie, intacte
  await expect(page.getByTestId('cle')).toHaveValue(CLE);
});

test('annuler l’analyse, puis la reprendre', async ({ page }) => {
  await ouvrirMonteur(page);
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('analyse-pourcent')).toBeVisible();
  // Retour Android pendant l'analyse : on reste dessus.
  await page.goBack();
  await expect(page.getByTestId('monteur-analyse')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('Touche Annuler');
  await page.getByTestId('annuler-analyse').click();
  await expect(page.getByTestId('analyse-interrompue')).toBeVisible();
  await capture(page, '12-interrompue');
  // Les réglages proposent de reprendre ; « Reprendre l'analyse » va au bout.
  await page.getByTestId('retour-reglages').click();
  await expect(page.getByTestId('reprise-dispo')).toBeVisible();
  await expect(page.getByTestId('lancer')).toHaveText('Reprendre l’analyse');
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('voir-clips')).toHaveText('Voir mes 3 clips', { timeout: 180_000 });
});

test('aide : conseils du premier lancement, écran Aide par « ? », lien du code source', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('conseils')).toBeVisible();
  await capture(page, '13-conseils');
  for (const _ of [1, 2]) await page.getByTestId('conseils-suivant').click();
  await expect(page.getByTestId('conseils-suivant')).toHaveText('C’est parti');
  await page.getByTestId('conseils-suivant').click();
  await expect(page.getByTestId('conseils')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('choisir-video')).toBeVisible();
  await expect(page.getByTestId('conseils')).toHaveCount(0);
  await page.getByTestId('ouvrir-aide').click();
  await expect(page.getByTestId('aide')).toBeVisible();
  await expect(page.getByTestId('aide-titre')).toBeFocused(); // M-9
  await expect(page.locator('[data-testid^="aide-carte-"]')).toHaveCount(5);
  const lien = page.getByTestId('code-source');
  await expect(lien).toHaveAttribute('href', 'https://github.com/arko-video/arko');
  await expect(lien).toHaveAttribute('target', '_blank');
  await capture(page, '14-aide');
  // Retour Android : on revient à Importer.
  await page.goBack();
  await expect(page.getByTestId('choisir-video')).toBeVisible();
});
