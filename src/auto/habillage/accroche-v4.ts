// Accroche du Best-of v4 (dev-habillage), fonctions PURES. Contrat : §1.7 « Accroche ».
//
// Pourquoi une v4 : l'accroche d'avant (meilleurMoment, express.ts) prend le plus gros PIC DE SON du montage : sur la
// vraie session, un bruit du jeu à 1016,7 s, dans aucune séquence de la main (diagnostic 4.6) ; celle de la main est
// une phrase criée suivie de la réaction (2 morceaux de la séquence 14, 6,0 s). Ici :
//  1. le moment : le plus fort parmi les moments DES SÉQUENCES GARDÉES (fou rire, cri, rire, phrase forte,
//     exclamation, juron ; un son fort seulement à défaut), départagé par la note de sa séquence et une punchline
//     dessus ; sans moment : la meilleure punchline ; sinon le plus gros pic DANS les séquences ; jamais ailleurs ;
//  2. les morceaux : depuis le début de la phrase qui amène le moment (0,25 s avant son 1er mot), le morceau du montage
//     qui le contient puis, s'il le faut, le morceau suivant de la même séquence (la réaction) : 1 ou 2 morceaux ;
//  3. la fin : sur un bord de mot (fin d'un mot + 0,35 s au plus, sans toucher le suivant) ou dans un silence, au plus
//     près de 6 s (5,5 à 6,5 s).
// La séquence d'origine garde son passage (comme la main) ; la copie se pose avec accrocheDesMorceaux (recette/modeles).

import { compiler, type PlanPlace } from '../../recette/chronologie';
import type { Mot, PlagePunchline, Recette, Sec } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';
import type { AccrocheV4, GenreMoment, MomentV4 } from '../types-v4';
import { phrases } from './punchlines';

export const ACCROCHE_V4 = {
  /**
   * 10/11 : les 90 premières secondes de la source (lancement du jeu, bureau, menus) ne font une accroche qu'en
   * dernier recours : grosse pénalité sur la note.
   */
  debutSource: 90,
  penaliteDebut: 1000,
  /** Durée visée (s) et fourchette acceptée. */
  duree: 6,
  min: 5.5,
  max: 6.5,
  /** Au plus long (s) quand aucun bord de mot ne tombe dans la fourchette. */
  maxAbsolu: 7.5,
  /** Marge gardée avant le 1er mot de la phrase et après le dernier mot (marges de la DA). */
  avant: 0.25,
  apres: 0.35,
  /** La phrase qui amène un rire finit au plus 2,5 s avant lui ; le moment arrive au plus 4 s après le début. */
  avantRire: 2.5,
  avantMoment: 4,
  /** Deux morceaux de la même séquence à moins de 12 s (source) l'un de l'autre. */
  ecartMorceaux: 12,
  /** Autres débuts essayés pour tenir les 6 s : au plus 1,5 s plus tôt ou plus tard, à un début de mot après un trou. */
  decalageMax: 1.5,
  trouDebut: 0.25,
  coutDecalage: 0.3,
  /** Moments essayés, et poids du coût (durée hors de 5,5–6,5 s, début décalé) face à la note du moment. */
  candidats: 20,
  poidsCout: 0.5,
  /** Bonus de la note : séquence (× centile / 100), punchline sur le moment ; malus d'un simple son fort. */
  poidsSequence: 0.3,
  poidsPunchline: 0.3,
  facteurSon: 0.6,
} as const;

/** Les moments dignes de l'accroche, puis (à défaut, avec un malus) les sons forts. */
export const GENRES_ACCROCHE: readonly GenreMoment[] = ['fouRire', 'cri', 'rire', 'phraseForte', 'exclamation', 'juron'];
const GENRES_SON: readonly GenreMoment[] = ['calmePuisPic', 'sonFort'];

export interface EntreeAccrocheV4 {
  src: string;
  /** Mots propres des séquences gardées (vides en mode voix). */
  mots: readonly Mot[];
  moments: readonly MomentV4[];
  /** Séquences gardées (temps source) ; `centile` 0 à 100 (absent = 50). */
  sequences: readonly (PlageTemps & { centile?: number })[];
  /** Punchlines choisies (phrases fortes), temps source. */
  punchlines: readonly PlagePunchline[];
  signaux: SignauxSource | null;
}

interface Candidat {
  t: Sec;
  de: Sec;
  a: Sec;
  note: number;
  raison: AccrocheV4['raison'];
  genre: GenreMoment | null;
  plan: number;
}

