// Persos v4 (dev-persos, 7/11/2026), fonctions PURES : émotion et bouche d'une PHRASE (un tour de parole recoupé aux
// fins de phrase par voix/persos-v4.ts), pour le Best-of v4. Différences avec la v3 (emotions.ts, bouche.ts, qui
// restent pour les autres montages) :
//  - les rires et cris viennent des MOMENTS v4 (moments/moments.ts : règles calibrées, relatives à chaque voix), plus
//    du détecteur de débit des syllabes d'avant ;
//  - « dit fort » est RELATIF au niveau habituel de la voix de la personne (la voix faible de Romain, ≈ 11 dB sous
//    celle de Guts, criait sans jamais passer les −6 / −16 dBFS d'avant) ;
//  - la bouche ne s'ouvre que si le détecteur de voix entend parler (p ≥ 0,5) ET que l'énergie dépasse le niveau de
//    la personne − 10 dB : plus de bouche qui bouge sur les sons du jeu.
// La situation de jeu reste celle des mots (situations-mots.ts, inchangée).

import { estJuron, motNu } from '../auto/habillage/jurons';
import type { SignauxSource } from '../auto/types';
import type { EnveloppeDb } from '../auto/types-v3';
import type { MomentV4, ProbasVad } from '../auto/types-v4';
import type { Emotion, Mot, Sec, TourDeParole } from '../recette/types';
import { BOUCHE, bitsBouche, type ContexteTours } from './bouche';
import { FRIME, MOQUEUR, PANIQUE, SURPRIS } from './emotions';
import { situationDuTour } from './situations-mots';

/** Règles chiffrées de la v4 (dB RELATIFS au niveau habituel de la voix de la personne, sauf mention). */
export const REGLES_EMOTION_V4 = {
  /** Rire fort (force du moment) ou long (s) → « mort de rire ». */
  rireFort: 0.7,
  rireLong: 3,
  /** Un moment compte pour la phrase s'il y passe au moins `partMoment` de lui-même, ou `tempsMoment` s, ou son sommet. */
  partMoment: 0.5,
  tempsMoment: 0.3,
  /**
   * Un moment « cri » ne fait crier le perso que s'il est au moins `criDb` au-dessus du niveau habituel de SA voix
   * (indice « +N dB » du moment : la règle du contrat, + 8 dB) ; sur la vraie session, les cris plus doux (+ 5 à + 7 dB)
   * tombent surtout sur des phrases que la main a laissées « parle ». « hurle » : l'indice du moment, ou (moment sans
   * indices) au moins `hurleDb` au-dessus du niveau de SA voix.
   */
  criDb: 8,
  hurleDb: 12,
  /** Phrase ou mot « dit fort » : un pic au moins `forteDb` au-dessus du niveau habituel de SA voix. */
  forteDb: 3,
  /** Surprise : calme avant (1,5 s, 6 dB plus bas que la phrase) ; pic de son z ≥ 6 → « choqué ». */
  calme: 1.5,
  ecartCalmeDb: 6,
  picChoque: 6,
} as const;

/** Bouche v4 : seuil du détecteur de voix ; marge sous le niveau de la personne (celle de bouche.ts). */
export const BOUCHE_V4 = { vad: 0.5, margeDb: BOUCHE.margeDb } as const;

/** Ce qu'il faut pour compléter des phrases en v4 (en plus de ContexteTours). */
export interface ContexteToursV4 extends ContexteTours {
  /** Probabilités de voix (Silero) : bouche fermée là où personne ne parle. Absent / null : l'énergie seule. */
  vad?: ProbasVad | null;
  /** Moments forts v4 (rire, fou rire, cri…). */
  moments?: readonly MomentV4[];
}

/** Ce que lit emotionDuTourV4 pour UNE phrase. */
export interface IndicesPhrase {
  /** Énergie de la bande voix (la piste de la personne, ou le mélange). */
  env: EnveloppeDb | null;
  /** Niveau habituel de la voix de la personne (dB, même échelle que `env`) ; null = inconnu (règles d'énergie sautées). */
  niveau: number | null;
  moments: readonly MomentV4[];
  signaux: SignauxSource | null;
}

/**
 * Mots triés par début, pour trouver vite ceux d'un passage (une session de 2 h a ≈ 20 000 mots et ≈ 3 000 phrases).
 * `entre(de, a)` : les mots qui touchent [de, a] (à trier encore par l'appelant s'il veut une règle plus fine).
 */
