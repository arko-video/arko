// Règles des moments forts v4 (dev-moments), PURES : rires, cris, exclamations / phrases fortes / jurons, sons forts,
// calme puis pic, échanges rapides. Aucun modèle (CED-tiny et YAMNet : 0 rire trouvé sur 9 dans la vraie session).
// Des règles SIMPLES, explicables, calibrées sur la vraie session (0–3600 s) et vérifiées sur la suite (3600–7300 s).
// Chaque seconde de parole (fenêtre de 1 s, tous les 0,5 s, dans les segments de la VAD) est jugée par rapport à SA
// voix « autour de ce moment » (niveau et hauteur habituels de cette personne sur ± 5 min : la voix faible de Romain
// compte autant que celle de Guts, et une voix qui monte en fin de session ne crie pas pour autant) :
//  - rire : de la voix que Whisper n'a pas écrite (« voix sans mots » ; un mot inventé par Whisper — phrase répétée,
//    phrase toute faite, pile — ne compte pas), voisée, un peu plus aiguë que d'habitude, hachée (4–6 Hz) ;
//  - cri : la voix nettement plus aiguë que d'habitude ET au moins aussi forte, ou très au-dessus de son niveau (+8 dB) ;
//  - exclamation / phrase forte / juron : depuis les mots propres (phrases ≤ 7 mots) ;
//  - son fort / calme puis pic : pics du son hors parole ; échanges : ≥ 4 changements de voix en 10 s (voix sûres).
// Au plus 1,5 rire et 1,5 cri par minute de parole (les plus nets d'abord). Force = rang dans le genre (centile) × poids
// du genre : relative à la session. Le détecteur d'avant (ia/rires.ts) mesurait le débit des syllabes : plus cru ici.

import type { Mot, Sec } from '../../recette/types';
import { partDansBande } from '../../ia/rires';
import { estFort } from '../../sous-titres/nettoyage';
import { estJuron, motNu } from '../habillage/jurons';
import { phrases } from '../habillage/punchlines';
import type { PlageTemps } from '../types';
import type { EntreeMoments, GenreMoment, MomentV4 } from '../types-v4';

/** Réglages des règles (calibrés sur la vraie session, voir le rapport de dev-moments). */
export interface ReglesMoments {
  /** Pas des trames (s). */
  pas: Sec;
  /** VAD : trame de voix si p ≥ pVoix. */
  pVoix: number;
  /** Un mot « couvre » la voix à ± margeMot s. */
  margeMot: Sec;
  /** Fenêtres jugées : `fenetre` s, tous les `saut` s, dans les segments de parole (au moins `voixMin` trames de voix). */
  fenetre: Sec;
  saut: Sec;
  voixMin: number;
  /** Niveau et hauteur habituels d'une voix : sur ses tours à ± `autour` s (au moins `toursMin`), sinon toute la source. */
  autour: Sec;
  toursMin: number;
  rire: {
    /** Part de la voix de la fenêtre sans aucun vrai mot à ± margeMot. */
    sansMots: number;
    /** Hauteur médiane ≥ hauteur × la sienne ; énergie (90ᵉ centile) ≥ son niveau + energie dB. */
    hauteur: number;
    energie: number;
    /** Part des variations du volume entre 4 et 6 Hz (sur 1,28 s) : haché comme « ha-ha-ha ». */
    modulation: number;
    /** Part de la voix où la hauteur est mesurée (un rire est voisé). */
    voise: number;
    /** Sans aucun mot (mode voix) : la modulation doit atteindre ça (plus strict). */
    modulationSansMots: number;
    /** Sans la hauteur : modulation et énergie demandées en plus (les tests de hauteur et de voisement sautent). */
    sansHauteur: { modulation: number; energie: number };
    /** Un rire juste après un déclencheur (pic, cri, phrase forte qui finit ≤ apres s avant) est plus net. */
    apres: Sec;
    /** Au plus parMinute rires par minute de parole, les plus nets d'abord. */
    parMinute: number;
    /** Fou rire : ≥ fouRireDuree s, ou note ≥ fouRireNote. */
    fouRireDuree: Sec;
    fouRireNote: number;
    dureeMax: Sec;
  };
  cri: {
    /** Voix aiguë (hauteur médiane ≥ aigu × la sienne) ET énergie ≥ son niveau + aiguEnergie dB… */
    aigu: number;
    aiguEnergie: number;
    /** … ou bien énergie ≥ son niveau + plus dB ; « hurle » à + hurle dB. */
    plus: number;
    hurle: number;
    parMinute: number;
    dureeMax: Sec;
  };
  mots: { motsMax: number };
  son: {
    /** Pic retenu si z ≥ zMin, sans voix à ± hors s ; « calme puis pic » si les `calme` s d'avant sont calmes. */
    zMin: number;
    hors: Sec;
    calme: Sec;
    /** Calme = son entier au moins calmeDb sous le pic, et personne ne parle. */
    calmeDb: number;
  };
  echanges: { fenetre: Sec; changements: number; sureMin: number };
  /** Poids des genres dans la force. */
  poids: Readonly<Record<GenreMoment, number>>;
}

