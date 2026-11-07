// Étape « voix » de la chaîne v4 (dev-voix), PURE : qui parle, sur les segments de parole (CONTRAT.md §1.2).
//  1. Pistes séparées (OBS micro + Discord) : une voix par piste, exact (voixDesPistes, inchangé).
//  2. Sinon, les segments de parole sont coupés en morceaux de 1,5 s au plus (au creux d'énergie) ; le niveau d'un
//     morceau = 90ᵉ centile de l'énergie de la bande voix ; groupes de niveau (poids = durée, seuil au creux) :
//     « 2 voix » si l'écart des médianes ≥ 6 dB et le creux ≤ 0,6 × le plus petit sommet (3 voix ou plus possibles).
//  3. Morceau ambigu (à ± 3 dB d'un seuil) : l'empreinte CAM++ si on l'a ; sinon la voix du morceau voisin sûr (même
//     tour, à < 0,3 s), et le tour est « incertain ».
//  4. Une seule voix au niveau : l'empreinte si on l'a (2 voix si le cosinus des centres < 0,68 ; les morceaux sans
//     empreinte sont rangés d'après leur niveau + timbre, appris sur ceux qui en ont une) ; sinon « une » et
//     `proposerEmpreinte = 'memeNiveau'` ; le timbre (8 bandes, comme avant) ne sert que pour « Deux personnes ».
//  5. p1 = la voix la plus FORTE (à gauche dans la DA), p2 la suivante… ; tours = morceaux voisins de la même voix
//     (trous ≤ 0,3 s), ≥ 0,3 s, jamais hors des segments de parole.
// L'empreinte n'est JAMAIS calculée ici : morceauxAEmpreinter dit lesquels l'aideraient (≈ 150 + les ambigus).

import type { Sec, TourDeParole } from '../../recette/types';
import type { PlageTemps } from '../types';
import type { EmpreintesVoix, VoixTrouvee } from '../types-v3';
import type { EmpreintesNeurales, EntreeVoix, SeparationVoix, VoixDetecteesV4 } from '../types-v4';
import { kMoyennes2, plusProche } from './classement';
import { CAMPLUS } from '../modeles/catalogue';
import { cosinus, groupeDe, groupesDEmpreintes, groupesDeNiveau, medianePonderee, normer } from './groupes';
import { decouperEnMorceaux, dureeMorceau, type MorceauParole } from './morceaux-parole';
import { NIVEAU_VIDE, niveauxDesMorceaux, timbresDesMorceaux } from './niveau-v4';
import { noterNettete, voixDesPistes } from './qui-parle';
import { PART_SURE_TOUR } from './tours';

export const REGLAGES_VOIX_V4 = {
  /** Un morceau à moins de `ambiguDb` dB d'un seuil de niveau est ambigu. */
  ambiguDb: 3,
  /** Morceau voisin « du même tour » : à moins de `voisin` s. */
  voisin: 0.3,
  /**
   * Tours : deux morceaux de la même voix à ≤ `pont` s font un seul tour (une pause dans la phrase ; le contrat disait
   * 0,3 s) ; un tour déborde de `marge` s de chaque côté de la parole entendue (sans empiéter sur la voix voisine :
   * au plus jusqu'au milieu du trou) ; tours ≥ `tourMin` s (sans les marges). Pourquoi : la VAD rate les bords des
   * mots (vraie session : 12 % du temps de parole de la vérité est à moins de 0,3 s d'un segment, hors de lui ; 0,25 s = la marge « avant » de la DA).
   * La bouche des persos, elle, suit la VAD (dev-persos) : ces marges ne la font pas bouger dans le vide.
   */
  pont: 0.8,
  marge: 0.25,
  tourMin: 0.3,
  /** Au-delà de cette part du temps de parole ambiguë, l'empreinte est proposée (« ambigus »). */
  partAmbigus: 0.25,
  /** Empreintes demandées : ≈ `reparties` morceaux répartis sur la session + les ambigus, `max` en tout. */
  reparties: 150,
  max: 300,
  /** Durée minimale d'un morceau donné à l'empreinte (il est élargi autour de son milieu). */
  dureeEmpreinte: 0.6,
  /** Avec l'empreinte, un ambigu est « sûr » si son cosinus au bon centre dépasse l'autre de `margeCosinus`. */
  margeCosinus: 0.05,
  /** Il faut au moins `appris` morceaux sûrs avec empreinte par voix pour s'en servir. */
  appris: 3,
  /**
   * Timbre seul (même niveau, sans empreinte) : 0 = seulement si l'utilisateur dit « Deux personnes » (d'office :
   * « une » et l'empreinte proposée) ; 1 = aussi tout seul si le rapport inter / intra ≥ `rapportTimbre`. Pourquoi 0 :
   * sur du vrai son le timbre se trompe (vraie session, 0–600 s : rapport 1,65, partage d'accord à 61 % seulement
   * avec CAM++) et ce rapport ne distingue pas un vrai partage (voix fabriquées bien différentes : 1,56).
   * Morceaux d'au moins `timbreMin` s pour apprendre, parts entre 10 et 90 %.
   */
  timbreAuto: 0,
  timbreMin: 1,
  rapportTimbre: 1.5,
  margeTimbre: 0.15,
} as const;

