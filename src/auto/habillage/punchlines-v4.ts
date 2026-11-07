// B v4. Punchlines du Best-of v4 (dev-habillage), fonctions PURES. Contrat : §1.7 « Punchlines ».
//
// Pourquoi une v4 : sur la vraie session, Whisper (base) n'écrit presque jamais « ! » (2 phrases sur 303 dans les
// passages gardés à la main) et ses « phrases » sont longues (un quart dépasse 9 mots, 20 % durent plus de 2,3 s) :
// la règle d'avant (phrase ≤ 7 mots ET « ! » / mot fort / juron / rire / pic) ne trouve presque rien. Ce que la main
// a gardé : des RÉPLIQUES (43 punchlines sur 53 finissent un tour de parole, 32 sur 53 le commencent), de 1,5 à 4 s,
// rarement d'un seul mot. Donc ici :
//  1. les mots placés dans le montage sont groupés en répliques (une personne, sans trou de plus de 0,6 s, jusqu'à la
//     fin de phrase « . ! ? … ») ; une réplique trop longue pour une ligne (> 7 mots ou > 2,3 s) donne sa FIN et son
//     DÉBUT (au plus 7 mots, 2,3 s, coupés de préférence à une virgule ou à un petit trou) ;
//  2. chaque candidate reçoit une note : la règle d'avant (mot fort, « ! », juron), les moments v4 (cri pendant la
//     phrase, rire juste après, phrase forte / exclamation, son fort autour), la fin de réplique, le cœur de la
//     séquence ; une phrase d'un mot ou trop rapide (pile de Whisper) perd des points ;
//  3. le choix : ≈ 3,3 par minute de montage (4 au plus), au moins une par séquence quand une phrase le permet, puis les
//     mieux notées, jamais deux à moins de 0,3 s, au plus 6 dans une fenêtre de 60 s.
// Le dessin (MAJUSCULES, mot clé en couleur, jurons masqués, « pop ») et la tenue (du 1er mot à la fin du dernier
// + 0,2 s, 2,5 s au plus) sont ceux du moteur (recette/sous-titres-places.ts, moteur/couches/sous-titres.ts) : une
// candidate tient en UNE ligne de 2,5 s au plus.

import { compiler } from '../../recette/chronologie';
import { placerMots, TENUE_PUNCHLINE, type MotPlace } from '../../recette/sous-titres-places';
import type { Mot, PlagePunchline, Recette, Sec, TourDeParole } from '../../recette/types';
import { estFort } from '../../sous-titres/nettoyage';
import type { PlageTemps, SignauxSource } from '../types';
import { motsDouteux } from '../moments/regles';
import type { GenreMoment, MomentV4 } from '../types-v4';
import { estJuron, motNu } from './jurons';
import { indiceCle } from './punchlines';

export const PUNCHLINES_V4 = {
  /** Visé par minute de montage (vérité : 54 en 16,5 min) et plafond. */
  parMinute: 3.3,
  maxParMinute: 4,
  /** Au plus `maxFenetre` punchlines commencent dans une fenêtre de `fenetre` s du montage (vérité : 7 au plus). */
  fenetre: 60,
  maxFenetre: 6,
  /** Écart minimal (temps de sortie) entre la fin d'une punchline et le début de la suivante. */
  ecartMin: 0.3,
  motsMax: 7,
  /** Durée des mots d'une candidate (une ligne : 2,5 s au plus avec les 0,2 s de tenue ; 0,05 s de marge d'arrondi). */
  dureeMax: TENUE_PUNCHLINE.max - TENUE_PUNCHLINE.apres - 0.05,
  dureeMin: 0.3,
  /** Un trou de plus de 0,6 s (source ou sortie) termine la réplique. */
  trouReplique: 0.6,
  /** Dans une réplique trop longue, une coupe « naturelle » : virgule, ou trou d'au moins 0,25 s. */
  trouInterne: 0.25,
  /** Pile de Whisper : au moins `pileMots` mots qui commencent dans `pileFenetre` s, ou des mots de 0,06 s en moyenne. */
  pileMots: 3,
  pileFenetre: 0.05,
  dureeMotMin: 0.06,
  /** Note minimale d'une candidate pour être affichée. */
  noteMin: 0.5,
  /** Un rire compte s'il commence pendant la phrase ou au plus 2 s après ; un son fort à ± 1,5 s. */
  apresRire: 2,
  autourPic: 1.5,
  /** Le cœur d'une séquence (moment fort de l'histoire) à ± 3 s de la phrase. */
  autourCoeur: 3,
} as const;

