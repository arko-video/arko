// Côté page : lance l'analyse d'une longue source dans un Worker, relaie la progression, garde l'écran
// allumé (Wake Lock), puis transcrit les candidats si on le demande. Annuler = arrêter net le Worker.

import type { SourceOuverte } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import type { Sec } from '../recette/types';
import { transcrireRecette } from '../sous-titres/client';
import type { DemandeAnalyse, DepuisWorkerAnalyse, StatsAnalyse } from './messages-analyse';
import { formaterMoments, type Moment } from './moments';
import { rangerMots, recetteATranscrire } from './mots-moments';

export interface OptionsAnalyseSource {
  /** Transcrire ±6 s autour de chaque candidat avec le module sous-titres (défaut : non, « analyse rapide »). */
  transcrire?: boolean;
  /** Langue de la transcription (défaut "fr"). */
  langue?: string;
  /** Nombre de candidats (défaut 40). */
  max?: number;
  /** false = repartir de zéro au lieu de reprendre le dernier point (défaut : reprendre). */
  reprendre?: boolean;
  /** p de 0 à 1, message en français. */
  surProgression?: (p: number, message: string) => void;
  signal?: AbortSignal;
  /** Garder l'écran allumé (Wake Lock) pendant l'analyse (défaut : oui). false si l'interface le fait déjà. */
  ecranAllume?: boolean;
}

export interface ResultatAnalyse {
  /** Les moments, triés par début (ids m01, m02…), avec pic, raison, et mots si transcrits. */
  moments: Moment[];
  /** Résumé ARKO-MOMENTS/1, prêt à envoyer au monteur IA. */
  resume: string;
  stats: StatsAnalyse & { transcrit: boolean };
  /** Messages pour l'utilisateur (ex. : la transcription n'a pas pu se faire). */
  avertissements: string[];
}

function erreurAnnule() {
  return new ErreurArko('Analyse annulée.', 'annule');
}

/** Lance un Worker neuf pour l'analyse et attend sa réponse. */
function lancerWorker(
  demande: DemandeAnalyse,
  signal: AbortSignal | undefined,
  surProgression: (p: number, message: string) => void,
): Promise<{ moments: Moment[]; stats: StatsAnalyse }> {
  if (signal?.aborted) return Promise.reject(erreurAnnule());
  return new Promise((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-analyse.ts', import.meta.url), { type: 'module', name: 'arko-analyse' });
    } catch {
      rejeter(new ErreurArko('Impossible de lancer l\'analyse dans ce navigateur. Mets Chrome à jour.', 'analyse'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', annuler);
    };
    const annuler = () => {
      if (termine) return;
      finir();
      rejeter(erreurAnnule());
    };
    signal?.addEventListener('abort', annuler);
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (termine) return;
      finir();
      rejeter(new ErreurArko('L\'analyse a planté. Réessaie : elle reprendra où elle en était.', 'analyse'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorkerAnalyse>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') surProgression(m.p, m.message);
      else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre({ moments: m.moments, stats: m.stats });
      }
    };
    worker.postMessage(demande);
  });
}

/**
 * Analyse un fichier dans le Worker, sans transcription (bas niveau : préférer analyserSource).
 * `empreinte` = Source.emp, sert de clé au point de reprise.
 */
export function analyserFichier(
  fichier: Blob,
  empreinte: string,
  options: Pick<OptionsAnalyseSource, 'max' | 'reprendre' | 'signal' | 'surProgression'> = {},
): Promise<{ moments: Moment[]; stats: StatsAnalyse }> {
  const demande: DemandeAnalyse = {
    type: 'analyser',
    fichier,
    empreinte,
    reprendre: options.reprendre ?? true,
    candidats: { max: options.max ?? 40 },
  };
  return lancerWorker(demande, options.signal, (p, m) => options.surProgression?.(p, m));
}

/** Garde l'écran allumé pendant l'analyse (si le navigateur le permet). Renvoie la fonction pour relâcher. */
async function garderEcranAllume(): Promise<() => void> {
  try {
    if (!('wakeLock' in navigator)) return () => {};
    const verrou = await navigator.wakeLock.request('screen');
    return () => {
      verrou.release().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/**
 * Analyse une longue source (1 h 30 à 5 h) pour trouver ses meilleurs moments.
 * Lève ErreurArko (codes "annule", "analyse", et ceux de l'ouverture : "format", "codec_video", "lecture").
 */
export async function analyserSource(source: SourceOuverte, options: OptionsAnalyseSource = {}): Promise<ResultatAnalyse> {
  const { signal, transcrire = false } = options;
  const langue = options.langue ?? 'fr';
  const part = transcrire ? 0.6 : 1;
  let dernier = 0;
  // La progression ne recule jamais (la transcription a sa propre échelle).
  const progresser = (p: number, message: string) => {
    dernier = Math.max(dernier, Math.min(1, p));
    options.surProgression?.(dernier, message);
  };
  const relacher = options.ecranAllume === false ? () => {} : await garderEcranAllume();
  try {
    const res = await analyserFichier(source.fichier, source.infos.emp, {
      max: options.max,
      reprendre: options.reprendre,
      signal,
      surProgression: (p, m) => progresser(p * part, m),
    });
    let moments = res.moments;
    const avertissements: string[] = [];
    let transcrit = false;
    if (transcrire && moments.length > 0) {
      try {
        const recette = recetteATranscrire(moments, source.infos);
        const mots = await transcrireRecette(recette, [source], {
          langue,
          signal,
          surProgression: (p, etape) => progresser(part + (1 - part) * p, etape),
        });
        moments = rangerMots(moments, mots, source.infos.duree);
        transcrit = true;
      } catch (e) {
        if (e instanceof ErreurArko && e.code === 'annule') throw e;
        if (signal?.aborted) throw erreurAnnule();
        const detail = e instanceof ErreurArko ? ` (${e.message})` : '';
        avertissements.push(`Je n'ai pas pu transcrire les paroles${detail}. Les moments sont là quand même.`);
      }
    }
    progresser(1, 'C\'est prêt !');
    const resume = formaterMoments({ src: source.infos.id, duree: source.infos.duree as Sec, langue }, moments);
    return { moments, resume, stats: { ...res.stats, transcrit }, avertissements };
  } finally {
    relacher();
  }
}
