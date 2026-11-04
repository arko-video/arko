// État (pur) d'une image de la vidéo finale au temps de sortie t : quel plan, quel temps source,
// quelle mise en page, et les calques actifs (textes, sous-titres, zoom, transition). Aucun dessin ici.

import { dansArret, planAuTemps, sourceA, type PlanPlace, type Scenario } from '../recette/chronologie';
import { TEXTE, ZOOM } from '../recette/defauts';
import type { LignePlacee } from '../recette/sous-titres-places';
import type { MiseEnPage, Sec, Texte, Zoom } from '../recette/types';
import { courbeZoom } from './couches/zooms';

/** Un texte visible, avec son âge (pour l'animation d'entrée) et le temps qui lui reste (fondu de sortie). */
export interface TexteActif {
  texte: Texte;
  /** Indice dans recette.textes. */
  i: number;
  /** Secondes depuis l'apparition du texte. */
  age: Sec;
  /** Secondes avant sa disparition. */
  reste: Sec;
}

/** La ligne de sous-titres visible et le mot en cours. */
export interface SousTitreActif {
  ligne: LignePlacee;
  style: string;
  y: number;
  /** Indice (dans la ligne) du mot en cours : le dernier mot déjà commencé. */
  actif: number;
  /** Secondes depuis le début du mot en cours. */
  ageMot: Sec;
}

export interface ZoomActif {
  zoom: Zoom;
  /** Avancement de 0 à 1 dans la durée du zoom. */
  avancement: number;
}

/**
 * Transition en cours. Elle occupe dur/2 à la FIN du plan précédent et dur/2 au DÉBUT du nouveau plan
 * (chaque moitié limitée à la moitié de son plan) : les plans ne se chevauchent jamais.
 */
export interface TransitionActive {
  type: string;
  /** De −1 (début de la transition) à 0 (la coupe) puis à 1 (fin de la transition). */
  avancement: number;
  /** « avant » : on montre encore le plan précédent ; « apres » : on montre déjà le nouveau plan. */
  cote: 'avant' | 'apres';
  /** Plan dont on sort, et plan où l'on entre. */
  depuis: PlanPlace;
  vers: PlanPlace;
}

export interface EtatImage {
  t: Sec;
  /** Gabarit de la destination (taille de référence des textes, zone sûre). */
  gab: Scenario['gab'];
  plan: PlanPlace;
  /** Temps source à afficher. */
  ts: Sec;
  src: string;
  mise: MiseEnPage;
  textes: TexteActif[];
  sousTitres: SousTitreActif | null;
  zoom: ZoomActif | null;
  transition: TransitionActive | null;
}

/** Calcule l'état de l'image au temps de sortie t (null si hors vidéo ou sans plan). */
export function etatImage(s: Scenario, t: Sec): EtatImage | null {
  const tb = Math.min(Math.max(t, 0), s.duree);
  const pos = sourceA(s, tb);
  if (!pos) return null;
  const { plan, ts } = pos;
  return {
    t: tb,
    gab: s.gab,
    plan,
    ts,
    src: plan.src,
    mise: plan.mise,
    textes: textesActifs(s, tb),
    // Pendant un arrêt sur image, les sous-titres restent figés sur la dernière ligne du plan.
    sousTitres: dansArret(plan, tb) ? sousTitreFige(s, plan) : sousTitreActif(s, tb),
    zoom: zoomActif(s, tb),
    transition: transitionActive(s, plan, tb),
  };
}

/** Textes visibles au temps t, dans l'ordre de la recette (le dernier est dessiné par-dessus). */
export function textesActifs(s: Pick<Scenario, 'textes'>, t: Sec): TexteActif[] {
  const res: TexteActif[] = [];
  s.textes.forEach((texte, i) => {
    const fin = texte.t + (texte.dur ?? TEXTE.dur);
    if (t >= texte.t && t < fin) res.push({ texte, i, age: t - texte.t, reste: fin - t });
  });
  return res;
}

function sousTitreActif(s: Scenario, t: Sec): SousTitreActif | null {
  const st = s.sousTitres;
  const ligne = st?.lignes.find((l) => t >= l.t0 && t < l.t1);
  if (!st || !ligne) return null;
  let actif = 0;
  ligne.mots.forEach((m, j) => {
    if (m.t0 <= t) actif = j;
  });
  return { ligne, style: st.style, y: st.y, actif, ageMot: t - ligne.mots[actif]!.t0 };
}