export type ReglagesVoixV4 = { -readonly [K in keyof typeof REGLAGES_VOIX_V4]: number };

/** Un niveau à ou sous ce plancher : morceau sans son mesuré (rangé avec son voisin). */
const MUET = NIVEAU_VIDE + 10;

/** Ce que la séparation a décidé pour chaque morceau (avant de nommer les voix). */
interface Decision {
  morceaux: MorceauParole[];
  niveaux: Float64Array;
  durees: Float64Array;
  /** Groupe de chaque morceau (0..k−1, dans un ordre quelconque). */
  groupe: Int32Array;
  sur: Uint8Array;
  /** Ambigu au niveau (à ± 3 dB d'un seuil). */
  ambigu: Uint8Array;
  /** Netteté (écart au seuil en dB, ou marge du timbre / de l'empreinte × 10). */
  nettete: Float64Array;
  k: number;
  par: SeparationVoix['par'];
  seuils: number[];
  cosinusCentres: number | null;
  proposerEmpreinte: SeparationVoix['proposerEmpreinte'];
}

/** L'empreinte de chaque morceau (celle qui le recouvre le plus, au moins la moitié), sinon null. */
export function empreintesDesMorceaux(morceaux: readonly PlageTemps[], neurales: EmpreintesNeurales | null): (Float32Array | null)[] {
  const res: (Float32Array | null)[] = morceaux.map(() => null);
  if (!neurales || neurales.morceaux.length === 0) return res;
  const emp = [...neurales.morceaux].sort((x, y) => x.de - y.de);
  let debut = 0;
  morceaux.forEach((m, j) => {
    while (debut < emp.length && emp[debut]!.a <= m.de - 5) debut++;
    let max = 0;
    for (let i = debut; i < emp.length && emp[i]!.de < m.a; i++) {
      const x = emp[i]!;
      const rec = Math.min(m.a, x.a) - Math.max(m.de, x.de);
      if (rec > max && rec >= 0.5 * Math.min(m.a - m.de, x.a - x.de) - 1e-9) {
        max = rec;
        res[j] = x.v;
      }
    }
  });
  return res;
}

/** Morceaux voisins (dans le temps) de j, avec leur écart (s). */
function voisins(ms: readonly MorceauParole[], j: number): { i: number; ecart: Sec }[] {
  const res: { i: number; ecart: Sec }[] = [];
  if (j > 0) res.push({ i: j - 1, ecart: ms[j]!.de - ms[j - 1]!.a });
  if (j + 1 < ms.length) res.push({ i: j + 1, ecart: ms[j + 1]!.de - ms[j]!.a });
  return res.sort((x, y) => x.ecart - y.ecart);
}

/** Une seule voix pour tous les morceaux. */
function uneVoix(d: Pick<Decision, 'morceaux' | 'niveaux' | 'durees'>, par: SeparationVoix['par'], proposer: SeparationVoix['proposerEmpreinte'], cos: number | null): Decision {
  const n = d.morceaux.length;
  return {
    ...d,
    groupe: new Int32Array(n),
    sur: new Uint8Array(n).fill(1),
    ambigu: new Uint8Array(n),
    nettete: new Float64Array(n).fill(10),
    k: 1,
    par,
    seuils: [],
    cosinusCentres: cos,
    proposerEmpreinte: proposer,
  };
}

/**
 * Range chaque morceau sans décision (`groupe` < 0) avec son plus proche voisin décidé (à < maxEcart s), sinon le
 * plus proche par le timbre (centres appris sur les morceaux décidés). Les morceaux rangés ainsi ne sont pas sûrs.
 */