export const REGLES_MOMENTS: ReglesMoments = {
  pas: 0.02,
  pVoix: 0.5,
  margeMot: 0.3,
  fenetre: 1,
  saut: 0.5,
  voixMin: 5,
  autour: 300,
  toursMin: 8,
  rire: {
    sansMots: 0.7,
    hauteur: 1.1,
    energie: -1,
    modulation: 0.3,
    voise: 0.8,
    modulationSansMots: 0.45,
    sansHauteur: { modulation: 0.1, energie: 1 },
    apres: 2,
    parMinute: 1.5,
    fouRireDuree: 2,
    fouRireNote: 0.8,
    dureeMax: 10,
  },
  cri: { aigu: 1.3, aiguEnergie: 0.5, plus: 5, hurle: 10, parMinute: 1.5, dureeMax: 6 },
  mots: { motsMax: 7 },
  son: { zMin: 3, hors: 0.3, calme: 3, calmeDb: 16 },
  echanges: { fenetre: 10, changements: 4, sureMin: 0.8 },
  poids: { fouRire: 1, cri: 0.85, rire: 0.7, phraseForte: 0.6, calmePuisPic: 0.55, juron: 0.5, exclamation: 0.45, echanges: 0.4, sonFort: 0.35 },
};

/* ------------------------------------------------------------------ outils */

const r2 = (x: number) => Math.round(x * 100) / 100;
const borne = (x: number) => Math.max(0, Math.min(1, x));

function quantile(v: ArrayLike<number>, q: number): number {
  const a = Array.from(v).filter((x) => Number.isFinite(x));
  if (a.length === 0) return NaN;
  a.sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))]!;
}

/* ------------------------------------------------------------------ mots douteux (hallucinations de Whisper) */

/** Phrases toutes faites que Whisper invente sur du son sans paroles claires (rires, musique, jeu). */
const PHRASES_INVENTEES: readonly string[][] = [
  ['je', 'vous', 'invite'],
  ['merci', 'davoir', 'regarde'],
  ['sous', 'titres'],
  ['soustitres'],
  ['soustitrage'],
  ['abonnezvous'],
  ['amara'],
];

/**
 * Mots que Whisper a sans doute inventés (indices, PAS de texte) : une suite de ≥ 3 mots répétée dans les 20 s, une
 * phrase toute faite, ou une pile (≥ 3 mots dont les débuts tiennent en 0,05 s). Ces mots ne « couvrent » pas la voix :
 * c'est souvent ce que Whisper écrit sur un rire.
 */
export function motsDouteux(mots: readonly Mot[]): Uint8Array {
  const n = mots.length;
  const douteux = new Uint8Array(n);
  const nus = mots.map((m) => motNu(m[0]));
  // 1. Suite de 3 mots (non vides) répétée dans les 20 s.
  const vus = new Map<string, number[]>();
  for (let i = 0; i + 2 < n; i++) {
    if (!nus[i] || !nus[i + 1] || !nus[i + 2]) continue;
    const cle = `${nus[i]} ${nus[i + 1]} ${nus[i + 2]}`;
    const avant = vus.get(cle) ?? [];
    for (const j of avant) {
      if (Math.abs(mots[i]![1] - mots[j]![1]) <= 20 && i - j >= 3) {
        for (let k = 0; k < 3; k++) {
          douteux[i + k] = 1;
          douteux[j + k] = 1;
        }
      }
    }
    avant.push(i);
    if (avant.length > 8) avant.shift();
    vus.set(cle, avant);
  }
  // 2. Phrases toutes faites.
  for (let i = 0; i < n; i++) {
    for (const ph of PHRASES_INVENTEES) {
      if (ph.every((w, k) => nus[i + k] === w)) for (let k = 0; k < ph.length; k++) douteux[i + k] = 1;
    }
  }
  // 3. Piles (mots triés par début).
  const ordre = Array.from({ length: n }, (_, i) => i).sort((x, y) => mots[x]![1] - mots[y]![1]);
  for (let a = 0; a < n; a++) {
    let b = a;
    while (b + 1 < n && mots[ordre[b + 1]!]![1] - mots[ordre[a]!]![1] <= 0.05) b++;
    if (b - a + 1 >= 3) for (let k = a; k <= b; k++) douteux[ordre[k]!] = 1;
  }
  return douteux;
}

