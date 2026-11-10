// Best-of v4 — ce que l'APPAREIL mesure avant la chaîne pure (NAVIGATEUR ; le banc fait passer ce même code avec
// ses faux Workers). Propriétaire en vague 2 : dev-vad (performance sur téléphone : CONTRAT.md §1.11).
// Ordre : 1. signaux du son (reprise IndexedDB, comme avant) → 2. UNE passe du son (empreintes + VAD + hauteur) →
// 3. zones de parole → Whisper seulement là (reprise par tranche de 5 min) → 4. bords de l'écran → 5. empreinte CAM++
// facultative (si le modèle est sur l'appareil et si la chaîne la demande). Rien n'est envoyé. Les modules absents ou
// refusés ne sont JAMAIS téléchargés ici : l'écran Réglages a demandé l'accord avant (decisionModules).
// Écrit par l'architecte (7/11/2026), repris par dev-vad : le détecteur de voix (2,2 Mo) est RANGÉ DANS L'APPLI
// (décision de l'orchestrateur) : il passe dès qu'il n'a pas été refusé, sans accord ni téléchargement depuis un
// autre site ; s'il ne charge pas, modules.vad = 'erreur' + un avertissement, et la chaîne prend le repli sans modèle.

import { imagesReparties } from '../coupes/mesures';
import { plagesManquantes } from '../coupes/tranches';
import { cadreRognage, detecterBords } from '../coupes/rognage-detection';
import { messageRegard, preparerRegard } from '../vision/regarder';
import { lireSignauxSource } from '../signaux-source';
import { MODELES } from '../modeles/catalogue';
import { mesurerSonBestOf } from '../vad/passe-son';
import { calculerEmpreintesNeurales } from '../voix/client-empreintes';
import { estPasEncoreFait } from '../pas-encore-fait';
import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import type { Rognage } from '../../recette/types';
import { transcrireZones } from '../../sous-titres/transcription-zones';
import { TA } from '../../textes-auto';
import type { OptionsTache, Transcription } from '../types';
import type { EmpreintesNeurales, MesuresSource, ModulesBestOf } from '../types-v4';
import { avertissementsMuets } from './analyse-express';
import { besoinsChaine } from './chaine-best-of';
import { horodatage } from './scenes';
import type { ReglagesBestOf } from './best-of';
import type { ReglagesExpress } from './express';

export interface OptionsMesures extends OptionsTache {
  /** Pistes gardées de la vidéo (la recette d'où l'on vient) ; absent : toutes si le fichier en a au moins 2. */
  pistes?: readonly number[];
  /** État des modules APRÈS l'écran d'accord (un module 'absent' ou 'refuse' n'est pas utilisé). */
  modules: ModulesBestOf;
}

/** Parts de la barre d'avancement (Whisper domine : 2 h → 30 à 60 min sur téléphone). */
const PARTS = { signaux: 0.1, son: 0.25, whisper: 0.93, bords: 0.96, empreinte: 0.99 } as const;

/**
 * Passer la VAD ? Oui si elle est sur l'appareil, ou livrée avec l'appli (même si l'écran la croit « absente » ou
 * « hors ligne » : elle est peut-être déjà gardée) ; jamais si l'utilisateur l'a refusée.
 */
export function vadUtilisable(etat: ModulesBestOf['vad']): boolean {
  if (etat === 'refuse') return false;
  return etat === 'present' || Boolean(MODELES.vad.dansLAppli);
}

function estAnnule(e: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (e instanceof ErreurArko && e.code === 'annule');
}

async function bordsDe(source: SourceOuverte): Promise<Omit<Rognage, 'src'> | null> {
  const L = source.infos.l ?? 0;
  const H = source.infos.h ?? 0;
  if (!L || !H) return null;
  try {
    return cadreRognage(detecterBords(await imagesReparties(source, 20, 640), L, H), L, H, L / H);
  } catch (e) {
    console.warn('[Arko] bords de l\'écran non trouvés', e);
    return null;
  }
}

