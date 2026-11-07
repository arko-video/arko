// Drapeaux du Montage auto : un bouton n'apparaît que si sa fonction est PRÊTE (constante PRETE de son composant
// d'entrée, passée à true par le dev quand elle marche) ou si on l'a FORCÉ pour l'essayer :
//  - localStorage `arko.auto` = "tout" ou une liste « blancs,musique » ;
//  - ou ?auto=tout (ou ?auto=blancs,musique) dans l'adresse.
// Forcé mais pas prêt : le bouton affiche « Bientôt ». Fichier GELÉ (intégrateur).
// v3 « Best-of » : ses drapeaux ont leur propre liste (DRAPEAUX_V3) ; « tout » les force aussi.

export type DrapeauAuto = 'blancs' | 'rognage' | 'punchlines' | 'zoomsAuto' | 'sections' | 'bruitages' | 'musique' | 'volumeFinal' | 'express';

export const DRAPEAUX_AUTO: readonly DrapeauAuto[] = ['blancs', 'rognage', 'punchlines', 'zoomsAuto', 'sections', 'bruitages', 'musique', 'volumeFinal', 'express'];
export const CLE_DRAPEAUX = 'arko.auto';

/** v3 « Best-of » (contrat : conception/contrat-wankil.md §1) : un drapeau par point d'entrée. */
export type DrapeauV3 = 'titres' | 'derush' | 'quiParle' | 'insertion' | 'pistes' | 'bips' | 'chibis' | 'avatars' | 'bestOf';
export const DRAPEAUX_V3: readonly DrapeauV3[] = ['titres', 'derush', 'quiParle', 'insertion', 'pistes', 'bips', 'chibis', 'avatars', 'bestOf'];

/** Comme lireDrapeaux, pour les drapeaux de la v3 (pure). */
export function lireDrapeauxV3(texte: string | null | undefined): ReadonlySet<DrapeauV3> {
  const mots = (texte ?? '').split(/[\s,;]+/).map((m) => m.trim()).filter(Boolean);
  if (mots.includes('tout')) return new Set(DRAPEAUX_V3);
  return new Set(DRAPEAUX_V3.filter((d) => mots.includes(d)));
}

/** Lit « tout » ou « blancs, musique » (pure). Texte vide ou absent : aucun drapeau forcé. */
export function lireDrapeaux(texte: string | null | undefined): ReadonlySet<DrapeauAuto> {
  const mots = (texte ?? '').split(/[\s,;]+/).map((m) => m.trim()).filter(Boolean);
  if (mots.includes('tout')) return new Set(DRAPEAUX_AUTO);
  return new Set(DRAPEAUX_AUTO.filter((d) => mots.includes(d)));
}

let forces: ReadonlySet<DrapeauAuto> | null = null;
let forcesV3: ReadonlySet<DrapeauV3> | null = null;

/** Texte des drapeaux forcés (localStorage puis adresse). */
function texteForce(): string {
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
  return texte;
}

/** Drapeaux forcés sur cet appareil (lus une fois ; jamais d'erreur si le stockage est bloqué). */
export function drapeauxForces(): ReadonlySet<DrapeauAuto> {
  forces ??= lireDrapeaux(texteForce());
  return forces;
}

/** Drapeaux v3 forcés sur cet appareil. */
export function drapeauxForcesV3(): ReadonlySet<DrapeauV3> {
  forcesV3 ??= lireDrapeauxV3(texteForce());
  return forcesV3;
}

/** Le bouton du drapeau `d` s'affiche-t-il ? */
export function visible(d: DrapeauAuto | DrapeauV3, prete: boolean): boolean {
  return prete || (drapeauxForces() as ReadonlySet<string>).has(d) || (drapeauxForcesV3() as ReadonlySet<string>).has(d);
}