/* ------------------------------------------------------------------ trames */

/** Ce que les règles regardent, toutes les `pas` s, sur toute la source. */
export interface Trames {
  pas: Sec;
  n: number;
  /** Probabilité de voix (0 à 1). */
  p: Float32Array;
  /** Énergie de la bande voix (dB). */
  db: Float32Array;
  /** Volume de tout le son (RMS linéaire), pour la modulation. */
  rms: Float32Array;
  /** Hauteur de la voix (Hz, 0 = pas voisé / pas mesuré) ; null sans mesure. */
  f0: Float32Array | null;
  /** 1 si un vrai mot (pas douteux) est à ± margeMot. */
  mot: Uint8Array;
  /** Indice de la voix qui parle (dans `voix`), −1 si personne / inconnu. */
  qui: Int16Array;
  voix: string[];
  /** Énergie au-dessus du niveau habituel de SA voix (dB) ; hauteur / sa hauteur habituelle (0 = pas mesurée). */
  eRel: Float32Array;
  fRel: Float32Array;
  /** Durée de parole (s), pour les plafonds par minute. */
  parole: Sec;
}

/** Valeur d'une enveloppe (pas quelconque) au temps t. */
function aTemps(x: Float32Array, pas: Sec, t: Sec, defaut: number): number {
  const k = Math.floor(t / pas);
  return k >= 0 && k < x.length ? x[k]! : defaut;
}

/** Niveau habituel (médiane, sur les tours, du 90ᵉ centile de l'énergie) et hauteur habituelle (médiane des f0). */
interface PointVoix {
  t: Sec;
  niveau: number;
  f0: number;
}

/**
 * Références « autour de t » d'une voix, sur une grille de 10 s : médianes de ses tours à ± `autour` s (au moins
 * `toursMin` tours), sinon de toute la source. Rend [niveau, f0] par case de la grille.
 */
function referencesLocales(points: readonly PointVoix[], global: PointVoix, duree: Sec, r: ReglesMoments): { niveau: Float32Array; f0: Float32Array } {
  const g = Math.max(1, Math.ceil(duree / 10));
  const niveau = new Float32Array(g).fill(global.niveau);
  const f0 = new Float32Array(g).fill(global.f0);
  const tries = [...points].sort((x, y) => x.t - y.t);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < g; i++) {
    const t = (i + 0.5) * 10;
    while (lo < tries.length && tries[lo]!.t < t - r.autour) lo++;
    while (hi < tries.length && tries[hi]!.t <= t + r.autour) hi++;
    const ici = tries.slice(lo, hi);
    if (ici.length < r.toursMin) continue;
    niveau[i] = quantile(ici.map((x) => x.niveau), 0.5);
    const fs = ici.map((x) => x.f0).filter((x) => x > 0);
    if (fs.length >= r.toursMin) f0[i] = quantile(fs, 0.5);
  }
  return { niveau, f0 };
}