/** Plans du montage qui viennent d'une séquence gardée (ordre de la vidéo) et l'indice de leur séquence. */
function plansGardes(r: Recette, e: EntreeAccrocheV4): { p: PlanPlace; s: number }[] {
  const res: { p: PlanPlace; s: number }[] = [];
  for (const p of compiler(r).plans) {
    if (p.ins || p.src !== e.src || p.vit !== 1) continue;
    const s = e.sequences.findIndex((x) => p.de >= x.de - 0.01 && p.a <= x.a + 0.01);
    if (s >= 0) res.push({ p, s });
  }
  return res;
}

/** Les moments possibles de l'accroche, notés (le meilleur d'abord). */
function candidats(gardes: readonly { p: PlanPlace; s: number }[], e: EntreeAccrocheV4): Candidat[] {
  const A = ACCROCHE_V4;
  const planDe = (t: Sec) => gardes.findIndex((g) => t >= g.p.de && t < g.p.a);
  const res: Candidat[] = [];
  const centile = (k: number) => (e.sequences[gardes[k]!.s]!.centile ?? 50) / 100;
  for (const m of e.moments) {
    const son = GENRES_SON.includes(m.genre);
    if (!son && !GENRES_ACCROCHE.includes(m.genre)) continue;
    const k = planDe(m.t);
    if (k < 0) continue;
    const punch = e.punchlines.some((x) => x.ts < m.a && x.fin > m.de - A.avantRire) ? A.poidsPunchline : 0;
    const note = (son ? A.facteurSon : 1) * m.force + A.poidsSequence * centile(k) + punch;
    res.push({ t: m.t, de: m.de, a: m.a, note, raison: m.genre, genre: m.genre, plan: k });
  }
  if (res.length === 0) {
    // Sans moment : la plus longue des punchlines du montage (une phrase forte), sinon le plus gros pic DES séquences.
    for (const x of e.punchlines) {
      const k = planDe((x.ts + x.fin) / 2);
      if (k >= 0) res.push({ t: x.ts, de: x.ts, a: x.fin, note: 0.2 * (x.fin - x.ts) + A.poidsSequence * centile(k), raison: 'phraseForte', genre: 'phraseForte', plan: k });
    }
  }
  if (res.length === 0 && e.signaux) {
    for (const x of e.signaux.pics) {
      const k = planDe(x.ts);
      if (k >= 0) res.push({ t: x.ts, de: x.ts, a: x.ts + 0.5, note: x.z / 10, raison: 'pic', genre: null, plan: k });
    }
  }
  return res.sort((x, y) => y.note - x.note || x.t - y.t);
}

/** Début de l'accroche dans le plan : 0,25 s avant le 1er mot de la phrase qui amène le moment. */
function debutAccroche(c: Candidat, p: PlanPlace, mots: readonly Mot[]): Sec {
  const A = ACCROCHE_V4;
  const dansPlan = mots.filter((m) => (m[1] + m[2]) / 2 >= p.de && (m[1] + m[2]) / 2 < p.a);
  let debut = Math.max(p.de, c.de - 1);
  if (dansPlan.length > 0) {
    const ph = phrases(dansPlan).map(({ k0, k1 }) => ({ ts: dansPlan[k0]![1], fin: dansPlan[k1 - 1]![2] }));
    // La phrase du moment (elle le contient), sinon celle qui finit juste avant (la blague avant le rire).
    const ici = ph.find((x) => x.ts <= c.de + 0.05 && x.fin >= c.de) ?? [...ph].reverse().find((x) => x.fin <= c.de + 0.05 && x.fin >= c.de - A.avantRire);
    if (ici) debut = ici.ts - A.avant;
  }
  // Le moment arrive vite (au plus 4 s après le début), et on ne remonte jamais avant le plan.
  return surUnBord(Math.max(p.de, debut, c.t - A.avantMoment), p, dansPlan);
}

/** Jamais un début en plein mot : on recule au début du mot (0,25 s avant au plus, sans toucher le précédent), dans le plan. */
function surUnBord(t: Sec, p: PlanPlace, mots: readonly Mot[]): Sec {
  const k = mots.findIndex((m) => t > m[1] + 1e-6 && t < m[2] - 1e-6);
  if (k < 0) return t;
  const m = mots[k]!;
  const precedent = mots[k - 1]?.[2] ?? -Infinity;
  return Math.max(p.de, m[1] - Math.min(ACCROCHE_V4.avant, Math.max(0, (m[1] - precedent) / 2)));
}

