// « Qui parle ? » (dev 1) : le résultat d'une analyse est gardé sur l'appareil par empreinte de la vidéo
// (idb-keyval, clé `arko.voix.<emp>`) pour ne pas réanalyser. On garde les voix trouvées et le NIVEAU de chaque piste
// (la bouche des avatars en a besoin), pas le timbre (8 fois plus gros, inutile après l'analyse).

import { del, get, set } from 'idb-keyval';
import type { PlageTemps } from '../../../auto/types';
import type { VoixDetectees } from '../../../auto/types-v3';
import type { EmpreintesNommees } from '../../../auto/voix/mesures-voix';

const VERSION = 1;

interface Gardee {
  v: number;
  pistes: number[];
  plage: PlageTemps;
  detectees: VoixDetectees;
  enveloppes: { pas: number; duree: number; db: Float32Array; piste?: number; nom?: string }[];
}

const cle = (emp: string) => `arko.voix.${emp}`;

/** L'analyse gardée, si elle a été faite avec les mêmes pistes et couvre la plage voulue. */
export async function relireVoix(emp: string, pistes: readonly number[], plage: PlageTemps): Promise<{ detectees: VoixDetectees; empreintes: EmpreintesNommees[] } | null> {
  try {
    const g = await get<Gardee>(cle(emp));
    if (!g || g.v !== VERSION || g.pistes.join(',') !== pistes.join(',') || g.plage.de > plage.de + 0.01 || g.plage.a < plage.a - 0.01) return null;
    return { detectees: g.detectees, empreintes: g.enveloppes.map((e) => ({ ...e, bandes: new Float32Array(0) })) };
  } catch {
    return null;
  }
}

export async function garderVoix(emp: string, pistes: readonly number[], plage: PlageTemps, detectees: VoixDetectees, empreintes: readonly EmpreintesNommees[]): Promise<void> {
  const g: Gardee = {
    v: VERSION,
    pistes: [...pistes],
    plage,
    detectees,
    enveloppes: empreintes.map((e) => ({ pas: e.pas, duree: e.duree, db: e.db, ...(e.piste !== undefined ? { piste: e.piste } : {}), ...(e.nom ? { nom: e.nom } : {}) })),
  };
  try {
    await set(cle(emp), g);
  } catch {
    // Stockage plein ou bloqué : on réanalysera la prochaine fois.
  }
}

export async function oublierVoix(emp: string): Promise<void> {
  try {
    await del(cle(emp));
  } catch {
    /* rien */
  }
}