export class IndexMots {
  readonly mots: readonly Mot[];
  private readonly longueur: Sec;
  constructor(mots: readonly Mot[]) {
    let trie = true;
    for (let i = 1; i < mots.length && trie; i++) if (mots[i]![1] < mots[i - 1]![1]) trie = false;
    this.mots = trie ? mots : [...mots].sort((x, y) => x[1] - y[1]);
    this.longueur = this.mots.reduce((m, w) => Math.max(m, w[2] - w[1]), 0);
  }
  /** Premier indice dont le début est ≥ t. */
  private premier(t: Sec): number {
    let bas = 0;
    let haut = this.mots.length;
    while (bas < haut) {
      const m = (bas + haut) >> 1;
      if (this.mots[m]![1] < t) bas = m + 1;
      else haut = m;
    }
    return bas;
  }
  /** Mots qui touchent [de, a] (fin > de et début < a). */
  entre(de: Sec, a: Sec): Mot[] {
    const res: Mot[] = [];
    for (let i = this.premier(de - this.longueur - 1e-9); i < this.mots.length && this.mots[i]![1] < a; i++) if (this.mots[i]![2] > de) res.push(this.mots[i]!);
    return res;
  }
  /** Mots dont le milieu est dans [de, a[. */
  milieuDans(de: Sec, a: Sec): Mot[] {
    return this.entre(de, a).filter((m) => (m[1] + m[2]) / 2 >= de && (m[1] + m[2]) / 2 < a);
  }
}

/** Plus forte énergie (dB) de `env` sur [de, a[ (−∞ si vide). */
export function maxEnergie(env: EnveloppeDb | null, de: Sec, a: Sec): number {
  if (!env) return -Infinity;
  let m = -Infinity;
  for (let i = Math.max(0, Math.floor(de / env.pas + 1e-9)); i < Math.min(env.db.length, Math.ceil(a / env.pas - 1e-9)); i++) if (env.db[i]! > m) m = env.db[i]!;
  return m;
}

/** Énergie moyenne (dB, moyenne des puissances) de `env` sur [de, a[ (−∞ si vide). */
function moyEnergie(env: EnveloppeDb, de: Sec, a: Sec): number {
  let t = 0;
  let n = 0;
  for (let i = Math.max(0, Math.floor(de / env.pas + 1e-9)); i < Math.min(env.db.length, Math.ceil(a / env.pas - 1e-9)); i++) {
    t += 10 ** (env.db[i]! / 10);
    n++;
  }
  return n > 0 && t > 0 ? 10 * Math.log10(t / n) : -Infinity;
}

/** « +N dB » dans les indices d'un moment (au-dessus du niveau de SA voix) ; null sans chiffre. */
function dbDeLIndice(m: MomentV4): number | null {
  for (const x of m.indices) {
    const r = /([+−-]\s?\d+(?:[.,]\d+)?)\s*dB/.exec(x);
    if (r) return Number(r[1]!.replace('−', '-').replace(/\s/g, '').replace(',', '.'));
  }
  return null;
}

/** Le moment compte-t-il pour la phrase [ts, fin] de la personne p ? */
function momentDansPhrase(m: MomentV4, ts: Sec, fin: Sec, p: string): boolean {
  if (m.p !== undefined && m.p !== p) return false;
  const rec = Math.min(m.a, fin) - Math.max(m.de, ts);
  if (rec <= 0) return m.t >= ts && m.t < fin;
  const R = REGLES_EMOTION_V4;
  return (m.t >= ts && m.t < fin) || rec >= R.tempsMoment || rec >= R.partMoment * Math.max(1e-9, m.a - m.de);
}

/**
 * Émotion d'une phrase (v4). Dans l'ordre : fou rire / rire (moments) → cri (moment ; « hurle » si son indice le dit,
 * ou, pour un moment sans indices, ≥ +12 dB sur SA voix) → juron dit fort (+3 dB sur SA voix ; 2 : rage) → « quoi ?! »
 * après un calme (pic : choqué) → frime → moquerie → panique dite fort → « parle » (la situation choisit alors la sienne).
 */
