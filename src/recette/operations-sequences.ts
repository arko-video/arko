// Best-of v4 (intégrateur, demande de dev-ui) : agir sur une SÉQUENCE entière dans Habiller, après le montage.
// Une séquence = ce qui est entre deux chapitres (YouTube 16:9 : le Best-of pose un chapitre au début de chaque
// histoire) ; les plans de l'accroche (avant le « glitch » du début) n'appartiennent à aucune séquence.
//  - retirerSequence : ses plans quittent le montage, elle va dans « Passages pas retenus » (on peut la remettre) ;
//  - deplacerSequence : elle échange sa place avec la séquence d'avant (−1) ou d'après (+1) ;
//  - etendreSequence : un morceau de plus (morceaux donnés, déjà coupés comme le Best-of par morceauxDuPassage) ou de
//    moins, au début ou à la fin.
// Ce qui est posé en temps de SORTIE (textes, sons et zooms sans temps source, musique, incrustations, guide) suit
// son image ; les chapitres suivent leur séquence ; ce qui est en temps SOURCE (sous-titres, punchlines, persos) suit
// tout seul. Fonctions PURES ; une opération = une nouvelle recette = un seul Annuler.

import { compiler, type PlanPlace, type Scenario } from './chronologie';
import { MEILLEUR } from './modeles';
import { normaliser } from './normaliser';
import { arrondir } from './temps';
import type { PassageNote, Plan, Recette, Sec } from './types';

/** Une séquence du montage (vue d'Habiller). */
export interface SequenceMontage {
  /** Indice de son chapitre. */
  i: number;
  nom: string;
  /** Temps de sortie de son début et de sa fin. */
  t0: Sec;
  t1: Sec;
  /** Indices de ses plans dans `recette.plans` (dans l'ordre). */
  plans: number[];
  /** Vidéo et étendue source de ses plans (null si elle n'a que des éléments insérés). */
  src: string | null;
  de: Sec;
  a: Sec;
}

const EPS = 1e-6;
/** Raison écrite dans « Passages pas retenus » pour une séquence retirée. */
export const RAISON_RETIREE = 'Retirée du montage';

/** Plans de l'accroche : ceux avant le 1er plan qui entre par « glitch » (Le meilleur d'abord), dans les 12 s. */
function plansAccroche(r: Recette, sc: Scenario): number {
  for (let k = 1; k < Math.min(5, r.plans.length); k++) {
    const t = r.plans[k]!.trans;
    const type = t ? (typeof t === 'string' ? t : t.type) : null;
    if (type === MEILLEUR.transition && (sc.plans[k]?.t0 ?? Infinity) <= 12) return k;
  }
  return 0;
}

const premiereVideo = (r: Recette) => r.sources.find((s) => s.type === 'video')?.id ?? null;

/**
 * Le montage vient-il d'un Best-of (v3 ou v4) ? Sa musique baisse sur la parole (v4), ses persos ont la tenue de la
 * DA (v4) ou il a des passages pas retenus (v3, v4). Les panneaux du Best-of dans Habiller → Couper (« Rythme des
 * coupes ») ne s'affichent que là : un montage fait à la main ne les voit pas (relecture point 5).
 */
export function vientDUnBestOf(r: Pick<Recette, 'musique' | 'avatars' | 'derush'>): boolean {
  return r.musique?.baisseSur === 'parole' || r.avatars?.tenue !== undefined || (r.derush?.passages.length ?? 0) > 0;
}

/** Les séquences du montage : une par chapitre, avec ses plans (hors accroche). Vide sans chapitres. */
export function sequencesDeLaVideo(r: Recette): SequenceMontage[] {
  const ch = r.chapitres ?? [];
  if (ch.length === 0 || r.plans.length === 0) return [];
  const sc = compiler(r);
  const k0 = plansAccroche(r, sc);
  const premiere = premiereVideo(r);
  return ch.map((c, i) => {
    const t1 = i + 1 < ch.length ? ch[i + 1]!.t : sc.duree;
    const places = sc.plans.filter((p) => p.i >= k0 && p.t0 >= c.t - EPS && p.t0 < t1 - EPS);
    const videos = places.filter((p) => !p.ins && p.src);
    return {
      i,
      nom: c.nom,
      t0: places[0]?.t0 ?? c.t,
      t1: places.length > 0 ? places[places.length - 1]!.t1 : t1,
      plans: places.map((p) => p.i),
      src: videos[0]?.src ?? premiere,
      de: videos.length > 0 ? Math.min(...videos.map((p) => p.de)) : 0,
      a: videos.length > 0 ? Math.max(...videos.map((p) => p.a)) : 0,
    };
  });
}

/** Un plan de la nouvelle recette, et le plan d'origine dont il vient (null : nouveau). */
interface PlanNeuf {
  plan: Plan;
  venu: number | null;
}

/**
 * La recette avec ces plans : ce qui est posé en temps de sortie suit son image (même plan d'origine, même écart à
 * son début) ; un temps dans un plan disparu va au début de ce qui vient après lui. Chapitres : `chapitres(sc2,
 * premierPlan)` les recalcule (premierPlan(k) = début de sortie du k-ième plan neuf).
 */