function rangerLesAutres(d: Decision, e: EmpreintesVoix, maxEcart: Sec) {
  const ms = d.morceaux;
  const n = ms.length;
  const restants = Array.from({ length: n }, (_, j) => j).filter((j) => d.groupe[j]! < 0);
  if (restants.length === 0) return;
  // Le plus proche voisin décidé, de chaque côté (balayage).
  const avant = new Int32Array(n).fill(-1);
  const apres = new Int32Array(n).fill(-1);
  let der = -1;
  for (let j = 0; j < n; j++) {
    avant[j] = der;
    if (d.groupe[j]! >= 0) der = j;
  }
  der = -1;
  for (let j = n - 1; j >= 0; j--) {
    apres[j] = der;
    if (d.groupe[j]! >= 0) der = j;
  }
  const timbres = timbresDesMorceaux(ms, e, d.niveaux);
  const centres: (Float64Array | null)[] = Array.from({ length: d.k }, (_, g) => {
    const siens = Array.from({ length: n }, (_, j) => j).filter((j) => d.groupe[j] === g && timbres[j]);
    if (siens.length === 0) return null;
    const c = new Float64Array(8);
    for (const j of siens) for (let b = 0; b < 8; b++) c[b]! += timbres[j]![b]! / siens.length;
    return c;
  });
  const nouveaux = new Int32Array(n).fill(-1);
  for (const j of restants) {
    const cands = [avant[j]!, apres[j]!].filter((i) => i >= 0).map((i) => ({ i, ecart: Math.max(0, i < j ? ms[j]!.de - ms[i]!.a : ms[i]!.de - ms[j]!.a) })).sort((x, y) => x.ecart - y.ecart);
    const proche = cands[0];
    if (proche && proche.ecart <= maxEcart) nouveaux[j] = d.groupe[proche.i]!;
    else if (timbres[j]) {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, g) => {
        if (!c) return;
        let s = 0;
        for (let b = 0; b < 8; b++) s += (timbres[j]![b]! - c[b]!) ** 2;
        if (s < bd) [bd, best] = [s, g];
      });
      nouveaux[j] = best;
    } else nouveaux[j] = proche ? d.groupe[proche.i]! : 0;
  }
  for (const j of restants) {
    d.groupe[j] = nouveaux[j]!;
    d.sur[j] = 0;
    d.nettete[j] = 0;
  }
}

/** Inverse d'une petite matrice symétrique (Gauss-Jordan), régularisée ; null si elle ne s'inverse pas. */
function inverser(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((ligne, i) => [...ligne, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r]![i]!) > Math.abs(a[p]![i]!)) p = r;
    if (Math.abs(a[p]![i]!) < 1e-12) return null;
    [a[i], a[p]] = [a[p]!, a[i]!];
    const piv = a[i]![i]!;
    for (let c = 0; c < 2 * n; c++) a[i]![c]! /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = a[r]![i]!;
      if (f !== 0) for (let c = 0; c < 2 * n; c++) a[r]![c]! -= f * a[i]![c]!;
    }
  }
  return a.map((ligne) => ligne.slice(n));
}

/**
 * Range les morceaux SANS décision (`groupe` < 0) d'après leur niveau et leur timbre (9 valeurs), par une analyse
 * discriminante linéaire (moyenne de chaque voix, covariance commune) apprise sur les morceaux SÛRS décidés (par
 * l'empreinte). Ils restent « pas sûrs ». false s'il n'y a pas assez d'exemples (≥ 5 par voix).
 */
function rangerParApprentissage(d: Decision, e: EmpreintesVoix): boolean {
  const ms = d.morceaux;
  const n = ms.length;
  const timbres = timbresDesMorceaux(ms, e, d.niveaux);
  const trait = (j: number): number[] | null => (timbres[j] && d.niveaux[j]! > MUET ? [d.niveaux[j]! / 3, ...Array.from(timbres[j]!)] : null);
  const D = 9;
  const parVoix = Array.from({ length: d.k }, () => [] as number[][]);
  for (let j = 0; j < n; j++) {
    if (d.groupe[j]! < 0 || !d.sur[j]) continue;
    const x = trait(j);
    if (x) parVoix[d.groupe[j]!]!.push(x);
  }
  if (parVoix.some((l) => l.length < 5)) return false;
  const moyennes = parVoix.map((l) => Array.from({ length: D }, (_, c) => l.reduce((s, x) => s + x[c]!, 0) / l.length));
  const cov = Array.from({ length: D }, () => new Array<number>(D).fill(0));
  let total = 0;
  parVoix.forEach((l, g) => {
    for (const x of l) {
      for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) cov[a]![b]! += (x[a]! - moyennes[g]![a]!) * (x[b]! - moyennes[g]![b]!);
      total++;
    }
  });
  for (let a = 0; a < D; a++) {
    for (let b = 0; b < D; b++) cov[a]![b]! /= Math.max(1, total - d.k);
    cov[a]![a]! += 1e-3;
  }
  const inv = inverser(cov);
  if (!inv) return false;
  for (let j = 0; j < n; j++) {
    if (d.groupe[j]! >= 0) continue;
    const x = trait(j);
    if (!x) continue;
    let best = 0;
    let bd = Infinity;
    moyennes.forEach((m, g) => {
      const v = x.map((y, c) => y - m[c]!);
      let s = 0;
      for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) s += v[a]! * inv[a]![b]! * v[b]!;
      if (s < bd) [bd, best] = [s, g];
    });
    d.groupe[j] = best;
    d.sur[j] = 0;
    d.nettete[j] = 0;
  }
  return true;
}

