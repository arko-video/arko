// C. Couche « avatars » (dev 3), dans LE chemin de rendu (rendre.ts → compositeur, après les fonds verts / mèmes et
// avant le calque de transition, les textes et les sous-titres) : le chibi de chaque personne qui parle apparaît
// (pop 0,12 s), change selon l'émotion du tour, bouche ouverte / fermée (bits du tour), petit rebond, reste visible
// `tenue` s après la fin du tour, puis disparaît (0,15 s). Plusieurs personnes = plusieurs chibis à leur place.
// Aperçu = export : tout est calculé à partir de la recette et de t (aucune horloge, aucun hasard).
// Contrat : conception/contrat-wankil.md §5.

import { boucheOuverte } from '../../chibis/bouche';
import { dessinerChibiCache } from '../../chibis/cache';
import type { PoseChibi } from '../../chibis/dessin';
import { persoPretPour } from '../../chibis/persos/prets';
import { emotionAvecSituation } from '../../chibis/persos/situations';
import type { Scenario } from '../../recette/chronologie';
import type { Gabarit } from '../../recette/destination';
import { AVATARS } from '../../recette/normaliser-chibis';
import type { DefinitionChibi, Emotion, Mot, Personne, PlaceAvatar, Recette, Sec, Situation, TourDeParole } from '../../recette/types';
import type { Ctx2D, Env } from '../canevas';
import type { EtatImage } from '../etat-image';
import { boitesSousTitres } from './boites-textes';
import { eviterTextes, melanger, placeAuto, placesDesPersos, PLACES_PERSOS } from './places-persos';

/** Un tour de parole placé en temps de SORTIE (un passage réutilisé donne plusieurs placements). */
export interface AvatarPlace {
  p: string;
  t0: Sec;
  t1: Sec;
  tour: TourDeParole;
  /** Temps source au début du placement (pour lire les bits de bouche). */
  ts0: Sec;
  vit: number;
  /** Mode « réactions » : tête géante au centre au début de ce placement. */
  xxl?: boolean;
}

/** Ce qu'il faut dessiner au temps t pour une personne. */
export interface AvatarVisible {
  p: string;
  chibi: DefinitionChibi;
  emo: Emotion;
  /** Situation de jeu du tour (absente = aucune). */
  sit?: Situation;
  bouche: boolean;
  place: PlaceAvatar;
  /** Échelle d'apparition / disparition (0 à 1,08) et décalage vertical du rebond (part de la hauteur du chibi). */
  echelle: number;
  saut: number;
  /** Tête géante au centre (mode « réactions ») : l'image est assombrie derrière. */
  xxl?: boolean;
}

export const ANIMATION_AVATAR = { pop: 0.12, depop: 0.15, rebond: 0.25, hauteurRebond: 0.06, echelleMax: 1.08 } as const;
/** Moment du sommet de l'apparition (échelle 1,08) et petit saut quand la bouche s'ouvre. */
export const POP_SOMMET = 0.08;
export const SAUT_BOUCHE = 0.015;

/**
 * Mode « réactions » (10/11/2026, d'après le best-of modèle de Romain : les persos surgissent sur les réactions et ne
 * restent pas posés tout le long). Une réaction = un tour avec une vraie émotion ou une situation de jeu.
 */
export const REACTIONS = {
  /** Une réaction reste visible au plus `dureeMax` s. */
  dureeMax: 4,
  /** Sans réaction depuis `rappel` s, le prochain tour montre son perso `dureeRappel` s (on sait qui parle). */
  rappel: 15,
  dureeRappel: 2,
  /** Tête géante au centre : seulement ces émotions, `dureeXxl` s, une fois toutes les `ecartXxl` s au plus. */
  emosXxl: ['hurle', 'mortDeRire', 'rage', 'choque', 'victoire', 'pleure'] as readonly Emotion[],
  dureeXxl: 1.4,
  ecartXxl: 45,
  placeXxl: { x: 0.5, y: 1.04, taille: 0.92 } as PlaceAvatar,
  /** Assombrissement de l'image derrière la tête géante. */
  sombreXxl: 0.45,
} as const;