/** Sous-titre pendant l'arrêt sur image : la ligne visible juste avant l'arrêt (ou finie depuis moins de 0,3 s). */
function sousTitreFige(s: Scenario, plan: PlanPlace): SousTitreActif | null {
  const t = plan.tFige - 1e-3;
  const st = s.sousTitres;
  if (!st) return null;
  const ligne = [...st.lignes].reverse().find((l) => l.t0 <= t && l.t1 > t - 0.3);
  if (!ligne) return null;
  let actif = 0;
  ligne.mots.forEach((m, j) => {
    if (m.t0 <= t) actif = j;
  });
  return { ligne, style: st.style, y: st.y, actif, ageMot: Math.max(0, t - ligne.mots[actif]!.t0) };
}

function zoomActif(s: Scenario, t: Sec): ZoomActif | null {
  const actifs: { zoom: Zoom; ecoule: Sec; dur: Sec }[] = [];
  for (const z of s.zooms) {
    if (z.t > t) break;
    const dur = z.element.dur ?? ZOOM.dur;
    if (t < z.t + dur) actifs.push({ zoom: z.element, ecoule: t - z.t, dur });
  }
  if (actifs.length === 0) return null;
  if (actifs.length === 1) return { zoom: actifs[0]!.zoom, avancement: actifs[0]!.ecoule / actifs[0]!.dur };
  return melangerZooms(actifs);
}

/**
 * Deux zooms (ou plus) qui se chevauchent : on passe de l'un à l'autre EN DOUCEUR.
 * Échelle = la plus grande des échelles (jamais de saut), centre = moyenne des centres pondérée par
 * l'agrandissement de chacun (un zoom qui commence ou qui finit ne pèse presque rien).
 * Le résultat est un zoom « punch » lu en plein maintien : son échelle vaut exactement sa force.
 */
function melangerZooms(actifs: { zoom: Zoom; ecoule: Sec; dur: Sec }[]): ZoomActif {
  let echelle = 1;
  let poids = 0;
  let x = 0;
  let y = 0;
  for (const a of actifs) {
    const e = 1 + ((a.zoom.force ?? ZOOM.force) - 1) * courbeZoom(a.zoom.style ?? ZOOM.style, a.ecoule, a.dur);
    echelle = Math.max(echelle, e);
    poids += e - 1;
    x += (e - 1) * (a.zoom.x ?? ZOOM.x);
    y += (e - 1) * (a.zoom.y ?? ZOOM.y);
  }
  const dernier = actifs[actifs.length - 1]!.zoom;
  const centre = poids > 0 ? { x: x / poids, y: y / poids } : { x: dernier.x ?? ZOOM.x, y: dernier.y ?? ZOOM.y };
  return { zoom: { ...dernier, ...centre, style: 'punch', force: echelle, dur: 1 }, avancement: 0.5 };
}

/** Durées des deux moitiés de la transition d'entrée du plan `vers` (0 si coupe franche). */
export function moitiesTransition(s: Pick<Scenario, 'plans'>, vers: PlanPlace): { avant: Sec; apres: Sec } {
  const depuis = s.plans[vers.i - 1];
  if (!vers.trans || !depuis) return { avant: 0, apres: 0 };
  const demi = vers.trans.dur / 2;
  return { avant: Math.min(demi, (depuis.t1 - depuis.t0) / 2), apres: Math.min(demi, (vers.t1 - vers.t0) / 2) };
}

function transitionActive(s: Scenario, plan: PlanPlace, t: Sec): TransitionActive | null {
  // 1. Début du plan : seconde moitié de SA transition d'entrée.
  if (plan.trans) {
    const { apres } = moitiesTransition(s, plan);
    if (apres > 0 && t < plan.t0 + apres) {
      return { type: plan.trans.type, avancement: (t - plan.t0) / apres, cote: 'apres', depuis: s.plans[plan.i - 1]!, vers: plan };
    }
  }
  // 2. Fin du plan : première moitié de la transition d'entrée du plan SUIVANT.
  const suivant = s.plans[plan.i + 1];
  if (suivant?.trans) {
    const { avant } = moitiesTransition(s, suivant);
    if (avant > 0 && t >= plan.t1 - avant) {
      const avancement = Math.min(0, (t - plan.t1) / avant);
      return { type: suivant.trans.type, avancement, cote: 'avant', depuis: plan, vers: suivant };
    }
  }
  return null;
}

/** Plan suivant celui affiché au temps t (pour pré-décoder avant une coupe). */
export function planSuivant(s: Scenario, t: Sec): PlanPlace | null {
  const p = planAuTemps(s, t);
  return p ? (s.plans[p.i + 1] ?? null) : null;
}
