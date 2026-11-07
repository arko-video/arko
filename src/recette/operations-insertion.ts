// B. Opérations « Insérer ici » (dev 2) : insérer un élément entre deux parties, le déplacer, changer sa durée, le
// retirer. Règle du DÉCALAGE (« ripple ») : tout ce qui est posé en TEMPS DE SORTIE après le point d'insertion (textes,
// fonds verts / mèmes incrustés, chapitres, morceaux de musique, sons et zooms posés en `t`) est décalé de la durée
// insérée ; ce qui est en temps source (sons et zooms en `ts`, sous-titres, tours de parole) suit tout seul. Le son
// guide ne bouge pas, ni le chapitre « 0:00 ». Retirer un élément fait l'inverse (et recolle les deux parties) :
// insérer puis retirer redonne exactement la recette d'origine. Une opération = un seul Annuler.
// Contrat : conception/contrat-wankil.md §4.1.

import { coupesDe, pointInsertion } from '../auto/insertion/point';
import { normaliser } from './normaliser';
import { sansClipsOrphelins } from './operations-bibliotheque';
import { arrondir, dureePlan } from './temps';
import { DUREE_INSERE } from './types-insertion';
import type { ElementInsere, ImageRecette, Plan, Recette, Sec, Source } from './types';

/** Ce qu'il faut en plus pour insérer un clip (sa source et la partie gardée) ou une image (sa fiche). */
export interface DetailsInsertion {
  /** Durée d'une image, d'un carton ou d'un chibi (défauts : 2, 2, 1,5 s ; 0,3 à 30 s). */
  dur?: Sec;
  clip?: { source: Source; de: Sec; a: Sec };
  image?: ImageRecette;
}

const EPS = 1e-6;

function finir(origine: Recette, r: Recette): Recette {
  const res = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(res) === JSON.stringify(origine) ? origine : res;
}

/** Durée bornée d'un élément sans vidéo. */
function dureeBornee(type: ElementInsere['type'], dur?: Sec): Sec {
  const defaut =
    type === 'chibi' ? DUREE_INSERE.chibi : type === 'image' ? DUREE_INSERE.image : DUREE_INSERE.carton;
  const d = dur !== undefined && Number.isFinite(dur) ? dur : defaut;
  return arrondir(Math.min(DUREE_INSERE.max, Math.max(DUREE_INSERE.min, d)));
}

/** Décale un temps : ≥ t → + d ; si d < 0, ce qui tombe dans le trou [t + d, t[ est posé sur t + d. */
function decaler(x: Sec, t: Sec, d: Sec): Sec {
  if (x >= t - EPS) return arrondir(x + d);
  if (d < 0 && x >= t + d - EPS) return arrondir(t + d);
  return x;
}

/** Décalage sans normaliser (sert aux opérations composées). */
function decalerBrut(r: Recette, t: Sec, d: Sec): Recette {
  if (!d) return r;
  const res: Recette = {
    ...r,
    textes: r.textes.map((x) => ({ ...x, t: decaler(x.t, t, d) })),
    sons: r.sons.map((s) => (s.ts === undefined && s.t !== undefined ? { ...s, t: decaler(s.t, t, d) } : s)),
    zooms: r.zooms.map((z) =>
      z.ts === undefined && z.t !== undefined ? { ...z, t: decaler(z.t, t, d) } : z,
    ),
  };
  if (r.incrustations) res.incrustations = r.incrustations.map((x) => ({ ...x, t: decaler(x.t, t, d) }));
  // Le chapitre « 0:00 » reste à 0:00 (règle YouTube).
  if (r.chapitres) res.chapitres = r.chapitres.map((c) => (c.t <= EPS ? c : { ...c, t: decaler(c.t, t, d) }));
  if (r.musique) {
    res.musique = {
      ...r.musique,
      morceaux: r.musique.morceaux.map((m) => {
        const n = { ...m, t: m.t <= EPS ? m.t : decaler(m.t, t, d) };
        if (m.fin !== undefined) n.fin = decaler(m.fin, t, d);
        return n;
      }),
    };
  }
  return res;
}