/** Placements retenus en mode « réactions » (pure, triés) : réactions (bornées), rappels, têtes géantes marquées. */
export function placesDeReaction(places: readonly AvatarPlace[]): AvatarPlace[] {
  const R = REACTIONS;
  const res: AvatarPlace[] = [];
  let finVue = -Infinity;
  let dernierXxl = -Infinity;
  for (const pl of [...places].sort((a, b) => a.t0 - b.t0)) {
    const emo = pl.tour.emo;
    const fort = (emo !== undefined && emo !== 'parle') || (pl.tour.sit !== undefined && pl.tour.sit !== 'aucune');
    if (fort) {
      const xxl = emo !== undefined && R.emosXxl.includes(emo) && pl.t0 - dernierXxl >= R.ecartXxl;
      if (xxl) dernierXxl = pl.t0;
      const t1 = Math.min(pl.t1, pl.t0 + R.dureeMax);
      res.push({ ...pl, t1, ...(xxl ? { xxl: true } : {}) });
      finVue = Math.max(finVue, t1);
    } else if (pl.t0 - finVue >= R.rappel) {
      const t1 = Math.min(pl.t1, pl.t0 + R.dureeRappel);
      res.push({ ...pl, t1 });
      finVue = t1;
    }
  }
  return res;
}

const REACTIONS_CACHE = new WeakMap<readonly AvatarPlace[], AvatarPlace[]>();
function reactionsDe(places: readonly AvatarPlace[]): AvatarPlace[] {
  let r = REACTIONS_CACHE.get(places);
  if (!r) REACTIONS_CACHE.set(places, (r = placesDeReaction(places)));
  return r;
}

/**
 * Place par défaut de la voix de rang `rang` parmi `n` voix (placement des persos de qui parle : places-persos.ts).
 * `ySousTitres` : centre des sous-titres / punchlines (9:16 : les pieds au-dessus).
 */
export function placeParDefaut(rang: number, gab: Gabarit, buste = false, n?: number, ySousTitres: number | null = null): PlaceAvatar {
  return placeAuto(rang, n ?? Math.max(2, rang + 1), gab, buste, ySousTitres);
}

/** Centre des sous-titres du montage (null s'il n'y en a pas) : les persos 9:16 se posent au-dessus. */
export function ySousTitresDe(scenario: Pick<Scenario, 'sousTitres'>): number | null {
  const st = scenario.sousTitres;
  return st && st.lignes.length > 0 ? st.y : null;
}

const PLACES = new WeakMap<Recette, Map<string, Map<string, PlaceAvatar>>>();

/** Place de chaque personne avec avatar (la sienne, sinon la place automatique de son rang), gardée en mémoire. */
export function placesAuto(recette: Recette, gab: Gabarit, ySousTitres: number | null): Map<string, PlaceAvatar> {
  const cle = `${gab.l}x${gab.h}|${ySousTitres}`;
  let parCle = PLACES.get(recette);
  if (!parCle) PLACES.set(recette, (parCle = new Map()));
  let res = parCle.get(cle);
  if (!res) {
    const style = recette.avatars?.style;
    res = placesDesPersos(avecAvatar(recette).map((p) => ({ id: p.id, ...(p.place ? { place: p.place } : {}), style: chibiDe(p, style).style })), gab, ySousTitres);
    parCle.set(cle, res);
  }
  return res;
}

/** Personnes qui ont un avatar (dans l'ordre de la recette). */
function avecAvatar(recette: Recette): Personne[] {
  return (recette.personnes ?? []).filter((p) => p.avatar !== false);
}

/** Tours de parole en temps de sortie (comme sortiesDe pour les mots), triés (pure). */
export function placerAvatars(recette: Recette, scenario: Scenario): AvatarPlace[] {
  const ids = new Set(avecAvatar(recette).map((p) => p.id));
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const res: AvatarPlace[] = [];
  for (const tour of recette.paroles ?? []) {
    if (!ids.has(tour.p)) continue;
    const src = tour.src ?? premiere;
    for (const pl of scenario.plans) {
      if (pl.src !== src || !pl.src) continue;
      const o0 = Math.max(tour.ts, pl.de);
      const o1 = Math.min(tour.fin, pl.a);
      if (o1 <= o0) continue;
      // Jamais pendant un arrêt sur image : le placement s'arrête à tFige.
      const t0 = pl.t0 + (o0 - pl.de) / pl.vit;
      const t1 = Math.min(pl.tFige, pl.t0 + (o1 - pl.de) / pl.vit);
      if (t1 > t0) res.push({ p: tour.p, t0, t1, tour, ts0: o0, vit: pl.vit });
    }
  }
  return res.sort((a, b) => a.t0 - b.t0 || a.p.localeCompare(b.p));
}

/** Placements d'une personne regroupés en moments visibles (placements à moins de `tenue` fusionnés). */
interface Moment {
  t0: Sec;
  /** Fin de la parole (avant la tenue). */
  t1: Sec;
  places: AvatarPlace[];
}

