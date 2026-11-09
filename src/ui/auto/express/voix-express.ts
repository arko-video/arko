// Montage express (style « Montage express ») : « Persos de qui parle », la même écoute des voix que le Best-of
// (auto/voix/voix-montage.ts), après l'analyse ; les noms et persos choisis sur la revue (etat-best-of.ts).

import type { AnalyseExpress, ReglagesExpress, RessourcesExpress } from '../../../auto/express/express';
import type { OptionsTache } from '../../../auto/types';
import { ecouterVoix } from '../../../auto/voix/voix-montage';
import type { SourceOuverte } from '../../../moteur/api';
import { chibisVoix, nomsVoix } from './etat-best-of';

/** Part de la barre d'avancement prise par l'analyse quand on écoute les voix ensuite. */
const PART_ANALYSE = 0.85;

/** Options de l'analyse : sa progression va de 0 à 85 % si les voix sont écoutées ensuite. */
export function voixApres(o: OptionsTache, reg: ReglagesExpress): OptionsTache {
  if (reg.persos === false) return o;
  return { ...o, surProgression: (p, m) => o.surProgression?.(p * PART_ANALYSE, m) };
}

/** L'analyse, avec les voix écoutées (null si aucune ; un message si l'écoute a échoué). */
export async function avecVoix(source: SourceOuverte, a: AnalyseExpress, o: OptionsTache & { pistes?: readonly number[] }): Promise<AnalyseExpress> {
  const e = await ecouterVoix(source, {
    signal: o.signal,
    surProgression: (p, m) => o.surProgression?.(PART_ANALYSE + p * (0.99 - PART_ANALYSE), m),
    mots: a.transcription.mots,
    ...(o.pistes && o.pistes.length > 0 ? { pistes: o.pistes } : {}),
  });
  return { ...a, voix: e.voix, empreintes: [...e.empreintes], avertissements: e.avertissement ? [...a.avertissements, e.avertissement] : a.avertissements };
}

/** Noms et persos choisis sur la revue (cartes « Qui parle ? »). */
export function choixVoix(): Pick<RessourcesExpress, 'noms' | 'chibis'> {
  return { noms: nomsVoix.peek(), chibis: chibisVoix.peek() };
}

/**
 * Revue du Montage express : « Deux personnes parlent » quand une seule voix a été trouvée. Réécoute le mélange en
 * forçant 2 voix (niveau à 3 dB, ou timbre même peu net), pour pouvoir donner un perso différent à chacun.
 * Renvoie null si rien n'a changé (toujours une seule voix).
 */
export async function forcerDeuxVoix(source: SourceOuverte, a: AnalyseExpress, o: OptionsTache = {}): Promise<AnalyseExpress | null> {
  const e = await ecouterVoix(source, { ...o, mots: a.transcription.mots, deux: true });
  if (!e.voix || e.voix.voix.length < 2) return null;
  return { ...a, voix: e.voix, empreintes: [...e.empreintes] };
}
