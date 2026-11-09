// Transitions automatiques du Montage express VERTICAL (TikTok) : une transition à chaque CHANGEMENT DE SCÈNE (jamais
// dans les jump cuts d'une même scène, qui restent des coupes franches). Le type suit ce qui se passe à l'entrée de
// la scène : un cri, un rire ou un pic juste au début → « secousse » ; sinon on alterne glissé, zoom et flash pour
// que ça ne se répète pas. Son assorti seulement si les bruitages sont demandés. Pure ; modifiable ensuite plan par
// plan (choisirTransition), un seul Annuler avec le reste du montage.

import { choisirTransition } from '../../recette/operations-effets';
import type { Recette, Sec } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';

export const TRANSITIONS_AUTO = { dur: 0.3, debut: 1.5, cycle: ['glisse', 'zoom', 'flash'] as const } as const;

/** Indice de la scène qui contient le temps source `t` (-1 : aucune). */
function sceneDe(scenes: readonly PlageTemps[], t: Sec): number {
  return scenes.findIndex((s) => t >= s.de - 0.05 && t < s.a + 0.05);
}

function fortAuDebut(s: SignauxSource | null, de: Sec): boolean {
  if (!s) return false;
  const dans = (t: number) => t >= de && t <= de + TRANSITIONS_AUTO.debut;
  return s.cris.some((x) => dans(x.t)) || s.rires.some((x) => dans(x.t)) || s.pics.some((x) => dans(x.ts));
}

export function transitionsDesScenes(r: Recette, scenes: readonly PlageTemps[], signaux: SignauxSource | null, o: { son?: boolean } = {}): Recette {
  if (scenes.length < 2) return r;
  let res = r;
  let precedente = -2;
  let n = 0;
  r.plans.forEach((p, i) => {
    if ((p as { ins?: unknown }).ins) return;
    const k = sceneDe(scenes, p.de);
    if (k < 0) return;
    if (i > 0 && precedente !== -2 && k !== precedente && !p.trans) {
      const type = fortAuDebut(signaux, p.de) ? 'secousse' : TRANSITIONS_AUTO.cycle[n++ % TRANSITIONS_AUTO.cycle.length]!;
      res = choisirTransition(res, i, { type, dur: TRANSITIONS_AUTO.dur, ...(o.son ? {} : { son: false as const }) });
    }
    precedente = k;
  });
  return res;
}
