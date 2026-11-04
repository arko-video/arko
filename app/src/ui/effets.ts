// État et actions des effets de la phase 3 dans Habiller : sons, transitions, zooms.
// Comme ailleurs, la recette ne change que par les opérations de src/recette puis l'historique (modifier) :
// Annuler / Rétablir marche donc sur chaque action. Les sons importés sont aussi ajoutés aux sources ouvertes.

import { computed, signal } from '@preact/signals';
import { catalogueSons, ErreurArko, importerSon, type SourceOuverte } from '../moteur/api';
import {
  ajouterSon,
  ajouterSource,
  ajouterZoom,
  bornesDesPlans,
  choisirTransition,
  dureeFinale,
  modifierSon,
  modifierZoom,
  planA,
  supprimerSon,
  supprimerZoom,
  transitionPartout,
} from '../recette/operations';
import { ALIAS_TRANSITION, SON, TRANSITIONS, ZOOM } from '../recette/defauts';
import type { Plan, Recette, Transition, Zoom } from '../recette/types';
import { T } from '../textes-fr';
import {
  afficherToast,
  ajouterSourceOuverte,
  idsPris,
  modifier,
  quandAnnuleOuRetabli,
  recette,
  recetteTemporaire,
  sources,
  teteLecture,
} from './etat';
import { garderFichier } from './sons-gardes';
import { auCentieme, formatTemps } from './format';

/** Son choisi (indice dans recette.sons) : le panneau Sons montre ses réglages. */
export const sonChoisi = signal<number | null>(null);
/** Coupe choisie = indice du plan dont on règle la transition d'entrée (≥ 1). */
export const coupeChoisie = signal<number | null>(null);
/** Zoom choisi (indice dans recette.zooms) : réglages et cible sur l'aperçu. */
export const zoomChoisi = signal<number | null>(null);
/** Onglet du panneau Sons : « messons » (Mes sons, gardés pour tous les projets), une famille du catalogue, ou « mes » (sons importés dans ce montage). */
export const ongletSons = signal<string>('messons');
/** Import d'un son en cours (fichier ou micro). */
export const importEnCours = signal(false);

export function reinitialiserEffets() {
  sonChoisi.value = null;
  coupeChoisie.value = null;
  zoomChoisi.value = null;
}
// Annuler / Rétablir ajoutent ou retirent des éléments : un indice gardé viserait le mauvais (M-8).
quandAnnuleOuRetabli(reinitialiserEffets);

function message(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return T.erreurInconnue;
}

/* ------------------------------------------------------------ position à la tête de lecture */

/** Temps SOURCE à la tête de lecture (pour qu'un son ou un zoom suive le moment), ou temps de sortie à défaut. */
export function poseALaTete(r: Recette): { ts: number; src?: string } | { t: number } {
  const t = Math.min(teteLecture.peek(), Math.max(0, dureeFinale(r) - 0.01));
  const p = planA(r, t);
  if (!p) return { t: auCentieme(t) };
  const src = r.plans[p.i]?.src;
  return src ? { ts: p.ts, src } : { ts: p.ts };
}

/* ------------------------------------------------------------ sons */

/** Sons importés de ce projet (sources audio ouvertes), sauf le son guide. */
export const sonsImportes = computed<SourceOuverte[]>(() => {
  const guide = recette.value?.guide?.src;
  return sources.value.filter((s) => s.infos.type === 'audio' && s.infos.id !== guide);
});

/**
 * Un son importé est posé avec l'id de sa source audio (ex. « a1 ») : `src` reste la source VIDÉO de `ts`,
 * comme pour les sons du catalogue. (Convention à garder alignée avec le normaliseur et le mixeur.)
 */
export function idSonImporte(s: SourceOuverte): string {
  return s.infos.id;
}

/** Nom affiché d'un son (catalogue ou importé). */
export function nomSon(id: string | undefined): string {
  if (!id) return '';
  const c = catalogueSons.find((s) => s.id === id);
  if (c) return c.nom;
  return sources.peek().find((s) => s.infos.id === id)?.infos.nom ?? id;
}

/** Ajoute un son du catalogue (id « famille.nom ») ou un son importé à la tête de lecture. */
export function ajouterSonIci(id: string, importe?: SourceOuverte) {
  const ok = modifier((r) => {
    const base = importe ? ajouterSource(r, importe.infos) : r;
    return ajouterSon(base, { id, ...poseALaTete(base), vol: SON.vol }).recette;
  });
  if (ok) afficherToast(T.sons.ajoute(nomSon(id), formatTemps(teteLecture.peek())), 2500);
}

/** Importe un fichier (audio, vidéo ou enregistrement du micro) dans « Mes sons ». */
export async function importerFichierSon(f: File): Promise<void> {
  importEnCours.value = true;
  try {
    const so = await importerSon(f, idsPris());
    ajouterSourceOuverte(so);
    garderFichier(so);
    ongletSons.value = 'mes';
    afficherToast(T.sons.importe(so.infos.nom));
  } catch (e) {
    afficherToast(message(e));
  } finally {
    importEnCours.value = false;
  }
}

