// Branchement de « Arko regarde l'image » dans les analyses (Montage express et Best-of) : AVANT de lire les signaux
// du son, si l'interface a branché un regard (ui/auto/express/regard-ui.ts : interrupteur coché + modèle sur
// l'appareil), on regarde la vidéo et les zones mortes (menus, chargements, bureau) rejoignent les passages muets :
// coupes, scènes, accroche et dossier du monteur IA les sautent tous. Jamais bloquant : une erreur = on continue sans.
// Sans branchement (tests, banc) : rien ne se passe.

import type { SourceOuverte } from '../../moteur/api';
import { appliquerRegard } from '../signaux-source';
import type { OptionsTache, PlageMuette } from '../types';

export type Regard = (source: SourceOuverte, o: OptionsTache) => Promise<PlageMuette[] | null>;

let regard: Regard | null = null;

/** Branche (ou débranche avec null) le regard du navigateur. */
export function definirRegard(r: Regard | null): void {
  regard = r;
}

/** Regarde la vidéo si c'est possible et retient les zones mortes. Rend les zones (vide si rien). Ne lève pas, sauf annulation. */
export async function preparerRegard(source: SourceOuverte, o: OptionsTache = {}): Promise<PlageMuette[]> {
  if (!regard) return [];
  try {
    const zones = await regard(source, o);
    if (!zones) return [];
    appliquerRegard(source, zones);
    return zones;
  } catch (e) {
    if (o.signal?.aborted) throw e;
    console.warn('[Arko] regard sur l\'image impossible', e);
    return [];
  }
}
