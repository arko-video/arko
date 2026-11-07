// État du mode « Best-of serré » du Montage express (intégrateur) : le style choisi, ses réglages, et ce qu'on règle
// sur la revue (noms des voix, chibis, « Sous-titres pour : »). L'analyse et le montage passent par etat-express.ts.

import { signal } from '@preact/signals';
import { BEST_OF_DEFAUT, voixMalEntendue, type AnalyseBestOf, type ReglagesBestOf, type RessourcesBestOf } from '../../../auto/express/best-of';
import type { DefinitionChibi } from '../../../recette/types';
import { visible } from '../drapeaux';

/** Le style « Best-of serré » est prêt : il s'affiche sans drapeau. */
export const PRETE_BEST_OF = true;

export type StyleMontage = 'express' | 'bestOf';

/** Le style choisi la dernière fois est retenu sur l'appareil : la prochaine ouverture est en 2 touchers. */
const CLE_STYLE = 'arko.express.style';

function styleRetenu(): StyleMontage {
  try {
    return globalThis.localStorage?.getItem(CLE_STYLE) === 'bestOf' ? 'bestOf' : 'express';
  } catch {
    return 'express';
  }
}

export function retenirStyle(st: StyleMontage) {
  try {
    globalThis.localStorage?.setItem(CLE_STYLE, st);
  } catch {
    // Pas de stockage (navigation privée) : le choix vaut pour cette session.
  }
}

export const styleMontage = signal<StyleMontage>(styleRetenu());
export const reglagesBestOf = signal<ReglagesBestOf>({ ...BEST_OF_DEFAUT });
export const nomsVoix = signal<Record<string, string>>({});
export const chibisVoix = signal<Record<string, { def: DefinitionChibi; bib?: string }>>({});
/** Id de la voix sous-titrée ; null = personne. */
export const sousTitresPourVoix = signal<string | null>(null);

/** Le Best-of est-il choisi (et visible) ? */
export function enBestOf(): boolean {
  return styleMontage.peek() === 'bestOf' && visible('bestOf', PRETE_BEST_OF);
}

export function reglerBestOf(p: Partial<ReglagesBestOf>) {
  const r = { ...reglagesBestOf.peek(), ...p };
  // Les avatars demandent de reconnaître qui parle.
  if (p.avatars) r.quiParle = true;
  if (p.quiParle === false) r.avatars = false;
  reglagesBestOf.value = r;
}

/** Après l'analyse (les deux styles) : noms et persos remis à zéro, « Sous-titres pour : » = la voix qu'on entend mal. */
export function preparerVoix(a: Pick<AnalyseBestOf, 'voix'> | { voix?: AnalyseBestOf['voix'] }) {
  nomsVoix.value = {};
  chibisVoix.value = {};
  sousTitresPourVoix.value = voixMalEntendue(a.voix ?? null);
}

export function nommerVoix(p: string, nom: string) {
  nomsVoix.value = { ...nomsVoix.peek(), [p]: nom };
}

export function chibiVoix(p: string, def: DefinitionChibi, bib?: string) {
  chibisVoix.value = { ...chibisVoix.peek(), [p]: bib ? { def, bib } : { def } };
}

/** Ce que construireBestOf reçoit en plus des ressources du Montage express. */
export function ressourcesBestOf(base: Omit<RessourcesBestOf, 'noms' | 'chibis' | 'sousTitresPour'>): RessourcesBestOf {
  return { ...base, noms: nomsVoix.peek(), chibis: chibisVoix.peek(), sousTitresPour: sousTitresPourVoix.peek() };
}
