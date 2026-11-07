// Banc réel — mesures PAR ÉTAPE de la chaîne v4 (« npm run banc-reel -- --v4 --etape <nom> »), contre la vérité (le
// montage fait à la main). Cœur PUR (`mesuresEtape`, testé dans etapes.test.ts) ; `mesurerEtape` lit les fichiers.
// Temps seulement : jamais de texte de la session.
//
//   parole    : parole de la vérité couverte par les segments ; non-parole (des morceaux gardés à la main) couverte
//   mots      : bilan du nettoyage ; tours de Romain / Guts avec au moins un mot ; mots hors parole de la vérité
//   voix      : les mesures « voix » de mesurer.ts
//   moments   : rires / cris de la vérité trouvés ; moments par minute de son, par genre
//   sequences : séquences par bloc de 20 min (Arko / vérité), nombre, durées
//   coupes    : bords de coupe en pleine parole selon Silero (p ≥ 0,5 des deux côtés), rythme
//   habillage : punchlines / min, zooms, accroche
//   persos    : les mesures « persos » et « sous-titres » de mesurer.ts
//   musique   : présence, et parole de CHACUN baissée d'au moins 6 dB (gainsBaisse rejoué sur la commande)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ETAT_BAISSE_REPOS, gainsBaisse, NIVEAU_PAROLE } from '../../../src/auto/son/baisse';
import { momentsDeParole, momentsParoleV4 } from '../../../src/moteur/audio/musique';
import type { Recette } from '../../../src/recette/types';
import { mesurerDossier, type Pers, type Resultats, type Verite } from './mesurer';
import { bordsDeCoupe, dansUnMot, fusionner, intersection, lireMontage, longueur, recouvrementTotal, sourceA, versSortie, type Iv, type Montage } from './temps';

export const NOMS_MESURES_ETAPES = ['parole', 'mots', 'voix', 'moments', 'sequences', 'coupes', 'habillage', 'persos', 'musique'] as const;
export type NomMesureEtape = (typeof NOMS_MESURES_ETAPES)[number];

export interface LigneEtape {
  nom: string;
  texte: string;
  /** Valeur brute (part 0–1, nombre…) ; null = pas mesurable. */
  valeur: number | null;
  /** Repère : la vérité, ou une cible du contrat (texte libre). */
  repere?: string;
}

export interface ResultatEtape {
  etape: string;
  lignes: LigneEtape[];
  avertissements: string[];
}

/** Ce que lisent les mesures d'étape (analyse.json v4 : champs facultatifs). */
export interface AnalyseEtape {
  parole?: string;
  mots?: [string, number, number, (0 | 1)?][];
  scenes?: { de: number; a: number; garde: boolean; duree: number; bloc?: number }[];
  paroleDetectee?: { methode: string; segments: { de: number; a: number }[]; part: number } | null;
  moments?: { de: number; a: number; t: number; genre: string; force: number }[];
  bilanMots?: Record<string, number> | null;
}

export interface EntreesEtape {
  verite: Verite;
  recette: Recette | null;
  analyse: AnalyseEtape | null;
  /** VAD (cache du banc, toutes les trames) : coupes en pleine parole. */
  vad?: { pas: number; p: Uint8Array } | null;
  /** Son 16 kHz de la source (musique : la commande de la baisse). */
  lireSon?: ((de: number, a: number) => Float32Array) | null;
  /** Mesures de mesurer.ts (voix, persos). */
  resultats?: Resultats | null;
  /** Partie de la session passée dans la chaîne (banc.json). */
  plage?: Iv | null;
  /**
   * Mots NETTOYÉS par l'analyse (nettoyerMotsV4, mode mots ; en mode voix : ceux de la passe « mots » voisine) :
   * « en plein mot » sans les mots bruts de Whisper étirés sur les silences (demande de dev-coupes).
   */
  motsNettoyes?: Iv[] | null;
}

