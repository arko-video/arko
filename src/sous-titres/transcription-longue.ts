// Transcription d'une LONGUE source (dev 1 ; sert à A, B, E et au Montage express) : Whisper sur l'appareil,
// par tranches de 5 minutes, avec progression (« 12 min sur 120 »), une plage au choix (« de 0:20:00 à
// 1:10:00 ») et une REPRISE si on ferme l'appli (mots déjà transcrits gardés dans IndexedDB, clé
// `arko.transcription.<empreinte>`). Réutilise le pilote et le Worker Whisper : rien n'est envoyé.
// Chaque tranche lance un Worker neuf (le modèle se recharge depuis le cache en quelques secondes) : annuler
// arrête net le Worker en cours, et ce qui était fini reste gardé.
// La boucle des tranches est partagée avec transcrireZones (v4, dev-mots : Whisper sur la parole seulement).
// Robustesse (dev-mots, 7/11/2026 ; intégrateur après relecture) : une tranche dont le Worker échoue est réessayée
// une fois. Ensuite : transcrireLongue (Couper les blancs, Montage express…) LÈVE, comme avant (ce qui est fini reste
// gardé, la tranche sera refaite au prochain essai) ; transcrireZones (Best-of, `tolerant`) la laisse de côté, NON
// gardée (« à refaire » : elle est refaite à la prochaine analyse) et rend `complete: false` (la revue le dit). Une
// fenêtre que Whisper a sautée (ecoute.ts) reste aussi à refaire. On lève toujours si AUCUNE tranche n'a marché, ou
// pour une erreur qui arrête tout (annulé, plus de place, réseau, pas de son).
// Ce qui est fait ≠ ce qui est écouté (`ecoutees`) : le Best-of ne fait écouter que la parole ; transcrireLongue et
// les sous-titres retranscrivent donc ce que Whisper n'a jamais entendu.

