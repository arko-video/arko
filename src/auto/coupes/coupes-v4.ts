// Étape « coupes » de la chaîne v4 (dev-coupes), PURE : les morceaux gardés (jump cuts) sur toute la source.
// Contrat : /home/claude/equipe/CONTRAT.md §1.4 et §4.5. Les fonctions d'avant (morceauxDeParole, REGLAGES_BLANCS :
// Couper les blancs, Montage express, monteur) ne changent pas : la v4 est écrite ici.
//  1. Zones gardées = mots propres ∪ segments de parole (en mode voix les « mots » SONT les segments) ∪ réactions
//     (rire, fou rire, cri, exclamation : gardées même sans mots, sur la partie qu'on entend : VAD, ou son au-dessus
//     de −55 dBFS et du fond + 10 dB).
//  2. Marges de la DA (« normal » : 0,25 s avant, 0,35 s après ; après un segment de la VAD 0,1 s de moins, car
//     Silero entend la fin de la voix en retard), fusion des morceaux à moins de 0,5 s : un trou de plus de 1,1 s
//     entre deux zones est coupé, un trou plus court reste (petites pauses de la vérité).
//  3. Sons forts hors parole (> −16 dBFS sur 100 ms, −0,4 / +0,6 s) gardés seulement si une réaction suit dans les
//     2 s, ou s'ils touchent (< 1 s) de la parole gardée.
//  4. Chaque bord : prolongé tant que la VAD entend encore la voix (+0,3 s au plus après, −0,2 s avant), puis glissé
//     vers la trame de 20 ms la plus calme à ± 0,15 s, JAMAIS là où p ≥ 0,35 (creux.ts).
//  5. Plages, passages muets, arrondi au 1/100 s, morceau ≥ 0,35 s. Fondus du son 20 / 40 ms (recette.blancs).
// Signatures GELÉES (types-v4.ts) ; `dureeDansMorceaux` reste égale à ce que garde couperLesBlancs.

import { arrondir } from '../../recette/temps';
import type { NiveauBlancs, Sec } from '../../recette/types';
import type { Morceau, PlageTemps, SignauxSource } from '../types';
import type { EntreeCoupes, GenreMoment, ReglagesCoupesV4 } from '../types-v4';
import { sonsForts } from './blancs';
import { ecouteDe, GARDE_NOYAU, partieEntendue, pointDeCoupe, prolonger, type Ecoute } from './creux';
import { morceauxDans, ranger } from './decoupe';
import { REGLAGES_BLANCS } from './reglages';

/** Ce que la v4 ajoute aux réglages de Couper les blancs (les mêmes pour Serré / Normal / Large). */
const EN_PLUS_V4 = {
  prolongerAvant: 0.2,
  prolongerApres: 0.3,
  seuilParole: 0.35,
  fenetreCreux: 0.15,
  fortSiReaction: true,
  reactionApres: 2,
} as const;

/** Réglages v4 d'office : les valeurs « normal » = la DA validée par Romain, plus la VAD et les creux. */
export const REGLAGES_COUPES_V4: Readonly<ReglagesCoupesV4> = {
  ...REGLAGES_BLANCS.normal,
  ...EN_PLUS_V4,
};

/** Réglages v4 d'un niveau (Serré / Normal / Large : marges de Couper les blancs, mêmes règles v4). */
export function reglagesCoupesV4(niveau: NiveauBlancs): ReglagesCoupesV4 {
  if (niveau === 'normal') return { ...REGLAGES_COUPES_V4 };
  return { ...(REGLAGES_BLANCS[niveau] ?? REGLAGES_BLANCS.normal), ...EN_PLUS_V4 };
}

/** Les moments qui sont des RÉACTIONS (gardées même sans mots ; elles sauvent un son fort qui les précède). */
export const GENRES_REACTION: readonly GenreMoment[] = ['rire', 'fouRire', 'cri', 'exclamation'];

/**
 * Silero entend la fin d'une phrase un peu APRÈS elle (sa probabilité retombe avec ≈ 0,1 s de retard, et le segment
 * garde 30 ms de marge) : la marge après un segment de parole est donc plus courte de RETARD_FIN_VAD que celle d'un
 * mot (mesuré sur la vraie session : la main coupe en médiane 0,25 s après la fin d'un segment). Si la voix continue,
 * le prolongement la garde quand même.
 */
export const RETARD_FIN_VAD: Sec = 0.1;

/** Un son fort « touche » la parole gardée s'il en est à moins de TOUCHE s (il est alors gardé). */
export const TOUCHE: Sec = 1;