const pc = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1).replace('.', ',')} %`);
const nb = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const part = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const PERS: readonly Pers[] = ['R', 'G'];
const NOM: Record<Pers, string> = { R: 'Romain', G: 'Guts' };

/** Parole de la vérité (fusionnée), et la partie connue de la source : les morceaux gardés à la main. */
function connu(v: Verite): { parole: Record<Pers, Iv[]>; toute: Iv[]; morceaux: Iv[] } {
  const parole = { R: fusionner(v.parole.R), G: fusionner(v.parole.G) };
  return { parole, toute: fusionner([...parole.R, ...parole.G]), morceaux: fusionner(v.morceaux.map((m): Iv => [m.de, m.a])) };
}

/** Complément de `liste` dans `dans` (intervalles fusionnés). */
export function hors(dans: readonly Iv[], liste: readonly Iv[]): Iv[] {
  const res: Iv[] = [];
  const l = fusionner(liste);
  for (const [a, b] of fusionner(dans)) {
    let t = a;
    for (const [x, y] of l) {
      if (y <= t || x >= b) continue;
      if (x > t) res.push([t, x]);
      t = Math.max(t, y);
    }
    if (t < b) res.push([t, b]);
  }
  return res;
}

/** Élargit chaque intervalle de `m` s de chaque côté. */
const elargir = (l: readonly Iv[], m: number): Iv[] => fusionner(l.map(([a, b]): Iv => [a - m, b + m]));

/* ------------------------------------------------------------------ parole */

function parole(e: EntreesEtape): LigneEtape[] {
  const seg = fusionner((e.analyse?.paroleDetectee?.segments ?? []).map((s): Iv => [s.de, s.a]));
  const c = connu(e.verite);
  const lignes: LigneEtape[] = [];
  const pd = e.analyse?.paroleDetectee;
  lignes.push({ nom: 'Méthode, segments', texte: pd ? `${pd.methode}, ${seg.length} segments, ${pc(pd.part)} de la source` : 'pas de parole détectée', valeur: seg.length });
  for (const p of PERS) {
    const x = part(longueur(intersection(c.parole[p], seg)), longueur(c.parole[p]));
    lignes.push({ nom: `Parole de ${NOM[p]} couverte`, texte: pc(x), valeur: x, repere: '≥ 90 % (Silero : 68 / 73 % des trames de leurs mots)' });
  }
  const nonParole = hors(c.morceaux, elargir(c.toute, 0.3));
  const fp = part(longueur(intersection(nonParole, seg)), longueur(nonParole));
  lignes.push({ nom: 'Non-parole des morceaux gardés couverte', texte: `${pc(fp)} (${nb(longueur(nonParole), 0)} s de non-parole connue)`, valeur: fp, repere: 'le plus bas possible (zones d\'avant : 55 %)' });
  return lignes;
}

/* ------------------------------------------------------------------ mots */

function mots(e: EntreesEtape): LigneEtape[] {
  const lignes: LigneEtape[] = [];
  const b = e.analyse?.bilanMots;
  if (b) lignes.push({ nom: 'Nettoyage', texte: `${b.avant} → ${b.apres} mots ; ${b.piles} piles (${b.motsDePiles} mots, ${b.repartis} répartis) ; ${b.horsParole} hors parole ; ${b.etires} étirés ; ${b.recales} recalés`, valeur: b.apres ?? null });
  else lignes.push({ nom: 'Nettoyage', texte: e.analyse?.parole === 'voix' ? 'mode voix : pas de mots' : 'pas de bilan (étape d\'avant ?)', valeur: null });
  const avecTexte = (e.analyse?.mots ?? []).filter((m) => m[0].trim()).map((m): Iv => [m[1], m[2]]);
  const milieux = avecTexte.map(([a, b2]) => (a + b2) / 2).sort((x, y) => x - y);
  const aUnMot = ([a, b2]: Iv) => {
    let lo = 0;
    let hi = milieux.length;
    while (lo < hi) {
      const mi = (lo + hi) >> 1;
      if (milieux[mi]! < a) lo = mi + 1;
      else hi = mi;
    }
    return lo < milieux.length && milieux[lo]! <= b2;
  };
  const c = connu(e.verite);
  for (const p of PERS) {
    const tours = e.verite.parole[p];
    const n = tours.filter(aUnMot).length;
    lignes.push({ nom: `Tours de ${NOM[p]} avec au moins un mot`, texte: `${n} / ${tours.length} (${pc(part(n, tours.length))})`, valeur: part(n, tours.length), repere: p === 'R' ? 'avant : 60 %' : undefined });
  }
  const dansConnu = avecTexte.filter(([a, b2]) => recouvrementTotal(c.morceaux, [[a, b2]]) > 0);
  const horsP = dansConnu.filter(([a, b2]) => recouvrementTotal(elargir(c.toute, 0.3), [[a, b2]]) === 0).length;
  lignes.push({ nom: 'Mots hors de la parole de la vérité (± 0,3 s)', texte: `${horsP} / ${dansConnu.length} mots des morceaux gardés (${pc(part(horsP, dansConnu.length))})`, valeur: part(horsP, dansConnu.length) });
  return lignes;
}

/* ------------------------------------------------------------------ moments */

const RIRES = new Set(['rit', 'mortDeRire']);
const CRIS = new Set(['crie', 'hurle', 'panique']);
const GENRES_RIRE = new Set(['rire', 'fouRire']);
const GENRES_CRI = new Set(['cri', 'exclamation']);

function moments(e: EntreesEtape): LigneEtape[] {
  const ms = e.analyse?.moments ?? [];
  const lignes: LigneEtape[] = [];
  const trouve = (emos: Set<string>, genres: Set<string>) => {
    const ph = e.verite.phrases.filter((x) => emos.has(x.emo) && !x.accroche);
    const ok = ph.filter((x) => x.bouche.some(([a, b]) => ms.some((m) => genres.has(m.genre) && m.a >= a - 0.5 && m.de <= b + 0.5))).length;
    return { ok, n: ph.length };
  };
  const r = trouve(RIRES, GENRES_RIRE);
  const c = trouve(CRIS, GENRES_CRI);
  lignes.push({ nom: 'Rires de la vérité trouvés (rire / fou rire, ± 0,5 s)', texte: `${r.ok} / ${r.n}`, valeur: part(r.ok, r.n) });
  lignes.push({ nom: 'Cris de la vérité trouvés (cri / exclamation, ± 0,5 s)', texte: `${c.ok} / ${c.n}`, valeur: part(c.ok, c.n) });
  const sonActif = e.analyse?.paroleDetectee ? Math.max(1, longueur(fusionner(e.analyse.paroleDetectee.segments.map((s): Iv => [s.de, s.a])))) : null;
  const parGenre = new Map<string, number>();
  for (const m of ms) parGenre.set(m.genre, (parGenre.get(m.genre) ?? 0) + 1);
  lignes.push({
    nom: 'Moments par genre (par minute de parole)',
    texte: [...parGenre].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}${sonActif ? ` (${nb((n * 60) / sonActif, 2)})` : ''}`).join(' · ') || 'aucun',
    valeur: ms.length,
  });
  return lignes;
}

