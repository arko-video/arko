#!/usr/bin/env node
// Banc réel — extraction de la VÉRITÉ (le montage fait à la main par Claude, validé par Romain) en TEMPS et
// ÉTIQUETTES seulement. Lit les scripts de rendu ffmpeg du montage (rendre.sh, ordre.json, sNN_k.ass, final.py)
// et écrit verite.json. AUCUN texte prononcé n'est gardé (seulement le nombre de mots et de caractères),
// aucun son. Reproductible :
//
//   node tests/banc-reel/verite/extraire-verite.mjs [dossier-montage4] [verite.json]
//
// Défauts : /home/claude/banc-prive/montage4 → tests/banc-reel/verite/verite.json.
//
// Ce que le script comprend de rendre.sh (une entrée `case` par tranche d'environ 40 s) :
// - `-ss $(rel NN T) -t D -i extraits/xNN.mkv` : un morceau gardé de la source, T = temps source ABSOLU (s depuis
//   le début de la vidéo de 3 h 20), D = durée. Les morceaux d'une tranche sont mis bout à bout (concat, vérifié),
//   donc le morceau k occupe [somme des D avant lui, + D] dans le temps de la tranche.
// - `crop=W:H:…` du morceau : zoom = 1172 / W (×1, ×1,12 ou ×1,32).
// - `-loop 1 … -i persos/<P>_<emotion>_<situation>_<f|o>.png` posé par `overlay … enable='between(t,a,b)+…'` :
//   P = R (Romain) ou G (Guts) ; `_f` = perso montré (une fenêtre `between` = une phrase, émotion + situation) ;
//   `_o` + `lt(mod(t,0.24),0.13)` = bouche qui bouge pendant les mots (≈ la parole elle-même).
// - `ass=montage4/sNN_k.ass` : styles Punch (punchline), Sous (sous-titre de la voix faible), Titre, Gros.
// - ordre.json : ordre des tranches dans la vidéo finale et musique de chaque tranche (final.py les assemble).
// Les temps de la tranche sont convertis en temps SOURCE grâce aux morceaux, et en temps de SORTIE (vidéo finale)
// en ajoutant la durée des tranches précédentes (durée d'une tranche = somme de ses D, comme le générateur).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = resolve(process.argv[2] ?? '/home/claude/banc-prive/montage4');
const SORTIE = resolve(process.argv[3] ?? join(ICI, 'verite.json'));

/** Largeur du cadrage sans zoom (1172 × 660 à (53, 20) en 720p). */
const LARGEUR_SANS_ZOOM = 1172;
/** Musiques (Kevin MacLeod, CC BY 4.0) : surnom dans final.py → titre. */
const TITRES_MUSIQUE = {
  monkeys: 'Monkeys Spinning Monkeys',
  snitch: 'Sneaky Snitch',
  duck: 'Fluffing a Duck',
  investigations: 'Investigations',
  weasel: 'Scheming Weasel (faster)',
  pizzicato: 'Divertissement Pizzicato',
};

const r3 = (x) => Math.round(x * 1000) / 1000;
const avertissements = [];

/* ------------------------------------------------------------------ lecture */