export function tramesDe(e: EntreeMoments, r: ReglesMoments = REGLES_MOMENTS): Trames {
  const pas = r.pas;
  const duree = e.signaux.duree;
  const n = Math.max(0, Math.ceil(duree / pas));
  const p = new Float32Array(n);
  const probas = e.parole.probas;
  if (probas) {
    for (let k = 0; k < n; k++) {
      const c = Math.floor(((k + 0.5) * pas) / probas.pas);
      p[k] = c >= 0 && c < probas.p.length ? probas.p[c]! / 255 : 0;
    }
  } else {
    for (const s of e.parole.segments) for (let k = Math.max(0, Math.floor(s.de / pas)); k < Math.min(n, Math.ceil(s.a / pas)); k++) p[k] = 1;
  }
  const db = new Float32Array(n);
  const rms = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * pas;
    const v = aTemps(e.signaux.rms, e.signaux.pas, t, 0);
    rms[k] = v;
    db[k] = e.energie ? aTemps(e.energie.db, e.energie.pas, t, -100) : v > 0 ? 20 * Math.log10(v) : -100;
  }
  let f0: Float32Array | null = null;
  if (e.hauteur && e.hauteur.f0.length > 0) {
    f0 = new Float32Array(n);
    for (let k = 0; k < n; k++) f0[k] = aTemps(e.hauteur.f0, e.hauteur.pas, (k + 0.5) * pas, 0);
  }
  const mot = new Uint8Array(n);
  const douteux = motsDouteux(e.mots);
  e.mots.forEach((m, i) => {
    if (douteux[i] || !m[0].trim()) return;
    for (let k = Math.max(0, Math.floor((m[1] - r.margeMot) / pas)); k < Math.min(n, Math.ceil((m[2] + r.margeMot) / pas)); k++) mot[k] = 1;
  });
  const voix = e.voix?.voix.map((v) => v.id) ?? [];
  const qui = new Int16Array(n).fill(-1);
  // Les tours (ou, sans qui parle, les segments) : leur voix, leur niveau, leur hauteur.
  const morceaux: { i: number; de: Sec; a: Sec }[] =
    e.voix && e.voix.tours.length > 0 ? e.voix.tours.map((x) => ({ i: voix.indexOf(x.p), de: x.ts, a: x.fin })) : e.parole.segments.map((s) => ({ i: -1, de: s.de, a: s.a }));
  const points: PointVoix[][] = voix.map(() => []);
  const tous: PointVoix[] = [];
  for (const m of morceaux) {
    const v: number[] = [];
    const fs: number[] = [];
    for (let k = Math.max(0, Math.floor(m.de / pas)); k < Math.min(n, Math.ceil(m.a / pas)); k++) {
      if (m.i >= 0) qui[k] = m.i;
      if (p[k]! < r.pVoix) continue;
      v.push(db[k]!);
      if (f0 && f0[k]! > 0) fs.push(f0[k]!);
    }
    if (v.length < 5) continue;
    const pt = { t: (m.de + m.a) / 2, niveau: quantile(v, 0.9), f0: fs.length >= 3 ? quantile(fs, 0.5) : 0 };
    tous.push(pt);
    if (m.i >= 0) points[m.i]!.push(pt);
  }
  const globalDe = (pts: readonly PointVoix[]): PointVoix => ({ t: 0, niveau: quantile(pts.map((x) => x.niveau), 0.5), f0: quantile(pts.map((x) => x.f0).filter((x) => x > 0), 0.5) || 0 });
  const commune = globalDe(tous);
  const refCommune = referencesLocales(tous, commune, duree, r);
  const refs = points.map((pts) => (pts.length >= 5 ? referencesLocales(pts, globalDe(pts), duree, r) : refCommune));
  const eRel = new Float32Array(n);
  const fRel = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const ref = qui[k]! >= 0 ? refs[qui[k]!]! : refCommune;
    const g = Math.min(ref.niveau.length - 1, Math.floor(((k + 0.5) * pas) / 10));
    eRel[k] = Number.isFinite(ref.niveau[g]!) ? db[k]! - ref.niveau[g]! : 0;
    const f = f0?.[k] ?? 0;
    fRel[k] = f > 0 && ref.f0[g]! > 0 ? f / ref.f0[g]! : 0;
  }
  const parole = e.parole.segments.reduce((s, x) => s + (x.a - x.de), 0);
  return { pas, n, p, db, rms, f0, mot, qui, voix, eRel, fRel, parole };
}

/* ------------------------------------------------------------------ fenêtres de parole */

/** Une seconde de parole jugée (mesures relatives à SA voix). */
export interface FenetreParole extends PlageTemps {
  k0: number;
  k1: number;
  /** Indice de la voix (−1 inconnue). */
  voix: number;
  /** Part de la voix sans vrai mot ; énergie au-dessus de son niveau (90ᵉ centile, dB) ; hauteur relative (médiane). */
  sansMots: number;
  energie: number;
  hauteur: number;
  /** Part de la voix où la hauteur est mesurée ; modulation 4–6 Hz du volume. */
  voise: number;
  modulation: number;
}

