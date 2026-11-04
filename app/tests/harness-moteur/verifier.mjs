// Lance Chrome (Playwright, channel 'chrome'), exécute le banc, puis relit les MP4 avec Mediabunny dans Node.
import { chromium } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const racine = new URL('../..', import.meta.url).pathname;
const serveur = spawn('npx', ['vite', '--config', 'tests/harness-moteur/vite.config.ts'], { cwd: racine, stdio: 'pipe' });
serveur.stderr.on('data', (d) => process.stderr.write(d));
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch('http://localhost:4181/tests/harness-moteur/index.html')).ok) break;
  } catch {}
  await attendre(500);
}

const resultats = [];
const ok = (nom, cond, detail = '') => {
  resultats.push({ nom, ok: !!cond, detail });
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

async function relire(base64, nomFichier) {
  const octets = Buffer.from(base64, 'base64');
  writeFileSync(nomFichier, octets);
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(octets) });
  const v = await input.getPrimaryVideoTrack();
  const a = await input.getPrimaryAudioTrack();
  const res = {
    duree: await input.computeDuration(),
    dureeVideo: v ? await v.computeDuration() : null,
    l: v ? await v.getDisplayWidth() : 0,
    h: v ? await v.getDisplayHeight() : 0,
    codecV: v ? await v.getCodec() : null,
    audio: !!a,
    codecA: a ? await a.getCodec() : null,
    canaux: a ? await a.getNumberOfChannels() : 0,
    frequence: a ? await a.getSampleRate() : 0,
    dureeAudio: a ? await a.computeDuration() : null,
    images: v ? (await v.computePacketStats()).packetCount : 0,
  };
  // Le moov est-il en tête (fastStart) ?
  const types = [];
  let pos = 0;
  while (pos + 8 <= octets.length && types.length < 6) {
    const taille = octets.readUInt32BE(pos);
    types.push(octets.toString('latin1', pos + 4, pos + 8));
    if (taille < 8) break;
    pos += taille;
  }
  res.boites = types.join(',');
  return res;
}

const navigateur = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await navigateur.newPage();
  const journal = [];
  page.on('console', (m) => journal.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => journal.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:4181/tests/harness-moteur/index.html');
  await page.waitForFunction(() => window.bancPret === true, null, { timeout: 60_000 });

  const cap = await page.evaluate(() => window.banc.capacites());
  ok('capacites : pas de message bloquant', cap.bloquant === null, JSON.stringify(cap));

  for (const [nom, mise, garder] of [['flou', { type: 'flou' }, 'debut'], ['recadre', { type: 'recadre', x: 0.3 }, 'fin']]) {
    const r = await page.evaluate(([m, g]) => window.banc.scenario(m, g), [mise, garder]);
    const f = await relire(r.base64, `/tmp/claude-0/arko-banc-${nom}.mp4`.replace('/tmp/claude-0', process.env.SCRATCH ?? '/tmp'));
    console.log(`\n--- ${nom} : ${JSON.stringify({ plans: r.recette.plans, mise: r.recette.mise, attendu: r.dureeAttendue, ms: r.ms, taille: r.taille, estimation: r.estimation, qualite: r.qualite, nom: r.nom })}`);
    console.log(`    relu : ${JSON.stringify(f)}`);
    console.log(`    progression : ${r.progres.map((p) => p.toFixed(2)).join(' ')} | restes : ${r.restes.map((x) => (x === null ? '-' : x.toFixed(1))).join(' ')}`);
    ok(`${nom} : source analysée (1920×1080, 5 s, empreinte)`, r.infos.l === 1920 && r.infos.h === 1080 && Math.abs(r.infos.duree - 5) < 0.1 && r.infos.emp.length === 32 && !r.verticale);
    ok(`${nom} : taille 1080 ou 1072 × 1920`, (f.l === 1080 || f.l === 1072) && f.h === 1920, `${f.l}×${f.h}`);
    ok(`${nom} : durée ${r.dureeAttendue} s ± 0,05`, Math.abs(f.duree - r.dureeAttendue) <= 0.05, `fichier ${f.duree.toFixed(3)} s, vidéo ${f.dureeVideo?.toFixed(3)} s, audio ${f.dureeAudio?.toFixed(3)} s`);
    ok(`${nom} : piste audio présente (AAC)`, f.audio && f.codecA === 'aac', `${f.codecA} ${f.canaux} canaux ${f.frequence} Hz`);
    ok(`${nom} : H.264, ${Math.round(r.dureeAttendue * 30)} images`, f.codecV === 'avc' && f.images === Math.round(r.dureeAttendue * 30), `${f.images} images`);
    ok(`${nom} : moov en tête (fastStart)`, f.boites.startsWith('ftyp,moov') || f.boites.startsWith('ftyp,free,moov'), f.boites);
    ok(`${nom} : progression jusqu'à 1`, r.progres.at(-1) === 1);
  }

  const code = await page.evaluate(() => window.banc.annulation());
  ok('annulation → ErreurArko "annule"', code === 'annule', code);
  const fmt = await page.evaluate(() => window.banc.erreurFormat());
  ok('fichier non vidéo → ErreurArko "format"', fmt.startsWith('format'), fmt);
  const ap = await page.evaluate(() => window.banc.apercu());
  ok('aperçu : image dessinée (centre non noir)', ap.centre[0] + ap.centre[1] + ap.centre[2] > 30, JSON.stringify(ap));
  ok('aperçu : la lecture avance', ap.tempsApresLecture > 1.6, `t = ${ap.tempsApresLecture}`);
  ok('vignette 160×90', ap.vignette && ap.vignette[0] === 160 && ap.vignette[1] === 90);
  const dc = await page.evaluate(() => window.banc.doubleCharger());
  ok('B-1 : deux charger() de suite → aperçu non noir', dc[0] + dc[1] + dc[2] > 30, JSON.stringify(dc));
  const ar = await page.evaluate(() => window.banc.annulerPuisRelancer());
  ok('I-5 : annuler puis relancer → 2e export OK', ar.code === 'annule' && ar.taille > 100_000, JSON.stringify(ar));
  ok('M-11 : pas d\'avertissement si le son est lisible', ar.avertissement === null);
  const erreurs = journal.filter((l) => /error|pageerror/i.test(l));
  if (erreurs.length) console.log('\nJournal (erreurs) :\n' + erreurs.join('\n'));
} finally {
  await navigateur.close();
  serveur.kill();
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications OK`);
process.exit(echecs ? 1 : 0);