/** Séparation par le niveau (2 groupes ou plus trouvés), l'empreinte tranche les ambigus si on l'a. */
function parNiveau(base: Pick<Decision, 'morceaux' | 'niveaux' | 'durees'>, seuils: number[], valides: Uint8Array, neur: (Float32Array | null)[], e: EmpreintesVoix, R: ReglagesVoixV4): Decision {
  const { morceaux: ms, niveaux } = base;
  const n = ms.length;
  const d: Decision = {
    ...base,
    groupe: new Int32Array(n).fill(-1),
    sur: new Uint8Array(n),
    ambigu: new Uint8Array(n),
    nettete: new Float64Array(n),
    k: seuils.length + 1,
    par: 'niveau',
    seuils,
    cosinusCentres: null,
    proposerEmpreinte: null,
  };
  for (let j = 0; j < n; j++) {
    if (!valides[j]) continue;
    const v = niveaux[j]!;
    const ecart = Math.min(...seuils.map((s) => Math.abs(v - s)));
    d.groupe[j] = groupeDe(v, seuils);
    d.ambigu[j] = ecart < R.ambiguDb ? 1 : 0;
    d.sur[j] = d.ambigu[j] ? 0 : 1;
    d.nettete[j] = ecart;
  }
  // L'empreinte : centres appris sur les morceaux SÛRS qui en ont une ; les ambigus vont au centre le plus proche.
  const centres = Array.from({ length: d.k }, (_, g) => {
    const siens = Array.from({ length: n }, (_, j) => j).filter((j) => d.sur[j] && d.groupe[j] === g && neur[j]);
    if (siens.length < R.appris) return null;
    const s = new Float64Array(neur[siens[0]!]!.length);
    for (const j of siens) for (let i = 0; i < s.length; i++) s[i]! += neur[j]![i]!;
    return normer(s);
  });
  if (centres.every((c) => c)) {
    let max = -Infinity;
    for (let a = 0; a < centres.length; a++) for (let b = a + 1; b < centres.length; b++) max = Math.max(max, cosinus(centres[a]!, centres[b]!));
    d.cosinusCentres = max;
    let tranches = 0;
    for (let j = 0; j < n; j++) {
      if (!d.ambigu[j] || !neur[j]) continue;
      const cos = centres.map((c) => cosinus(neur[j]!, c!));
      const ordre = cos.map((_, g) => g).sort((x, y) => cos[y]! - cos[x]!);
      d.groupe[j] = ordre[0]!;
      const marge = cos[ordre[0]!]! - cos[ordre[1]!]!;
      if (marge >= R.margeCosinus) d.sur[j] = 1;
      d.nettete[j] = marge * 10;
      tranches++;
    }
    if (tranches > 0) d.par = 'niveau+empreinte';
  }
  // Sans empreinte : un ambigu prend la voix d'un voisin sûr du même tour (à < 0,3 s) ; il reste incertain.
  const groupeNiveau = Int32Array.from(d.groupe);
  for (let j = 0; j < n; j++) {
    if (!d.ambigu[j] || d.sur[j] || !valides[j]) continue;
    for (const { i, ecart } of voisins(ms, j)) {
      if (ecart > R.voisin || !d.sur[i] || !valides[i]) continue;
      d.groupe[j] = groupeNiveau[i]!;
      break;
    }
  }
  rangerLesAutres(d, e, 2);
  return d;
}