/** Les fenêtres de 1 s (tous les 0,5 s) de chaque segment de parole ; un segment plus court = une fenêtre. */
export function fenetresDeParole(t: Trames, segments: readonly PlageTemps[], r: ReglesMoments = REGLES_MOMENTS): FenetreParole[] {
  const res: FenetreParole[] = [];
  const nMod = Math.round(1.28 / t.pas);
  for (const s of segments) {
    const plages: [Sec, Sec][] = [];
    if (s.a - s.de <= r.fenetre) plages.push([s.de, s.a]);
    else for (let x = s.de; x < s.a - r.fenetre / 2; x += r.saut) plages.push([x, Math.min(s.a, x + r.fenetre)]);
    for (const [de, a] of plages) {
      const k0 = Math.max(0, Math.floor(de / t.pas));
      const k1 = Math.min(t.n, Math.ceil(a / t.pas));
      const e: number[] = [];
      const f: number[] = [];
      let voix = 0;
      let sansMots = 0;
      const qui = new Map<number, number>();
      for (let k = k0; k < k1; k++) {
        if (t.p[k]! < r.pVoix) continue;
        voix++;
        e.push(t.eRel[k]!);
        if (!t.mot[k]) sansMots++;
        if (t.fRel[k]! > 0) f.push(t.fRel[k]!);
        if (t.qui[k]! >= 0) qui.set(t.qui[k]!, (qui.get(t.qui[k]!) ?? 0) + 1);
      }
      if (voix < r.voixMin) continue;
      let v = -1;
      let nb = 0;
      for (const [i, x] of qui) if (x > nb) [v, nb] = [i, x];
      const a0 = Math.max(0, Math.round((k0 + k1) / 2 - nMod / 2));
      res.push({
        de: r2(de),
        a: r2(a),
        k0,
        k1,
        voix: v,
        sansMots: sansMots / voix,
        energie: quantile(e, 0.9),
        hauteur: f.length >= 5 ? quantile(f, 0.5) : 0,
        voise: f.length / voix,
        modulation: a0 + nMod <= t.n ? partDansBande(t.rms, a0, nMod, t.pas) : 0,
      });
    }
  }
  return res;
}

/* ------------------------------------------------------------------ candidats */

/** Un moment proposé, avant le classement de la session. */
export interface Candidat extends PlageTemps {
  genre: GenreMoment;
  t: Sec;
  /** Netteté (0 à 1) : sert au tri dans le genre et au plafond. */
  note: number;
  voix: number;
  indices: string[];
}

/** Fin d'un moment qui peut déclencher une réaction (pic, phrase forte, cri). */
interface Declencheur {
  fin: Sec;
}

function apresDeclencheur(d: readonly Declencheur[], de: Sec, apres: Sec): boolean {
  return d.some((x) => x.fin <= de + 0.2 && x.fin >= de - apres);
}

/** Garde les plus nets, au plus `parMinute` par minute de parole (au moins 1). */
function plafonner(c: Candidat[], parMinute: number, parole: Sec): Candidat[] {
  const max = Math.max(1, Math.floor((parMinute * parole) / 60));
  return [...c].sort((x, y) => y.note - x.note || x.t - y.t).slice(0, max);
}

/** Réunit les fenêtres retenues qui se touchent (même genre) en moments ; note = moyenne des notes, sommet = la plus forte. */
function reunir(t: Trames, f: readonly { w: FenetreParole; note: number; indices: string[] }[], genre: GenreMoment, dureeMax: Sec): Candidat[] {
  const tries = [...f].sort((x, y) => x.w.de - y.w.de);
  const groupes: (typeof tries)[] = [];
  for (const x of tries) {
    const g = groupes[groupes.length - 1];
    if (g && x.w.de <= g[g.length - 1]!.w.a + 0.05 && x.w.a - g[0]!.w.de <= dureeMax) g.push(x);
    else groupes.push([x]);
  }
  return groupes.map((g) => {
    const de = g[0]!.w.de;
    const a = Math.max(...g.map((x) => x.w.a));
    let sommet = g[0]!.w.k0;
    for (const x of g) for (let k = x.w.k0; k < x.w.k1; k++) if (t.p[k]! >= 0.5 && t.db[k]! > t.db[sommet]!) sommet = k;
    const meilleur = g.reduce((m, x) => (x.note > m.note ? x : m), g[0]!);
    const note = Math.min(1, g.reduce((s, x) => s + x.note, 0) / g.length + 0.05 * Math.min(1, (a - de) / 3));
    const voix = meilleur.w.voix;
    return { de, a: r2(a), t: r2((sommet + 0.5) * t.pas), genre, note, voix, indices: meilleur.indices };
  });
}

/**
 * Rires. Avec les mots : une seconde de parole où ≥ 70 % de la voix n'a aucun vrai mot, voisée (≥ 80 %), un peu plus
 * aiguë que SA voix (× 1,1), pas plus faible (− 1 dB), hachée (≥ 30 % des variations entre 4 et 6 Hz). Sans aucun mot
 * (mode voix) : la même, mais hachée à ≥ 45 %. Plus nette juste après un pic / un cri / une phrase forte.
 */