/* ------------------------------------------------------------------ séquences */

function sequences(e: EntreesEtape): LigneEtape[] {
  const sc = (e.analyse?.scenes ?? []).filter((s) => s.garde);
  const bloc = 1200;
  const nBlocs = Math.ceil(Math.max(...e.verite.sequences.flatMap((s) => s.plages.map((p) => p[1])), ...sc.map((s) => s.a), 1) / bloc);
  const arko = new Array<number>(nBlocs).fill(0);
  const verite = new Array<number>(nBlocs).fill(0);
  for (const s of sc) arko[Math.min(nBlocs - 1, Math.floor(((s.de + s.a) / 2) / bloc))]!++;
  for (const s of e.verite.sequences) {
    const m = (s.plages[0]![0] + s.plages[s.plages.length - 1]![1]) / 2;
    verite[Math.min(nBlocs - 1, Math.floor(m / bloc))]!++;
  }
  const durees = sc.map((s) => s.a - s.de).sort((a, b) => a - b);
  const med = durees.length ? durees[Math.floor(durees.length / 2)]! : 0;
  const retrouvees = e.verite.sequences.filter((s) => recouvrementTotal(fusionner(sc.map((x): Iv => [x.de, x.a])), s.plages) >= 0.5 * s.duree).length;
  return [
    { nom: 'Séquences gardées', texte: `${sc.length} (vérité ${e.verite.sequences.length})`, valeur: sc.length },
    { nom: 'Par bloc de 20 min de source (Arko / vérité)', texte: arko.map((n, k) => `${k * 20}′ ${n}/${verite[k]}`).join(' · '), valeur: null },
    { nom: 'Durée de source par séquence (min / médiane / max)', texte: durees.length ? `${nb(durees[0]!, 0)} / ${nb(med, 0)} / ${nb(durees[durees.length - 1]!, 0)} s ; après coupes ${nb(sc.reduce((t, s) => t + s.duree, 0) / Math.max(1, sc.length), 0)} s en moyenne` : '—', valeur: med, repere: 'histoires de 30 à 120 s, ~55 s gardées' },
    { nom: 'Séquences de la vérité gardées à moitié', texte: `${retrouvees} / ${e.verite.sequences.length}`, valeur: part(retrouvees, e.verite.sequences.length), repere: '≥ 16 / 19' },
  ];
}