/** Points de la note (calés sur la vraie session : la fin de réplique et le son fort autour sont les meilleurs indices). */
export const POINTS_PUNCHLINES = {
  base: 1,
  finDeReplique: 0.5,
  debutDeReplique: 0.2,
  motFort: 0.6,
  exclamation: 0.8,
  juron: 0.6,
  interjection: 0.3,
  /** × force du moment. */
  cri: 1.2,
  rire: 1,
  phraseForte: 0.8,
  pic: 1,
  coeur: 0.5,
  unMot: -0.7,
  deuxMots: -0.2,
} as const;

/** Exclamations courantes d'une partie entre amis (mots génériques, sans accents ; aucun mot d'une vraie session). */
export const INTERJECTIONS: ReadonlySet<string> = new Set([
  'non', 'nan', 'quoi', 'attends', 'attend', 'attendez', 'oh', 'ah', 'wow', 'waouh', 'ouf', 'serieux', 'jamais',
  'impossible', 'incroyable', 'mdr', 'ptdr', 'gg', 'stop', 'arrete', 'aide', 'vite', 'regarde', 'mince', 'oups',
  'genial', 'bravo', 'help', 'go', 'nooon', 'noon', 'ohhh', 'ohh', 'ahh', 'ahhh',
]);

export type RaisonPunchlineV4 = 'mot-fort' | 'exclamation' | 'juron' | 'rire' | 'pic' | 'cri' | 'phrase-forte' | 'replique';

/** Une punchline possible : plage (temps source) + temps de sortie + note. */
export interface CandidatPunchline extends PlagePunchline {
  /** Indices [k0, k1[ dans les mots donnés. */
  k0: number;
  k1: number;
  /** Temps de SORTIE du début du 1er mot et de la fin du dernier. */
  t0: Sec;
  t1: Sec;
  note: number;
  raison: RaisonPunchlineV4;
  /** Mot clé à colorer (indice dans les mots donnés), comme le dessin le choisira. */
  cle: number | null;
  /** Indice de la séquence (dans `sequences`) qui la contient ; −1 = aucune. */
  sequence: number;
}

export interface EntreePunchlinesV4 {
  src: string;
  /** Mots propres (temps source) des séquences gardées. */
  mots: readonly Mot[];
  moments: readonly MomentV4[];
  signaux: SignauxSource | null;
  /** Séquences gardées : leur plage et leur cœur (moment fort). */
  sequences: readonly (PlageTemps & { coeur?: PlageTemps })[];
  /** Tours de parole (une réplique ne mélange jamais deux personnes) ; absent = inconnu. */
  tours?: readonly TourDeParole[];
}

const FIN_DE_PHRASE = /[.!?…]$/;
const VIRGULE = /[,;:]$/;
const GENRES_PHRASE: readonly GenreMoment[] = ['phraseForte', 'exclamation', 'juron'];
const GENRES_RIRE: readonly GenreMoment[] = ['rire', 'fouRire'];
const GENRES_PIC: readonly GenreMoment[] = ['sonFort', 'calmePuisPic'];

/** Personne qui parle au temps source t (tours triés ou non) ; null = inconnu. */
function personneA(tours: readonly TourDeParole[] | undefined, t: Sec): string | null {
  if (!tours) return null;
  for (const x of tours) if (t >= x.ts && t < x.fin) return x.p;
  return null;
}