export function candidatsRires(t: Trames, fenetres: readonly FenetreParole[], declencheurs: readonly Declencheur[], avecMots: boolean, r: ReglesMoments = REGLES_MOMENTS): Candidat[] {
  const R = r.rire;
  // Sans la hauteur (pas mesurée) : pas de test de hauteur ni de voisement, mais haché et énergie plus exigeants.
  const avecHauteur = t.f0 !== null;
  const modMin = (avecMots ? R.modulation : R.modulationSansMots) + (avecHauteur ? 0 : R.sansHauteur.modulation);
  const energieMin = R.energie + (avecHauteur ? 0 : R.sansHauteur.energie);
  const retenues: { w: FenetreParole; note: number; indices: string[] }[] = [];
  for (const w of fenetres) {
    if (avecMots && w.sansMots < R.sansMots) continue;
    if (avecHauteur && (w.voise < R.voise || w.hauteur < R.hauteur)) continue;
    if (!(w.energie >= energieMin) || w.modulation < modMin) continue;
    const indices = [`voix sans mots ${Math.round(w.sansMots * 100)} %`, `haché ${Math.round(w.modulation * 100)} %`, `${w.energie >= 0 ? '+' : ''}${Math.round(w.energie)} dB sur sa voix`];
    if (avecHauteur) indices.push(`hauteur ×${w.hauteur.toFixed(2)}`);
    let note = 0.4 + 0.15 * (avecHauteur ? borne((w.hauteur - R.hauteur) / 0.3) : 0.5) + 0.15 * borne((w.modulation - modMin) / 0.3) + 0.1 * borne((w.energie - energieMin) / 6) + 0.05 * borne((w.sansMots - R.sansMots) / (1 - R.sansMots + 1e-9));
    if (apresDeclencheur(declencheurs, w.de, R.apres)) {
      note += 0.15;
      indices.push('juste après un pic, un cri ou une phrase forte');
    }
    retenues.push({ w, note, indices });
  }
  const gardes = plafonner(reunir(t, retenues, 'rire', R.dureeMax), R.parMinute, t.parole);
  for (const c of gardes) if (c.a - c.de >= R.fouRireDuree || c.note >= R.fouRireNote) c.genre = 'fouRire';
  return gardes;
}

/**
 * Cris : une seconde de parole nettement plus aiguë que SA voix (× 1,35) sans être plus faible (+ 1 dB), ou très
 * au-dessus de son niveau (+ 8 dB ; « hurle » à + 14 dB). Plus net avec un « ! » dans les mots.
 */
export function candidatsCris(t: Trames, fenetres: readonly FenetreParole[], mots: readonly Mot[], r: ReglesMoments = REGLES_MOMENTS): Candidat[] {
  const C = r.cri;
  const avecMots = mots.some((m) => m[0].trim());
  const retenues: { w: FenetreParole; note: number; indices: string[] }[] = [];
  for (const w of fenetres) {
    // Sans la hauteur (pas mesurée), seul le niveau compte.
    const aigu = w.hauteur > 0 && w.hauteur >= C.aigu && w.energie >= C.aiguEnergie;
    const fort = w.energie >= C.plus;
    if (!aigu && !fort) continue;
    // Aigu mais sans mots et haché comme « ha-ha-ha » : c'est un rire (sauf s'il est aussi très fort).
    const hache = w.modulation >= r.rire.modulationSansMots && (!avecMots || w.sansMots >= r.rire.sansMots);
    if (hache && !fort) continue;
    const indices = [`${w.energie >= 0 ? '+' : ''}${Math.round(w.energie)} dB sur sa voix`];
    if (w.hauteur > 0) indices.push(`hauteur ×${w.hauteur.toFixed(2)}`);
    let note = 0.4 + 0.25 * (w.hauteur > 0 ? borne((w.hauteur - C.aigu) / 0.4) : 0) + 0.25 * borne(w.energie / C.plus);
    if (w.energie >= C.hurle) {
      note += 0.1;
      indices.push('hurle');
    }
    if (mots.some((m) => m[1] < w.a + 0.3 && m[2] > w.de - 0.3 && m[0].includes('!'))) {
      note += 0.1;
      indices.push('« ! »');
    }
    retenues.push({ w, note, indices });
  }
  return plafonner(reunir(t, retenues, 'cri', C.dureeMax), C.parMinute, t.parole);
}