/* ------------------------------------------------------------------ coupes */

/** Bords de coupe en pleine parole : VAD ≥ seuil juste avant ET juste après le bord (± 60 ms), temps source. */
export function coupesEnPleineParole(m: Montage, vad: { pas: number; p: Uint8Array }, seuil = 0.5, ecart = 0.06): { n: number; total: number } {
  const p = (t: number) => {
    const k = Math.floor(t / vad.pas);
    return k >= 0 && k < vad.p.length ? vad.p[k]! / 255 : 0;
  };
  const bords = bordsDeCoupe(m).filter((b) => b.plan >= m.nbAccroche);
  const n = bords.filter((b) => p(b.ts - ecart) >= seuil && p(b.ts + ecart) >= seuil).length;
  return { n, total: bords.length };
}

function coupes(e: EntreesEtape): LigneEtape[] {
  if (!e.recette) return [{ nom: 'Coupes', texte: 'pas de recette', valeur: null }];
  const m = lireMontage(e.recette);
  const lignes: LigneEtape[] = [];
  if (e.vad) {
    const c = coupesEnPleineParole(m, e.vad);
    lignes.push({ nom: 'Bords en pleine parole (Silero ≥ 0,5 des deux côtés, ± 60 ms)', texte: `${c.n} / ${c.total} (${pc(part(c.n, c.total))})`, valeur: part(c.n, c.total), repere: '≤ 7 % (la main : 7 %)' });
    // La vérité au même critère (ses morceaux).
    const plansV = e.verite.morceaux.map((x, i) => ({ i, video: true, de: x.de, a: x.a, vit: 1, t0: x.t0, t1: x.t1, tFige: x.t1 }));
    const mv: Montage = { src: 's1', duree: e.verite.duree, plans: plansV, nbAccroche: e.verite.accroche?.morceaux.length ?? 0, finAccroche: 0, scenario: null };
    const cv = coupesEnPleineParole(mv, e.vad);
    lignes.push({ nom: '… la vérité au même critère', texte: `${cv.n} / ${cv.total} (${pc(part(cv.n, cv.total))})`, valeur: part(cv.n, cv.total) });
  } else lignes.push({ nom: 'Bords en pleine parole', texte: 'pas de VAD (banc-cache/vad-v5-continu.u8)', valeur: null });
  if (e.motsNettoyes && e.motsNettoyes.length > 0) {
    // Mêmes mots pour Arko et la vérité : ceux qu'Arko garde après nettoyage (± 30 ms, comme cuts.pleinMot).
    const mots = e.motsNettoyes;
    const dans = (mm: Montage) => {
      const b = bordsDeCoupe(mm).filter((x) => x.plan >= mm.nbAccroche);
      return { n: b.filter((x) => dansUnMot(mots, x.ts, 0.03)).length, total: b.length };
    };
    const a = dans(m);
    const plansV = e.verite.morceaux.map((x, i) => ({ i, video: true, de: x.de, a: x.a, vit: 1, t0: x.t0, t1: x.t1, tFige: x.t1 }));
    const v = dans({ src: 's1', duree: e.verite.duree, plans: plansV, nbAccroche: e.verite.accroche?.morceaux.length ?? 0, finAccroche: 0, scenario: null });
    lignes.push({ nom: 'En plein mot (mots de l\'analyse : nettoyés en v4, ± 30 ms)', texte: `${a.n} / ${a.total} (${pc(part(a.n, a.total))}) ; vérité ${v.n} / ${v.total} (${pc(part(v.n, v.total))})`, valeur: part(a.n, a.total), repere: '≤ la vérité aux mêmes mots' });
  }
  const video = m.plans.slice(m.nbAccroche).filter((p) => p.video);
  const duree = m.duree - m.finAccroche;
  lignes.push({ nom: 'Rythme', texte: `${video.length} plans, ${nb(video.length / Math.max(1, duree / 60), 1)} / min, ${nb(duree / Math.max(1, video.length), 2)} s en moyenne`, valeur: duree / Math.max(1, video.length), repere: `vérité ${e.verite.morceaux.length} morceaux, ${nb(e.verite.duree / e.verite.morceaux.length, 2)} s` });
  return lignes;
}