function lire(nom) {
  const chemin = join(DOSSIER, nom);
  if (!existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}`);
  return readFileSync(chemin, 'utf8');
}

const ordreJson = JSON.parse(lire('ordre.json'));
const ORDRE = ordreJson.ordre;
const MUSIQUES = ordreJson.musiques;
const rendre = lire('rendre.sh');
const finalPy = lire('final.py');

// Réglages de la musique lus dans final.py (contrôle : on s'attend à −17 dB, sidechain 0,03 / 6 / 20 / 400, −14 LUFS).
function reglagesMusique(py) {
  const n = (re) => {
    const m = re.exec(py);
    return m ? Number(m[1]) : null;
  };
  return {
    volumeDb: n(/volume=(-?[\d.]+)dB/),
    fonduEntree: n(/afade=t=in:d=([\d.]+)/),
    fonduSortie: n(/afade=t=out:st=.*?:d=([\d.]+),volume=/),
    baisse: {
      seuil: n(/sidechaincompress=threshold=([\d.]+)/),
      ratio: n(/sidechaincompress=[^']*ratio=([\d.]+)/),
      attaqueMs: n(/sidechaincompress=[^']*attack=([\d.]+)/),
      relacheMs: n(/sidechaincompress=[^']*release=([\d.]+)/),
    },
    lufs: n(/loudnorm=I=(-?[\d.]+)/),
    crete: n(/loudnorm=[^,']*TP=(-?[\d.]+)/),
  };
}

/* ------------------------------------------------------------------ rendre.sh */

/** Une entrée `case` → ses entrées (-i) dans l'ordre, son filter_complex, son fichier .ass. */
function lireTranche(id, ligne) {
  const entrees = [];
  const re = /-ss \$\(rel (\d+) ([\d.]+)\) -t ([\d.]+) -i extraits\/x(\d+)\.mkv|-loop 1 -framerate \d+ -i persos\/([A-Za-z0-9_]+)\.png/g;
  let m;
  while ((m = re.exec(ligne))) {
    if (m[1] !== undefined) {
      if (m[1] !== m[4]) avertissements.push(`${id} : rel ${m[1]} sur extraits/x${m[4]}.mkv`);
      entrees.push({ type: 'morceau', extrait: m[1], T: Number(m[2]), D: Number(m[3]) });
    } else entrees.push({ type: 'perso', fichier: m[5] });
  }
  // Toutes les entrées de la ligne doivent avoir été reconnues.
  const nbI = (ligne.match(/ -i /g) ?? []).length;
  if (nbI !== entrees.length) throw new Error(`${id} : ${nbI} entrées -i, ${entrees.length} comprises`);
  const fc = /-filter_complex '(.*)' -map '\[vo\]'/.exec(ligne);
  if (!fc) throw new Error(`${id} : filter_complex introuvable`);
  const filtre = fc[1].replace(/'"'"'/g, "'");
  return { id, entrees, filtre };
}

function lireRendre(texte) {
  const tranches = new Map();
  for (const ligne of texte.split('\n')) {
    const m = /^\s+([a-z0-9_]+)\) ffmpeg /.exec(ligne);
    if (!m) continue;
    tranches.set(m[1], lireTranche(m[1], ligne));
  }
  return tranches;
}

/** Fenêtres `between(t,a,b)` d'une expression enable. */
function fenetresDe(expr) {
  const res = [];
  const re = /between\(t,([\d.]+),([\d.]+)\)/g;
  let m;
  while ((m = re.exec(expr))) res.push([Number(m[1]), Number(m[2])]);
  return res;
}

/** Analyse le filter_complex d'une tranche : zooms des morceaux, ordre du concat, overlays des persos, fichier .ass. */
function analyserFiltre(tr) {
  const zooms = new Map();
  const persos = [];
  let concat = null;
  let ass = null;
  for (const bout of tr.filtre.split(';')) {
    let m = /^\[(\d+):v\]setpts=PTS-STARTPTS,fps=30,crop=(\d+):(\d+):(\d+):(\d+),/.exec(bout);
    if (m) {
      zooms.set(Number(m[1]), r3(LARGEUR_SANS_ZOOM / Number(m[2])));
      continue;
    }
    m = /^((?:\[v\d+\]\[a\d+\])+)concat=n=(\d+):v=1:a=1/.exec(bout);
    if (m) {
      concat = [...m[1].matchAll(/\[v(\d+)\]/g)].map((x) => Number(x[1]));
      if (concat.length !== Number(m[2])) throw new Error(`${tr.id} : concat n=${m[2]} mais ${concat.length} entrées`);
      continue;
    }
    m = /^\[[a-z0-9]+\]\[(\d+):v\]overlay=x=(-?\d+):.*enable='(.*)'\[[a-z0-9]+\]$/.exec(bout);
    if (m) {
      const k = Number(m[1]);
      const e = tr.entrees[k];
      if (!e || e.type !== 'perso') throw new Error(`${tr.id} : overlay de l'entrée ${k} qui n'est pas un perso`);
      const bouche = /lt\(mod\(t,0\.24\),0\.13\)/.test(m[3]);
      persos.push({ k, x: Number(m[2]), fichier: e.fichier, bouche, fenetres: fenetresDe(m[3]) });
      continue;
    }
    m = /\bass=montage4\/([A-Za-z0-9_]+\.ass)/.exec(bout);
    if (m) ass = m[1];
  }
  return { zooms, concat, persos, ass };
}

/* ------------------------------------------------------------------ .ass */

function tempsAss(s) {
  const m = /^(\d+):(\d\d):(\d\d(?:\.\d+)?)$/.exec(s.trim());
  if (!m) throw new Error(`Temps ASS illisible : ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Dialogues d'un .ass : style, début, fin (temps de la tranche) et SEULEMENT des comptes sur le texte. */
function lireAss(nom) {
  const res = [];
  for (const ligne of lire(nom).split('\n')) {
    if (!ligne.startsWith('Dialogue:')) continue;
    const champs = ligne.slice('Dialogue:'.length).split(',');
    const texte = champs.slice(9).join(','); // le texte peut contenir des virgules
    const brut = texte.replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' ').trim();
    const mots = brut.split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x));
    let cle = 'aucune';
    if (/\\c&H00E5FF&/i.test(texte)) cle = 'jaune';
    else if (/\\c&H3030FF&/i.test(texte)) cle = 'rouge';
    res.push({ style: champs[3].trim(), a: tempsAss(champs[1]), b: tempsAss(champs[2]), nMots: mots.length, nCar: brut.length, cle });
  }
  return res;
}