/** Exclamations, phrases fortes, jurons : phrases courtes (≤ 7 mots) des VRAIS mots (pas des hallucinations). */
export function candidatsMots(mots: readonly Mot[], t: Trames, r: ReglesMoments = REGLES_MOMENTS): Candidat[] {
  const tries = [...mots].filter((m) => m[0].trim() && m[2] > m[1]).sort((x, y) => x[1] - y[1]);
  const douteux = motsDouteux(tries);
  const res: Candidat[] = [];
  for (const { k0, k1 } of phrases(tries)) {
    if (k1 - k0 > r.mots.motsMax) continue;
    const ceux = tries.slice(k0, k1);
    if (ceux.some((_, i) => douteux[k0 + i])) continue;
    const de = ceux[0]![1];
    const a = ceux[ceux.length - 1]![2];
    const juron = ceux.some((m) => estJuron(m[0]));
    const exclame = ceux.some((m) => m[0].includes('!'));
    const motFort = ceux.some((m) => m[3] === 1 || (estFort(m[0]) && !m[0].includes('!')));
    if (!juron && !exclame && !motFort) continue;
    const genre: GenreMoment = motFort ? 'phraseForte' : juron ? 'juron' : 'exclamation';
    const ka = Math.max(0, Math.floor(de / t.pas));
    const kb = Math.min(t.n, Math.ceil(a / t.pas));
    let sommet = ka;
    let e = -Infinity;
    const qui = new Map<number, number>();
    for (let k = ka; k < kb; k++) {
      if (t.qui[k]! >= 0) qui.set(t.qui[k]!, (qui.get(t.qui[k]!) ?? 0) + 1);
      if (t.p[k]! >= r.pVoix && t.eRel[k]! > e) [e, sommet] = [t.eRel[k]!, k];
    }
    let v = -1;
    let nb = 0;
    for (const [i, x] of qui) if (x > nb) [v, nb] = [i, x];
    const indices = [motFort ? 'mot fort' : juron ? 'juron' : '« ! »'];
    if (juron && genre !== 'juron') indices.push('juron');
    if (exclame && genre !== 'exclamation') indices.push('« ! »');
    // Plus courte, plus de raisons, et dite plus fort que d'habitude (par rapport à SA voix) = plus nette.
    let note = 0.4 + 0.15 * (1 - (k1 - k0 - 1) / r.mots.motsMax) + 0.1 * (Number(juron) + Number(exclame) + Number(motFort) - 1);
    if (Number.isFinite(e)) note += 0.25 * borne(e / 6);
    res.push({ de: r2(de), a: r2(a), t: r2((sommet + 0.5) * t.pas), genre, note: Math.min(1, note), voix: v, indices });
  }
  return res;
}

/** Sons forts hors parole (pics z ≥ 3) ; « calme puis pic » quand les 3 s d'avant sont calmes (et sans parole). */
export function candidatsSon(e: Pick<EntreeMoments, 'signaux'>, t: Trames, r: ReglesMoments = REGLES_MOMENTS): Candidat[] {
  const S = r.son;
  const res: Candidat[] = [];
  const nCalme = Math.round(S.calme / t.pas);
  for (const pic of e.signaux.pics) {
    if (pic.z < S.zMin) continue;
    const k = Math.floor(pic.ts / t.pas);
    let parle = false;
    for (let i = Math.max(0, Math.floor((pic.ts - S.hors) / t.pas)); i < Math.min(t.n, Math.ceil((pic.ts + 0.5 + S.hors) / t.pas)); i++) {
      if (t.p[i]! >= r.pVoix) {
        parle = true;
        break;
      }
    }
    if (parle) continue;
    let calme = k - nCalme >= 0;
    if (calme) {
      for (let i = k - nCalme; i < k - 2; i++) {
        const v = t.rms[i]!;
        const db = v > 0 ? 20 * Math.log10(v) : -100;
        if (db > pic.db - S.calmeDb || t.p[i]! >= r.pVoix) {
          calme = false;
          break;
        }
      }
    }
    const genre: GenreMoment = calme ? 'calmePuisPic' : 'sonFort';
    res.push({ de: r2(pic.ts), a: r2(pic.ts + 0.5), t: r2(pic.ts), genre, note: Math.min(1, 0.4 + pic.z / 20), voix: -1, indices: [`pic z ${pic.z.toFixed(1)}`, ...(calme ? ['calme avant'] : [])] });
  }
  return res;
}

