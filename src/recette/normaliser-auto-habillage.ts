// Normalisation des champs du Montage auto « Habillage » (dev 2) : punchlines des sous-titres (B),
// zoom fixe d'un plan (C), titres de section (G). Champs FACULTATIFS : absents → rien n'est ajouté.

import { estObjet, lireNombre, type Journal, type Objet } from './normaliser-outils';
import { arrondir, lireTemps } from './temps';
import type { ModeSousTitres, PlagePunchline, ReglagesSections, SousTitres, ZoomFixe } from './types';

/** Zoom fixe d'un plan : force 1 à 2,5 ; centre un peu au-dessus du milieu par défaut. */
export const ZOOM_FIXE = { forceMin: 1, forceMax: 2.5, x: 0.5, y: 0.45 };
/** Titres de section : 2,2 s par défaut. */
export const SECTIONS = { dur: 2.2, durMin: 0.5, durMax: 6 };
/** Clés des sous-titres ajoutées par le Montage auto (à accepter dans normaliserSousTitres). */
export const CLES_SOUS_TITRES_AUTO = ['mode', 'punchlines', 'couleurCle', 'jurons', 'pour'] as const;

/** Champs auto des sous-titres (seulement ceux présents et valides). */
export function normaliserSousTitresAuto(brut: Objet, journal: Journal): Partial<SousTitres> {
  const res: Partial<SousTitres> = {};
  if (brut.mode !== undefined) {
    if (brut.mode === 'tout' || brut.mode === 'punchlines') res.mode = brut.mode as ModeSousTitres;
    else journal.corrige('sousTitres.mode', `Le mode "${String(brut.mode)}" n'existe pas : toutes les phrases s'affichent.`);
  }
  const p = normaliserPunchlines(brut.punchlines, journal);
  if (p) res.punchlines = p;
  if (brut.couleurCle !== undefined) {
    if (brut.couleurCle === 'jaune' || brut.couleurCle === 'rouge') res.couleurCle = brut.couleurCle;
    else journal.corrige('sousTitres.couleurCle', `La couleur "${String(brut.couleurCle)}" n'existe pas : jaune choisi.`);
  }
  if (brut.jurons !== undefined) {
    if (brut.jurons === 'masques' || brut.jurons === 'visibles') res.jurons = brut.jurons;
    else journal.corrige('sousTitres.jurons', 'Réglage des jurons inconnu : ils seront masqués.');
  }
  // Best-of : les phrases de cette personne sont sous-titrées en plus des punchlines (id de `personnes`).
  if (brut.pour !== undefined) {
    if (typeof brut.pour === 'string' && brut.pour.length > 0 && brut.pour.length <= 12) res.pour = brut.pour;
    else journal.corrige('sousTitres.pour', 'Personne des sous-titres illisible : ignorée.');
  }
  return res;
}

/** Punchlines : triées, fin après le début, celles qui se chevauchent fusionnées. */
function normaliserPunchlines(brut: unknown, journal: Journal): PlagePunchline[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('sousTitres.punchlines', '"punchlines" doit être une liste : ignoré.');
    return undefined;
  }
  const lues: PlagePunchline[] = [];
  brut.forEach((b, i) => {
    const ts = estObjet(b) ? lireTemps(b.ts) : null;
    const fin = estObjet(b) ? lireTemps(b.fin) : null;
    if (ts === null || fin === null || fin <= ts || ts < 0) return journal.corrige(`sousTitres.punchlines[${i}]`, 'Punchline sans début ou fin lisible : ignorée.');
    lues.push({ ts: arrondir(ts), fin: arrondir(fin) });
  });
  lues.sort((a, b) => a.ts - b.ts);
  const res: PlagePunchline[] = [];
  for (const p of lues) {
    const der = res[res.length - 1];
    if (der && p.ts <= der.fin) der.fin = Math.max(der.fin, p.fin);
    else res.push({ ...p });
  }
  return res;
}

/** Zoom fixe d'un plan. Une force ≤ 1 (aucun zoom) → pas de champ. */
export function normaliserZoomFixe(brut: unknown, chemin: string, journal: Journal): ZoomFixe | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  const o: Objet = typeof brut === 'number' || typeof brut === 'string' ? { force: brut } : estObjet(brut) ? brut : {};
  if (o.force === undefined) {
    journal.corrige(chemin, 'Zoom du plan sans force : retiré.');
    return undefined;
  }
  const force = lireNombre(o.force, `${chemin}.force`, journal, { defaut: 1, min: ZOOM_FIXE.forceMin, max: ZOOM_FIXE.forceMax, nom: 'la force du zoom du plan' });
  if (force <= 1.001) return undefined;
  const z: ZoomFixe = { force };
  if (o.x !== undefined) z.x = lireNombre(o.x, `${chemin}.x`, journal, { defaut: ZOOM_FIXE.x, min: 0, max: 1, nom: 'le centre du zoom (x)' });
  if (o.y !== undefined) z.y = lireNombre(o.y, `${chemin}.y`, journal, { defaut: ZOOM_FIXE.y, min: 0, max: 1, nom: 'le centre du zoom (y)' });
  return z;
}

/** Réglages des titres de section. `true` = réglages par défaut (titres des chapitres, avec whoosh). */
export function normaliserSections(brut: unknown, journal: Journal): ReglagesSections | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (brut === true) brut = { source: 'chapitres' };
  if (!estObjet(brut)) {
    journal.corrige('sections', 'Réglage des titres de section illisible : ignoré.');
    return undefined;
  }
  const res: ReglagesSections = { source: brut.source === 'main' ? 'main' : 'chapitres' };
  if (brut.source !== undefined && brut.source !== 'main' && brut.source !== 'chapitres') {
    journal.corrige('sections.source', `La source de titres "${String(brut.source)}" n'existe pas : chapitres choisis.`);
  }
  if (brut.son !== undefined) res.son = brut.son !== false;
  if (brut.dur !== undefined) res.dur = lireNombre(brut.dur, 'sections.dur', journal, { defaut: SECTIONS.dur, min: SECTIONS.durMin, max: SECTIONS.durMax, nom: 'la durée des titres de section' });
  return res;
}
