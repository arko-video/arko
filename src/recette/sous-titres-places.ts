// Sous-titres placés sur la vidéo finale (fonctions pures).
// 1. Chaque mot est en TEMPS SOURCE : on le convertit en temps de SORTIE pour chaque plan qui le contient
//    (un passage réutilisé fait réapparaître ses mots ; un mot coupé hors des plans disparaît).
// 2. Les mots sont regroupés en lignes de `parLigne` mots. Une ligne s'arrête aussi sur un trou de plus
//    de 0,6 s (dans la vidéo finale ou dans la source), à la fin d'une phrase (. ! ? …) ou si le mot
//    suivant ne suit pas dans la liste.
// 3. Mode « Punchlines seulement » (Montage auto, B) : seuls les mots dont le milieu tombe dans une punchline
//    restent, UNE ligne par punchline (7 mots au plus), CALÉE SUR LES MOTS (retour de Romain, 6/11/2026) : elle
//    apparaît au début du 1er mot (jamais avant), disparaît 0,2 s après la fin du dernier, et dure 2,5 s au plus
//    (une phrase plus longue est coupée en deux lignes).
// Le dessin (moteur/couches/sous-titres.ts) et la liste de l'interface (lignesSousTitres) lisent ces MÊMES lignes.

import { PUNCHLINES } from '../auto/habillage/punchlines';
import type { PlanPlace } from './chronologie';
import { SOUS_TITRES, ySousTitres } from './defauts';
import { avecLignesVoix, toursDeLaVideo } from './sous-titres-voix';
import type { MiseEnPage, Mot, PlagePunchline, Sec, SousTitres, TourDeParole } from './types';

/** Un trou plus long que ça entre deux mots coupe la ligne. */
export const TROU_MAX: Sec = 0.6;

/** Un mot posé sur la vidéo finale. */
export interface MotPlace {
  /** Indice du mot dans sousTitres.mots. */
  k: number;
  mot: Mot;
  /** Temps de SORTIE du début et de la fin du mot. */
  t0: Sec;
  t1: Sec;
}

/** Une ligne affichée de t0 (début de son 1er mot) à t1 (fin de son dernier mot). */
export interface LignePlacee {
  /** Indices [k0, k1[ des mots dans sousTitres.mots. */
  k0: number;
  k1: number;
  t0: Sec;
  t1: Sec;
  mots: MotPlace[];
  /** Best-of (« Sous-titres pour : … ») : ligne d'une personne, avec son style et sa hauteur (sinon ceux du bloc). */
  style?: string;
  y?: number;
}

export interface SousTitresPlaces {
  style: string;
  /** Centre vertical du bloc (0 = haut, 1 = bas). */
  y: number;
  lignes: LignePlacee[];
  /** B. Couleur du mot clé (style « punchline ») et jurons masqués au dessin (« P*TAIN »). Absents = anciens réglages. */
  couleurCle?: string;
  masquer?: boolean;
}

/** Couleurs du mot clé d'une punchline. */
export const COULEURS_CLE = { jaune: '#FFE500', rouge: '#FF3030' } as const;
/** Une punchline reste 0,2 s après son dernier mot (sans toucher la suivante), et 2,5 s au plus à l'écran. */
export const TENUE_PUNCHLINE = { apres: 0.2, max: 2.5 };

/** Mots visibles dans la vidéo finale, dans l'ordre de la vidéo. Un mot appartient au plan qui contient son milieu. */
export function placerMots(plans: PlanPlace[], mots: Mot[], src: string): MotPlace[] {
  const res: MotPlace[] = [];
  for (const p of plans) {
    if (p.src !== src) continue;
    mots.forEach((mot, k) => {
      const milieu = (mot[1] + mot[2]) / 2;
      if (milieu < p.de || milieu >= p.a) return;
      const t0 = p.t0 + (Math.max(mot[1], p.de) - p.de) / p.vit;
      const t1 = p.t0 + (Math.min(mot[2], p.a) - p.de) / p.vit;
      res.push({ k, mot, t0, t1 });
    });
  }
  return res;
}

const FIN_DE_PHRASE = /[.!?…]$/;

/**
 * Regroupe les mots placés en lignes. `groupe` (facultatif) : une ligne ne mélange jamais deux groupes.
 * `dureeMax` (facultatif) : une ligne qui finirait plus de `dureeMax` s après son début est coupée en deux.
 */
