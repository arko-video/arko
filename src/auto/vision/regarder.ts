// Branchement de « Arko regarde l'image » dans les analyses (Montage express et Best-of) : AVANT de lire les signaux
// du son, si l'interface a branché un regard (ui/auto/express/regard-ui.ts : interrupteur coché + modèle sur
// l'appareil), on regarde la vidéo et les zones mortes (menus, chargements, bureau) rejoignent les passages muets :
// coupes, scènes, accroche et dossier du monteur IA les sautent tous. Jamais bloquant : une erreur = on continue sans.
// Sans branchement (tests, banc) : rien ne se passe.

import type { SourceOuverte } from '../../moteur/api';
import { appliquerRegard } from '../signaux-source';
import { REGARD } from './regard';
import type { OptionsTache, PlageMuette } from '../types';

export type Regard = (source: SourceOuverte, o: OptionsTache) => Promise<PlageMuette[] | null>;

let regard: Regard | null = null;

/** Branche (ou débranche avec null) le regard du navigateur. */
export function definirRegard(r: Regard | null): void {
  regard = r;
}

export interface ResultatRegard {
  zones: PlageMuette[];
  /** Part de la vidéo vue comme menus / chargements / bureau (0 à 1). */
  part: number;
  /** Trop de vidéo coupée : le regard n'est pas fiable ici, rien n'est appliqué. */
  ignore: boolean;
}

/** Part de `duree` couverte par les zones (pure). */
export function partCouverte(zones: readonly PlageMuette[], duree: number): number {
  return duree > 0 ? Math.min(1, zones.reduce((t, z) => t + Math.max(0, z.a - z.de), 0) / duree) : 0;
}

/**
 * Regarde la vidéo si c'est possible et retient les zones mortes. Garde-fou : si elles couvrent plus de 35 % de la
 * vidéo (REGARD.partMax), le regard s'est trompé sur cette vidéo → rien n'est appliqué (et c'est dit). Ne lève pas,
 * sauf annulation.
 */
export async function preparerRegard(source: SourceOuverte, o: OptionsTache = {}): Promise<ResultatRegard> {
  const rien: ResultatRegard = { zones: [], part: 0, ignore: false };
  if (!regard) return rien;
  try {
    const zones = await regard(source, o);
    if (!zones) return rien;
    const part = partCouverte(zones, source.infos.duree);
    if (part > REGARD.partMax) {
      console.warn(`[Arko] regard sur l'image : ${Math.round(part * 100)} % vu comme menus, pas fiable → ignoré`);
      appliquerRegard(source, []);
      return { zones: [], part, ignore: true };
    }
    appliquerRegard(source, zones);
    return { zones, part, ignore: false };
  } catch (e) {
    if (o.signal?.aborted) throw e;
    console.warn('[Arko] regard sur l\'image impossible', e);
    return rien;
  }
}

/** Message pour l'écran d'analyse (null : rien à dire). */
export function messageRegard(r: ResultatRegard): string | null {
  const pc = Math.round(r.part * 100);
  if (r.ignore) return `Regard sur l'image : ${pc} % de ta vidéo ressemblait à des menus, ce n'est pas normal. Je n'ai rien coupé à l'image.`;
  if (r.zones.length === 0) return null;
  const min = Math.round(r.zones.reduce((t, z) => t + z.a - z.de, 0) / 6) / 10;
  return `Menus, chargements et bureau retirés : ${r.zones.length} passage${r.zones.length > 1 ? 's' : ''} (${String(min).replace('.', ',')} min).`;
}