/* ------------------------------------------------------------------ habillage */

function habillage(e: EntreesEtape): LigneEtape[] {
  if (!e.recette) return [{ nom: 'Habillage', texte: 'pas de recette', valeur: null }];
  const r = e.recette;
  const m = lireMontage(r);
  const min = Math.max(1, m.duree / 60);
  const np = r.sousTitres?.punchlines?.length ?? 0;
  const vmin = e.verite.duree / 60;
  const zooms = r.plans.map((p) => p.zoomFixe?.force ?? 1);
  const forts = zooms.filter((z) => z >= 1.25).length;
  const legers = zooms.filter((z) => z > 1 && z < 1.25).length;
  const zv = e.verite.morceaux.map((x) => x.zoom);
  const acc = m.nbAccroche > 0 ? m.finAccroche : m.plans[0] ? m.plans[0].t1 : 0;
  return [
    { nom: 'Punchlines', texte: `${np} (${nb(np / min, 1)} / min)`, valeur: np / min, repere: `vérité ${e.verite.punchlines.length} (${nb(e.verite.punchlines.length / vmin, 1)} / min)` },
    { nom: 'Plans zoomés fort / léger', texte: `${forts} / ${legers} sur ${r.plans.length} (${pc(part(forts, r.plans.length))} / ${pc(part(legers, r.plans.length))})`, valeur: part(forts + legers, r.plans.length), repere: `vérité ${pc(part(zv.filter((z) => z >= 1.25).length, zv.length))} / ${pc(part(zv.filter((z) => z > 1 && z < 1.25).length, zv.length))}` },
    { nom: 'Accroche', texte: `${nb(acc, 1)} s${m.plans[0] ? `, source ${nb(m.plans[0].de, 0)} s` : ''}`, valeur: acc, repere: e.verite.accroche ? `vérité ${nb(e.verite.accroche.sortie[1] - e.verite.accroche.sortie[0], 1)} s, source ${nb(e.verite.accroche.plages[0]![0], 0)} s` : undefined },
    { nom: 'Chapitres, textes', texte: `${r.chapitres?.length ?? 0} chapitres, ${r.textes.length} textes`, valeur: r.chapitres?.length ?? 0 },
  ];
}

/* ------------------------------------------------------------------ musique */

/**
 * Baisse de la musique (dB, ≥ 0) toutes les 20 ms du montage, en rejouant le compresseur d'Arko (gainsBaisse) sur la
 * commande que le mixeur lui donnerait : le son des plans (16 kHz ici), seulement pendant la parole connue, et au
 * moins NIVEAU_PAROLE avec `baisseSur: 'parole'`. Approximation : son des plans sans leurs fondus ni volumes.
 */