export function decouperLignes(mots: MotPlace[], parLigne: number, groupe?: (m: MotPlace) => number, dureeMax = Infinity): LignePlacee[] {
  const lignes: LignePlacee[] = [];
  let courante: MotPlace[] = [];
  const fermer = () => {
    const premier = courante[0];
    const dernier = courante[courante.length - 1];
    if (premier && dernier) lignes.push({ k0: premier.k, k1: dernier.k + 1, t0: premier.t0, t1: dernier.t1, mots: courante });
    courante = [];
  };
  for (const m of mots) {
    const prec = courante[courante.length - 1];
    const couper =
      prec !== undefined &&
      (courante.length >= parLigne ||
        m.k !== prec.k + 1 ||
        m.t0 - prec.t1 > TROU_MAX || // trou dans la vidéo finale
        m.mot[1] - prec.mot[2] > TROU_MAX || // saut dans la source (une coupe a retiré un passage)
        FIN_DE_PHRASE.test(prec.mot[0]) ||
        m.t1 - courante[0]!.t0 > dureeMax ||
        (groupe !== undefined && groupe(m) !== groupe(prec)));
    if (couper) fermer();
    courante.push(m);
  }
  fermer();
  return lignes;
}

/** Indice de la punchline qui contient le milieu du mot (−1 : aucune). */
function punchlineDu(mot: Mot, plages: readonly PlagePunchline[]): number {
  const milieu = (mot[1] + mot[2]) / 2;
  return plages.findIndex((p) => milieu >= p.ts && milieu <= p.fin);
}

/** Tient chaque punchline 0,2 s après son dernier mot, 2,5 s au plus, sans jamais chevaucher la suivante. */
function tenir(lignes: LignePlacee[]): LignePlacee[] {
  return lignes.map((l, i) => {
    const suivante = lignes[i + 1]?.t0 ?? Infinity;
    return { ...l, t1: Math.max(l.t0 + 0.01, Math.min(suivante, l.t1 + TENUE_PUNCHLINE.apres, l.t0 + TENUE_PUNCHLINE.max)) };
  });
}

/** Options de placement : `toutes` = toutes les phrases même en mode punchlines (liste de l'interface, pour en ajouter). */
export interface OptionsPlacement {
  toutes?: boolean;
  /** Best-of : tours de parole (pour `st.pour`) et hauteur des lignes de la personne. */
  paroles?: readonly TourDeParole[];
  yVoix?: number;
}

/** Sous-titres de la vidéo finale (null s'il n'y en a pas, ou s'ils sont encore à transcrire). */
export function placerSousTitres(st: SousTitres | null, plans: PlanPlace[], mise: MiseEnPage, premiere: string, o: OptionsPlacement = {}): SousTitresPlaces | null {
  if (!st || st.mots === 'auto') return null;
  const parLigne = Math.max(1, st.parLigne ?? SOUS_TITRES.parLigne);
  const mots = placerMots(plans, st.mots, st.src ?? premiere);
  const style = st.style ?? SOUS_TITRES.style;
  const res: SousTitresPlaces = { style, y: st.y ?? ySousTitres(mise), lignes: [] };
  const punch = st.mode === 'punchlines';
  if (punch && o.toutes) {
    // Liste de l'interface : une ligne par phrase (pour toucher une phrase entière).
    res.lignes = decouperLignes(mots, Infinity);
  } else if (punch) {
    const plages = st.punchlines ?? [];
    const gardes = mots.filter((m) => punchlineDu(m.mot, plages) >= 0);
    res.lignes = tenir(decouperLignes(gardes, PUNCHLINES.motsMax, (m) => punchlineDu(m.mot, plages), TENUE_PUNCHLINE.max - TENUE_PUNCHLINE.apres));
    if (st.pour && o.paroles && o.paroles.length > 0) {
      const tours = toursDeLaVideo(o.paroles, st.src ?? premiere, premiere);
      const dans = (m: Mot) => punchlineDu(m, plages) >= 0;
      res.lignes = avecLignesVoix(res.lignes, mots, tours, st.pour, o.yVoix ?? res.y, dans, (ms, n, d) => decouperLignes(ms, n, undefined, d));
    }
  } else res.lignes = decouperLignes(mots, parLigne);
  if (punch || style === 'punchline' || st.couleurCle) res.couleurCle = COULEURS_CLE[st.couleurCle ?? 'jaune'];
  const masquer = st.jurons ? st.jurons === 'masques' : punch || style === 'punchline';
  if (masquer) res.masquer = true;
  return res;
}