/** Décale de `d` s (positif ou négatif) tout ce qui est posé en temps de sortie à partir de `t` (pure). */
export function decalerApres(r: Recette, t: Sec, d: Sec): Recette {
  if (!Number.isFinite(t) || !Number.isFinite(d) || Math.abs(d) < EPS) return r;
  return finir(r, decalerBrut(r, t, d));
}

/** true si le plan i est un élément inséré (`ins`). */
export function estElementInsere(r: Recette, i: number): boolean {
  return r.plans[i]?.ins !== undefined;
}

/** Fabrique le plan de l'élément (et la recette munie de sa source ou de son image) ; null si impossible. */
function planDe(r: Recette, el: ElementInsere, d: DetailsInsertion): { r: Recette; plan: Plan } | null {
  if (el.type === 'clip') {
    const c = d.clip;
    if (!c || c.source.type !== 'video') return null;
    const fin = c.source.duree > 0 ? Math.min(c.a, c.source.duree) : c.a;
    const de = arrondir(Math.max(0, Math.min(c.de, fin)));
    const plan: Plan = {
      src: c.source.id,
      de,
      a: arrondir(fin),
      mise: { type: 'flou', y: 0.5 },
      ins: { type: 'clip' },
    };
    const avec = r.sources.some((s) => s.id === c.source.id)
      ? r
      : { ...r, sources: [...r.sources, { ...c.source }] };
    return { r: avec, plan };
  }
  const plan: Plan = { de: 0, a: dureeBornee(el.type, d.dur), ins: { ...el } };
  if (el.type !== 'image') return { r, plan };
  const images = r.images ?? [];
  if (images.some((x) => x.id === el.img) && !d.image) return { r, plan };
  if (!d.image) return null;
  const deja = images.find((x) => x.emp && x.emp === d.image!.emp);
  const id = deja?.id ?? (d.image.id && !images.some((x) => x.id === d.image!.id) ? d.image.id : idImage(r));
  plan.ins = { type: 'image', img: id };
  return { r: deja ? r : { ...r, images: [...images, { ...d.image, id }] }, plan };
}

/** Coupe (si besoin) et pose le plan au point d'insertion, puis décale la suite (sans normaliser). */
function poser(r: Recette, t: Sec, plan: Plan): { r: Recette; i: number } {
  const p = pointInsertion(r, t);
  const plans = [...r.plans];
  if (p.coupe) {
    const k = p.i - 1;
    const avant = plans[k]!;
    const ts = p.ts ?? arrondir(avant.de + (p.t - coupesDe(r)[k]!) * (avant.vit ?? 1));
    const a: Plan = { ...avant, a: ts };
    const b: Plan = { ...avant, de: ts };
    delete a.fige; // l'arrêt sur image reste à la fin du 2ᵉ morceau
    delete b.trans; // la transition reste à l'entrée du premier morceau
    plans.splice(k, 1, a, b);
  }
  plans.splice(p.i, 0, plan);
  return { r: decalerBrut({ ...r, plans }, p.t, dureePlan(plan)), i: p.i };
}

/** Insère l'élément au temps de sortie t (voir pointInsertion) et décale la suite. Renvoie l'indice du plan (−1 si refusé). */
export function insererElement(
  r: Recette,
  t: Sec,
  el: ElementInsere,
  d: DetailsInsertion = {},
): { recette: Recette; i: number } {
  const fab = planDe(r, el, d);
  if (!fab || !Number.isFinite(t)) return { recette: r, i: -1 };
  const { r: brut, i } = poser(fab.r, t, fab.plan);
  const res = finir(r, brut);
  if (res === r || res.plans.length <= r.plans.length || !res.plans[i]?.ins) return { recette: r, i: -1 };
  return { recette: res, i };
}