const PRIORITE: Record<Morceau['raison'], number> = { parole: 3, voix: 2, fort: 1 };

/** Morceau en construction : ses bords, et la parole qu'il protège (noyau : on ne coupe jamais dedans). */
interface Brut {
  de: Sec;
  a: Sec;
  noyauDe: Sec;
  noyauA: Sec;
  raison: Morceau['raison'];
}

function fusionner(liste: Brut[], ecart: Sec): Brut[] {
  const tries = liste.filter((m) => m.a > m.de).sort((x, y) => x.de - y.de || x.a - y.a);
  const res: Brut[] = [];
  for (const m of tries) {
    const der = res[res.length - 1];
    if (der && m.de - der.a < ecart) {
      der.a = Math.max(der.a, m.a);
      der.noyauDe = Math.min(der.noyauDe, m.noyauDe);
      der.noyauA = Math.max(der.noyauA, m.noyauA);
      if (PRIORITE[m.raison] > PRIORITE[der.raison]) der.raison = m.raison;
    } else res.push({ ...m });
  }
  return res;
}

/** Retire de chaque morceau les passages muets (fin d'enregistrement AFK…). */
function sansMuets(liste: readonly Morceau[], muets: readonly PlageTemps[]): Morceau[] {
  let res = [...liste];
  for (const z of muets) {
    res = res.flatMap((m) => {
      if (z.a <= m.de || z.de >= m.a) return [m];
      const parts: Morceau[] = [];
      if (z.de > m.de) parts.push({ ...m, a: z.de });
      if (z.a < m.a) parts.push({ ...m, de: z.a });
      return parts;
    });
  }
  return res;
}

/** Durée de la source d'après ce qu'on a (signaux, VAD, segments, mots). */
function dureeSource(e: EntreeCoupes): Sec {
  if (e.signaux) return e.signaux.duree;
  let d = 0;
  const v = e.parole.probas;
  if (v) d = Math.max(d, v.p.length * v.pas);
  for (const s of e.parole.segments) d = Math.max(d, s.a);
  for (const m of e.mots) d = Math.max(d, m[2]);
  return d > 0 ? d + 1 : Infinity;
}

/** Les morceaux de [p0, p1] (sans arrondi ni plage) : zones → marges → forts → fusion → bords au creux → fusion. */
function morceauxDeZone(e: EntreeCoupes, r: ReglagesCoupesV4, ec: Ecoute, p0: Sec, p1: Sec): Morceau[] {
  const dans = (de: Sec, a: Sec) => a > p0 - r.apres - r.prolongerApres && de < p1 + r.avant + r.prolongerAvant;
  const zones: Brut[] = [];
  const apresSegment = Math.max(0.1, r.apres - RETARD_FIN_VAD);
  const ajouter = (de: Sec, a: Sec, raison: Morceau['raison'], apres: Sec) => {
    if (!(a >= de) || !dans(de, a)) return;
    zones.push({ de: de - r.avant, a: a + apres, noyauDe: de, noyauA: a, raison });
  };
  // Les « mots » vides sont des segments de parole (mode voix : motsDeParole).
  for (const m of e.mots) ajouter(m[1], Math.max(m[1], m[2]), 'parole', m[0].trim() ? r.apres : apresSegment);
  for (const s of e.parole.segments) ajouter(s.de, s.a, 'parole', apresSegment);
  // Réactions gardées sans mots, mais seulement la partie qu'on ENTEND (un « rire » muet ne fait pas un blanc).
  const reactions: PlageTemps[] = [];
  for (const m of e.moments) {
    if (!GENRES_REACTION.includes(m.genre) || !dans(m.de, m.a)) continue;
    const x = partieEntendue(ec, m.de, m.a, r.seuilParole);
    if (!x) continue;
    reactions.push(x);
    ajouter(x.de, x.a, 'voix', r.apres);
  }
  let morceaux = fusionner(zones, r.fusion);

  // Sons forts hors parole : gardés seulement s'ils sont suivis d'une réaction ou s'ils touchent la parole gardée.
  if (e.garder === 'parole+forts' && e.signaux) {
    const forts = sonsForts(e.signaux, r, Math.max(0, p0 - 2), p1 + 2).map((f): Brut => ({ de: f.de, a: f.a, noyauDe: f.de + r.fortAvant, noyauA: f.a - r.fortApres, raison: 'fort' }));
    const gardes = r.fortSiReaction ? forts.filter((f) => suiviDUneReaction(f, reactions, r.reactionApres) || touche(f, morceaux)) : forts;
    if (gardes.length > 0) morceaux = fusionner([...morceaux, ...gardes], r.fusion);
  }

  // Bords : prolongés tant que la voix continue, puis posés au creux, jamais dans la voix.
  const poses = morceaux.map((m): Brut => {
    const de0 = prolonger(ec, m.de, 'debut', r);
    const a0 = prolonger(ec, m.a, 'fin', r);
    const de = pointDeCoupe(ec, de0, 'debut', Math.min(de0 < m.de ? de0 : Infinity, m.noyauDe - GARDE_NOYAU), r);
    const a = pointDeCoupe(ec, a0, 'fin', Math.max(a0 > m.a ? a0 : -Infinity, m.noyauA + GARDE_NOYAU), r);
    return { ...m, de: Math.min(de, m.noyauDe), a: Math.max(a, m.noyauA) };
  });
  return fusionner(poses, r.fusion).map((m) => ({ de: m.de, a: m.a, raison: m.raison }));
}