/** Une seule voix au niveau : l'empreinte, sinon le timbre, sinon une voix. */
function memeNiveau(
  base: Pick<Decision, 'morceaux' | 'niveaux' | 'durees'>,
  valides: Uint8Array,
  neur: (Float32Array | null)[],
  e: EmpreintesVoix,
  forcer: 1 | 2 | undefined,
  partage: { seuil: number; ecart: number } | null,
  R: ReglagesVoixV4,
): Decision {
  const { morceaux: ms, niveaux } = base;
  const n = ms.length;
  const avecEmp = Array.from({ length: n }, (_, j) => j).filter((j) => neur[j] && valides[j]);
  if (avecEmp.length >= 8) {
    const g = groupesDEmpreintes(avecEmp.map((j) => neur[j]!), forcer === 2 ? { forcer: 2 } : {});
    if (g.centres.length < 2) return uneVoix(base, 'une', null, g.cosinusCentres);
    const d: Decision = {
      ...base,
      groupe: new Int32Array(n).fill(-1),
      sur: new Uint8Array(n),
      ambigu: new Uint8Array(n),
      nettete: new Float64Array(n),
      k: g.centres.length,
      par: 'empreinte',
      seuils: [],
      cosinusCentres: g.cosinusCentres,
      proposerEmpreinte: null,
    };
    avecEmp.forEach((j, u) => {
      d.groupe[j] = g.groupes[u]!;
      const cos = g.centres.map((c) => cosinus(neur[j]!, c));
      const tries = [...cos].sort((x, y) => y - x);
      const marge = tries[0]! - (tries[1] ?? -1);
      d.sur[j] = marge >= R.margeCosinus ? 1 : 0;
      d.nettete[j] = marge * 10;
    });
    // Les morceaux sans empreinte : d'après le niveau et le timbre, appris sur ceux qui en ont une ; à défaut, le voisin.
    rangerParApprentissage(d, e);
    rangerLesAutres(d, e, 3);
    return d;
  }
  const proposer: SeparationVoix['proposerEmpreinte'] = 'memeNiveau';
  // « Deux personnes » forcé : le meilleur partage du niveau s'il sépare un peu (≥ 4 dB), sinon le timbre forcé.
  if (forcer === 2 && partage && partage.ecart >= 4) {
    const d = parNiveau(base, [partage.seuil], valides, neur, e, R);
    return { ...d, proposerEmpreinte: proposer };
  }
  // Timbre seul (comme avant, mais par morceau) : spectre moyen des morceaux d'au moins 1 s.
  const timbres = timbresDesMorceaux(ms, e, niveaux);
  const utiles = Array.from({ length: n }, (_, j) => j).filter((j) => valides[j] && timbres[j] && base.durees[j]! >= R.timbreMin);
  const km = kMoyennes2(utiles.map((j) => timbres[j]!));
  const part0 = km ? km.groupes.filter((x) => x === 0).length / km.groupes.length : 0;
  const deux = km && (forcer === 2 || (R.timbreAuto > 0 && km.rapport >= R.rapportTimbre && part0 >= 0.1 && part0 <= 0.9));
  if (!km || !deux) return uneVoix(base, 'une', proposer, null);
  const d: Decision = {
    ...base,
    groupe: new Int32Array(n).fill(-1),
    sur: new Uint8Array(n),
    ambigu: new Uint8Array(n),
    nettete: new Float64Array(n),
    k: 2,
    par: 'timbre',
    seuils: [],
    cosinusCentres: null,
    proposerEmpreinte: proposer,
  };
  for (let j = 0; j < n; j++) {
    if (!timbres[j] || !valides[j]) continue;
    const p = plusProche(timbres[j]!, km.c[0], km.c[1]);
    d.groupe[j] = p.g;
    d.sur[j] = p.ecart >= R.margeTimbre ? 1 : 0;
    d.nettete[j] = p.ecart * 10;
  }
  rangerLesAutres(d, e, 2);
  return d;
}