function reconstruire(r: Recette, neufs: readonly PlanNeuf[], chapitres: (debut: (k: number) => Sec) => Recette['chapitres']): Recette {
  if (neufs.length === 0) return r;
  const sc = compiler(r);
  const r2: Recette = { ...r, plans: neufs.map((x) => x.plan) };
  const sc2 = compiler(r2);
  const debut = (k: number): Sec => sc2.plans[k]?.t0 ?? sc2.duree;
  const deplacer = (t: Sec): Sec => {
    if (!Number.isFinite(t)) return t;
    if (t >= sc.duree - EPS) return arrondir(sc2.duree + (t - sc.duree));
    const p: PlanPlace | undefined = sc.plans.find((x) => t >= x.t0 - EPS && t < x.t1);
    if (!p) return t;
    const k = neufs.findIndex((x) => x.venu === p.i);
    if (k >= 0) return arrondir(Math.min(sc2.plans[k]!.t1, debut(k) + (t - p.t0)));
    // Plan disparu : le début du plan neuf qui vient d'un plan d'origine placé après lui.
    const apres = neufs.findIndex((x) => x.venu !== null && x.venu > p.i);
    return arrondir(apres >= 0 ? debut(apres) : sc2.duree);
  };
  const sansTs = <T extends { t?: Sec; ts?: Sec }>(x: T): T => (x.ts === undefined && x.t !== undefined ? { ...x, t: deplacer(x.t) } : x);
  const res: Recette = { ...r2, textes: r.textes.map((x) => ({ ...x, t: deplacer(x.t) })), sons: r.sons.map(sansTs), zooms: r.zooms.map(sansTs) };
  const ch = chapitres(debut);
  if (ch && ch.length > 0) res.chapitres = ch;
  else delete res.chapitres;
  if (r.guide && r.guide.t !== undefined) res.guide = { ...r.guide, t: deplacer(r.guide.t) };
  if (r.incrustations) res.incrustations = r.incrustations.map((x) => ({ ...x, t: deplacer(x.t) }));
  if (r.musique) res.musique = { ...r.musique, morceaux: r.musique.morceaux.map((m) => ({ ...m, t: deplacer(m.t), ...(m.fin !== undefined ? { fin: deplacer(m.fin) } : {}) })) };
  const fini = normaliser(res, { sources: r.sources }).recette;
  return JSON.stringify(fini) === JSON.stringify(r) ? r : fini;
}

/** Plans neufs = mêmes plans, dans l'ordre `ordre` (indices d'origine), la transition d'entrée de la 1ʳᵉ séquence gardée. */
function dansLOrdre(r: Recette, ordre: readonly number[], k0: number): PlanNeuf[] {
  const neufs = ordre.map((i) => ({ plan: { ...r.plans[i]! }, venu: i as number | null }));
  // La transition d'entrée après l'accroche (« glitch ») reste à sa PLACE, pas sur le plan qui bouge.
  const entree = r.plans[k0]?.trans;
  if (k0 > 0 && entree && neufs[k0] && neufs[k0]!.venu !== k0) {
    for (const x of neufs) if (x.venu === k0) delete x.plan.trans;
    neufs[k0]!.plan.trans = entree;
  }
  return neufs;
}

/** Chapitres recalculés : un par séquence (dans le nouvel ordre), au début de son 1er plan ; le 1er reste à 0 s'il y était. */
function chapitresDe(r: Recette, seqs: readonly { nom: string; k: number }[], debut: (k: number) => Sec): Recette['chapitres'] {
  const zero = (r.chapitres?.[0]?.t ?? 0) <= EPS;
  return seqs.map((s, n) => ({ nom: s.nom, t: n === 0 && zero ? 0 : arrondir(debut(s.k)) }));
}

/**
 * Retire la séquence `i` du montage : ses plans partent, elle entre dans « Passages pas retenus » (Ajouter la remet
 * à sa place). Sans effet si elle n'a pas de plan, ou si c'est la seule.
 */
export function retirerSequence(r: Recette, i: number): Recette {
  const seqs = sequencesDeLaVideo(r);
  const s = seqs[i];
  if (!s || s.plans.length === 0 || seqs.filter((x) => x.plans.length > 0).length <= 1) return r;
  const sc = compiler(r);
  const k0 = plansAccroche(r, sc);
  const ote = new Set(s.plans);
  const ordre = r.plans.map((_, k) => k).filter((k) => !ote.has(k));
  const neufs = dansLOrdre(r, ordre, k0);
  const restantes = seqs.filter((x) => x.i !== i && x.plans.length > 0).map((x) => ({ nom: x.nom, k: neufs.findIndex((n) => n.venu === x.plans[0]) }));
  const avant = reconstruire(r, neufs, (debut) => chapitresDe(r, restantes, debut));
  if (avant === r || !s.src || !(s.a > s.de)) return avant;
  // Dans « Passages pas retenus », en tête (note haute : on l'avait choisie).
  const passage: PassageNote = { src: s.src, de: arrondir(s.de), a: arrondir(s.a), note: 100, raison: RAISON_RETIREE, titre: s.nom.slice(0, 60) };
  const passages = [passage, ...(avant.derush?.passages ?? []).filter((p) => !(Math.abs(p.de - passage.de) < 0.011 && Math.abs(p.a - passage.a) < 0.011))];
  return normaliser({ ...avant, derush: { passages } }, { sources: avant.sources }).recette;
}

