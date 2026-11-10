// H. Analyse du « Montage express » (INTÉGRATEUR, navigateur) : signaux du son (dev 1, réutilise l'analyse du
// monteur IA et sa reprise), transcription longue par tranches de 5 min avec reprise (dev 1) ou, sans Whisper, voix
// détectée au son ; bords de l'écran (dev 1) ; puis scènes notées (scenes.ts). Tout reste sur l'appareil.

import { imagesReparties, mesurerVoix } from '../coupes/mesures';
import { cadreRognage, detecterBords } from '../coupes/rognage-detection';
import { zonesDeVoix } from '../coupes/voix';
import { lireSignauxSource } from '../signaux-source';
import { preparerRegard } from '../vision/regarder';
import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import { MEILLEUR } from '../../recette/modeles';
import type { Mot, Rognage, Sec } from '../../recette/types';
import { transcrireLongue } from '../../sous-titres/transcription-longue';
import { TA } from '../../textes-auto';
import type { OptionsTache, SignauxSource, Transcription } from '../types';
import type { AnalyseExpress, ReglagesExpress } from './express';
import { choisirScenes, decouperScenes } from './scenes';

/** Durée visée des scènes (après coupe) : le milieu de la fourchette, moins l'accroche. */
export function dureeVisee(r: ReglagesExpress): Sec {
  return Math.max(10, (r.dureeVisee.min + r.dureeVisee.max) / 2 - (r.accroche ? MEILLEUR.dureeExpress : 0));
}

/** « 25 min », « 3 min 10 ». */
function enMinutes(s: Sec): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m === 0 ? `${r}${' '}s` : r === 0 || m >= 10 ? `${m}${' '}min` : `${m}${' '}min${' '}${r}`;
}

/** Messages sur les longs passages sans son (fin d'enregistrement AFK) : jamais proposés. */
export function avertissementsMuets(s: SignauxSource): string[] {
  return s.muets.filter((m) => !m.vu).map((m) =>
    m.sonIsole ? TA.express.afkIsole(enMinutes(m.a - m.de - m.sonIsole), enMinutes(m.sonIsole)) : s.duree - m.a < 5 ? TA.express.afk(enMinutes(m.a - m.de)) : TA.express.afkMilieu(enMinutes(m.a - m.de)),
  );
}

/** Zones de voix (sans texte) vues comme des « mots » vides : les règles des scènes et des coupes marchent pareil. */
export function motsDeVoix(zones: readonly { de: Sec; a: Sec }[]): Mot[] {
  return zones.map((z) => ['', Math.round(z.de * 100) / 100, Math.round(z.a * 100) / 100]);
}

async function bordsDe(source: SourceOuverte): Promise<Omit<Rognage, 'src'> | null> {
  const L = source.infos.l ?? 0;
  const H = source.infos.h ?? 0;
  if (!L || !H) return null;
  try {
    const images = await imagesReparties(source, 20, 640);
    return cadreRognage(detecterBords(images, L, H), L, H, L / H);
  } catch (e) {
    console.warn('[Arko] bords de l\'écran non trouvés', e);
    return null;
  }
}

/** Lance l'analyse (transcription longue + signaux + scènes). Reprend si on ferme l'appli. */
export async function analyserPourExpress(source: SourceOuverte, reglages: ReglagesExpress, options: OptionsTache = {}): Promise<AnalyseExpress> {
  const { signal, surProgression } = options;
  const p = (de: number, a: number) => (x: number, m: string) => surProgression?.(de + (a - de) * x, m);
  await preparerRegard(source, { signal, surProgression: (x, m) => p(0, 0.05)(x, m ?? TA.express.ecoute) });
  const signaux = await lireSignauxSource(source, { signal, surProgression: (x) => p(0.05, 0.2)(x, TA.express.ecoute) });
  if (signal?.aborted) throw new ErreurArko('Analyse annulée.', 'annule');
  const toute = { de: 0, a: source.infos.duree };
  let transcription: Transcription | null = null;
  let parole: AnalyseExpress['parole'] = 'mots';
  if (reglages.transcrire) {
    transcription = await transcrireLongue(source, { signal, surProgression: p(0.2, 0.92), plage: toute });
    if (!transcription.mots.some((m) => m[0].trim())) transcription = null;
  }
  if (!transcription) {
    parole = 'voix';
    const voix = await mesurerVoix(source, { signal, surProgression: p(0.2, 0.92) });
    transcription = { src: source.infos.id, mots: motsDeVoix(zonesDeVoix(voix)), plages: [toute], complete: true };
  }
  surProgression?.(0.93, TA.express.chercheBords);
  const cadreBords = reglages.bords ? await bordsDe(source) : null;
  surProgression?.(0.98, TA.express.scenes);
  const scenes = choisirScenes(decouperScenes(transcription.mots, signaux), transcription.mots, signaux, dureeVisee(reglages));
  const avertissements = avertissementsMuets(signaux);
  if (parole === 'voix') avertissements.push(TA.express.sansMots);
  surProgression?.(1, TA.express.scenes);
  return { transcription, parole, signaux, scenes, cadreBords, avertissements };
}
