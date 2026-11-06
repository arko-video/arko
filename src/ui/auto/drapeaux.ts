// Drapeaux du Montage auto : un bouton n'apparaît que si sa fonction est PRÊTE (constante PRETE de son composant
// d'entrée, passée à true par le dev quand elle marche) ou si on l'a FORCÉ pour l'essayer :
//  - localStorage `arko.auto` = "tout" ou une liste « blancs,musique » ;
//  - ou ?auto=tout (ou ?auto=blancs,musique) dans l'adresse.
// Forcé mais pas prêt : le bouton affiche « Bientôt ». Fichier GELÉ (intégrateur).

export type DrapeauAuto = 'blancs' | 'rognage' | 'punchlines' | 'zoomsAuto' | 'sections' | 'bruitages' | 'musique' | 'volumeFinal' | 'express';

export const DRAPEAUX_AUTO: readonly DrapeauAuto[] = ['blancs', 'rognage', 'punchlines', 'zoomsAuto', 'sections', 'bruitages', 'musique', 'volumeFinal', 'express'];
export const CLE_DRAPEAUX = 'arko.auto';

/** Lit « tout » ou « blancs, musique » (pure). Texte vide ou absent : aucun drapeau forcé. */
export function lireDrapeaux(texte: string | null | undefined): ReadonlySet<DrapeauAuto> {
  const mots = (texte ?? '').split(/[\s,;]+/).map((m) => m.trim()).filter(Boolean);
  if (mots.includes('tout')) return new Set(DRAPEAUX_AUTO);
  return new Set(DRAPEAUX_AUTO.filter((d) => mots.includes(d)));
}

let forces: ReadonlySet<DrapeauAuto> | null = null;

/** Drapeaux forcés sur cet appareil (lus une fois ; jamais d'erreur si le stockage est bloqué). */
export function drapeauxForces(): ReadonlySet<DrapeauAuto> {
  if (forces) return forces;
  let texte = '';
  try {
    texte += ` ${localStorage.getItem(CLE_DRAPEAUX) ?? ''}`;
  } catch {
    /* stockage bloqué */
  }
  try {
    texte += ` ${new URLSearchParams(location.search).get('auto') ?? ''}`;
  } catch {
    /* pas de page (tests) */
  }
  forces = lireDrapeaux(texte);
  return forces;
}

/** Le bouton du drapeau `d` s'affiche-t-il ? */
export function visible(d: DrapeauAuto, prete: boolean): boolean {
  return prete || drapeauxForces().has(d);
}