/** Points de coupe possibles (temps source) dans [de, a] : bords de mots (+ 0,35 s au plus, sans toucher le suivant). */
function boutsPossibles(de: Sec, a: Sec, mots: readonly Mot[], s: SignauxSource | null): Sec[] {
  const A = ACCROCHE_V4;
  const dedans = mots.filter((m) => m[2] > de && m[1] < a).sort((x, y) => x[1] - y[1]);
  const res: Sec[] = [a];
  dedans.forEach((m, i) => {
    const suivant = dedans[i + 1]?.[1] ?? Infinity;
    const fin = Math.min(m[2] + A.apres, m[2] + Math.max(0, suivant - m[2]) / 2, a);
    if (fin > de && fin >= m[2]) res.push(fin);
  });
  if (dedans.length === 0 && s) {
    // Sans mots (mode voix) : la trame de 20 ms la plus calme de chaque fenêtre de 0,5 s.
    for (let t = de + 0.5; t < a - 0.1; t += 0.5) {
      let meilleur = t;
      let min = Infinity;
      for (let k = Math.floor(t / s.pas); k < Math.min(s.rms.length, Math.ceil((t + 0.5) / s.pas)); k++) {
        if (s.rms[k]! < min) {
          min = s.rms[k]!;
          meilleur = k * s.pas;
        }
      }
      if (meilleur > de && meilleur < a) res.push(meilleur);
    }
  }
  const dansUnMot = (t: Sec) => dedans.some((m) => t > m[1] + 1e-6 && t < m[2] - 1e-6);
  return [...new Set(res.map((t) => Math.round(t * 1000) / 1000))].filter((t) => !dansUnMot(t)).sort((x, y) => x - y);
}

/** Coût d'une fin d'accroche à `cumul` s : 0 à 0,5 dans la fourchette (au plus près de 6 s), plus cher en dehors. */
function coutFin(cumul: Sec): number {
  const A = ACCROCHE_V4;
  if (cumul >= A.min - 1e-6 && cumul <= A.max + 1e-6) return Math.abs(cumul - A.duree);
  if (cumul > A.maxAbsolu || cumul < 1) return Infinity;
  return 0.5 + 2 * (cumul < A.min ? A.min - cumul : cumul - A.max);
}

/**
 * Débuts possibles dans le plan : celui de la phrase (`debut`, sans pénalité), puis des débuts de mots après un petit
 * trou (≥ 0,25 s) — un peu plus tard (le moment reste dedans) ou un peu plus tôt (contexte) — avec une pénalité.
 */
function debutsPossibles(debut: Sec, c: Candidat, p: PlanPlace, mots: readonly Mot[]): { t: Sec; cout: number }[] {
  const A = ACCROCHE_V4;
  const res: { t: Sec; cout: number }[] = [{ t: debut, cout: 0 }];
  const dansPlan = mots.filter((m) => m[1] >= p.de && m[1] < p.a).sort((x, y) => x[1] - y[1]);
  dansPlan.forEach((m, k) => {
    const precedent = dansPlan[k - 1]?.[2] ?? -Infinity;
    if (m[1] - precedent < A.trouDebut) return;
    const t = Math.max(p.de, m[1] - Math.min(A.avant, (m[1] - precedent) / 2));
    if (Math.abs(t - debut) < 0.05) return;
    if (t > debut && t <= Math.min(debut + A.decalageMax, c.t - 0.3)) res.push({ t, cout: A.coutDecalage + 0.1 * (t - debut) });
    if (t < debut && t >= debut - A.decalageMax) res.push({ t, cout: A.coutDecalage / 2 + 0.05 * (debut - t) });
  });
  if (p.de < debut - 0.05 && p.de >= debut - A.decalageMax) res.push({ t: p.de, cout: A.coutDecalage / 2 + 0.05 * (debut - p.de) });
  return res;
}

/** Débuts de mots après un petit trou dans un plan (et le début du plan) : le morceau d'avant donne du contexte. */
function debutsDuPlan(p: PlanPlace, mots: readonly Mot[], cout: number): { t: Sec; cout: number }[] {
  const A = ACCROCHE_V4;
  const res: { t: Sec; cout: number }[] = [{ t: p.de, cout }];
  const dansPlan = mots.filter((m) => m[1] >= p.de && m[1] < p.a).sort((x, y) => x[1] - y[1]);
  dansPlan.forEach((m, k) => {
    const precedent = dansPlan[k - 1]?.[2] ?? -Infinity;
    if (m[1] - precedent >= A.trouDebut) res.push({ t: Math.max(p.de, m[1] - Math.min(A.avant, (m[1] - precedent) / 2)), cout });
  });
  return res;
}