/** Les mots placés groupés en répliques : [i0, i1[ dans `places` (ordre de la vidéo, chaque mot une fois). */
function repliques(places: readonly MotPlace[], qui: (m: MotPlace) => string | null): { i0: number; i1: number; finTour: boolean }[] {
  const res: { i0: number; i1: number; finTour: boolean }[] = [];
  let i0 = 0;
  for (let i = 0; i < places.length; i++) {
    const m = places[i]!;
    const s = places[i + 1];
    const changePersonne = s !== undefined && qui(m) !== null && qui(s) !== null && qui(m) !== qui(s);
    const trou = s === undefined || s.k !== m.k + 1 || s.mot[1] - m.mot[2] > PUNCHLINES_V4.trouReplique || s.t0 - m.t1 > PUNCHLINES_V4.trouReplique;
    if (trou || changePersonne || FIN_DE_PHRASE.test(m.mot[0].trim())) {
      // Fin de tour : un vrai trou ou l'autre personne qui parle (une fin de phrase suivie de la même voix n'en est pas une).
      res.push({ i0, i1: i + 1, finTour: trou || changePersonne });
      i0 = i + 1;
    }
  }
  return res;
}

/** Tient en une ligne : au plus 7 mots et 2,3 s. */
function tient(places: readonly MotPlace[], i0: number, i1: number): boolean {
  return i1 - i0 <= PUNCHLINES_V4.motsMax && places[i1 - 1]!.mot[2] - places[i0]!.mot[1] <= PUNCHLINES_V4.dureeMax + 1e-9;
}

/** Coupe naturelle entre places[i - 1] et places[i] (virgule ou petit trou). */
function coupeNaturelle(places: readonly MotPlace[], i: number): boolean {
  const p = places[i - 1]!;
  const m = places[i]!;
  return VIRGULE.test(p.mot[0].trim()) || m.mot[1] - p.mot[2] >= PUNCHLINES_V4.trouInterne;
}

/** Fin d'une réplique trop longue : le plus long suffixe qui tient, commencé à une coupe naturelle si possible. */
function fenetreFin(places: readonly MotPlace[], i0: number, i1: number): [number, number] {
  let plusLong = i1 - 1;
  let naturel = -1;
  for (let j = i1 - 1; j >= i0; j--) {
    if (!tient(places, j, i1)) break;
    plusLong = j;
    if (j === i0 || coupeNaturelle(places, j)) naturel = j;
  }
  return [naturel >= 0 ? naturel : plusLong, i1];
}

/** Début d'une réplique trop longue : le plus long préfixe qui tient, fini à une coupe naturelle si possible. */
function fenetreDebut(places: readonly MotPlace[], i0: number, i1: number): [number, number] {
  let plusLong = i0 + 1;
  let naturel = -1;
  for (let j = i0 + 1; j <= i1; j++) {
    if (!tient(places, i0, j)) break;
    plusLong = j;
    if (j === i1 || coupeNaturelle(places, j)) naturel = j;
  }
  return [i0, naturel >= 0 ? naturel : plusLong];
}

const aExclamation = (m: Mot) => m[0].includes('!');
const estMotFort = (m: Mot) => m[3] === 1 || (estFort(m[0]) && !aExclamation(m));
const estInterjection = (m: Mot) => INTERJECTIONS.has(motNu(m[0]));