export function baisseDuMontage(r: Recette, lireSon: (de: number, a: number) => Float32Array, f = 16000): { pas: number; db: Float32Array } | null {
  const piste = r.musique;
  if (!piste || piste.morceaux.length === 0 || piste.baisse === false) return null;
  const m = lireMontage(r);
  if (!m.scenario) return null;
  const surParole = piste.baisseSur === 'parole';
  const parole = surParole ? momentsParoleV4(r, m.scenario) : momentsDeParole(r, m.scenario);
  const n = Math.ceil(m.duree * f);
  const cle = new Float32Array(n);
  for (const p of m.plans) {
    if (!p.video) continue;
    const x = lireSon(p.de, p.de + (p.tFige - p.t0) * p.vit);
    const k0 = Math.round(p.t0 * f);
    for (let i = 0; i < x.length && k0 + i < n; i++) cle[k0 + i] = x[Math.min(x.length - 1, Math.floor(i * p.vit))]!;
  }
  if (parole) {
    const garde = new Uint8Array(n);
    for (const q of parole) garde.fill(1, Math.max(0, Math.ceil(q.t0 * f)), Math.min(n, Math.ceil(q.t1 * f)));
    for (let k = 0; k < n; k++) {
      if (!garde[k]) cle[k] = 0;
      else if (surParole && Math.abs(cle[k]!) < NIVEAU_PAROLE) cle[k] = NIVEAU_PAROLE;
    }
  }
  const gains = gainsBaisse(cle, f, { ...ETAT_BAISSE_REPOS });
  const pas = 0.02;
  const db = new Float32Array(Math.ceil(m.duree / pas));
  for (let k = 0; k < db.length; k++) {
    const g = gains[Math.min(n - 1, Math.floor((k + 0.5) * pas * f))] ?? 1;
    db[k] = -20 * Math.log10(Math.max(1e-6, g));
  }
  return { pas, db };
}

function musique(e: EntreesEtape): LigneEtape[] {
  const r = e.recette;
  if (!r) return [{ nom: 'Musique', texte: 'pas de recette', valeur: null }];
  const lignes: LigneEtape[] = [];
  const piste = r.musique;
  lignes.push({ nom: 'Piste', texte: piste ? `${piste.morceaux.length} morceaux, baisse ${piste.baisse === false ? 'non' : 'oui'}${piste.baisseSur ? ` (sur la ${piste.baisseSur})` : ''}, vol ${piste.vol ?? 'défaut'}` : 'AUCUNE', valeur: piste ? piste.morceaux.length : 0 });
  if (!piste || !e.lireSon) return lignes;
  const b = baisseDuMontage(r, e.lireSon);
  if (!b) return lignes;
  const m = lireMontage(r);
  for (const p of PERS) {
    const sorties = e.verite.parole[p].flatMap((w) => versSortie(m, w, m.nbAccroche));
    let n = 0;
    let ok = 0;
    for (const [a, z] of sorties) {
      for (let k = Math.ceil(a / b.pas); k < Math.floor(z / b.pas); k++) {
        n++;
        if ((b.db[k] ?? 0) >= 6) ok++;
      }
    }
    lignes.push({ nom: `Parole de ${NOM[p]} baissée d'au moins 6 dB`, texte: `${pc(part(ok, n))} (${nb((n * b.pas), 0)} s de sa parole dans le montage)`, valeur: part(ok, n), repere: '≥ 90 %' });
  }
  // Hors parole : la musique doit remonter (baisse < 3 dB).
  let n = 0;
  let haut = 0;
  for (let k = Math.ceil(m.finAccroche / b.pas); k < b.db.length; k++) {
    const t = (k + 0.5) * b.pas;
    const ts = sourceA(m, t);
    if (ts === null) continue;
    const parle = PERS.some((p) => e.verite.parole[p].some(([x, y]) => ts >= x - 0.3 && ts <= y + 0.6));
    if (parle) continue;
    n++;
    if (b.db[k]! < 3) haut++;
  }
  lignes.push({ nom: 'Hors parole : musique à moins de 3 dB de baisse', texte: pc(part(haut, n)), valeur: part(haut, n) });
  return lignes;
}

/* ------------------------------------------------------------------ voix, persos (mesurer.ts) */

function depuisResultats(e: EntreesEtape, groupes: readonly string[]): LigneEtape[] {
  const r = e.resultats;
  if (!r) return [{ nom: groupes.join(', '), texte: 'mesures de mesurer.ts absentes', valeur: null }];
  return r.mesures.filter((x) => groupes.includes(x.groupe)).map((x) => ({ nom: x.nom, texte: `${x.texte}${x.detail ? ` — ${x.detail}` : ''}`, valeur: typeof x.valeur === 'number' ? x.valeur : null, repere: x.cible }));
}

