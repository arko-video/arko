// Opérations du Montage auto « Habillage » (dev 2) : B (punchlines), C (zooms automatiques), G (titres de section).
// Mêmes règles que operations.ts : NOUVELLE recette normalisée, la recette d'origine si sans effet ;
// une opération = un seul Annuler. Réexportées par operations.ts.

import { phraseDuMot } from '../auto/habillage/punchlines';
import { SON_SECTION, TITRE_SECTION, titresAPoser, titresDesChapitres, type TitreSection } from '../auto/habillage/sections';
import { momentsForts, planifierZoomsAuto, type ForceZoomsAuto } from '../auto/habillage/zooms-auto';
import type { SignauxSource } from '../auto/types';
import { compiler } from './chronologie';
import { SOUS_TITRES } from './defauts';
import { gabaritDe } from './destination';
import { normaliser } from './normaliser';
import { SECTIONS } from './normaliser-auto-habillage';
import type { ModeSousTitres, PlagePunchline, Plan, Recette, ReglagesSections, Sec, Son, SousTitres, Texte, ZoomFixe } from './types';

/** Hauteur des punchlines en 16:9 : tiers bas, au-dessus de la barre d'objets du jeu. */
export const Y_PUNCHLINES_PAYSAGE = 0.74;
/**
 * En vertical : hauteur habituelle, mais pas plus bas que 0,63 (une punchline en gros sur 2 rangées descendrait
 * sous la description TikTok, à 0,72).
 */
export const Y_PUNCHLINES_VERTICAL_MAX = 0.63;

/** Normalise ; renvoie la recette d'origine si rien n'a changé. */
function finir(origine: Recette, modifiee: Recette): Recette {
  const r = normaliser(modifiee, { sources: modifiee.sources }).recette;
  return JSON.stringify(r) === JSON.stringify(origine) ? origine : r;
}

/** Sous-titres modifiés (la recette d'origine s'il n'y en a pas). */
function avecSousTitres(recette: Recette, changer: (st: SousTitres) => SousTitres): Recette {
  if (!recette.sousTitres) return recette;
  return finir(recette, { ...recette, sousTitres: changer({ ...recette.sousTitres }) });
}

/* ------------------------------------------------------------------ B. Punchlines */

/** « Tout » / « Punchlines seulement ». En punchlines, le style « punchline » est choisi (on peut en changer). */
export function choisirModeSousTitres(recette: Recette, mode: ModeSousTitres): Recette {
  const paysage = gabaritDe(recette).paysage;
  return avecSousTitres(recette, (st) => {
    if (mode === 'punchlines') {
      st.mode = 'punchlines';
      st.style = 'punchline';
      st.punchlines = st.punchlines ?? [];
      if (paysage) st.y = Y_PUNCHLINES_PAYSAGE;
      else if ((st.y ?? 0) > Y_PUNCHLINES_VERTICAL_MAX) st.y = Y_PUNCHLINES_VERTICAL_MAX;
      return st;
    }
    delete st.mode;
    if (st.style === 'punchline') st.style = SOUS_TITRES.style;
    // Retour à la hauteur habituelle (calculée par le normaliseur selon la mise en page).
    if (st.y === (paysage ? Y_PUNCHLINES_PAYSAGE : Y_PUNCHLINES_VERTICAL_MAX)) delete st.y;
    return st;
  });
}

/** Remplace la liste des punchlines (ex. celles de trouverPunchlines). */
export function definirPunchlines(recette: Recette, plages: readonly PlagePunchline[]): Recette {
  return avecSousTitres(recette, (st) => ({ ...st, punchlines: plages.map((p) => ({ ts: p.ts, fin: p.fin })) }));
}

/** Retire [de, a] des plages (une plage coupée en deux garde ses deux bouts). */
function soustraire(plages: readonly PlagePunchline[], de: Sec, a: Sec): PlagePunchline[] {
  const res: PlagePunchline[] = [];
  for (const p of plages) {
    if (p.fin <= de || p.ts >= a) res.push({ ...p });
    else {
      if (p.ts < de) res.push({ ts: p.ts, fin: de });
      if (p.fin > a) res.push({ ts: a, fin: p.fin });
    }
  }
  return res;
}

/** Ajoute ou retire d'un toucher la phrase qui contient le mot k (indice dans sousTitres.mots). */
export function basculerPunchline(recette: Recette, k: number): Recette {
  const mots = recette.sousTitres?.mots;
  if (!Array.isArray(mots) || !Number.isInteger(k) || k < 0 || k >= mots.length) return recette;
  const phrase = phraseDuMot(mots, k);
  const plages = recette.sousTitres!.punchlines ?? [];
  const milieu = (mots[k]![1] + mots[k]![2]) / 2;
  const deja = plages.some((p) => milieu >= p.ts && milieu <= p.fin);
  const nouvelles = deja ? soustraire(plages, phrase.ts, phrase.fin) : [...plages, { ts: phrase.ts, fin: phrase.fin }];
  return avecSousTitres(recette, (st) => ({ ...st, punchlines: nouvelles }));
}