import { del, get, set } from 'idb-keyval';
import {
  ajouterTranche,
  dureePlages,
  enTranches,
  gardeeUtilisable,
  motsCouverts,
  motsDansPlage,
  plagesDans,
  plagesEcoutees,
  plagesManquantes,
  soustrairePlages,
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
import type { MotBrut, VersWorker } from './messages';
import { nettoyer } from './nettoyage';
import { executer, type OptionsPilote } from './pilote';

/** Le chemin jusqu'au Worker Whisper (remplaçable par les tests et le banc). */
export interface MoteurTranscription {
  /** Envoie UNE demande au Worker et rend ses mots bruts (défaut : pilote.ts → executer). */
  executer(demande: VersWorker, o: OptionsPilote): Promise<MotBrut[]>;
  /** Télécharge le module s'il manque (défaut : client.ts → telechargerModuleSousTitres). */
  preparer(o: OptionsPilote): Promise<void>;
}

export const MOTEUR_WORKER: MoteurTranscription = { executer, preparer: (o) => telechargerModuleSousTitres(o) };

export interface OptionsTranscriptionLongue extends OptionsTache {
  /** Partie à transcrire (défaut : toute la source). */
  plage?: PlageTemps;
  /** Langue (défaut "fr"). */
  langue?: string;
  /** false = oublier ce qui était déjà transcrit et repartir de zéro (défaut : reprendre). */
  reprendre?: boolean;
  /** Tests et banc seulement : autre chemin jusqu'à Whisper (défaut : le Worker). */
  moteur?: MoteurTranscription;
  /**
   * true (Best-of, transcrireZones) : une tranche ratée est laissée « à refaire » et l'écoute continue
   * (`complete: false`) ; défaut false : elle lève, comme avant (Couper les blancs, Montage express).
   */
  tolerant?: boolean;
}

/** Erreurs qui arrêtent tout : inutile d'essayer la tranche suivante. */
const ERREURS_FATALES = new Set(['annule', 'place', 'reseau', 'pas_de_son', 'source', 'plage']);

function estFatale(e: unknown): boolean {
  return e instanceof ErreurArko && ERREURS_FATALES.has(e.code);
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

/** Ce que la boucle des tranches donne à Whisper (transcrireLongue : la tranche entière ; transcrireZones : ses zones). */
export interface EcouteTranches {
  /** Plages à faire écouter dans cette tranche ; [] = rien à écouter (tranche marquée faite sans lancer Whisper). */
  plagesDe(tranche: PlageTemps): PlageTemps[];
  /** Remonter la voix de chaque plage avant Whisper (Worker : `gain`). */
  gain: boolean;
  /** true : toute la tranche est écoutée ; ce qui manque se compte alors sur ce qui a été vraiment ÉCOUTÉ. */
  toute: boolean;
}

const TOUTE_LA_TRANCHE: EcouteTranches = { plagesDe: (t) => [t], gain: false, toute: true };

/**
 * La boucle des tranches de 5 min, partagée par transcrireLongue et transcrireZones : reprise, progression (au prorata
 * de ce que Whisper écoute vraiment), une tranche ratée réessayée une fois puis laissée de côté.
 */
export async function transcrireParTranches(source: SourceOuverte, options: OptionsTranscriptionLongue, ecoute: EcouteTranches): Promise<Transcription> {
  const { signal, surProgression } = options;
  const moteur = options.moteur ?? MOTEUR_WORKER;
  const langue = options.langue ?? 'fr';
  const duree = source.infos.duree;
  const voulue = { de: Math.max(0, options.plage?.de ?? 0), a: Math.min(duree, options.plage?.a ?? duree) };
  if (voulue.a - voulue.de < 0.1) throw new ErreurArko('La partie choisie est vide.', 'plage');
  if (options.reprendre === false) await oublierTranscription(source);
  let g = (await lire(source, langue)) ?? transcriptionVide(duree, langue);
  const faites = (x: TranscriptionGardee) => (ecoute.toute ? plagesEcoutees(x) : x.plages);
  const tranches = enTranches(plagesManquantes(voulue, faites(g))).map((t) => ({ t, plages: ecoute.plagesDe(t).filter((p) => p.a - p.de > 0.05) }));
  const tolerant = options.tolerant === true;
  const total = voulue.a - voulue.de;
  // Travail de Whisper : le son vraiment écouté (une tranche sans parole ne coûte presque rien).
  const travail = (x: { plages: PlageTemps[] }) => dureePlages(x.plages) + 1;
  const deja = total - dureePlages(tranches.map((x) => x.t));
  const aFaire = tranches.reduce((s, x) => s + travail(x), 0);
  let fait = 0;
  const part = (dans: number) => (aFaire <= 0 ? 1 : (deja + (total - deja) * Math.min(1, (fait + dans) / aFaire)) / total);
  const progresser = (dans: number) => {
    const p = Math.min(1, part(dans));
    surProgression?.(p, TA.coupes.blancs.transcription(enMinutes(p * total), enMinutes(total)));
  };
  let ratees = 0;
  let reussies = 0;
  let sautees = 0;
  let premiere: unknown = null;
  if (tranches.length > 0) {
    if (deja > 0) surProgression?.(deja / total, TA.coupes.blancs.reprise);
    // Le modèle (≈ 90 Mo, une seule fois) : rien à faire s'il est déjà sur l'appareil ou s'il n'y a rien à écouter.
    if (tranches.some((x) => x.plages.length > 0)) await moteur.preparer({ signal, surProgression: (p, etape) => surProgression?.(p, etape) });
    const relacher = await garderEcranAllume();
    try {
      for (const x of tranches) {
        if (signal?.aborted) throw new ErreurArko('Transcription annulée.', 'annule');
        const len = travail(x);
        progresser(0);
        if (x.plages.length === 0) {
          // Rien à écouter (Best-of : pas de parole) : faite, mais pas écoutée.
          g = ajouterTranche(g, x.t, [], { ecoutees: [] });
          await ecrire(source, g);
          fait += len;
          continue;
        }
        const demande: VersWorker = { type: 'transcrire', fichier: source.fichier, plages: x.plages, langue, ...(ecoute.gain ? { gain: true } : {}) };
        let bruts: MotBrut[] | null = null;
        let trous: PlageTemps[] = [];
        for (let essai = 0; essai < 2 && bruts === null; essai++) {
          try {
            trous = [];
            bruts = await moteur.executer(demande, { signal, surProgression: (p) => progresser(p * len), surSautees: (s) => void (trous = s.map((y) => ({ de: y.de, a: y.a }))) });
          } catch (e) {
            if (estFatale(e) || signal?.aborted) throw e;
            console.warn(`[sous-titres] tranche ${x.t.de}–${x.t.a} s ratée (essai ${essai + 1}) :`, e);
            premiere ??= e;
          }
        }
        fait += len;
        if (bruts === null) {
          // Comme avant : on s'arrête (ce qui est fini est gardé, la tranche sera refaite au prochain essai).
          if (!tolerant) throw premiere;
          ratees++;
          // Deux tranches ratées et rien n'a jamais marché (même en reprise) : le module est sans doute cassé.
          if (ratees >= 2 && reussies === 0) throw premiere;
          continue;
        }
        reussies++;
        // Les fenêtres que Whisper a sautées restent à refaire (ni faites ni écoutées).
        if (trous.length > 0) sautees++;
        const ecoutees = soustrairePlages(x.plages, trous);
        g = ajouterTranche(g, x.t, appliquerCorrections(nettoyer(bruts, langue)), { faites: soustrairePlages([x.t], trous), ecoutees });
        await ecrire(source, g);
      }
    } finally {
      relacher();
    }
  }
  if (ratees > 0 && reussies === 0 && premiere !== null) throw premiere;
  progresser(0);
  return { src: source.infos.id, mots: motsDansPlage(g.mots, voulue), plages: plagesDans(faites(g), voulue), complete: ratees === 0 && sautees === 0 };
}

/** Transcrit la source (ou la plage), en reprenant ce qui était déjà fait. Lève ErreurArko 'annule' si on annule. */
export async function transcrireLongue(source: SourceOuverte, options: OptionsTranscriptionLongue = {}): Promise<Transcription> {
  return transcrireParTranches(source, options, TOUTE_LA_TRANCHE);
}

/** Ce qui est déjà transcrit pour cette source (null si rien). `complete` = toute la source est transcrite. */
export async function transcriptionGardee(source: SourceOuverte, langue = 'fr'): Promise<Transcription | null> {
  const g = await lire(source, langue);
  const ecoutees = g ? plagesEcoutees(g) : [];
  if (!g || ecoutees.length === 0) return null;
  const toute = { de: 0, a: source.infos.duree };
  return { src: source.infos.id, mots: g.mots, plages: ecoutees, complete: plagesManquantes(toute, ecoutees).length === 0 };
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