const INDEX = new WeakMap<readonly AvatarPlace[], Map<string, Moment[]>>();

function momentsDe(places: readonly AvatarPlace[], tenue: Sec): Map<string, Moment[]> {
  let idx = INDEX.get(places);
  if (idx) return idx;
  idx = new Map();
  for (const pl of places) {
    const liste = idx.get(pl.p) ?? [];
    const der = liste[liste.length - 1];
    if (der && pl.t0 - der.t1 < tenue) {
      der.t1 = Math.max(der.t1, pl.t1);
      der.places.push(pl);
    } else liste.push({ t0: pl.t0, t1: pl.t1, places: [pl] });
    idx.set(pl.p, liste);
  }
  INDEX.set(places, idx);
  return idx;
}

/** Dernier moment qui a commencé à t (recherche dichotomique). */
function momentA(liste: readonly Moment[], t: Sec): Moment | null {
  let bas = 0;
  let haut = liste.length - 1;
  let res: Moment | null = null;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    if (liste[m]!.t0 <= t + 1e-9) {
      res = liste[m]!;
      bas = m + 1;
    } else haut = m - 1;
  }
  return res;
}

/** Échelle d'apparition : 0 → 1,08 en 0,08 s → 1 à 0,12 s ; disparition 1 → 0 sur les 0,15 dernières secondes. */
export function echelleAvatar(depuis: Sec, avantFin: Sec): number {
  const A = ANIMATION_AVATAR;
  let e = 1;
  if (depuis < POP_SOMMET) e = (A.echelleMax * Math.max(0, depuis)) / POP_SOMMET;
  else if (depuis < A.pop) e = A.echelleMax - ((A.echelleMax - 1) * (depuis - POP_SOMMET)) / (A.pop - POP_SOMMET);
  if (avantFin < A.depop) e = Math.min(e, Math.max(0, avantFin / A.depop));
  return e;
}

/** Perso d'une personne : le sien, sinon un des 6 persos tout prêts (Voix 1 → perso 1…). Style imposé si réglé. */
export function chibiDe(p: Personne, style?: DefinitionChibi['style']): DefinitionChibi {
  const def = p.chibi ?? persoPretPour(p.id);
  return style ? { ...def, style } : def;
}

/** Avatars visibles au temps de sortie t (pure : c'est elle que les tests vérifient image par image). */
export function avatarsAuTemps(recette: Recette, places: readonly AvatarPlace[], t: Sec, gab: Gabarit, mots?: readonly Mot[], ySousTitres: number | null = null): AvatarVisible[] {
  const reglages = recette.avatars;
  if (!reglages) return [];
  const ou = placesAuto(recette, gab, ySousTitres);
  const tenue = reglages.tenue ?? AVATARS.tenue;
  const toujours = reglages.mode === 'toujours';
  const rebond = reglages.rebond !== false;
  const index = momentsDe(reglages.mode === 'reactions' ? reactionsDe(places) : places, tenue);
  const res: AvatarVisible[] = [];
  avecAvatar(recette).forEach((pers, rang) => {
    const liste = index.get(pers.id);
    if (!liste || liste.length === 0) return;
    const m = momentA(liste, t);
    if (!m) return;
    const fin = m.t1 + tenue;
    if (!toujours && t >= fin) return;
    // Placement en cours de parole, sinon le dernier commencé (tenue : même émotion, bouche fermée).
    let actif: AvatarPlace | null = null;
    let dernier = m.places[0]!;
    for (const pl of m.places) {
      if (pl.t0 > t + 1e-9) break;
      dernier = pl;
      if (t < pl.t1) actif = pl;
    }
    const enTenue = !actif;
    const pl = actif ?? dernier;
    const ts = pl.ts0 + (t - pl.t0) * pl.vit;
    const bouche = !enTenue && boucheOuverte(pl.tour, ts, pl.tour.b === undefined ? mots : undefined);
    const premier = toujours ? liste[0]!.t0 : m.t0;
    const echelle = echelleAvatar(t - premier, toujours ? Infinity : fin - t);
    let saut = 0;
    if (rebond) {
      const u = t - pl.t0;
      if (!toujours || !enTenue) {
        if (u >= 0 && u < ANIMATION_AVATAR.rebond) saut += ANIMATION_AVATAR.hauteurRebond * Math.sin((Math.PI * u) / ANIMATION_AVATAR.rebond);
      }
      if (bouche) saut += SAUT_BOUCHE;
    }
    const repos = toujours && enTenue && t >= fin;
    const sit = repos ? undefined : pl.tour.sit;
    const emo: Emotion = repos ? 'parle' : emotionAvecSituation(pl.tour.emo, sit);
    const chibi = chibiDe(pers, reglages.style);
    const xxl = pl.xxl === true && t - pl.t0 < REACTIONS.dureeXxl;
    const v: AvatarVisible = { p: pers.id, chibi, emo, bouche, place: xxl ? REACTIONS.placeXxl : (ou.get(pers.id) ?? placeParDefaut(rang, gab)), echelle, saut };
    if (sit) v.sit = sit;
    if (xxl) v.xxl = true;
    res.push(v);
  });
  return res;
}

