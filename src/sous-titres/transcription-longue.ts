// Transcription d'une LONGUE source (dev 1 ; sert à A, B, E et au Montage express) : Whisper sur l'appareil,
// par tranches de 5 minutes, avec progression (« 12 min sur 120 »), une plage au choix (« de 0:20:00 à
// 1:10:00 ») et une REPRISE si on ferme l'appli (mots déjà transcrits gardés dans IndexedDB, clé
// `arko.transcription.<empreinte>`). Réutilise le pilote et le Worker Whisper : rien n'est envoyé.
// Chaque tranche lance un Worker neuf (le modèle se recharge depuis le cache en quelques secondes) : annuler
// arrête net le Worker en cours, et ce qui était fini reste gardé.

import { del, get, set } from 'idb-keyval';
import {
  ajouterTranche,
  dureePlages,
  enTranches,
  gardeeUtilisable,
  motsCouverts,
  motsDansPlage,
  plagesDans,
  plagesManquantes,
  transcriptionVide,
  type TranscriptionGardee,
} from '../auto/coupes/tranches';
import type { OptionsTache, PlageTemps, Transcription } from '../auto/types';
import type { SourceOuverte } from '../moteur/api';
import type { Mot } from '../recette/types';
import { ErreurArko } from '../moteur/erreurs';
import { TA } from '../textes-auto';
import { telechargerModuleSousTitres } from './client';
import { appliquerCorrections } from './corrections';
import { nettoyer } from './nettoyage';
import { executer } from './pilote';

export interface OptionsTranscriptionLongue extends OptionsTache {
  /** Partie à transcrire (défaut : toute la source). */
  plage?: PlageTemps;
  /** Langue (défaut "fr"). */
  langue?: string;
  /** false = oublier ce qui était déjà transcrit et repartir de zéro (défaut : reprendre). */
  reprendre?: boolean;
}

function cle(source: SourceOuverte): string {
  return `arko.transcription.${source.infos.emp}`;
}

async function lire(source: SourceOuverte, langue: string): Promise<TranscriptionGardee | null> {
  try {
    const g: unknown = await get(cle(source));
    return gardeeUtilisable(g, source.infos.duree, langue) ? g : null;
  } catch {
    return null;
  }
}

async function ecrire(source: SourceOuverte, g: TranscriptionGardee): Promise<void> {
  try {
    await set(cle(source), g);
  } catch {
    // Plus de place ou stockage bloqué : la transcription marche quand même, sans reprise.
  }
}

/** « 12 min », ou « 45 s » pour moins d'une minute. */
function enMinutes(s: number): string {
  return s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min`;
}

async function garderEcranAllume(): Promise<() => void> {
  try {
    if (!('wakeLock' in navigator)) return () => {};
    const verrou = await navigator.wakeLock.request('screen');
    return () => void verrou.release().catch(() => {});
  } catch {
    return () => {};
  }
}

/** Transcrit la source (ou la plage), en reprenant ce qui était déjà fait. Lève ErreurArko 'annule' si on annule. */
export async function transcrireLongue(source: SourceOuverte, options: OptionsTranscriptionLongue = {}): Promise<Transcription> {
  const { signal, surProgression } = options;
  const langue = options.langue ?? 'fr';
  const duree = source.infos.duree;
  const voulue = { de: Math.max(0, options.plage?.de ?? 0), a: Math.min(duree, options.plage?.a ?? duree) };
  if (voulue.a - voulue.de < 0.1) throw new ErreurArko('La partie choisie est vide.', 'plage');
  if (options.reprendre === false) await oublierTranscription(source);
  let g = (await lire(source, langue)) ?? transcriptionVide(duree, langue);
  const tranches = enTranches(plagesManquantes(voulue, g.plages));
  const total = voulue.a - voulue.de;
  let fait = total - dureePlages(tranches);
  const progresser = (dans: number) => surProgression?.(Math.min(1, (fait + dans) / total), TA.coupes.blancs.transcription(enMinutes(fait + dans), enMinutes(total)));
  if (tranches.length > 0) {
    if (fait > 0) surProgression?.(fait / total, TA.coupes.blancs.reprise);
    // Le modèle (≈ 90 Mo, une seule fois) : rien à faire s'il est déjà sur l'appareil.
    await telechargerModuleSousTitres({ signal, surProgression: (p, etape) => surProgression?.(p, etape) });
    const relacher = await garderEcranAllume();
    try {
      for (const tranche of tranches) {
        if (signal?.aborted) throw new ErreurArko('Transcription annulée.', 'annule');
        const len = tranche.a - tranche.de;
        progresser(0);
        const bruts = await executer(
          { type: 'transcrire', fichier: source.fichier, plages: [tranche], langue },
          { signal, surProgression: (p) => progresser(p * len) },
        );
        g = ajouterTranche(g, tranche, appliquerCorrections(nettoyer(bruts, langue)));
        await ecrire(source, g);
        fait += len;
      }
    } finally {
      relacher();
    }
  }
  progresser(0);
  return { src: source.infos.id, mots: motsDansPlage(g.mots, voulue), plages: plagesDans(g.plages, voulue), complete: true };
}

/** Ce qui est déjà transcrit pour cette source (null si rien). `complete` = toute la source est transcrite. */
export async function transcriptionGardee(source: SourceOuverte, langue = 'fr'): Promise<Transcription | null> {
  const g = await lire(source, langue);
  if (!g || g.plages.length === 0) return null;
  const toute = { de: 0, a: source.infos.duree };
  return { src: source.infos.id, mots: g.mots, plages: g.plages, complete: plagesManquantes(toute, g.plages).length === 0 };
}

export async function oublierTranscription(source: SourceOuverte): Promise<void> {
  try {
    await del(cle(source));
  } catch {
    // Rien à faire.
  }
}

/**
 * Mots déjà transcrits pour ces plages (temps source), gardés sur l'appareil par « Couper les blancs » ou le Montage
 * express, avec les corrections retenues ; null s'il en manque une partie (il faut alors transcrire).
 */
export async function motsDejaTranscrits(source: SourceOuverte, plages: readonly PlageTemps[], langue = 'fr'): Promise<Mot[] | null> {
  const g = await lire(source, langue);
  const mots = g ? motsCouverts(g, plages) : null;
  return mots && mots.length > 0 ? appliquerCorrections(mots) : null;
}