/** Tout ce que la chaîne pure (analyserChaine) lit. Lève ErreurArko 'annule' si on annule. */
export async function mesurerPourBestOf(source: SourceOuverte, reg: ReglagesExpress, bestOf: ReglagesBestOf, o: OptionsMesures): Promise<MesuresSource> {
  const { signal, surProgression } = o;
  const part = (de: number, a: number) => (x: number, m: string) => surProgression?.(de + (a - de) * x, m);
  const src = source.infos.id;
  const duree = source.infos.duree;
  const avertissements: string[] = [];
  const modules: ModulesBestOf = { ...o.modules };

  // 1. Signaux du son (enveloppe 20 ms, pics, passages muets).
  const vu = await preparerRegard(source, { signal, surProgression: (x, m) => part(0, PARTS.signaux / 4)(x, m ?? TA.express.ecoute) });
  const signaux = await lireSignauxSource(source, { signal, surProgression: (x) => part(PARTS.signaux / 4, PARTS.signaux)(x, TA.express.ecoute) });
  if (signal?.aborted) throw new ErreurArko('Analyse annulée.', 'annule');
  const mv = messageRegard(vu);
  if (mv) avertissements.push(mv);

  // 2. Une passe du son : empreintes + VAD + hauteur (une seule lecture du fichier, gardée pour la fois suivante).
  const nb = source.infos.pistes ?? 0;
  const pistes = o.pistes && o.pistes.length > 0 ? o.pistes : nb >= 2 ? Array.from({ length: nb }, (_, i) => i) : [];
  const vadVoulue = vadUtilisable(modules.vad);
  const son = await mesurerSonBestOf(source, { signal, surProgression: part(PARTS.signaux, PARTS.son), pistes, vad: vadVoulue, hauteur: true });
  if (signal?.aborted) throw new ErreurArko('Analyse annulée.', 'annule');
  avertissements.push(...son.avertissements);
  if (vadVoulue) modules.vad = son.vad ? 'present' : 'erreur';
  const pistesSeparees = son.empreintes.length >= 2;

  // 3. Whisper sur les zones de parole seulement — SANS détecteur de voix, toute la source (contrat §1.3 ; relecture
  // point 6 : le repli sans modèle rate trop la voix faible pour qu'on saute ce qu'il n'entend pas).
  let transcription: Transcription | null = null;
  if (reg.transcrire && modules.whisper === 'present') {
    const b = besoinsChaine({ src, duree, signaux, empreintes: son.empreintes, pistesSeparees, vad: son.vad }, bestOf);
    try {
      transcription = await transcrireZones(source, { signal, surProgression: part(PARTS.son, PARTS.whisper), plage: { de: 0, a: duree }, ...(son.vad ? { zones: b.transcrire } : {}) });
      // Une tranche ratée reste à refaire : on le dit (elle sera refaite à la prochaine analyse).
      if (!transcription.complete) {
        const manque = plagesManquantes({ de: 0, a: duree }, transcription.plages);
        if (manque.length > 0) avertissements.push(TA.express.partieManquante(manque.slice(0, 3).map((p) => `${horodatage(p.de)}–${horodatage(p.a)}`).join(', ') + (manque.length > 3 ? '…' : '')));
      }
      if (!transcription.mots.some((m) => m[0].trim())) transcription = null;
    } catch (e) {
      if (estAnnule(e, signal)) throw e;
      console.warn('[Arko] Best-of : transcription impossible', e);
      modules.whisper = 'erreur';
      transcription = null;
    }
  }
  if (!transcription) avertissements.push(TA.express.sansMots);

  // 4. Bords de l'écran (capture OBS).
  surProgression?.(PARTS.whisper, TA.express.chercheBords);
  const cadreBords = reg.bords ? await bordsDe(source) : null;

  // 5. Empreinte CAM++ : seulement si elle est sur l'appareil et que la chaîne la demande.
  let neurales: EmpreintesNeurales | null = null;
  if (modules.empreinte === 'present' && (bestOf.quiParle || bestOf.avatars)) {
    // Le modèle est là : il sert aussi tout seul aux morceaux ambigus (intégrateur, demande de dev-voix).
    const b = besoinsChaine({ src, duree, signaux, empreintes: son.empreintes, pistesSeparees, vad: son.vad, transcription }, bestOf, { empreinteSurAppareil: true });
    if (b.empreintes.length > 0) {
      try {
        neurales = await calculerEmpreintesNeurales(source, b.empreintes, { signal, surProgression: (x, m) => part(PARTS.bords, PARTS.empreinte)(x, m) });
      } catch (e) {
        if (estAnnule(e, signal)) throw e;
        if (!estPasEncoreFait(e)) console.warn('[Arko] Best-of : empreinte de voix impossible', e);
        modules.empreinte = 'erreur';
      }
    }
  }
  surProgression?.(1, TA.express.scenes);
  return {
    src,
    duree,
    signaux,
    empreintes: son.empreintes,
    pistesSeparees,
    vad: son.vad,
    hauteur: son.hauteur,
    transcription,
    neurales,
    cadreBords,
    modules,
    avertissements: [...avertissementsMuets(signaux), ...avertissements],
  };
}