/* ------------------------------------------------------------------ temps */

/** Intervalles triés et fusionnés. */
function fusionner(liste, ecart = 0) {
  const tries = liste.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  const res = [];
  for (const [a, b] of tries) {
    const der = res[res.length - 1];
    if (der && a <= der[1] + ecart) der[1] = Math.max(der[1], b);
    else res.push([a, b]);
  }
  return res;
}
const longueur = (liste) => liste.reduce((s, [a, b]) => s + (b - a), 0);
function recouvrement(liste, [a, b]) {
  let s = 0;
  for (const [x, y] of liste) s += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return s;
}

/* ------------------------------------------------------------------ construction */

const tranchesSh = lireRendre(rendre);
for (const id of ORDRE) if (!tranchesSh.has(id)) throw new Error(`Tranche ${id} de ordre.json absente de rendre.sh`);
for (const id of tranchesSh.keys()) if (!ORDRE.includes(id)) avertissements.push(`Tranche ${id} de rendre.sh absente de ordre.json`);

const morceaux = [];
const tranches = [];
const phrases = [];
const punchlines = [];
const sousTitres = [];
const titres = [];
const controles = { fenetresRognees: 0, fenetresAJointure: 0, bouchesSansPhrase: 0, fenetresHorsMorceau: 0 };
let tSortie = 0;

const sequenceDe = (id) => (id.startsWith('hook') ? 'accroche' : id.split('_')[0]);

