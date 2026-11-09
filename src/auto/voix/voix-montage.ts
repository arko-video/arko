// « Persos de qui parle » (7/11/2026), NAVIGATEUR : l'écoute des voix PARTAGÉE par tous les montages sans IA
// (Montage express, Best-of serré, clips du monteur sans IA). Pistes séparées si la vidéo en a, sinon niveau +
// timbre, sur les zones où il y a des mots (ou, sans mots, celles trouvées au son). Rien n'est envoyé.
// Une écoute impossible n'arrête pas le montage : il se fait sans persos, avec un message.

import { ErreurArko } from '../../moteur/erreurs';
import type { SourceOuverte } from '../../moteur/api';
import { estPasEncoreFait } from '../pas-encore-fait';
import type { OptionsTache, PlageTemps } from '../types';
import type { Mot } from '../../recette/types';
import { analyserQuiParle } from './mesures-voix';
import type { VoixEcoutees } from './persos-montage';

export const MESSAGE_SANS_VOIX = 'Je n\'ai pas pu reconnaître les voix : le montage se fera sans persos.';

export interface OptionsEcoute extends OptionsTache {
  /** Mots de la transcription (vrais mots ou zones de voix) : on n'écoute que là où quelqu'un parle. */
  mots?: readonly Mot[];
  /** Pistes gardées de la vidéo (pistes séparées : une voix par piste). */
  pistes?: readonly number[];
  /** N'écouter que ce passage de la source (clips). */
  plage?: PlageTemps;
  /** « Deux personnes parlent » (revue) : forcer 2 voix sur un mélange. */
  deux?: boolean;
}

/** Écoute les voix de la source. `avertissement` : message pour l'utilisateur si l'écoute a échoué. */
export async function ecouterVoix(source: SourceOuverte, o: OptionsEcoute = {}): Promise<VoixEcoutees & { avertissement?: string }> {
  const { signal, surProgression } = o;
  const zones = (o.mots ?? []).map((m) => ({ de: Math.max(0, m[1] - 0.05), a: m[2] + 0.05 }));
  try {
    const q = await analyserQuiParle(source, {
      signal,
      surProgression,
      ...(zones.length > 0 ? { zones } : {}),
      ...(o.pistes && o.pistes.length > 0 ? { pistes: o.pistes } : {}),
      ...(o.plage ? { plage: o.plage } : {}),
      ...(o.deux ? { deux: true } : {}),
    });
    return { voix: q.detectees.voix.length > 0 && q.detectees.tours.length > 0 ? q.detectees : null, empreintes: q.empreintes };
  } catch (e) {
    if (signal?.aborted || (e instanceof ErreurArko && e.code === 'annule')) throw e;
    if (!estPasEncoreFait(e)) console.warn('[Arko] Qui parle :', e);
    return { voix: null, empreintes: [], avertissement: MESSAGE_SANS_VOIX };
  }
}
