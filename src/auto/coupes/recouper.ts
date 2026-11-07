// Coupes v4 APRÈS le montage (dev-coupes), fonctions PURES : Habiller → Couper « Serré / Normal / Large » recoupe un
// Best-of comme le Best-of lui-même (couperV4), et « Passages pas retenus → Ajouter » coupe un passage pareil, SANS
// réécouter la vidéo : depuis les mesures gardées après l'analyse (MesuresGardees : VAD + énergie de la bande voix)
// et les mots des sous-titres. Contrat : /home/claude/equipe/CONTRAT.md §1.4 (« Après coup ») et §1.10.
//
// recouperMontage : chaque plan de la vidéo est recoupé dans une FENÊTRE autour de lui : un bord posé par les coupes
// (marge autour de la parole) peut bouger d'au plus FENETRE_RECOUPE s ; un bord posé autrement (bord de séquence,
// découpe à la main) ne bouge pas ; deux plans proches (≤ TROU_RECOUPE s) peuvent se rejoindre ; un plan que les
// coupes d'avant n'expliquent pas (réaction ou son fort qu'on ne connaît plus) reste tel quel. Jamais de passage
// nouveau loin des plans gardés. L'accroche, les éléments insérés et les plans d'une autre vidéo ne changent pas ;
// ce qui est posé en temps de SORTIE (textes, chapitres, musique, sons et zooms sans temps source, incrustations)
// suit son image. UNE opération (une nouvelle recette) = un seul Annuler.

import { compiler, sourceA, type Scenario } from '../../recette/chronologie';
import { MEILLEUR } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { arrondir } from '../../recette/temps';
import type { Mot, NiveauBlancs, PassageNote, Plan, Recette, Sec } from '../../recette/types';
import type { Morceau, PlageTemps, SignauxSource } from '../types';
import type { EntreeCoupes, MesuresGardees, MomentV4, ParoleDetectee, ProbasVad } from '../types-v4';
import { detecterParoleV4 } from '../vad/parole';
import { fusionnerPlages, paroleDepuisProbas, paroleDepuisZones } from '../vad/segments';
import { couperV4 } from './coupes-v4';
import { morceauxDans, premiereVideo, ranger } from './decoupe';
import { REGLAGES_BLANCS } from './reglages';
import { zonesDeVoix } from './voix';

/** Ce qu'il faut pour recouper après coup, sans réécouter la vidéo. */
export interface EntreeRecoupe {
  /** Mesures gardées après l'analyse (IndexedDB `arko.mesures.<emp>`, dev-vad) ; null = pas gardées : coupes sur les mots seuls. */
  mesures: MesuresGardees | null;
  /** Mots de la source, temps source (d'office pour recouperMontage : les mots des sous-titres de la recette). */
  mots?: readonly Mot[] | null;
  /** Signaux du son (sons forts, passages muets), si l'appli les a encore. */
  signaux?: SignauxSource | null;
  /** Moments v4 (réactions gardées même sans mots), si l'appli les a encore. */
  moments?: readonly MomentV4[] | null;
  /** 'parole+forts' (d'office, comme le Best-of) ou 'parole'. */
  garder?: 'parole+forts' | 'parole';
  /** Durée de la source (s) ; d'office : celle de la vidéo de la recette, sinon des signaux, sinon de la VAD. */
  duree?: Sec;
  /** Nombre de plans de l'accroche au début du montage (jamais recoupés) ; d'office : ceux avant la transition « glitch ». */
  accroche?: number;
}

/** Un bord posé par les coupes peut bouger d'au plus FENETRE_RECOUPE s (Serré ↔ Large : marges, prolongement, creux). */
export const FENETRE_RECOUPE: Sec = 1;
/** Deux plans gardés à moins de TROU_RECOUPE s l'un de l'autre peuvent se rejoindre (Large fusionne plus). */
export const TROU_RECOUPE: Sec = 2;
/** Un bord de plan est « posé par les coupes » s'il tombe à moins de 15 ms d'un bord de morceau du niveau d'avant. */
const MEME_BORD: Sec = 0.015;

const vide = (src: string): ParoleDetectee => ({ src, methode: 'mots', segments: [], probas: null, part: 0 });

/** La parole depuis les mesures gardées : VAD (comme le Best-of), sinon repli de dev-vad, sinon les mots, sinon l'énergie. */
function paroleDe(e: EntreeRecoupe, src: string, duree: Sec, mots: readonly Mot[]): ParoleDetectee {
  const g = e.mesures;
  const vad: ProbasVad | null = g?.vad ? { src, ...g.vad } : null;
  const energie = g?.energie ?? null;
  const avecTexte = mots.some((m) => m[0].trim());
  if (e.signaux) return detecterParoleV4({ src, duree, vad, energie, signaux: e.signaux, mots: avecTexte ? mots : null });
  if (vad) return paroleDepuisProbas(vad, duree);
  if (avecTexte) return paroleDepuisZones(src, duree, mots.filter((m) => m[0].trim()).map((m) => ({ de: Math.max(0, m[1] - 0.05), a: m[2] + 0.05 })), 'mots');
  if (energie) return paroleDepuisZones(src, duree, zonesDeVoix(energie), 'sans-modele');
  return vide(src);
}