export function emotionDuTourV4(tour: TourDeParole, mots: readonly Mot[], c: IndicesPhrase): Emotion {
  const R = REGLES_EMOTION_V4;
  const { ts, fin, p } = tour;
  const dedans = c.moments.filter((m) => momentDansPhrase(m, ts, fin, p));
  // 1. Rire (les moments, relatifs à la session et à la voix).
  const rires = dedans.filter((m) => m.genre === 'rire' || m.genre === 'fouRire');
  if (rires.length > 0) return rires.some((m) => m.genre === 'fouRire' || m.force >= R.rireFort || m.a - m.de >= R.rireLong) ? 'mortDeRire' : 'rit';
  // 2. Cri.
  const fortAuDessus = (de: Sec, a: Sec, db: number) => c.niveau !== null && maxEnergie(c.env, de, a) >= c.niveau + db;
  const cris = dedans.filter((m) => m.genre === 'cri');
  // « hurle » : l'indice du moment (relatif à SA voix, moments/regles.ts) ; un moment sans indices (étape d'avant) :
  // son énergie, ≥ +12 dB sur le niveau habituel de SA voix. « crie » : l'indice « +N dB » ≥ + 8 (sans chiffre : oui).
  const hurle = (m: MomentV4) => (m.indices.length > 0 ? m.indices.some((x) => /hurl/i.test(x)) : fortAuDessus(m.de, m.a, R.hurleDb));
  const crie = (m: MomentV4) => hurle(m) || (dbDeLIndice(m) ?? Infinity) >= R.criDb;
  if (cris.some(hurle)) return 'hurle';
  if (cris.some(crie)) return 'crie';
  // 3. Juron dit fort (relatif à SA voix ; sans énergie connue : tout juron compte, comme la v3 sans signaux).
  const nus = mots.map((m) => motNu(m[0]));
  const ditFort = (m: Mot) => m[3] === 1 || m[0].includes('!') || c.niveau === null || !c.env || fortAuDessus(m[1], m[2], R.forteDb);
  const jurons = mots.filter((m) => estJuron(m[0]) && ditFort(m));
  if (jurons.length >= 2) return 'rage';
  if (jurons.length === 1) return 'enerve';
  // 4. « Quoi ?! » après un calme (déjà relatif : la phrase contre ce qui la précède).
  if (nus.some((n) => SURPRIS.has(n)) || mots.some((m) => /\?!|!\?/.test(m[0]))) {
    const env = c.env;
    const calme = !env || moyEnergie(env, Math.max(0, ts - R.calme), ts) < moyEnergie(env, ts, fin) - R.ecartCalmeDb;
    if (calme) return c.signaux?.pics.some((x) => x.ts >= ts && x.ts < fin && x.z >= R.picChoque) ? 'choque' : 'surpris';
  }
  // 5. Frime, 6. moquerie.
  const suite = nus.join(' ');
  if (nus.some((n) => FRIME.has(n)) || /\btrop fort\b/.test(suite)) return 'frime';
  if (nus.some((n) => MOQUEUR.has(n))) return 'moqueur';
  // 7. Panique dite fort (relatif à SA voix).
  const phraseForte = mots.some((m) => m[3] === 1 || m[0].includes('!')) || c.niveau === null || !c.env || fortAuDessus(ts, fin, R.forteDb);
  if ((nus.some((n) => PANIQUE.has(n)) || /\bnon non\b/.test(suite)) && phraseForte) return 'panique';
  return 'parle';
}

/** Plus grande probabilité de voix (0 à 1) sur [t, t + 0,04[. */
function vadSur(v: ProbasVad, t: Sec): number {
  let m = 0;
  for (let k = Math.max(0, Math.floor(t / v.pas + 1e-9)); k < Math.min(v.p.length, Math.ceil((t + BOUCHE.pas) / v.pas - 1e-9)); k++) if (v.p[k]! > m) m = v.p[k]!;
  return m / 255;
}

/**
 * Bits de bouche v4 de [de, a] : ouverte si l'énergie dépasse `seuilDb` ET (avec la VAD) que la voix est entendue
 * (p ≥ 0,5). Même format que bouche.ts (base64, pas de 0,04 s, tenue 0,08 s) : l'aperçu et l'export lisent pareil.
 */
export function bitsBoucheV4(env: EnveloppeDb, vad: ProbasVad | null | undefined, de: Sec, a: Sec, seuilDb: number): string {
  if (!vad) return bitsBouche(env, de, a, seuilDb);
  return bitsBouche(env, de, a, seuilDb, (t) => vadSur(vad, t) >= BOUCHE_V4.vad);
}

function mediane(env: EnveloppeDb, de: Sec, a: Sec): number {
  const v: number[] = [];
  for (let i = Math.floor(de / env.pas); i < Math.ceil(a / env.pas) && i < env.db.length; i++) if (Number.isFinite(env.db[i]!)) v.push(env.db[i]!);
  if (v.length === 0) return -60;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)]!;
}

/**
 * Ajoute `emo` (emotionDuTourV4), `sit` (situationDuTour, inchangée) et `b` (bitsBoucheV4) à des PHRASES ; renvoie de
 * NOUVEAUX tours. Même rôle que completerTours (bouche.ts), donné à definirQuiParle par l'option `completer`.
 */
export function completerToursV4(tours: readonly TourDeParole[], c: ContexteToursV4): TourDeParole[] {
  const index = new IndexMots(c.mots ?? []);
  const moments = [...(c.moments ?? [])].sort((x, y) => x.de - y.de);
  const longMoment = moments.reduce((m, x) => Math.max(m, x.a - x.de), 0);
  return tours.map((t) => {
    const res: TourDeParole = { ...t };
    const env = c.enveloppe?.(t) ?? null;
    const niveau = c.niveaux?.[t.p] ?? null;
    const dedans = index.milieuDans(t.ts, t.fin);
    const proches = moments.filter((m) => m.de < t.fin && m.de > t.ts - longMoment - 1e-9);
    const emo = emotionDuTourV4(t, dedans, { env, niveau, moments: proches, signaux: c.signaux ?? null });
    res.emo = emo;
    // Situation : mots du tour et ± 1,5 s (situations-mots.ts filtre lui-même ; on ne lui donne que les voisins).
    const sit = situationDuTour(t, index.entre(t.ts - 2, t.fin + 2));
    if (sit) res.sit = sit;
    else delete res.sit;
    if (env) res.b = bitsBoucheV4(env, c.vad, t.ts, t.fin, (niveau ?? mediane(env, t.ts, t.fin)) - BOUCHE_V4.margeDb);
    else delete res.b;
    return res;
  });
}