/** Note et raison d'une candidate (temps source [ts, fin]). */
function noter(ceux: readonly Mot[], ts: Sec, fin: Sec, e: EntreePunchlinesV4, finTour: boolean, debutTour: boolean, sequence: number): { note: number; raison: RaisonPunchlineV4 } {
  const P = POINTS_PUNCHLINES;
  const R = PUNCHLINES_V4;
  const points: [RaisonPunchlineV4, number][] = [];
  if (ceux.some(aExclamation)) points.push(['exclamation', P.exclamation]);
  if (ceux.some(estMotFort)) points.push(['mot-fort', P.motFort]);
  if (ceux.some((m) => estJuron(m[0]))) points.push(['juron', P.juron]);
  if (ceux.some(estInterjection)) points.push(['exclamation', P.interjection]);
  const force = (genres: readonly GenreMoment[], de: Sec, a: Sec) =>
    e.moments.reduce((f, m) => (genres.includes(m.genre) && m.de < a && m.a > de ? Math.max(f, m.force) : f), 0);
  const cri = force(['cri'], ts, fin);
  if (cri > 0) points.push(['cri', P.cri * cri]);
  // Un rire qui commence pendant la phrase ou juste après : la blague a marché.
  const rire = e.moments.reduce((f, m) => (GENRES_RIRE.includes(m.genre) && m.de >= ts - 0.3 && m.de <= fin + R.apresRire ? Math.max(f, m.force) : f), 0);
  if (rire > 0) points.push(['rire', P.rire * rire]);
  const forte = force(GENRES_PHRASE, ts, fin);
  if (forte > 0) points.push(['phrase-forte', P.phraseForte * forte]);
  const pic =
    force(GENRES_PIC, ts - R.autourPic, fin + R.autourPic) > 0 ||
    (e.signaux?.pics.some((p) => p.ts >= ts - R.autourPic && p.ts <= fin + R.autourPic) ?? false);
  if (pic) points.push(['pic', P.pic]);
  const coeur = sequence >= 0 ? e.sequences[sequence]!.coeur : undefined;
  if (coeur && coeur.de < fin + R.autourCoeur && coeur.a > ts - R.autourCoeur) points.push(['replique', P.coeur]);
  let note = P.base + points.reduce((s, [, x]) => s + x, 0);
  if (finTour) note += P.finDeReplique;
  if (debutTour) note += P.debutDeReplique;
  if (ceux.length === 1) note += P.unMot;
  else if (ceux.length === 2) note += P.deuxMots;
  const raison = points.length > 0 ? points.reduce((m, x) => (x[1] > m[1] ? x : m))[0] : 'replique';
  return { note: Math.round(note * 1000) / 1000, raison };
}

/** Toutes les punchlines possibles d'un montage (mots placés dans les plans de la recette), notées. Pure. */
export function candidatsPunchlines(r: Recette, e: EntreePunchlinesV4): CandidatPunchline[] {
  const sc = compiler(r);
  const mots = [...e.mots].sort((x, y) => x[1] - y[1]);
  // Mots que Whisper a sans doute inventés (boucles, piles, phrases toutes faites) : jamais dans une punchline.
  const douteux = motsDouteux(mots);
  const vus = new Set<number>();
  // Chaque mot une fois (la 1re fois qu'il apparaît), dans l'ordre de la vidéo.
  const places = placerMots(sc.plans, mots, e.src).filter((m) => (vus.has(m.k) ? false : (vus.add(m.k), true)));
  const qui = (m: MotPlace) => personneA(e.tours, (m.mot[1] + m.mot[2]) / 2);
  const res: CandidatPunchline[] = [];
  const ajouter = (i0: number, i1: number, finTour: boolean, debutTour: boolean) => {
    const ceux = places.slice(i0, i1);
    const ts = ceux[0]!.mot[1];
    const fin = ceux[ceux.length - 1]!.mot[2];
    if (fin - ts < PUNCHLINES_V4.dureeMin) return;
    // Pile de Whisper (mots empilés au même instant) : pas une vraie phrase.
    if (ceux.length >= 2 && (fin - ts) / ceux.length < PUNCHLINES_V4.dureeMotMin) return;
    const n = PUNCHLINES_V4.pileMots;
    if (ceux.some((m, i) => i + n - 1 < ceux.length && ceux[i + n - 1]!.mot[1] - m.mot[1] <= PUNCHLINES_V4.pileFenetre + 1e-9)) return;
    if (ceux.every((m) => motNu(m.mot[0]).length < 2)) return;
    if (ceux.some((m) => douteux[m.k])) return;
    if (res.some((c) => c.ts === ts && c.fin === fin)) return;
    const milieu = (ts + fin) / 2;
    const sequence = e.sequences.findIndex((s) => milieu >= s.de && milieu < s.a);
    const motsCeux = ceux.map((m) => m.mot);
    const { note, raison } = noter(motsCeux, ts, fin, e, finTour, debutTour, sequence);
    const c = indiceCle(motsCeux);
    res.push({ ts, fin, k0: ceux[0]!.k, k1: ceux[ceux.length - 1]!.k + 1, t0: ceux[0]!.t0, t1: ceux[ceux.length - 1]!.t1, note, raison, cle: c === null ? null : ceux[0]!.k + c, sequence });
  };
  let debutTour = true;
  for (const { i0, i1, finTour } of repliques(places, qui)) {
    if (tient(places, i0, i1)) ajouter(i0, i1, finTour, debutTour);
    else {
      const [f0, f1] = fenetreFin(places, i0, i1);
      ajouter(f0, f1, finTour, false);
      const [d0, d1] = fenetreDebut(places, i0, i1);
      if (d1 <= f0) ajouter(d0, d1, false, debutTour);
    }
    debutTour = finTour;
  }
  return res.sort((x, y) => x.t0 - y.t0);
}