function dureeDe(e: EntreeRecoupe, fallback: Sec): Sec {
  if (e.duree && e.duree > 0) return e.duree;
  if (fallback > 0 && Number.isFinite(fallback)) return fallback;
  if (e.signaux) return e.signaux.duree;
  const v = e.mesures?.vad;
  if (v) return v.p.length * v.pas;
  const en = e.mesures?.energie;
  if (en) return en.db.length * en.pas;
  return Infinity;
}

/** L'entrée de couperV4 depuis ce qu'on a gardé (mots vides = segments de parole en mode voix, comme la chaîne). */
function entreeCoupes(e: EntreeRecoupe, src: string, duree: Sec, niveau: NiveauBlancs, plages?: readonly PlageTemps[]): EntreeCoupes {
  const motsDonnes = [...(e.mots ?? [])];
  const parole = paroleDe(e, src, duree, motsDonnes);
  const avecTexte = motsDonnes.some((m) => m[0].trim());
  const mots: Mot[] = avecTexte ? motsDonnes : parole.segments.map((s): Mot => ['', arrondir(s.de), arrondir(s.a)]);
  return {
    mots,
    parole,
    energie: e.mesures?.energie ?? null,
    moments: e.moments ?? [],
    signaux: e.signaux ?? null,
    niveau,
    garder: e.garder ?? 'parole+forts',
    ...(plages ? { plages } : {}),
  };
}

/**
 * « Passages pas retenus → Ajouter » : les morceaux du passage coupés comme le Best-of (mêmes règles, même niveau).
 * [] si rien n'est à garder (l'appelant garde alors le passage entier, comme avant).
 */
export function morceauxDuPassage(e: EntreeRecoupe, passage: Pick<PassageNote, 'de' | 'a'> & { src?: string }, niveau: NiveauBlancs): Morceau[] {
  if (!(passage.a > passage.de)) return [];
  const duree = dureeDe(e, Infinity);
  const de = Math.max(0, passage.de);
  const a = Math.min(passage.a, duree);
  if (!(a > de)) return [];
  return couperV4(entreeCoupes(e, passage.src ?? '', duree, niveau, [{ de, a }]));
}

/** Nombre de plans de l'accroche : ceux avant le 1er plan qui entre par « glitch » (Le meilleur d'abord), dans les 12 s. */
function plansAccroche(r: Recette, sc: Scenario): number {
  for (let k = 1; k < Math.min(5, r.plans.length); k++) {
    const t = r.plans[k]!.trans;
    const type = t ? (typeof t === 'string' ? t : t.type) : null;
    if (type === MEILLEUR.transition && (sc.plans[k]?.t0 ?? Infinity) <= 12) return k;
  }
  return 0;
}

/** Un bord est « posé par les coupes » s'il coïncide avec un bord de morceau (morceaux triés). */
function bordDeMorceau(morceaux: readonly PlageTemps[], t: Sec, cote: 'de' | 'a'): boolean {
  let lo = 0;
  let hi = morceaux.length;
  while (lo < hi) {
    const mi = (lo + hi) >> 1;
    if (morceaux[mi]!.a < t - MEME_BORD) lo = mi + 1;
    else hi = mi;
  }
  for (let i = lo; i < morceaux.length && morceaux[i]!.de <= t + MEME_BORD; i++) if (Math.abs(morceaux[i]![cote] - t) <= MEME_BORD) return true;
  return false;
}

const memesReglages = (x: Plan, y: Plan) =>
  (x.src ?? '') === (y.src ?? '') &&
  (x.vit ?? 1) === (y.vit ?? 1) &&
  JSON.stringify(x.mise ?? null) === JSON.stringify(y.mise ?? null) &&
  JSON.stringify(x.zoomFixe ?? null) === JSON.stringify(y.zoomFixe ?? null) &&
  (x.m ?? '') === (y.m ?? '') &&
  !x.ins &&
  !y.ins;

/**
 * Recoupe le montage (Best-of ou montage coupé par Couper les blancs) au niveau donné, comme le Best-of. Rend la
 * recette d'origine si rien ne change. `e.mots` absent : les mots des sous-titres de la recette.
 */
