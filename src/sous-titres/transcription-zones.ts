// Whisper sur la PAROLE seulement (dev-mots), NAVIGATEUR : comme transcrireLongue (tranches de 5 min, reprise
// IndexedDB, progression « 12 min sur 120 »), mais chaque tranche ne donne à Whisper que ses passages de parole ; une
// tranche sans parole est marquée faite sans lancer Whisper (plus d'inventions dans le silence ni dans le jeu).
//
// MESURÉ sur la vraie session (1200–1800 s, onnxruntime-web, 7/11) : coller les zones « segments + 0,3 s, trous
// < 1 s » dans les fenêtres de 28 s fait PERDRE des mots (Whisper invente plus de boucles quand le son est haché) :
// tours de Romain avec un mot (milieu dans le tour) 15/23 → 6/23 (8/23 avec le gain), mots de Romain retrouvés
// 49 % → 27 %. Donc, comme le prévoit le contrat, les zones sont ÉLARGIES : seuls les trous de 30 s et plus sans
// parole sont sautés (le son reste d'un tenant entre deux). Sur 2 h : 5609 s écoutées sur 11 976 (≈ 2,1 fois moins
// de Whisper), 14 tranches sur 40 sans Whisper du tout.
// Le gain (chaque passage remonté vers −20 dBFS avant Whisper, pcm.ts → normaliserPieces) existe mais n'est PAS mis
// d'office : il a aidé un peu avec les zones hachées (27 % contre 23 % des mots de Romain), il n'est pas mesuré sur
// des passages d'un tenant. `gain: true` pour l'essayer.
// Une transcription déjà gardée (même faite par transcrireLongue) reste valable : ses tranches ne sont pas refaites.

import type { PlageTemps, Transcription } from '../auto/types';
import type { SourceOuverte } from '../moteur/api';
import { fusionner } from './fenetres';
import { transcrireLongue, transcrireParTranches, type OptionsTranscriptionLongue } from './transcription-longue';

/**
 * Deux zones séparées de moins de `trou` s sont écoutées d'un tenant, trou compris (le contexte aide Whisper ; des
 * zones hachées lui font perdre des mots, mesuré). Les zones de besoinsChaine sont déjà collées sous 1 s.
 */
export const ZONES_TRANSCRIPTION = { trou: 30 } as const;

export interface OptionsTranscriptionZones extends OptionsTranscriptionLongue {
  /** Zones de parole (temps source, triées) ; absent ou vide = toute la plage, comme transcrireLongue. */
  zones?: readonly PlageTemps[];
  /** Remonter la voix de chaque passage avant Whisper (défaut : non, voir l'en-tête). */
  gain?: boolean;
}

/** Les zones (fusionnées sous `trou` s) qui tombent dans la tranche, coupées à ses bords. Pure. */
export function zonesDeLaTranche(zones: readonly PlageTemps[], tranche: PlageTemps): PlageTemps[] {
  return zones
    .map((z) => ({ de: Math.max(z.de, tranche.de), a: Math.min(z.a, tranche.a) }))
    .filter((z) => z.a - z.de > 0.05);
}

/** Zones triées, fusionnées sous `trou` s. Pure. */
export function preparerZones(zones: readonly PlageTemps[], trou: number = ZONES_TRANSCRIPTION.trou): PlageTemps[] {
  const triees = fusionner(zones.filter((z) => z.a > z.de).map((z) => ({ de: z.de, a: z.a })));
  const res: PlageTemps[] = [];
  for (const z of triees) {
    const der = res[res.length - 1];
    if (der && z.de - der.a < trou) der.a = Math.max(der.a, z.a);
    else res.push({ ...z });
  }
  return res;
}

/**
 * Best-of : tolérant d'office (`tolerant`, une tranche ratée reste « à refaire » et `complete` vaut false) ; une
 * tranche sans parole est faite sans être écoutée (les autres outils la retranscriront s'ils en ont besoin).
 */
export async function transcrireZones(source: SourceOuverte, o: OptionsTranscriptionZones = {}): Promise<Transcription> {
  const { zones, gain = false, ...reste } = o;
  const options = { ...reste, tolerant: reste.tolerant ?? true };
  if (!zones || zones.length === 0) return transcrireLongue(source, options);
  const pretes = preparerZones(zones);
  return transcrireParTranches(source, options, { plagesDe: (t) => zonesDeLaTranche(pretes, t), gain, toute: false });
}