/** Règle le son choisi (volume, position…). */
export function reglerSon(partiel: Parameters<typeof modifierSon>[2]) {
  const i = sonChoisi.peek();
  if (i === null) return;
  recetteTemporaire.value = null;
  modifier((r) => (r.sons[i] ? modifierSon(r, i, partiel) : r));
}

/** Décale le son choisi de d secondes (dans le temps où il est attaché). */
export function decalerSon(d: number) {
  const i = sonChoisi.peek();
  const s = i !== null ? recette.peek()?.sons[i] : undefined;
  if (!s) return;
  if (s.ts !== undefined) reglerSon({ ts: auCentieme(Math.max(0, s.ts + d)) });
  else reglerSon({ t: auCentieme(Math.max(0, (s.t ?? 0) + d)) });
}

export function supprimerSonChoisi() {
  const i = sonChoisi.peek();
  if (i === null) return;
  modifier((r) => (r.sons[i] ? supprimerSon(r, i) : r));
  sonChoisi.value = null;
}

/* ------------------------------------------------------------ transitions */

type IdTransition = (typeof TRANSITIONS)[number]['id'];

/** Type affiché de la transition d'entrée d'un plan (alias compris ; absent = coupe franche). */
export function typeTransition(p: Plan | undefined): IdTransition {
  const brut = typeof p?.trans === 'string' ? p.trans : p?.trans?.type;
  const id = (brut && ALIAS_TRANSITION[brut]) || brut;
  return TRANSITIONS.some((x) => x.id === id) ? (id as IdTransition) : 'coupe';
}

/** Le son assorti est-il actif ? (`son: false` le coupe.) */
export function sonTransitionActif(p: Plan | undefined): boolean {
  return !(typeof p?.trans === 'object' && p.trans.son === false);
}

/** Transition à écrire : le simple nom si rien d'autre, sinon l'objet (durée gardée, son coupé). */
function transition(
  type: IdTransition,
  avecSon: boolean,
  ancienne: Plan['trans'],
): string | Transition | null {
  if (type === 'coupe') return null;
  const dur = typeof ancienne === 'object' ? ancienne.dur : undefined;
  if (avecSon && dur === undefined) return type;
  const t: Transition = { type };
  if (dur !== undefined) t.dur = dur;
  if (!avecSon) t.son = false;
  return t;
}

/** Temps de sortie des coupes : [indice du plan d'entrée, temps]. */
export function coupes(r: Recette): [number, number][] {
  const b = bornesDesPlans(r);
  return b.slice(1, -1).map((t, k) => [k + 1, t]);
}

export function choisirTypeTransition(type: IdTransition) {
  const i = coupeChoisie.peek();
  if (i === null) return;
  modifier((r) => {
    const p = r.plans[i];
    return p ? choisirTransition(r, i, transition(type, sonTransitionActif(p), p.trans)) : r;
  });
}

export function basculerSonTransition(avec: boolean) {
  const i = coupeChoisie.peek();
  if (i === null) return;
  modifier((r) => {
    const p = r.plans[i];
    return p ? choisirTransition(r, i, transition(typeTransition(p), avec, p.trans)) : r;
  });
}

/** Met la transition de la coupe choisie (avec son réglage de son) sur toutes les coupes. */
export function transitionSurToutes() {
  const i = coupeChoisie.peek();
  const p = i !== null ? recette.peek()?.plans[i] : undefined;
  if (!p) return;
  const type = typeTransition(p);
  if (modifier((r) => transitionPartout(r, transition(type, sonTransitionActif(p), p.trans)))) {
    afficherToast(T.transitions.appliquee(TRANSITIONS.find((x) => x.id === type)?.nom ?? type), 2500);
  }
}

/* ------------------------------------------------------------ zooms */

/** Ajoute un zoom à la tête de lecture (en jeu + webcam : sur la bande webcam par défaut) et le choisit. */
export function ajouterZoomIci() {
  let i = -1;
  modifier((r) => {
    const z: Zoom = {
      ...poseALaTete(r),
      dur: ZOOM.dur,
      x: ZOOM.x,
      y: ZOOM.y,
      force: ZOOM.force,
      style: ZOOM.style,
    };
    if (r.mise.type === 'jeuCam') z.zone = 'cam';
    const res = ajouterZoom(r, z);
    i = res.i;
    return res.recette;
  });
  if (i >= 0) zoomChoisi.value = i;
}

export function reglerZoom(partiel: Partial<Zoom>) {
  const i = zoomChoisi.peek();
  if (i === null) return;
  recetteTemporaire.value = null;
  modifier((r) => (r.zooms[i] ? modifierZoom(r, i, partiel) : r));
}

export function supprimerZoomChoisi() {
  const i = zoomChoisi.peek();
  if (i === null) return;
  modifier((r) => (r.zooms[i] ? supprimerZoom(r, i) : r));
  zoomChoisi.value = null;
}
