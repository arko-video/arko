// Intro et outro dans LE chemin de rendu : rendre() assemble [intro][montage][outro] en un seul Rendu.
// Un générique « modèle » est dessiné par couches/generique.ts (son muet) ; un générique « vidéo » est une
// mini-recette (un plan de la vidéo de l'utilisateur, fond flou) rendue par le même moteur que le montage.
// L'aperçu et l'export passent donc par les mêmes fonctions : ce qu'on voit est ce qu'on exporte.

import { recetteVide } from '../recette/defauts';
import { texteParDefaut, type Place } from '../recette/generiques';
import type { Recette, Sec } from '../recette/types';
import { FREQUENCE_SORTIE } from './audio/reechantillonner';
import type { Ctx2D, Env } from './canevas';
import { dessinerGenerique } from './couches/generique';
import type { MediaOuvert } from './media';
import { policesChargees, policesPretes } from './polices';
import type { Rendu } from './rendre';

/** Un morceau de la vidéo finale, avec son propre temps (0 = son début). */
export interface Segment {
  duree: Sec;
  image(t: Sec, ctx: Ctx2D, env: Env): Promise<void>;
  audio(t0: Sec, n: number, options?: { guide?: boolean }): Promise<Float32Array[]>;
  fermer(): Promise<void>;
}

type RendreMontage = (r: Recette, medias: ReadonlyMap<string, MediaOuvert>) => Rendu;

/** Recette d'un générique vidéo : un seul plan de la vidéo importée, en fond flou, même destination. */
export function recetteGeneriqueVideo(recette: Recette, place: Place): Recette | null {
  const g = recette[place];
  const source = g?.src ? recette.sources.find((s) => s.id === g.src) : undefined;
  if (!g || !source) return null;
  return {
    ...recetteVide(),
    ...(recette.destination ? { destination: recette.destination } : {}),
    sources: [{ ...source }],
    plans: [{ src: source.id, de: 0, a: g.dur }],
    mise: { type: 'flou', y: 0.5 },
  };
}

/** Segment d'intro ou d'outro de la recette (null s'il n'y en a pas). */
export function segmentGenerique(recette: Recette, place: Place, medias: ReadonlyMap<string, MediaOuvert>, rendreMontage: RendreMontage): Segment | null {
  const g = recette[place];
  if (!g || g.dur <= 0) return null;
  if (g.src) {
    const mini = recetteGeneriqueVideo(recette, place);
    return mini && medias.has(g.src) ? rendreMontage(mini, medias) : null;
  }
  if (!g.modele) return null;
  const texte = g.texte ?? texteParDefaut(place);
  return {
    duree: g.dur,
    async image(t, ctx, env) {
      if (!policesChargees()) await policesPretes();
      dessinerGenerique(ctx, g, env, Math.min(Math.max(0, t), g.dur), texte);
    },
    audio: async (_t0, n) => [new Float32Array(n), new Float32Array(n)],
    fermer: async () => undefined,
  };
}

/** Assemble intro + montage + outro en un seul Rendu (mêmes méthodes que celui du montage). */
export function assembler(corps: Rendu, intro: Segment | null, outro: Segment | null): Rendu {
  const morceaux: { debut: Sec; seg: Segment }[] = [];
  let t = 0;
  for (const seg of [intro, corps, outro]) {
    if (!seg) continue;
    morceaux.push({ debut: t, seg });
    t += seg.duree;
  }
  const duree = t;

  async function image(tt: Sec, ctx: Ctx2D, env: Env) {
    const x = Math.min(Math.max(tt, 0), duree);
    const m = morceaux.find((k) => x < k.debut + k.seg.duree) ?? morceaux[morceaux.length - 1]!;
    await m.seg.image(Math.min(x - m.debut, m.seg.duree), ctx, env);
  }

  async function audio(t0: Sec, n: number, options: { guide?: boolean } = {}) {
    const res = [new Float32Array(n), new Float32Array(n)];
    for (const { debut, seg } of morceaux) {
      const s0 = Math.max(0, Math.round((debut - t0) * FREQUENCE_SORTIE));
      const s1 = Math.min(n, Math.round((debut + seg.duree - t0) * FREQUENCE_SORTIE));
      if (s1 <= s0) continue;
      const bloc = await seg.audio(Math.max(0, t0 + s0 / FREQUENCE_SORTIE - debut), s1 - s0, options);
      res[0]!.set(bloc[0]!.subarray(0, s1 - s0), s0);
      res[1]!.set((bloc[1] ?? bloc[0]!).subarray(0, s1 - s0), s0);
    }
    return res;
  }

  async function fermer() {
    await Promise.all(morceaux.map((m) => m.seg.fermer()));
  }

  return { duree, scenario: corps.scenario, image, audio, effetsPrets: corps.effetsPrets, debutCorps: intro?.duree ?? 0, fermer };
}