function suiviDUneReaction(f: Brut, reactions: readonly PlageTemps[], apres: Sec): boolean {
  return reactions.some((m) => m.a > f.de && m.de < f.a + apres);
}

/** Le son fort est à moins de TOUCHE s d'un morceau de parole (ou de réaction) gardé. */
function touche(f: Brut, morceaux: readonly Brut[]): boolean {
  let lo = 0;
  let hi = morceaux.length;
  while (lo < hi) {
    const mi = (lo + hi) >> 1;
    if (morceaux[mi]!.a < f.de - TOUCHE) lo = mi + 1;
    else hi = mi;
  }
  for (let i = lo; i < morceaux.length && morceaux[i]!.de <= f.a + TOUCHE; i++) {
    const m = morceaux[i]!;
    if (m.de - f.a < TOUCHE && f.de - m.a < TOUCHE) return true;
  }
  return false;
}

/**
 * Les morceaux gardés (temps source, triés, sans chevauchement, ≥ morceauMin), sur toute la source ou seulement dans
 * `e.plages`. Ne lève pas sur des entrées vides (rend []).
 */
export function couperV4(e: EntreeCoupes): Morceau[] {
  return morceauxV4(e, reglagesCoupesV4(e.niveau));
}

/** couperV4 avec des réglages donnés (tests, banc ; `e.niveau` n'est alors pas lu). */
export function morceauxV4(e: EntreeCoupes, r: ReglagesCoupesV4): Morceau[] {
  const ec = ecouteDe(e.parole, e.energie);
  const duree = dureeSource(e);
  const plages = e.plages ? ranger(e.plages) : [{ de: 0, a: duree }];
  const signaux: SignauxSource | null = e.signaux;
  const res: Morceau[] = [];
  for (const p of plages) {
    const p0 = Math.max(0, p.de);
    const p1 = Math.min(p.a, duree);
    if (!(p1 > p0)) continue;
    const bornes = morceauxDeZone(e, r, ec, p0, p1)
      .map((m) => ({ ...m, de: Math.max(m.de, p0), a: Math.min(m.a, p1) }))
      .filter((m) => m.a > m.de);
    for (const m of sansMuets(bornes, signaux?.muets ?? [])) {
      const x = { ...m, de: arrondir(m.de), a: arrondir(m.a) };
      if (x.a - x.de >= r.morceauMin - 1e-9) res.push(x);
    }
  }
  return res;
}

/** Morceaux déjà rangés (une liste de morceaux = une analyse : elle ne change pas). */
const MORCEAUX_RANGES = new WeakMap<readonly PlageTemps[], PlageTemps[]>();

/**
 * Durée (s) que couperLesBlancs garderait des `plages` avec ces morceaux (même découpe : morceauxDans de
 * decoupe.ts, morceaux rangés, parties plus courtes que `morceauMin` retirées). Sert aux durées de la revue : elles
 * sont celles du montage.
 */
export function dureeDansMorceaux(morceaux: readonly PlageTemps[], plages: readonly PlageTemps[], morceauMin: Sec): Sec {
  // Rangés une fois par liste de morceaux (la revue appelle ceci pour chaque ligne, à chaque toucher : relecture 14).
  let ranges = MORCEAUX_RANGES.get(morceaux);
  if (!ranges) MORCEAUX_RANGES.set(morceaux, (ranges = ranger(morceaux)));
  let total = 0;
  for (const p of plages) for (const x of morceauxDans(p.de, p.a, ranges, morceauMin).parts) total += x.a - x.de;
  return Math.round(total * 100) / 100;
}