/* ------------------------------------------------------------------ C. Zooms automatiques */

/** Pose un zoom fixe (ou aucun, null) sur chaque plan ; la liste a un élément par plan. */
export function appliquerZoomsAuto(recette: Recette, zooms: readonly (ZoomFixe | null)[]): Recette {
  const plans: Plan[] = recette.plans.map((p, i) => {
    if (i >= zooms.length) return p;
    const { zoomFixe: _ancien, ...reste } = p;
    void _ancien;
    const z = zooms[i];
    return z ? { ...reste, zoomFixe: { ...z } } : reste;
  });
  return finir(recette, { ...recette, plans });
}

/** Bouton « Zooms automatiques » : momentsForts + planifierZoomsAuto + appliquerZoomsAuto. */
export function zoomsAutomatiques(recette: Recette, signaux: SignauxSource | null, force: ForceZoomsAuto): Recette {
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  return appliquerZoomsAuto(recette, planifierZoomsAuto(recette.plans, momentsForts(recette, signaux), force, premiere));
}

/** Retire tous les zooms fixes des plans. */
export function retirerZoomsAuto(recette: Recette): Recette {
  return appliquerZoomsAuto(recette, recette.plans.map(() => null));
}

/** Nombre de plans avec un zoom fixe (pour l'interface). */
export function compterZoomsAuto(recette: Recette): number {
  return recette.plans.filter((p) => p.zoomFixe).length;
}

/* ------------------------------------------------------------------ G. Titres de section */

function texteSection(x: TitreSection, dur: Sec): Texte {
  return { txt: x.nom, role: 'section', style: 'bandeau', t: x.t, dur, x: 0.5, y: TITRE_SECTION.y };
}

function sonSection(t: Sec): Son {
  return { id: SON_SECTION, t, role: 'section', vol: TITRE_SECTION.volSon };
}

/** La recette sans aucun titre de section (textes et sons de rôle « section »). */
function sansSections(recette: Recette): Recette {
  return { ...recette, textes: recette.textes.filter((x) => x.role !== 'section'), sons: recette.sons.filter((s) => s.role !== 'section') };
}

/**
 * Pose les titres de section (textes rôle « section », style « bandeau », + whoosh rôle « section » si `son`),
 * en remplaçant ceux d'avant ; écrit `recette.sections`. Source « chapitres » : un titre par chapitre.
 * Source « main » : les titres posés à la main sont gardés (on leur applique la durée et le son).
 */
export function titresDeSection(recette: Recette, reglages: ReglagesSections): Recette {
  const dur = reglages.dur ?? SECTIONS.dur;
  const son = reglages.son !== false;
  const titres =
    reglages.source === 'chapitres'
      ? titresDesChapitres(recette)
      : recette.textes.filter((x) => x.role === 'section').map((x) => ({ t: x.t, nom: x.txt }));
  const base = sansSections(recette);
  const poses = titresAPoser(titres, base, compiler(recette).duree);
  const r: Recette = {
    ...base,
    textes: [...base.textes, ...poses.map((x) => texteSection(x, dur))],
    sons: [...base.sons, ...(son ? poses.map((x) => sonSection(x.t)) : [])],
    sections: { source: reglages.source, son, dur },
  };
  return finir(recette, r);
}

/** Pose UN titre de section à la main au temps de sortie t. */
export function ajouterTitreDeSection(recette: Recette, t: Sec, nom: string): { recette: Recette; i: number } {
  const txt = nom.trim();
  if (!txt) return { recette, i: -1 };
  const reglages: ReglagesSections = recette.sections ?? { source: 'main' };
  const x = { t: Math.max(0, Math.round(t * 100) / 100), nom: txt };
  const r: Recette = {
    ...recette,
    textes: [...recette.textes, texteSection(x, reglages.dur ?? SECTIONS.dur)],
    sons: reglages.son === false ? recette.sons : [...recette.sons, sonSection(x.t)],
    sections: reglages,
  };
  const fini = finir(recette, r);
  return fini === recette ? { recette, i: -1 } : { recette: fini, i: fini.textes.length - 1 };
}

/** Retire tous les titres de section (textes et sons de rôle « section ») et `recette.sections`. */
export function retirerTitresDeSection(recette: Recette): Recette {
  const { sections: _s, ...reste } = sansSections(recette);
  void _s;
  return finir(recette, reste as Recette);
}

/** Nombre de titres de section posés (pour l'interface). */
export function compterTitresDeSection(recette: Recette): number {
  return recette.textes.filter((x) => x.role === 'section').length;
}