for (const id of ORDRE) {
  const tr = tranchesSh.get(id);
  const f = analyserFiltre(tr);
  const indicesMorceaux = tr.entrees.map((e, k) => (e.type === 'morceau' ? k : -1)).filter((k) => k >= 0);
  if (!f.concat || f.concat.join(',') !== indicesMorceaux.map((_, i) => i).join(',')) {
    throw new Error(`${id} : le concat ne prend pas les morceaux dans l'ordre`);
  }
  // Morceaux de la tranche : temps de la tranche → temps source et de sortie.
  const sequence = sequenceDe(id);
  const locaux = [];
  let c = 0;
  for (const k of indicesMorceaux) {
    const e = tr.entrees[k];
    const m = {
      i: morceaux.length,
      tranche: id,
      sequence,
      de: r3(e.T),
      a: r3(e.T + e.D),
      t0: r3(tSortie + c),
      t1: r3(tSortie + c + e.D),
      zoom: f.zooms.get(k) ?? 1,
    };
    if (!f.zooms.has(k)) avertissements.push(`${id} : zoom du morceau ${k} introuvable`);
    locaux.push({ c0: c, c1: c + e.D, T: e.T, m });
    morceaux.push(m);
    c += e.D;
  }
  const duree = c;
  const t0Tranche = tSortie;
  tSortie += duree;

  /** Fenêtre en temps de tranche → { source: [[de, a]…], sortie: [t0, t1] } (rognée à la tranche). */
  const convertir = (a, b) => {
    let x = a;
    let y = b;
    if (x < -1e-6 || y > duree + 1e-6) controles.fenetresRognees++;
    x = Math.max(0, x);
    y = Math.min(duree, y);
    const source = [];
    for (const l of locaux) {
      const o0 = Math.max(x, l.c0);
      const o1 = Math.min(y, l.c1);
      if (o1 - o0 > 1e-6) source.push([r3(l.T + (o0 - l.c0)), r3(l.T + (o1 - l.c0))]);
    }
    if (source.length > 1) controles.fenetresAJointure++;
    if (source.length === 0 && y > x) controles.fenetresHorsMorceau++;
    return { source, sortie: [r3(t0Tranche + x), r3(t0Tranche + y)] };
  };

  // Persos : chaque fenêtre `_f` = une phrase ; les fenêtres `_o` de la même image vont dans la phrase qui les contient.
  const phrasesTranche = [];
  for (const o of f.persos) {
    const mm = /^([RG])_([a-zA-Z]+)_([a-zA-Z]+)_([fo])$/.exec(o.fichier);
    if (!mm) throw new Error(`${id} : nom de perso inattendu ${o.fichier}`);
    const [, p, emo, sit, fo] = mm;
    if ((fo === 'o') !== o.bouche) avertissements.push(`${id} : ${o.fichier} et l'animation de la bouche ne vont pas ensemble`);
    const cote = o.x < 1000 ? 'gauche' : 'droite';
    if (fo === 'f') {
      for (const [a, b] of o.fenetres) phrasesTranche.push({ p, emo, sit, cote, a, b, bouches: [] });
    }
  }
  for (const o of f.persos) {
    const mm = /^([RG])_([a-zA-Z]+)_([a-zA-Z]+)_o$/.exec(o.fichier);
    if (!mm) continue;
    const [, p, emo, sit] = mm;
    for (const [a, b] of o.fenetres) {
      // Quand deux phrases de la même personne se suivent, la fenêtre `_f` de la 1re s'arrête 0,1 s avant le début
      // de la suivante : sa bouche peut donc dépasser de 0,1 s. On prend la phrase qui recouvre le plus la bouche.
      const candidates = phrasesTranche.filter((x) => x.p === p && x.emo === emo && x.sit === sit);
      let meilleure = null;
      let max = 0;
      for (const x of candidates) {
        const rec = Math.min(b, x.b) - Math.max(a, x.a);
        if (rec > max) [meilleure, max] = [x, rec];
      }
      if (!meilleure || a < meilleure.a - 0.011 || b > meilleure.b + 0.111) controles.bouchesSansPhrase++;
      if (meilleure) meilleure.bouches.push([a, b]);
    }
  }
  phrasesTranche.sort((x, y) => x.a - y.a || x.p.localeCompare(y.p));
  for (const ph of phrasesTranche) {
    const montre = convertir(ph.a, ph.b);
    const bouche = [];
    for (const [a, b] of ph.bouches.sort((x, y) => x[0] - y[0])) bouche.push(...convertir(a, b).source);
    phrases.push({
      i: phrases.length,
      p: ph.p,
      emo: ph.emo,
      sit: ph.sit === 'aucune' ? null : ph.sit,
      tranche: id,
      sequence,
      accroche: sequence === 'accroche',
      cote: ph.cote,
      sortie: montre.sortie,
      montre: montre.source,
      bouche,
    });
  }

  // Textes à l'écran (.ass) : temps seulement.
  if (!f.ass) throw new Error(`${id} : pas de fichier .ass`);
  for (const d of lireAss(f.ass)) {
    const w = convertir(d.a, d.b);
    const base = { tranche: id, sequence, accroche: sequence === 'accroche', sortie: w.sortie, source: w.source };
    if (d.style === 'Punch') punchlines.push({ i: punchlines.length, ...base, nMots: d.nMots, nCar: d.nCar, cle: d.cle });
    else if (d.style === 'Sous') sousTitres.push({ i: sousTitres.length, ...base, nMots: d.nMots, nCar: d.nCar });
    else if (d.style === 'Titre' || d.style === 'Gros') titres.push({ style: d.style, ...base, nMots: d.nMots });
    else avertissements.push(`${id} : style ASS inconnu ${d.style}`);
  }

  tranches.push({
    id,
    sequence,
    t0: r3(t0Tranche),
    t1: r3(tSortie),
    duree: r3(duree),
    musique: MUSIQUES[id] ?? null,
    morceaux: locaux.map((l) => l.m.i),
  });
}

const dureeTotale = r3(tSortie);

/* ------------------------------------------------------------------ parole par personne */