/** Échanges rapides : ≥ 4 changements de voix en 10 s, SEULEMENT si les voix sont sûres (2 voix, sure ≥ 0,8). */
export function candidatsEchanges(e: Pick<EntreeMoments, 'voix'>, r: ReglesMoments = REGLES_MOMENTS): Candidat[] {
  const E = r.echanges;
  const v = e.voix;
  if (!v || v.voix.length < 2 || v.sure < E.sureMin) return [];
  const tours = [...v.tours].sort((x, y) => x.ts - y.ts);
  const changements: Sec[] = [];
  for (let i = 1; i < tours.length; i++) if (tours[i]!.p !== tours[i - 1]!.p) changements.push(tours[i]!.ts);
  const res: Candidat[] = [];
  let i = 0;
  while (i < changements.length) {
    let j = i;
    while (j + 1 < changements.length && changements[j + 1]! - changements[i]! <= E.fenetre) j++;
    if (j - i + 1 >= E.changements) {
      // Tant que le rythme continue (changement suivant à moins de fenêtre / 2 du dernier).
      while (j + 1 < changements.length && changements[j + 1]! - changements[j]! <= E.fenetre / 2) j++;
      const de = changements[i]!;
      const a = changements[j]!;
      res.push({ de: r2(Math.max(0, de - 1)), a: r2(a + 1), t: r2((de + a) / 2), genre: 'echanges', note: Math.min(1, 0.4 + (j - i + 1) / 20), voix: -1, indices: [`${j - i + 1} changements de voix`] });
      i = j + 1;
    } else i++;
  }
  return res;
}

/* ------------------------------------------------------------------ forces relatives et assemblage */

/** Force = poids du genre × rang centile de la note dans le genre (rire et fou rire ensemble). Pure. */
export function forcesRelatives(c: readonly Pick<Candidat, 'genre' | 'note' | 't'>[], r: ReglesMoments = REGLES_MOMENTS): number[] {
  const famille = (g: GenreMoment) => (g === 'fouRire' ? 'rire' : g);
  const parFamille = new Map<string, number[]>();
  c.forEach((x, i) => {
    const f = famille(x.genre);
    const ids = parFamille.get(f) ?? [];
    ids.push(i);
    parFamille.set(f, ids);
  });
  const force = new Array<number>(c.length).fill(0);
  for (const ids of parFamille.values()) {
    const tries = [...ids].sort((x, y) => c[x]!.note - c[y]!.note || c[x]!.t - c[y]!.t);
    tries.forEach((id, rang) => {
      force[id] = Math.round(r.poids[c[id]!.genre] * ((rang + 1) / tries.length) * 1000) / 1000;
    });
  }
  return force;
}

/** Toutes les règles : son et mots d'abord (déclencheurs), puis cris, puis rires (réactions), puis échanges. */
export function trouverMoments(e: EntreeMoments, r: ReglesMoments = REGLES_MOMENTS): MomentV4[] {
  const t = tramesDe(e, r);
  const avecMots = e.mots.some((m) => m[0].trim());
  const fenetres = fenetresDeParole(t, e.parole.segments, r);
  const son = candidatsSon(e, t, r);
  const mots = avecMots ? candidatsMots(e.mots, t, r) : [];
  const cris = candidatsCris(t, fenetres, e.mots, r);
  const declencheurs: Declencheur[] = [
    ...e.signaux.pics.filter((p) => p.z >= r.son.zMin).map((p) => ({ fin: p.ts + 0.5 })),
    ...mots.filter((m) => m.genre !== 'exclamation').map((m) => ({ fin: m.a })),
    ...cris.map((m) => ({ fin: m.a })),
  ];
  // Un rire n'est pas aussi un cri : les fenêtres déjà prises par un cri ne comptent pas pour les rires.
  const libres = fenetres.filter((w) => !cris.some((c) => c.de < w.a && c.a > w.de));
  const rires = candidatsRires(t, libres, declencheurs, avecMots, r);
  const echanges = candidatsEchanges(e, r);
  const tous = [...son, ...mots, ...cris, ...rires, ...echanges];
  const forces = forcesRelatives(tous, r);
  return tous
    .map((c, i): MomentV4 => {
      const m: MomentV4 = { de: c.de, a: c.a, t: c.t, genre: c.genre, force: forces[i]!, indices: c.indices };
      if (c.voix >= 0 && t.voix[c.voix]) m.p = t.voix[c.voix]!;
      return m;
    })
    .sort((x, y) => x.t - y.t || x.de - y.de);
}