/**
 * Les morceaux (1 ou 2) de l'accroche autour d'un candidat et leur coût (0 = 6 s pile depuis le début de la phrase) ;
 * null si rien de jouable. Essaie : le morceau du moment seul, puis avec le suivant (la réaction), puis avec le
 * précédent (le contexte) — toujours de la même séquence, à moins de 12 s.
 */
function morceauxAutour(c: Candidat, gardes: readonly { p: PlanPlace; s: number }[], e: EntreeAccrocheV4): { plages: PlageTemps[]; cout: number } | null {
  const A = ACCROCHE_V4;
  const g = gardes[c.plan]!;
  const p = g.p;
  const voisin = (k: number, apres: boolean): PlanPlace | null => {
    const x = gardes[k];
    if (!x || x.s !== g.s) return null;
    const ecart = apres ? x.p.de - p.a : p.de - x.p.a;
    return ecart >= -0.01 && ecart <= A.ecartMorceaux ? x.p : null;
  };
  const suivant = voisin(c.plan + 1, true);
  const precedent = voisin(c.plan - 1, false);
  const debuts = debutsPossibles(debutAccroche(c, p, e.mots), c, p, e.mots);
  const fenetres: { plans: PlanPlace[]; debuts: { t: Sec; cout: number }[] }[] = [{ plans: [p], debuts }];
  if (suivant) fenetres.push({ plans: [p, suivant], debuts });
  if (precedent) fenetres.push({ plans: [precedent, p], debuts: debutsDuPlan(precedent, e.mots, A.coutDecalage + 0.1) });
  // La fin garde le moment (au moins jusqu'à son sommet + 0,3 s).
  const finMin = Math.min(c.a, c.t + 0.3);
  let meilleur: { cout: number; segs: PlageTemps[] } | null = null;
  for (const f of fenetres) {
    for (const d of f.debuts) {
      const segs: PlageTemps[] = f.plans.map((x, i) => ({ de: i === 0 ? d.t : x.de, a: x.a }));
      if (!(segs[0]!.a > segs[0]!.de)) continue;
      let avant = 0;
      segs.forEach((x, i) => {
        for (const t of boutsPossibles(x.de, x.a, e.mots, e.signaux)) {
          if (f.plans[i] === p && t < finMin) continue;
          if (f.plans[i] !== p && f.plans[i] === precedent) continue; // la fin est dans le morceau du moment ou après
          const cout = d.cout + coutFin(avant + t - x.de) + (i > 0 ? 0.05 : 0);
          if (cout < (meilleur?.cout ?? Infinity) - 1e-9) {
            const res = segs.slice(0, i + 1).map((y) => ({ ...y }));
            res[i]!.a = t;
            meilleur = { cout, segs: res };
          }
        }
        avant += x.a - x.de;
      });
    }
  }
  if (!meilleur) return null;
  const m = meilleur as { cout: number; segs: PlageTemps[] };
  const arr = (t: Sec) => Math.round(t * 100) / 100;
  const plages = m.segs.filter((x) => x.a - x.de >= 0.3).map((x) => ({ de: arr(x.de), a: arr(x.a) }));
  return plages.length > 0 ? { plages, cout: m.cout } : null;
}

/** L'accroche du montage (plans = morceaux gardés, AVANT la copie) ; null s'il n'y a rien de bon dans les séquences. */
export function choisirAccroche(r: Recette, e: EntreeAccrocheV4): AccrocheV4 | null {
  const gardes = plansGardes(r, e);
  if (gardes.length === 0) return null;
  // Les meilleurs moments, départagés par la note du moment ET la tenue des 6 s (une accroche de 2 s ne vaut rien).
  let meilleur: { valeur: number; a: AccrocheV4 } | null = null;
  for (const c of candidats(gardes, e).slice(0, ACCROCHE_V4.candidats)) {
    const m = morceauxAutour(c, gardes, e);
    if (!m) continue;
    const valeur = c.note - ACCROCHE_V4.poidsCout * m.cout - (c.t < ACCROCHE_V4.debutSource ? ACCROCHE_V4.penaliteDebut : 0);
    if (!meilleur || valeur > meilleur.valeur + 1e-9) meilleur = { valeur, a: { plages: m.plages, t: Math.round(c.t * 100) / 100, raison: c.raison } };
  }
  return meilleur?.a ?? null;
}