const parole = {};
const bouche = {};
for (const p of ['R', 'G']) {
  const siennes = phrases.filter((x) => x.p === p);
  parole[p] = fusionner(siennes.flatMap((x) => x.bouche)).map(([a, b]) => [r3(a), r3(b)]);
  bouche[p] = fusionner(siennes.flatMap((x) => x.montre)).map(([a, b]) => [r3(a), r3(b)]);
}
// Qui dit chaque punchline / sous-titre : la personne dont la parole le recouvre le plus.
function personneDe(source) {
  let meilleure = null;
  let max = 0;
  for (const p of ['R', 'G']) {
    const rec = source.reduce((s, w) => s + recouvrement(parole[p], w), 0);
    if (rec > max) [meilleure, max] = [p, rec];
  }
  return meilleure;
}
for (const x of punchlines) x.p = personneDe(x.source);
for (const x of sousTitres) x.p = personneDe(x.source);

/* ------------------------------------------------------------------ séquences et musique */

const sequences = [];
for (const id of [...new Set(tranches.map((t) => t.sequence))]) {
  if (id === 'accroche') continue;
  const ts = tranches.filter((t) => t.sequence === id);
  const ms = morceaux.filter((m) => m.sequence === id);
  const plages = fusionner(ms.map((m) => [m.de, m.a]), 0.001).map(([a, b]) => [r3(a), r3(b)]);
  const musiques = [...new Set(ts.map((t) => t.musique))];
  sequences.push({
    id,
    tranches: ts.map((t) => t.id),
    morceaux: ms.length,
    plages,
    duree: r3(longueur(plages)),
    source: [plages[0][0], plages[plages.length - 1][1]],
    sortie: [ts[0].t0, ts[ts.length - 1].t1],
    musique: musiques.length === 1 ? musiques[0] : musiques,
    titre: titres.some((x) => x.style === 'Titre' && ts.some((t) => t.id === x.tranche)),
  });
}
const accrocheTr = tranches.filter((t) => t.sequence === 'accroche');
const accroche = accrocheTr.length
  ? {
      sortie: [accrocheTr[0].t0, accrocheTr[accrocheTr.length - 1].t1],
      morceaux: accrocheTr.flatMap((t) => t.morceaux),
      plages: morceaux.filter((m) => m.sequence === 'accroche').map((m) => [m.de, m.a]),
      sequenceSource: (() => {
        const ms = morceaux.filter((m) => m.sequence === 'accroche');
        const s = sequences.find((q) => ms.every((m) => q.plages.some(([a, b]) => m.de >= q.source[0] - 60 && m.a <= q.source[1] + 60)));
        return s ? s.id : null;
      })(),
    }
  : null;

// Musique : tranches qui se suivent avec le même morceau = un seul morceau continu (comme final.py).
const groupes = [];
for (const t of tranches) {
  if (!t.musique) continue;
  const der = groupes[groupes.length - 1];
  if (der && der.nom === t.musique && Math.abs(der.t1 - t.t0) < 0.01) der.t1 = t.t1;
  else groupes.push({ nom: t.musique, titre: TITRES_MUSIQUE[t.musique] ?? null, t0: t.t0, t1: t.t1 });
}
const musique = {
  morceaux: groupes,
  credit: 'Kevin MacLeod (incompetech.com), CC BY 4.0',
  ...reglagesMusique(finalPy),
  partCouverte: r3(longueur(groupes.map((g) => [g.t0, g.t1])) / (dureeTotale - (accroche ? accroche.sortie[1] : 0))),
};

/* ------------------------------------------------------------------ contrôles */

const ε = 0.002;
// Chaque fenêtre (phrases, bouche, textes) tombe dans un morceau gardé : vrai par construction, revérifié ici.
const dansMorceau = (w) => morceaux.some((m) => w[0] >= m.de - ε && w[1] <= m.a + ε);
const toutes = [
  ...phrases.flatMap((x) => [...x.montre, ...x.bouche]),
  ...punchlines.flatMap((x) => x.source),
  ...sousTitres.flatMap((x) => x.source),
];
const horsMorceau = toutes.filter((w) => !dansMorceau(w)).length;
const plagesRG = (p) => phrases.filter((x) => x.p === p && !x.accroche);
const sousSurR = sousTitres.reduce((s, x) => s + x.source.reduce((u, w) => u + recouvrement(parole.R, w), 0), 0);
const sousSurG = sousTitres.reduce((s, x) => s + x.source.reduce((u, w) => u + recouvrement(parole.G, w), 0), 0);
const chevauchementRG = parole.R.reduce((s, w) => s + recouvrement(parole.G, w), 0);
// Morceaux d'une séquence dans l'ordre chronologique et sans recouvrement.
let desordres = 0;
for (const s of sequences) {
  const ms = morceaux.filter((m) => m.sequence === s.id);
  for (let k = 1; k < ms.length; k++) if (ms[k].de < ms[k - 1].a - ε) desordres++;
}
const plansCourts = morceaux.filter((m) => m.a - m.de < 0.35 - 1e-9).length;
const zooms = {};
for (const m of morceaux) zooms[m.zoom] = (zooms[m.zoom] ?? 0) + 1;