export function recouperMontage(r: Recette, e: EntreeRecoupe, niveau: NiveauBlancs): Recette {
  const src = premiereVideo(r);
  const video = r.sources.find((s) => s.id === src && s.type === 'video');
  if (!src || !video || r.plans.length === 0) return r;
  const reglages = REGLAGES_BLANCS[niveau] ?? REGLAGES_BLANCS.normal;
  const duree = dureeDe(e, video.duree);
  const motsSt = Array.isArray(r.sousTitres?.mots) ? r.sousTitres.mots : [];
  const entree: EntreeRecoupe = { ...e, mots: e.mots ?? motsSt };
  const sc = compiler(r);
  const nAccroche = Math.max(0, Math.min(r.plans.length, e.accroche ?? plansAccroche(r, sc)));

  // Les plans à recouper : ceux de la vidéo, hors accroche et éléments insérés.
  const aRecouper = r.plans.map((p, i) => ({ p, i })).filter(({ p, i }) => i >= nAccroche && (p.src ?? src) === src && !p.ins && p.a > p.de);
  if (aRecouper.length === 0) return r;

  // Bords libres (posés par les coupes du niveau d'avant) ou fixes (bord de séquence, découpe à la main).
  const ancien = r.blancs?.niveau;
  // Déjà coupé à ce niveau : rien à refaire (les bords restent exactement où ils sont).
  if (ancien === niveau) return r;
  const autour = fusionnerPlages(aRecouper.map(({ p }) => ({ de: Math.max(0, p.de - FENETRE_RECOUPE - 3), a: Math.min(duree, p.a + FENETRE_RECOUPE + 3) })), 0);
  const avant = ancien ? ranger(couperV4(entreeCoupes(entree, src, duree, ancien, autour))) : [];
  const libre = new Map<number, { de: boolean; a: boolean }>();
  for (const { p, i } of aRecouper) libre.set(i, { de: ancien ? bordDeMorceau(avant, p.de, 'de') : false, a: ancien ? bordDeMorceau(avant, p.a, 'a') : false });

  // Fenêtres : ± FENETRE_RECOUPE sur un bord libre, rien sur un bord fixe ; deux plans voisins dans la source ne se
  // marchent pas dessus (coupe au milieu du trou), et se rejoignent si le trou est court et leurs bords libres.
  const fen = new Map<number, PlageTemps>();
  for (const { p, i } of aRecouper) {
    const l = libre.get(i)!;
    fen.set(i, { de: Math.max(0, l.de ? p.de - FENETRE_RECOUPE : p.de), a: Math.min(duree, l.a ? p.a + FENETRE_RECOUPE : p.a) });
  }
  const parSource = [...aRecouper].sort((x, y) => x.p.de - y.p.de || x.i - y.i);
  for (let k = 1; k < parSource.length; k++) {
    const q = parSource[k - 1]!;
    const p = parSource[k]!;
    const wq = fen.get(q.i)!;
    const wp = fen.get(p.i)!;
    if (q.p.a > p.p.de + 1e-6) {
      // Plans qui se recouvrent (passage repris à la main) : chacun garde exactement le sien.
      fen.set(q.i, { de: wq.de, a: Math.min(wq.a, Math.max(q.p.a, wq.de)) });
      fen.set(p.i, { de: Math.max(wp.de, Math.min(p.p.de, wp.a)), a: wp.a });
      continue;
    }
    const milieu = (q.p.a + p.p.de) / 2;
    const rejoindre = libre.get(q.i)!.a && libre.get(p.i)!.de && p.p.de - q.p.a <= TROU_RECOUPE;
    if (rejoindre || wq.a > milieu) wq.a = Math.max(q.p.a, milieu);
    if (rejoindre || wp.de < milieu) wp.de = Math.min(p.p.de, milieu);
  }

  // Un plan que les coupes d'avant, refaites avec ce qu'on sait encore, ne redonnent pas (réaction ou son fort qu'on
  // ne connaît plus, passage ajouté ou retouché à la main) n'est pas recoupé : on le garde tel quel plutôt que de le
  // perdre. (Montage jamais coupé : tous les plans sont resserrés, sans rien ajouter.)
  if (ancien) {
    const min = (REGLAGES_BLANCS[ancien] ?? REGLAGES_BLANCS.normal).morceauMin;
    for (const { p, i } of aRecouper) {
      const w = fen.get(i)!;
      const { parts } = morceauxDans(w.de, w.a, avant, min);
      const redonne = parts.length === 1 && Math.abs(parts[0]!.de - p.de) <= MEME_BORD && Math.abs(parts[0]!.a - p.a) <= MEME_BORD;
      if (!redonne) fen.delete(i);
    }
  }
  // Rien à recouper (aucune mesure, aucun mot) : on ne change rien, pas même le réglage affiché.
  if (fen.size === 0) return r;

  // Les morceaux du nouveau niveau dans les fenêtres, découpés comme couperLesBlancs (morceauxDans).
  // Mêmes plages de calcul que pour le niveau d'avant.
  const nouveaux = ranger(couperV4(entreeCoupes(entree, src, duree, niveau, autour)));
  const plans: Plan[] = [];
  const recoupe: boolean[] = [];
  const venus: number[][] = r.plans.map(() => []);
  r.plans.forEach((p, i) => {
    const w = fen.get(i);
    if (!w) {
      venus[i]!.push(plans.length);
      plans.push(p);
      recoupe.push(false);
      return;
    }
    const { parts } = morceauxDans(w.de, w.a, nouveaux, reglages.morceauMin);
    parts.forEach((x, k) => {
      const n: Plan = { ...p, de: x.de, a: x.a };
      if (k > 0) delete n.trans;
      if (k < parts.length - 1) delete n.fige;
      venus[i]!.push(plans.length);
      plans.push(n);
      recoupe.push(true);
    });
  });
  if (plans.length === 0) return r;

  // Plans recollés : deux plans RECOUPÉS qui se suivent dans la source avec les mêmes réglages n'en font qu'un (deux
  // plans voisins que le nouveau niveau rejoint) ; les plans gardés tels quels ne sont jamais recollés.
  const fusion: Plan[] = [];
  const nouvelIndice: number[] = [];
  plans.forEach((p, j) => {
    const der = fusion[fusion.length - 1];
    if (der && j > 0 && recoupe[j] && recoupe[j - 1] && !p.trans && !der.fige && Math.abs(der.a - p.de) < 0.005 && memesReglages(der, p)) {
      der.a = p.a;
      if (p.fige) der.fige = p.fige;
      else delete der.fige;
    } else fusion.push({ ...p });
    nouvelIndice[j] = fusion.length - 1;
  });

  // Ce qui est posé en temps de sortie suit son image (même plan d'origine, même temps source).
  const r2: Recette = { ...r, plans: fusion };
  const sc2 = compiler(r2);
  const deplacer = (t: Sec): Sec => {
    if (!Number.isFinite(t)) return t;
    if (t >= sc.duree - 1e-9) return arrondir(sc2.duree + (t - sc.duree));
    const pos = sourceA(sc, Math.max(0, t));
    if (!pos) return t;
    const i = pos.plan.i;
    const issus = [...new Set(venus[i]!.map((j) => nouvelIndice[j]!))].map((j) => sc2.plans[j]!).filter(Boolean);
    if (!fen.has(i)) {
      const p2 = issus[0];
      return p2 ? arrondir(p2.t0 + (t - pos.plan.t0)) : t;
    }
    for (const q of issus) if (pos.ts >= q.de - 1e-9 && pos.ts < q.a) return arrondir(Math.min(q.tFige, q.t0 + (pos.ts - q.de) / q.vit));
    const suivant = issus.find((q) => q.de >= pos.ts);
    if (suivant) return arrondir(suivant.t0);
    if (issus.length > 0) return arrondir(issus[issus.length - 1]!.t1);
    // Plan disparu : le début de ce qui vient après lui.
    for (let k = i + 1; k < venus.length; k++) {
      const j = venus[k]![0];
      if (j !== undefined) return arrondir(sc2.plans[nouvelIndice[j]!]!.t0);
    }
    return arrondir(sc2.duree);
  };
  const sansTs = <T extends { t?: Sec; ts?: Sec }>(x: T): T => (x.ts === undefined && x.t !== undefined ? { ...x, t: deplacer(x.t) } : x);
  const res: Recette = {
    ...r2,
    textes: r.textes.map((x) => ({ ...x, t: deplacer(x.t) })),
    sons: r.sons.map(sansTs),
    zooms: r.zooms.map(sansTs),
    blancs: { niveau: REGLAGES_BLANCS[niveau] ? niveau : 'normal', fonduEntree: reglages.fonduEntree, fonduSortie: reglages.fonduSortie },
  };
  if (r.chapitres) res.chapitres = r.chapitres.map((c) => ({ ...c, t: deplacer(c.t) }));
  if (r.guide && r.guide.t !== undefined) res.guide = { ...r.guide, t: deplacer(r.guide.t) };
  if (r.incrustations) res.incrustations = r.incrustations.map((x) => ({ ...x, t: deplacer(x.t) }));
  if (r.musique) res.musique = { ...r.musique, morceaux: r.musique.morceaux.map((m) => ({ ...m, t: deplacer(m.t), ...(m.fin !== undefined ? { fin: deplacer(m.fin) } : {}) })) };
  const fini = normaliser(res, { sources: r.sources }).recette;
  return JSON.stringify(fini) === JSON.stringify(r) ? r : fini;
}