export interface CoucheAvatars {
  /** `etat` (l'image en cours) : pas de perso sur un élément inséré plein écran ; les punchlines sont évitées. */
  dessiner(ctx: Ctx2D, t: Sec, env: Env, etat?: Pick<EtatImage, 'plan' | 'sousTitres'> | null): void;
}

/**
 * Ce qu'on dessine vraiment au temps t (pure) : rien pendant un élément inséré plein écran (carton, image, perso,
 * mème, vidéo insérée) ; sinon les avatars visibles, chacun écarté des punchlines et sous-titres à l'écran.
 */
export function avatarsAffiches(
  recette: Recette,
  places: readonly AvatarPlace[],
  t: Sec,
  scenario: Pick<Scenario, 'gab' | 'sousTitres'>,
  etat?: Pick<EtatImage, 'plan' | 'sousTitres'> | null,
  mots?: readonly Mot[],
): AvatarVisible[] {
  if (etat?.plan.ins) return [];
  const gab = scenario.gab;
  const visibles = avatarsAuTemps(recette, places, t, gab, mots, ySousTitresDe(scenario));
  const textes = etat?.sousTitres ? boitesSousTitres(etat.sousTitres, gab) : null;
  if (!textes || textes.boites.length === 0) return visibles;
  const e = Math.max(0, Math.min(1, (t - textes.t0) / PLACES_PERSOS.evite.fondu, (textes.t1 - t) / PLACES_PERSOS.evite.fondu));
  return visibles.map((v) => ({ ...v, place: melanger(v.place, eviterTextes(v.place, textes.boites, gab), e) }));
}

/** Mots de la transcription (pour la bouche des tours sans bits). */
function motsDe(recette: Recette): readonly Mot[] | undefined {
  const m = recette.sousTitres?.mots;
  return Array.isArray(m) ? m : undefined;
}

/** Dessine les avatars visibles (pure côté calcul ; le dessin passe par le cache d'images des chibis). */
export function dessinerAvatars(ctx: Ctx2D, visibles: readonly AvatarVisible[], t: Sec, env: Env) {
  const geant = visibles.find((v) => v.xxl && v.echelle > 0);
  if (geant) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${REACTIONS.sombreXxl * Math.min(1, geant.echelle)})`;
    ctx.fillRect(0, 0, env.l, env.h);
    ctx.restore();
  }
  // La tête géante passe devant les autres.
  for (const v of [...visibles].sort((a, b) => Number(a.xxl === true) - Number(b.xxl === true))) {
    if (v.echelle <= 0) continue;
    const h = v.place.taille * env.h;
    const cadre = { x: v.place.x * env.l, y: v.place.y * env.h - v.saut * h, h };
    const pose: PoseChibi = { emo: v.emo, bouche: v.bouche, t, retourne: v.place.x > 0.5 };
    if (v.sit) pose.sit = v.sit;
    dessinerChibiCache(ctx, v.chibi, pose, cadre, v.echelle);
  }
}

/** null sans `recette.avatars`, sans personnes ou sans tours (rendu exactement comme avant). */
export function preparerAvatars(recette: Recette, scenario: Scenario): CoucheAvatars | null {
  if (!recette.avatars || !recette.personnes?.length || !recette.paroles?.length) return null;
  try {
    const places = placerAvatars(recette, scenario);
    if (places.length === 0 && recette.avatars.mode !== 'toujours') return null;
    const mots = motsDe(recette);
    return {
      dessiner(ctx, t, env, etat) {
        try {
          dessinerAvatars(ctx, avatarsAffiches(recette, places, t, scenario, etat, mots), t, env);
        } catch (e) {
          prevenir(e);
        }
      },
    };
  } catch (e) {
    prevenir(e);
    return null;
  }
}

let prevenu = false;
function prevenir(e: unknown) {
  if (prevenu) return;
  prevenu = true;
  console.warn('[Arko] Avatars : dessin impossible.', e);
}