/** Toute la décision sur une piste (sans les noms des voix). null s'il n'y a aucun morceau. */
function decider(e: EntreeVoix, principale: EmpreintesVoix, avecEmpreintes: boolean, R: ReglagesVoixV4): Decision | null {
  const morceaux = decouperEnMorceaux(e.parole.segments, principale);
  if (morceaux.length === 0) return null;
  const niveaux = niveauxDesMorceaux(morceaux, principale);
  const durees = Float64Array.from(morceaux, dureeMorceau);
  const base = { morceaux, niveaux, durees };
  const n = morceaux.length;
  const valides = Uint8Array.from(niveaux, (v) => (v > MUET ? 1 : 0));
  const ix = Array.from({ length: n }, (_, j) => j).filter((j) => valides[j]);
  if (ix.length === 0) return null;
  if (e.forcer === 1) return uneVoix(base, 'une', null, null);
  const neur = avecEmpreintes ? empreintesDesMorceaux(morceaux, e.neurales) : morceaux.map(() => null);
  const niv = ix.map((j) => niveaux[j]!);
  const poids = ix.map((j) => durees[j]!);
  const libre = groupesDeNiveau(niv, poids);
  if (libre.seuils.length >= 1) {
    // « Deux personnes » forcé alors que le niveau en voit plus : le premier partage seulement.
    const seuils = e.forcer === 2 && libre.premier ? [libre.premier.seuil] : libre.seuils;
    let d = parNiveau(base, seuils, valides, neur, principale, R);
    // L'empreinte dit que deux groupes de niveau sont la MÊME voix (une personne qui parle plus ou moins fort).
    if (e.forcer !== 2 && d.k === 2 && d.cosinusCentres !== null && d.cosinusCentres >= CAMPLUS.cosinusDeuxVoix) d = uneVoix(base, 'une', null, d.cosinusCentres);
    else if (d.par === 'niveau') {
      let amb = 0;
      let tout = 0;
      for (let j = 0; j < n; j++) {
        tout += durees[j]!;
        if (d.ambigu[j]) amb += durees[j]!;
      }
      if (tout > 0 && amb / tout > R.partAmbigus) d.proposerEmpreinte = 'ambigus';
    }
    return d;
  }
  const p = libre.premier;
  return memeNiveau(base, valides, neur, principale, e.forcer, p ? { seuil: p.seuil, ecart: p.haut - p.bas } : null, R);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Les voix nommées (p1 = la plus forte) et les tours, d'après la décision. */
function construire(src: string, d: Decision, R: ReglagesVoixV4): VoixDetecteesV4 | null {
  const { morceaux: ms, niveaux, durees } = d;
  const n = ms.length;
  // Ordre des voix : la plus forte d'abord (médiane pondérée des niveaux de ses morceaux).
  const medianes = Array.from({ length: d.k }, (_, g) => {
    const ix = Array.from({ length: n }, (_, j) => j).filter((j) => d.groupe[j] === g && niveaux[j]! > MUET);
    return { g, ix, med: ix.length > 0 ? medianePonderee(ix.map((j) => niveaux[j]!), ix.map((j) => durees[j]!)) : NIVEAU_VIDE };
  })
    .filter((x) => x.ix.length > 0)
    .sort((x, y) => y.med - x.med);
  const rang = new Map(medianes.map((x, i) => [x.g, i]));
  const ids = medianes.map((_, i) => `p${i + 1}`);
  // Tours : les parties des morceaux, dans l'ordre ; même voix et trou ≤ 0,3 s = même tour.
  interface Bloc { v: number; de: Sec; a: Sec; duree: Sec; sures: Sec; nettete: number }
  // Netteté d'un morceau pour les 3 extraits de la revue : sûr ET au niveau habituel de sa voix (pas le plus faible :
  // les morceaux les plus faibles de la voix faible sont souvent du jeu).
  const medianeDe = new Map(medianes.map((x) => [x.g, x.med]));
  const parties: { v: number; de: Sec; a: Sec; sur: boolean; nettete: number }[] = [];
  for (let j = 0; j < n; j++) {
    const v = rang.get(d.groupe[j]!);
    if (v === undefined) continue;
    const typique = Math.max(0, 10 - Math.abs(niveaux[j]! - medianeDe.get(d.groupe[j]!)!));
    const nettete = d.sur[j] ? typique + Math.min(2, d.nettete[j]!) : 0;
    for (const p of ms[j]!.parties) parties.push({ v, de: p.de, a: p.a, sur: d.sur[j] === 1, nettete });
  }
  parties.sort((x, y) => x.de - y.de);
  const blocs: Bloc[] = [];
  for (const p of parties) {
    const l = p.a - p.de;
    const der = blocs[blocs.length - 1];
    if (der && der.v === p.v && p.de - der.a <= R.pont + 1e-9) {
      der.a = Math.max(der.a, p.a);
      der.duree += l;
      der.sures += p.sur ? l : 0;
      der.nettete += p.nettete * l;
    } else blocs.push({ v: p.v, de: p.de, a: p.a, duree: l, sures: p.sur ? l : 0, nettete: p.nettete * l });
  }
  const gardes = blocs.filter((b) => b.a - b.de >= R.tourMin - 1e-9);
  const tours: TourDeParole[] = [];
  gardes.forEach((b, i) => {
    // Marges : jusqu'au milieu du trou si la voix voisine est une autre, sinon jusqu'à elle.
    const prec = gardes[i - 1];
    const suiv = gardes[i + 1];
    const limiteAvant = prec ? (prec.v === b.v ? prec.a : Math.max(prec.a, (prec.a + b.de) / 2)) : 0;
    const limiteApres = suiv ? (suiv.v === b.v ? suiv.de : Math.min(suiv.de, (b.a + suiv.de) / 2)) : Infinity;
    const ts = Math.min(b.de, Math.max(b.de - R.marge, limiteAvant));
    const fin = Math.max(b.a, Math.min(b.a + R.marge, limiteApres));
    const t: TourDeParole = { ts: r2(ts), fin: r2(fin), p: ids[b.v]!, src };
    if (b.sures / Math.max(1e-9, b.duree) < PART_SURE_TOUR) t.sur = false;
    noterNettete(t, b.nettete / Math.max(1e-9, b.duree));
    tours.push(t);
  });
  if (tours.length === 0) return null;
  let total = 0;
  let sures = 0;
  let ambigu = 0;
  const parVoix = new Float64Array(ids.length);
  for (let j = 0; j < n; j++) {
    const v = rang.get(d.groupe[j]!);
    if (v === undefined) continue;
    total += durees[j]!;
    parVoix[v]! += durees[j]!;
    if (d.sur[j]) sures += durees[j]!;
    if (d.ambigu[j]) ambigu += durees[j]!;
  }
  const voix: VoixTrouvee[] = medianes.map((x, i) => ({ id: ids[i]!, niveauDb: Math.round(x.med * 10) / 10, part: total > 0 ? parVoix[i]! / total : 0 }));
  const k = voix.length;
  const methode: VoixDetecteesV4['methode'] = k <= 1 ? 'une' : d.par === 'niveau' || d.par === 'niveau+empreinte' ? 'niveau+timbre' : 'timbre';
  // Seuil entre p1 et p2 (les deux plus fortes) quand le niveau a séparé.
  const seuil = d.seuils.length > 0 && k >= 2 ? (d.seuils.find((s) => s <= voix[0]!.niveauDb && s >= voix[1]!.niveauDb) ?? d.seuils[d.seuils.length - 1]!) : null;
  const separation: SeparationVoix = {
    par: k <= 1 ? 'une' : d.par,
    seuilDb: seuil === null ? null : Math.round(seuil * 10) / 10,
    ecartDb: k >= 2 ? Math.round((voix[0]!.niveauDb - voix[1]!.niveauDb) * 10) / 10 : null,
    cosinusCentres: d.cosinusCentres === null ? null : Math.round(d.cosinusCentres * 1000) / 1000,
    ambigu: total > 0 ? Math.round(((d.seuils.length > 0 ? ambigu : total - sures) / total) * 1000) / 1000 : 0,
    morceaux: n,
    proposerEmpreinte: d.proposerEmpreinte,
  };
  return { src, methode, voix, tours, sure: total > 0 ? sures / total : 0, separation };
}

/** Qui parle v4 (étape « voix » de la chaîne). null : personne ne parle (ou rien de mesuré). */
export function separerVoixV4(e: EntreeVoix): VoixDetecteesV4 | null {
  return separerVoixAvec(e);
}

/** separerVoixV4 avec d'autres réglages (banc, essais). */
export function separerVoixAvec(e: EntreeVoix, o: Partial<ReglagesVoixV4> = {}): VoixDetecteesV4 | null {
  const R: ReglagesVoixV4 = { ...REGLAGES_VOIX_V4, ...o };
  if (e.pistesSeparees && e.empreintes.length >= 2) {
    const d = voixDesPistes(e.empreintes, e.src);
    if (d.voix.length === 0 || d.tours.length === 0) return null;
    return { ...d, separation: { par: 'pistes', seuilDb: null, ecartDb: null, cosinusCentres: null, ambigu: 0, morceaux: 0, proposerEmpreinte: null } };
  }
  const principale = e.empreintes[0];
  if (!principale) return null;
  const d = decider(e, principale, true, R);
  return d ? construire(e.src, d, R) : null;
}

/**
 * Qui parle par l'EMPREINTE SEULE (sans le niveau) : pour le banc (« --empreinte forcee ») et les comparaisons.
 * Les morceaux sans empreinte prennent la voix du voisin le plus proche (ou du timbre). null sans empreintes.
 */
export function separerParEmpreintes(e: EntreeVoix, o: Partial<ReglagesVoixV4> = {}): VoixDetecteesV4 | null {
  const R: ReglagesVoixV4 = { ...REGLAGES_VOIX_V4, ...o };
  const principale = e.empreintes[0];
  if (!principale || !e.neurales || e.neurales.morceaux.length === 0) return null;
  const morceaux = decouperEnMorceaux(e.parole.segments, principale);
  if (morceaux.length === 0) return null;
  const niveaux = niveauxDesMorceaux(morceaux, principale);
  const durees = Float64Array.from(morceaux, dureeMorceau);
  const valides = new Uint8Array(morceaux.length).fill(1);
  const d = memeNiveau({ morceaux, niveaux, durees }, valides, empreintesDesMorceaux(morceaux, e.neurales), principale, e.forcer, null, R);
  return construire(e.src, d.par === 'empreinte' || d.k === 1 ? d : { ...d, par: 'empreinte' }, R);
}

/** Élargit une plage à `min` s autour de son milieu (dans [0, fin]). */
function elargir(p: PlageTemps, min: Sec, fin: Sec): PlageTemps {
  const l = p.a - p.de;
  if (l >= min) return { de: p.de, a: p.a };
  const m = (p.de + p.a) / 2;
  let de = Math.max(0, m - min / 2);
  const a = Math.min(fin, de + min);
  de = Math.max(0, a - min);
  return { de: Math.round(de * 1000) / 1000, a: Math.round(a * 1000) / 1000 };
}

/** Indices de `ix` (triés dans le temps) répartis sur la session : le plus long de chacune de `nb` tranches égales. */
function repartis(durees: Float64Array, ix: readonly number[], nb: number): number[] {
  if (ix.length <= nb) return [...ix];
  const res: number[] = [];
  for (let b = 0; b < nb; b++) {
    const de = Math.floor((b * ix.length) / nb);
    const a = Math.floor(((b + 1) * ix.length) / nb);
    let best = ix[de]!;
    for (let u = de; u < a; u++) if (durees[ix[u]!]! > durees[best]!) best = ix[u]!;
    res.push(best);
  }
  return res;
}

/**
 * Morceaux dont l'empreinte CAM++ aiderait (≈ 150 répartis sur la session + les ambigus, 300 au plus), d'après une
 * première séparation sans empreinte ; [] si elle n'apporterait rien (voix bien séparées par le niveau, sans aucun
 * ambigu, pistes séparées, ou « une seule personne » choisie). Plages de 0,6 à 3 s, triées.
 */
export function morceauxAEmpreinter(e: EntreeVoix, v: VoixDetecteesV4 | null): PlageTemps[] {
  const R: ReglagesVoixV4 = { ...REGLAGES_VOIX_V4 };
  if ((e.pistesSeparees && e.empreintes.length >= 2) || v?.separation.par === 'pistes' || e.forcer === 1) return [];
  const principale = e.empreintes[0];
  if (!principale) return [];
  const d = decider({ ...e, neurales: null }, principale, false, R);
  if (!d) return [];
  const n = d.morceaux.length;
  const tous = Array.from({ length: n }, (_, j) => j).filter((j) => d.niveaux[j]! > MUET);
  const ambigus = tous.filter((j) => d.ambigu[j]);
  let choisis: number[];
  if (d.k >= 2) {
    if (ambigus.length === 0 && !d.proposerEmpreinte) return [];
    // Pour apprendre chaque voix : des morceaux sûrs répartis, autant par voix ; puis les ambigus.
    const parVoix = Math.max(R.appris, Math.floor(R.reparties / d.k));
    const surs = Array.from({ length: d.k }, (_, g) => repartis(d.durees, tous.filter((j) => d.sur[j] && d.groupe[j] === g && d.durees[j]! >= R.dureeEmpreinte), parVoix)).flat();
    const reste = Math.max(0, R.max - surs.length);
    // Les ambigus les plus proches du seuil d'abord, s'il faut en laisser.
    const amb = [...ambigus].sort((x, y) => d.nettete[x]! - d.nettete[y]! || x - y).slice(0, reste);
    choisis = [...surs, ...amb];
  } else {
    // Une voix au niveau : on ne sait rien, des morceaux répartis sur toute la session.
    choisis = repartis(d.durees, tous.filter((j) => d.durees[j]! >= R.dureeEmpreinte), R.max);
    if (choisis.length < 8) choisis = repartis(d.durees, tous, R.max);
  }
  const fin = principale.duree;
  const vus = new Set<string>();
  const res: PlageTemps[] = [];
  for (const j of [...new Set(choisis)].sort((x, y) => x - y)) {
    const m = d.morceaux[j]!;
    const p = elargir(m, R.dureeEmpreinte, fin);
    const cle = `${p.de}|${p.a}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    res.push(p);
  }
  return res;
}