/** Deux plans voisins issus d'une même coupe (même source, bout à bout, mêmes réglages) : recollés en un seul. */
function recoller(a: Plan, b: Plan): Plan | null {
  if (
    a.ins ||
    b.ins ||
    a.fige !== undefined ||
    b.trans !== undefined ||
    (a.src ?? '') !== (b.src ?? '') ||
    Math.abs(a.a - b.de) > EPS
  )
    return null;
  const sauf = (p: Plan) => {
    const { de: _de, a: _a, fige: _f, trans: _t, ...reste } = p;
    return JSON.stringify(Object.entries(reste).sort(([x], [y]) => x.localeCompare(y)));
  };
  if (sauf(a) !== sauf(b)) return null;
  const res: Plan = { ...a, a: b.a };
  if (b.fige !== undefined) res.fige = b.fige;
  return res;
}

/** Retire le plan i (élément inséré), recolle les deux parties et fait le décalage inverse (sans normaliser). */
function retirer(r: Recette, i: number): { r: Recette; plan: Plan; t: Sec } | null {
  const plan = r.plans[i];
  if (!plan?.ins || r.plans.length <= 1) return null;
  const t = coupesDe(r)[i]!;
  const plans = r.plans.filter((_, k) => k !== i);
  const avant = plans[i - 1];
  const apres = plans[i];
  const colle = avant && apres ? recoller(avant, apres) : null;
  if (colle) plans.splice(i - 1, 2, colle);
  const d = arrondir(dureePlan(plan));
  return { r: decalerBrut(sansClipsOrphelins({ ...r, plans }), arrondir(t + d), -d), plan, t };
}

/** Retire l'élément inséré i et recolle la suite (décalage inverse ; l'image ou le clip inutilisés partent). */
export function supprimerElement(r: Recette, i: number): Recette {
  const ret = Number.isInteger(i) ? retirer(r, i) : null;
  return ret ? finir(r, ret.r) : r;
}

/** Déplace l'élément inséré i au temps de sortie t (retrait puis insertion : un seul Annuler). */
export function deplacerElement(r: Recette, i: number, t: Sec): { recette: Recette; i: number } {
  const ret = Number.isInteger(i) && Number.isFinite(t) ? retirer(r, i) : null;
  if (!ret) return { recette: r, i: -1 };
  const d = dureePlan(ret.plan);
  // t est un temps de la recette actuelle : dans l'élément lui-même → rien ; après lui → recompté sans lui.
  if (t > ret.t + EPS && t < ret.t + d - EPS) return { recette: r, i };
  const tSans = t >= ret.t + d - EPS ? t - d : t;
  // Le plan déplacé garde son contenu et ses réglages ; une transition sur le 1er plan serait retirée par le normaliseur.
  const { r: brut, i: j } = poser(ret.r, tSans, ret.plan);
  const res = finir(r, brut);
  return { recette: res, i: res === r ? i : j };
}

/** Change le contenu (texte, couleurs, émotion…) et/ou la durée de l'élément i (la suite est décalée d'autant). */
export function modifierElement(r: Recette, i: number, partiel: Partial<ElementInsere>, dur?: Sec): Recette {
  const plan = r.plans[i];
  if (!plan?.ins) return r;
  const ins = { ...plan.ins, ...partiel, type: plan.ins.type } as ElementInsere;
  for (const [k, v] of Object.entries(partiel))
    if (v === undefined) delete (ins as unknown as Record<string, unknown>)[k];
  let nouveau: Plan = { ...plan, ins };
  let res: Recette = r;
  if (dur !== undefined && ins.type !== 'clip') {
    const a = dureeBornee(ins.type, dur);
    const delta = arrondir(a - dureePlan(plan));
    nouveau = { ...nouveau, de: 0, a };
    res = decalerBrut(r, arrondir(coupesDe(r)[i + 1]!), delta);
  }
  return finir(r, { ...res, plans: res.plans.map((p, k) => (k === i ? nouveau : p)) });
}

/** Premier id « iN » libre pour une image. */
export function idImage(r: Recette): string {
  const pris = new Set((r.images ?? []).map((x) => x.id));
  let n = 1;
  while (pris.has(`i${n}`)) n++;
  return `i${n}`;
}
