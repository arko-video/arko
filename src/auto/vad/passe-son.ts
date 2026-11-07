// Passe du son du Best-of v4 (dev-vad), NAVIGATEUR : UNE lecture du fichier dans le Worker « Qui parle »
// (auto/voix/worker-voix.ts) pour les empreintes de voix (niveau + timbre, 20 ms), la VAD Silero (32 ms, modèle
// rangé dans l'appli, onnxruntime-web WASM 1 fil) et la hauteur de la voix (sur la parole). Le résultat est GARDÉ
// (gardees.ts, `arko.mesures.<emp>`) : une 2ᵉ analyse de la même vidéo ne relit pas le son ; Habiller recoupe avec.
// Un modèle qui ne charge pas → vad: null + un avertissement, jamais une erreur qui arrête l'analyse. Signature GELÉE.
// Le banc fait passer CE code avec son faux Worker (même protocole : DemandePasseSonV4 / ResultatPasseSonV4).

import { mesurerPasseSon, type EmpreintesNommees } from '../voix/mesures-voix';
import type { SourceOuverte } from '../../moteur/api';
import type { OptionsTache } from '../types';
import type { HauteurVoix, ProbasVad } from '../types-v4';
import { garderPasseSon, relirePasseSon } from './gardees';
import { MODELE_VAD } from './silero';
import { TEXTES_VAD } from './textes-vad';

export interface OptionsPasseSon extends OptionsTache {
  /** Pistes à mesurer (≥ 2 : pistes séparées ; [] : la piste principale). */
  pistes: readonly number[];
  /** Passer la VAD (le modèle est rangé dans l'appli : il est lu au 1er usage). */
  vad: boolean;
  /** Mesurer la hauteur de la voix sur la parole. */
  hauteur: boolean;
}

export interface SonMesure {
  empreintes: EmpreintesNommees[];
  vad: ProbasVad | null;
  hauteur: HauteurVoix | null;
  /** Messages pour l'utilisateur (« Le détecteur de voix n'a pas pu démarrer : coupes moins précises. »). */
  avertissements: string[];
}

/** Outils de la passe (une passe gardée faite avec d'autres outils est refaite). */
export const OUTILS_PASSE = `empreintes1|${MODELE_VAD}|hauteur1`;

export async function mesurerSonBestOf(source: SourceOuverte, o: OptionsPasseSon): Promise<SonMesure> {
  const pistes: (number | null)[] = o.pistes.length > 0 ? [...o.pistes] : [null];
  const { id: src, emp, duree } = source.infos;
  const deja = emp ? await relirePasseSon(emp, duree, pistes, OUTILS_PASSE, o.vad) : null;
  if (deja && (!o.hauteur || deja.hauteur)) {
    o.surProgression?.(1, TEXTES_VAD.reprise);
    return { empreintes: deja.empreintes, vad: deja.vad ? { ...deja.vad, src } : null, hauteur: o.hauteur ? deja.hauteur : null, avertissements: [] };
  }
  const r = await mesurerPasseSon(source, pistes, { signal: o.signal, surProgression: o.surProgression, vad: o.vad, hauteur: o.hauteur });
  const vad = o.vad && r.vad ? { ...r.vad, src } : null;
  const hauteur = o.hauteur ? (r.hauteur ?? null) : null;
  const avertissements = r.avertissement ? [r.avertissement] : o.vad && !vad ? [TEXTES_VAD.pasDemarre] : [];
  if (emp) await garderPasseSon(emp, duree, pistes, OUTILS_PASSE, { empreintes: r.empreintes, vad: vad ? { pas: vad.pas, p: vad.p, plages: vad.plages, modele: vad.modele } : null, hauteur });
  return { empreintes: r.empreintes, vad, hauteur, avertissements };
}