const resume = {
  duree: dureeTotale,
  dureeMinSec: `${Math.floor(dureeTotale / 60)} min ${(dureeTotale % 60).toFixed(1)} s`,
  tranches: tranches.length,
  sequences: sequences.length,
  morceaux: morceaux.length,
  morceauxHorsAccroche: morceaux.filter((m) => m.sequence !== 'accroche').length,
  dureeMoyenneMorceau: r3(dureeTotale / morceaux.length),
  morceauxCourts: plansCourts,
  zooms,
  accroche: accroche ? r3(accroche.sortie[1] - accroche.sortie[0]) : 0,
  phrases: { R: plagesRG('R').length, G: plagesRG('G').length, accroche: phrases.filter((x) => x.accroche).length },
  parole: { R: r3(longueur(parole.R)), G: r3(longueur(parole.G)), chevauchementRG: r3(chevauchementRG) },
  persoMontre: { R: r3(longueur(bouche.R)), G: r3(longueur(bouche.G)) },
  punchlines: punchlines.length,
  punchlinesHorsAccroche: punchlines.filter((x) => !x.accroche).length,
  punchlinesParPersonne: { R: punchlines.filter((x) => x.p === 'R').length, G: punchlines.filter((x) => x.p === 'G').length, aucune: punchlines.filter((x) => !x.p).length },
  sousTitres: sousTitres.length,
  sousTitresParPersonne: { R: sousTitres.filter((x) => x.p === 'R').length, G: sousTitres.filter((x) => x.p === 'G').length, aucune: sousTitres.filter((x) => !x.p).length },
  sousTitresTempsSurParole: { R: r3(sousSurR), G: r3(sousSurG) },
  titres: titres.length,
  musique: groupes.map((g) => `${g.nom} ${g.t0}→${g.t1}`),
};
Object.assign(controles, {
  fenetresHorsMorceauGarde: horsMorceau,
  morceauxEnDesordreDansUneSequence: desordres,
  dureeAttendue: '≈ 16 min 30 (vidéo validée : 16 min 33)',
  dureeOk: dureeTotale > 16 * 60 && dureeTotale < 17 * 60,
});

const verite = {
  format: 'arko.banc-verite/1',
  origine: 'Montage à la main par Claude (montage4), validé par Romain. Extrait par tests/banc-reel/verite/extraire-verite.mjs.',
  conventions: {
    temps: 'secondes ; « source » = temps ABSOLU dans la vidéo de la session (3 h 20) ; « sortie » = temps dans la vidéo finale du montage',
    personnes: 'R = Romain (voix faible, ≈ −40 dB) ; G = Guts (Discord, ≈ −25 dB)',
    phrases: '« montre » = perso affiché (≈ 1er mot − 0,1 s → dernier mot + 0,35 s) ; « bouche » = bouche qui bouge (≈ les mots)',
    textes: 'aucun texte prononcé : seulement le nombre de mots (nMots) et de caractères (nCar)',
    accroche: 'l’accroche (hook) est une COPIE d’un passage de la séquence indiquée : ses phrases et textes ont accroche: true',
  },
  duree: dureeTotale,
  resume,
  controles,
  avertissements,
  accroche,
  sequences,
  tranches,
  morceaux,
  parole,
  persoMontre: bouche,
  phrases,
  punchlines,
  sousTitres,
  titres,
  musique,
};

// Garde-fou : aucune chaîne de verite.json ne doit venir du texte des .ass.
const json = JSON.stringify(verite, null, 1);
writeFileSync(SORTIE, json + '\n');
console.log(JSON.stringify({ sortie: SORTIE, ...resume, controles, avertissements }, null, 1));