/** Les mesures d'une étape (pur). */
export function mesuresEtape(nom: string, e: EntreesEtape): ResultatEtape {
  const avertissements: string[] = [];
  if (e.plage) avertissements.push(`Chaîne lancée sur ${e.plage[0]}–${e.plage[1]} s : la vérité hors de cette partie compte quand même ici (mesures d'étape non réduites).`);
  const f: Record<NomMesureEtape, () => LigneEtape[]> = {
    parole: () => parole(e),
    mots: () => mots(e),
    voix: () => depuisResultats(e, ['voix']),
    moments: () => moments(e),
    sequences: () => sequences(e),
    coupes: () => coupes(e),
    habillage: () => habillage(e),
    persos: () => depuisResultats(e, ['persos', 'sousTitres']),
    musique: () => musique(e),
  };
  const fn = f[nom as NomMesureEtape];
  if (!fn) return { etape: nom, lignes: [], avertissements: [`Étape inconnue : ${nom} (${NOMS_MESURES_ETAPES.join(', ')}).`] };
  return { etape: nom, lignes: fn(), avertissements };
}

/* ------------------------------------------------------------------ fichiers */

const CACHE = process.env.BANC_CACHE ?? '/home/claude/banc-cache';

function lireJson<T>(chemin: string): T | null {
  return existsSync(chemin) ? (JSON.parse(readFileSync(chemin, 'utf8')) as T) : null;
}

/** Lit le dossier de sortie, la vérité, la VAD et le son du cache, puis mesure l'étape. */
export async function mesurerEtape(nom: string, dossier: string, dossierVerite: string): Promise<ResultatEtape> {
  const verite = lireJson<Verite>(join(dossierVerite, 'verite.json'));
  if (!verite) throw new Error(`verite.json introuvable dans ${dossierVerite}`);
  const recette = lireJson<Recette>(join(dossier, 'recette.json'));
  const analyse = lireJson<AnalyseEtape>(join(dossier, 'analyse.json'));
  const banc = lireJson<{ plage?: { de: number; a: number } | null }>(join(dossier, 'banc.json'));
  let vad: EntreesEtape['vad'] = null;
  const fv = join(CACHE, 'vad-v5-continu.u8');
  const mv = lireJson<{ pas: number }>(join(CACHE, 'vad-v5-continu.json'));
  if (existsSync(fv) && mv) {
    const b = readFileSync(fv);
    vad = { pas: mv.pas, p: new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
  }
  let lireSon: EntreesEtape['lireSon'] = null;
  const fs16 = join(CACHE, 'son-16k.f32');
  if (nom === 'musique' && existsSync(fs16)) {
    const { openSync, readSync } = await import('node:fs');
    const fd = openSync(fs16, 'r');
    lireSon = (de, a) => {
      const i0 = Math.max(0, Math.round(de * 16000));
      const n = Math.max(0, Math.round(a * 16000) - i0);
      const buf = Buffer.alloc(n * 4);
      readSync(fd, buf, 0, buf.length, i0 * 4);
      return new Float32Array(buf.buffer, buf.byteOffset, n).slice();
    };
  }
  const resultats = nom === 'voix' || nom === 'persos' ? await mesurerDossier(dossier, dossierVerite) : null;
  // Mots nettoyés : ceux de cette analyse (mode mots), sinon ceux de la passe « mots » voisine (même combinaison).
  const avecTexte = (a: AnalyseEtape | null) => (a?.mots ?? []).filter((x) => x[0].trim()).map((x): Iv => [x[1], x[2]]);
  let motsNettoyes = avecTexte(analyse);
  if (motsNettoyes.length === 0) motsNettoyes = avecTexte(lireJson<AnalyseEtape>(join(dossier, '..', 'mots', 'analyse.json')));
  motsNettoyes.sort((x, y) => x[0] - y[0]);
  return mesuresEtape(nom, { verite, recette, analyse, vad, lireSon, resultats, plage: banc?.plage ? [banc.plage.de, banc.plage.a] : null, motsNettoyes });
}

export function afficherEtape(r: ResultatEtape): string {
  const l = r.lignes.map((x) => `  ${x.nom.padEnd(58)} ${x.texte}${x.repere ? `   [${x.repere}]` : ''}`);
  return [...l, ...r.avertissements.map((a) => `  ! ${a}`)].join('\n');
}