/** Échange la séquence `i` avec celle d'avant (−1) ou d'après (+1). Sans effet au bord. */
export function deplacerSequence(r: Recette, i: number, sens: 1 | -1): Recette {
  const seqs = sequencesDeLaVideo(r);
  const j = i + sens;
  const s = seqs[i];
  const t = seqs[j];
  if (!s || !t || s.plans.length === 0 || t.plans.length === 0) return r;
  const sc = compiler(r);
  const k0 = plansAccroche(r, sc);
  const [x, y] = i < j ? [s, t] : [t, s];
  // Les deux blocs sont voisins dans la liste des plans : x puis y → y puis x.
  const debutX = x.plans[0]!;
  const finY = y.plans[y.plans.length - 1]!;
  const indices = [...r.plans.keys()];
  const entre = indices.filter((k) => k > x.plans[x.plans.length - 1]! && k < y.plans[0]!);
  const ordre = [...indices.filter((k) => k < debutX), ...y.plans, ...entre, ...x.plans, ...indices.filter((k) => k > finY)];
  const neufs = dansLOrdre(r, ordre, k0);
  const nouvelles = [...seqs];
  nouvelles[i] = t;
  nouvelles[j] = s;
  const liste = nouvelles.filter((q) => q.plans.length > 0).map((q) => ({ nom: q.nom, k: neufs.findIndex((n) => n.venu === q.plans[0]) }));
  return reconstruire(r, neufs, (debut) => chapitresDe(r, liste, debut));
}

/**
 * Un morceau de plus (`sens` = 1 : `morceaux`, temps source, posés avant le 1er plan ou après le dernier ; ce qui
 * chevauche la séquence est rogné) ou de moins (−1 : son 1er ou son dernier plan, s'il lui en reste un autre) au
 * `cote` 'debut' ou 'fin' de la séquence `i`.
 */
export function etendreSequence(r: Recette, i: number, cote: 'debut' | 'fin', sens: 1 | -1, morceaux: readonly { de: Sec; a: Sec }[] = []): Recette {
  const seqs = sequencesDeLaVideo(r);
  const s = seqs[i];
  if (!s || s.plans.length === 0) return r;
  const sc = compiler(r);
  const k0 = plansAccroche(r, sc);
  const premierK = s.plans[0]!;
  const dernierK = s.plans[s.plans.length - 1]!;
  let neufs: PlanNeuf[];
  if (sens < 0) {
    if (s.plans.length < 2) return r;
    const ote = cote === 'debut' ? premierK : dernierK;
    neufs = dansLOrdre(r, [...r.plans.keys()].filter((k) => k !== ote), k0);
    // Le plan qui entre à la place de l'ancien 1er garde sa transition d'entrée.
    if (cote === 'debut' && r.plans[ote]!.trans) {
      const k = neufs.findIndex((x) => x.venu === s.plans[1]);
      if (k >= 0 && !neufs[k]!.plan.trans) neufs[k]!.plan.trans = r.plans[ote]!.trans;
    }
  } else {
    const bord = r.plans[cote === 'debut' ? premierK : dernierK]!;
    const src = bord.src;
    const ajout = morceaux
      .map((m) => (cote === 'debut' ? { de: m.de, a: Math.min(m.a, bord.de) } : { de: Math.max(m.de, bord.a), a: m.a }))
      .filter((m) => m.a - m.de >= 0.1)
      .sort((p, q) => p.de - q.de)
      .map((m): PlanNeuf => ({ plan: { ...(src !== undefined ? { src } : {}), de: arrondir(m.de), a: arrondir(m.a) }, venu: null }));
    if (ajout.length === 0) return r;
    const tous = dansLOrdre(r, [...r.plans.keys()], k0);
    const k = tous.findIndex((x) => x.venu === (cote === 'debut' ? premierK : dernierK));
    if (cote === 'debut') {
      // La transition d'entrée de la séquence passe au nouveau 1er plan.
      const trans = tous[k]!.plan.trans;
      if (trans) {
        delete tous[k]!.plan.trans;
        ajout[0]!.plan.trans = trans;
      }
      neufs = [...tous.slice(0, k), ...ajout, ...tous.slice(k)];
    } else neufs = [...tous.slice(0, k + 1), ...ajout, ...tous.slice(k + 1)];
  }
  const liste = seqs
    .filter((q) => q.plans.length > 0)
    .map((q) => {
      if (q.i === i && sens > 0 && cote === 'debut') return { nom: q.nom, k: neufs.findIndex((n) => n.venu === null) };
      const premier = q.plans.find((p) => neufs.some((n) => n.venu === p));
      return { nom: q.nom, k: neufs.findIndex((n) => n.venu === premier) };
    });
  return reconstruire(r, neufs, (debut) => chapitresDe(r, liste, debut));
}