/** Nombre visé de punchlines pour `duree` s de montage (≈ 3,3 / min, 4 / min au plus). */
export function nombrePunchlines(duree: Sec): { vise: number; max: number } {
  const min = Math.max(0, duree) / 60;
  const max = duree > 0 ? Math.max(1, Math.floor(PUNCHLINES_V4.maxParMinute * min + 1e-9)) : 0;
  return { vise: Math.min(max, Math.max(duree > 0 ? 1 : 0, Math.round(PUNCHLINES_V4.parMinute * min))), max };
}

/**
 * Le choix : au moins une par séquence (sa meilleure, si sa note le permet), puis les mieux notées jusqu'au nombre
 * visé, sans chevauchement (0,3 s d'écart au moins) et au plus 6 par fenêtre de 60 s. Rendu dans l'ordre de la vidéo.
 */
export function choisirPunchlines(candidats: readonly CandidatPunchline[], duree: Sec): CandidatPunchline[] {
  const { vise } = nombrePunchlines(duree);
  const R = PUNCHLINES_V4;
  const parNote = [...candidats].filter((c) => c.note >= R.noteMin).sort((x, y) => y.note - x.note || x.t0 - y.t0);
  const choisis: CandidatPunchline[] = [];
  // Aucune fenêtre de 60 s (n'importe où) n'en contient plus de 6 : on regarde les fenêtres qui contiennent c.
  const fenetreOk = (c: CandidatPunchline) => {
    const ts = choisis.map((x) => x.t0).filter((t) => Math.abs(t - c.t0) < R.fenetre).concat(c.t0).sort((x, y) => x - y);
    return ts.every((t, i) => ts.filter((u, j) => j >= i && u - t < R.fenetre).length <= R.maxFenetre);
  };
  const possible = (c: CandidatPunchline) =>
    choisis.every((x) => c.t0 >= x.t1 + R.ecartMin || c.t1 <= x.t0 - R.ecartMin) &&
    choisis.every((x) => x.fin <= c.ts || x.ts >= c.fin) &&
    fenetreOk(c);
  // 1. Une par séquence (les séquences dont la meilleure est la mieux notée d'abord).
  const meilleures = new Map<number, CandidatPunchline>();
  for (const c of parNote) if (c.sequence >= 0 && !meilleures.has(c.sequence)) meilleures.set(c.sequence, c);
  for (const c of [...meilleures.values()].sort((x, y) => y.note - x.note || x.t0 - y.t0)) {
    if (choisis.length >= vise) break;
    if (possible(c)) choisis.push(c);
  }
  // 2. Les mieux notées.
  for (const c of parNote) {
    if (choisis.length >= vise) break;
    if (!choisis.includes(c) && possible(c)) choisis.push(c);
  }
  return choisis.sort((x, y) => x.t0 - y.t0);
}

/** Les punchlines du Best-of v4 pour un montage déjà coupé (plans = morceaux gardés). Pure. */
export function punchlinesV4(r: Recette, e: EntreePunchlinesV4): CandidatPunchline[] {
  if (!e.mots.some((m) => m[0].trim())) return [];
  return choisirPunchlines(candidatsPunchlines(r, e), compiler(r).duree);
}
