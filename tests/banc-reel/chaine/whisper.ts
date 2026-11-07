// Banc réel — transcription de la session avec le MÊME Whisper qu'Arko, dans Node.
//
// Reproduit src/sous-titres/transcription-longue.ts + worker.ts (le navigateur) :
// - plage = toute la source, coupée en tranches de 5 min (enTranches) ; chaque tranche = un Worker neuf dans
//   l'appli, ici = un fichier gardé dans le cache (reprise : une tranche déjà écrite n'est pas refaite) ;
// - dans une tranche : fenêtres de 28 s au plus (remplirFenetre, coupe dans le silence le plus calme des 8 dernières
//   secondes), son ramené à 16 kHz par la même moyenne (ajouterMono) depuis des morceaux décodés à 48 kHz ;
// - pipeline transformers.js 4.3.2, même modèle (onnx-community/whisper-base_timestamped), dtype q8, 1 fil,
//   options { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, language: 'fr' } ;
// - correction des temps des mots (corrigerTempsWhisper), puis nettoyer + appliquerCorrections + ajouterTranche.
// - (intégrateur, 7/11) la boucle fenêtre par fenêtre n'est plus recopiée : c'est `ecouterPlages` de l'appli
//   (src/sous-titres/ecoute.ts, dev-mots), avec `reparerDecodageVide` : une fenêtre où transformers.js plante est
//   réessayée en deux moitiés puis sautée et notée (comme le Worker), le silence numérique n'est plus écouté.
//
// ÉCARTS avec le navigateur : onnxruntime-node (CPU) au lieu d'onnxruntime-web (WASM) — mêmes poids q8, calculs
// très proches mais pas bit à bit ; aucune correction mémorisée (localStorage de Romain inconnu).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { ajouterTranche, enTranches, motsDansPlage, plagesManquantes, transcriptionVide, type TranscriptionGardee } from '../../../src/auto/coupes/tranches';
import type { PlageTemps } from '../../../src/auto/types';
import type { Mot } from '../../../src/recette/types';
import { MODELE } from '../../../src/sous-titres/config';
import { appliquerCorrections } from '../../../src/sous-titres/corrections';
import { corrigerTempsWhisper, reparerDecodageVide } from '../../../src/sous-titres/correction-temps';
import { ecouterPlages, type Reconnaissance } from '../../../src/sous-titres/ecoute';
import { dureeTotale } from '../../../src/sous-titres/fenetres';
import type { SonOuvert } from '../../../src/sous-titres/lecture-son';
import type { FenetreSautee, MotBrut, Plage } from '../../../src/sous-titres/messages';
import { nettoyer } from '../../../src/sous-titres/nettoyage';
import { DOSSIER_CACHE, fauxSink, SonPcm } from './son';

/**
 * Moteur d'onnxruntime sous Whisper : « web » = onnxruntime-web (WASM, 1 fil), le MÊME que le Worker du navigateur
 * (BANC_ORT=web) ; « node » = onnxruntime-node (CPU). Les deux donnent des mots assez différents (≈ 1 mot sur 3
 * identique à 0,1 s près sur une tranche) : le banc prend « web » dès que toutes ses tranches sont faites.
 */
export type Moteur = 'node' | 'web';
export const MOTEUR_TRANSCRIPTION: Moteur = process.env.BANC_ORT === 'web' ? 'web' : 'node';
export function dossierTranches(m: Moteur): string {
  return m === 'web' ? `${DOSSIER_CACHE}/whisper-web` : `${DOSSIER_CACHE}/whisper`;
}
/** Les mots que la chaîne utilise (et que lisent les mesures). */
export const FICHIER_MOTS = `${DOSSIER_CACHE}/mots-arko.json`;
/** Durée de la source telle qu'Arko la voit (la vidéo de Romain : 11976 s). */
export const DUREE_SOURCE = 11976;
const LANGUE = 'fr';

export interface TrancheFaite {
  tranche: PlageTemps;
  /** Mots bruts du Worker (avant nettoyage), en temps source. */
  bruts: MotBrut[];
  /** Temps de calcul (s). */
  calcul: number;
  fenetres: number;
  /**
   * Fenêtres où transformers.js a levé une erreur (ex. « token_ids must be a non-empty array of integers. » dans
   * _decode_asr). Dans le navigateur, le Worker s'arrête là et l'analyse échoue (« Le module sous-titres n'a pas pu
   * démarrer… ») ; le banc garde les autres fenêtres et le note.
   */
  erreurs?: { de: number; a: number; message: string }[];
}

let asrCharge: AutomaticSpeechRecognitionPipeline | null = null;

/** Charge le modèle comme le Worker (dtype q8, 1 fil) ; device « cpu » = onnxruntime-node. */
export async function chargerWhisper(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrCharge) return asrCharge;
  env.allowLocalModels = false;
  env.cacheDir = `${DOSSIER_CACHE}/modeles-hf`;
  const web = process.env.BANC_ORT === 'web';
  if (web) env.useWasmCache = false;
  const asr = await pipeline('automatic-speech-recognition', MODELE, {
    // BANC_ORT=web : onnxruntime-web (WASM, 1 fil) comme le Worker du navigateur ; sinon onnxruntime-node.
    device: web ? 'auto' : 'cpu',
    dtype: 'q8',
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  });
  corrigerTempsWhisper(asr);
  reparerDecodageVide(asr);
  asrCharge = asr;
  return asr;
}

/**
 * `transcrire` du Worker (src/sous-titres/worker.ts) : la MÊME boucle `ecouterPlages` de l'appli (fenêtres de 28 s,
 * fenêtre qui plante réessayée en deux moitiés puis sautée et notée, silence numérique pas écouté), sans la
 * progression. `fenetres` = nombre de fenêtres remplies (pour le journal).
 */
export async function transcrirePlages(
  son: SonPcm,
  plagesDemandees: Plage[],
  langue = LANGUE,
): Promise<{ bruts: MotBrut[]; fenetres: number; erreurs: { de: number; a: number; message: string }[] }> {
  const sonOuvert = { sink: fauxSink(son), duree: son.duree, fermer() {} } as unknown as SonOuvert;
  const plages = plagesDemandees.map((p) => ({ de: Math.max(0, p.de), a: Math.min(sonOuvert.duree, p.a) })).filter((p) => p.a - p.de > 0.05);
  if (dureeTotale(plages) <= 0) return { bruts: [], fenetres: 0, erreurs: [] };
  const asr = await chargerWhisper();
  const reconnaitre: Reconnaissance = (pcm, options) => asr(pcm, options as never);
  const sautees: FenetreSautee[] = [];
  let fenetres = 0;
  const bruts = await ecouterPlages(sonOuvert, plages, reconnaitre, { langue, sautees, surAvancement: () => void fenetres++ });
  return { bruts, fenetres, erreurs: sautees.map((x) => ({ de: x.de, a: x.a, message: x.message })) };
}

function nomTranche(t: PlageTemps, m: Moteur = MOTEUR_TRANSCRIPTION): string {
  return `${dossierTranches(m)}/tranche-${String(Math.round(t.de)).padStart(5, '0')}-${String(Math.round(t.a)).padStart(5, '0')}.json`;
}

/** Les tranches de 5 min de la source entière, comme transcrireLongue (plage = toute la source). */
export function tranchesSource(duree = DUREE_SOURCE): PlageTemps[] {
  return enTranches(plagesManquantes({ de: 0, a: duree }, []));
}

function fichiersTranches(m: Moteur): string[] {
  const d = dossierTranches(m);
  return existsSync(d) ? readdirSync(d).filter((f) => /^tranche-\d+-\d+\.json$/.test(f)) : [];
}

/** Moteur des mots utilisés par la chaîne : BANC_WHISPER=node|web, sinon « web » si toutes ses tranches sont faites. */
export function moteurChaine(): Moteur {
  const e = process.env.BANC_WHISPER;
  if (e === 'node' || e === 'web') return e;
  return fichiersTranches('web').length >= tranchesSource().length ? 'web' : 'node';
}

export function lireTranchesFaites(m: Moteur = moteurChaine()): TrancheFaite[] {
  const d = dossierTranches(m);
  return fichiersTranches(m)
    .map((f) => JSON.parse(readFileSync(`${d}/${f}`, 'utf8')) as TrancheFaite)
    .sort((x, y) => x.tranche.de - y.tranche.de);
}

/**
 * Transcrit les tranches de [de, a] qui manquent (reprise). Une tranche = un fichier. Écrit mots-arko.json après
 * chaque tranche (ce qui est fait sert tout de suite à l'équipe).
 */
export async function transcrireSession(de: number, a: number, journal: (m: string) => void = console.log): Promise<void> {
  mkdirSync(dossierTranches(MOTEUR_TRANSCRIPTION), { recursive: true });
  const son = new SonPcm();
  const aFaire = tranchesSource().filter((t) => t.a > de + 0.01 && t.de < a - 0.01 && !existsSync(nomTranche(t)));
  journal(`${aFaire.length} tranche(s) à transcrire entre ${de} et ${a} s (onnxruntime-${MOTEUR_TRANSCRIPTION}).`);
  for (const tranche of aFaire) {
    const t0 = performance.now();
    const { bruts, fenetres, erreurs } = await transcrirePlages(son, [tranche]);
    const calcul = (performance.now() - t0) / 1000;
    const fait: TrancheFaite = { tranche, bruts, calcul, fenetres, ...(erreurs.length > 0 ? { erreurs } : {}) };
    const chemin = nomTranche(tranche);
    writeFileSync(`${chemin}.tmp`, JSON.stringify(fait));
    renameSync(`${chemin}.tmp`, chemin);
    const total = assemblerMots(MOTEUR_TRANSCRIPTION);
    journal(
      `${new Date().toISOString()} tranche ${tranche.de}–${tranche.a} s : ${bruts.length} mots bruts, ${fenetres} fenêtres, ` +
        `${calcul.toFixed(0)} s de calcul (×${((tranche.a - tranche.de) / calcul).toFixed(1)} temps réel) ; mots-arko-${MOTEUR_TRANSCRIPTION}.json : ${total.mots} mots, ${total.couvert} s couvertes` +
        (erreurs.length > 0 ? ` ; ERREUR de transformers.js sur ${erreurs.map((x) => `${x.de.toFixed(1)}–${x.a.toFixed(1)} s (${x.message})`).join(', ')}` : ''),
    );
  }
  son.fermer();
}

/** Ce que transcrireLongue garde (TranscriptionGardee), refait à partir des tranches écrites. */
export function transcriptionDesTranches(m: Moteur, duree = DUREE_SOURCE): TranscriptionGardee {
  let g = transcriptionVide(duree, LANGUE);
  for (const t of lireTranchesFaites(m)) g = ajouterTranche(g, t.tranche, appliquerCorrections(nettoyer(t.bruts, LANGUE)));
  return g;
}

export interface FichierMots {
  /** Mots de la recette ([texte, début, fin, fort?]) en temps source, comme transcrireLongue les rend. */
  mots: Mot[];
  /** Plages transcrites (temps source). */
  plages: PlageTemps[];
  duree: number;
  modele: string;
  moteur: Moteur;
  ecrit: string;
}

function ecrireJson(chemin: string, x: unknown) {
  writeFileSync(`${chemin}.tmp`, JSON.stringify(x));
  renameSync(`${chemin}.tmp`, chemin);
}

/** Écrit mots-arko-<moteur>.json à partir des tranches faites, et mots-arko.json si c'est le moteur de la chaîne. */
export function assemblerMots(m: Moteur = moteurChaine()): { mots: number; couvert: number } {
  const g = transcriptionDesTranches(m);
  const mots = motsDansPlage(g.mots, { de: 0, a: g.duree });
  const fichier: FichierMots = { mots, plages: g.plages, duree: g.duree, modele: MODELE, moteur: m, ecrit: new Date().toISOString() };
  ecrireJson(`${DOSSIER_CACHE}/mots-arko-${m}.json`, fichier);
  if (m === moteurChaine()) ecrireJson(FICHIER_MOTS, fichier);
  return { mots: mots.length, couvert: Math.round(g.plages.reduce((s, p) => s + p.a - p.de, 0)) };
}

export function lireMots(): FichierMots | null {
  if (!existsSync(FICHIER_MOTS)) return null;
  return JSON.parse(readFileSync(FICHIER_MOTS, 'utf8')) as FichierMots;
}

/** Mesure la vitesse sur [de, de + duree] (sans rien écrire dans les tranches). */
export async function mesurerVitesse(de: number, duree: number, journal: (m: string) => void = console.log): Promise<void> {
  const son = new SonPcm();
  const tc = performance.now();
  await chargerWhisper();
  const charge = (performance.now() - tc) / 1000;
  const t0 = performance.now();
  const { bruts, fenetres } = await transcrirePlages(son, [{ de, a: de + duree }]);
  const calcul = (performance.now() - t0) / 1000;
  const mots = nettoyer(bruts, LANGUE);
  journal(`Chargement du modèle : ${charge.toFixed(1)} s`);
  journal(`${duree} s de son (${de}–${de + duree}) : ${calcul.toFixed(1)} s de calcul (×${(duree / calcul).toFixed(2)} temps réel), ${fenetres} fenêtres, ${mots.length} mots`);
  journal(`Estimation pour 7300 s : ${((7300 / duree) * calcul / 60).toFixed(0)} min ; pour 11976 s : ${((11976 / duree) * calcul / 60).toFixed(0)} min`);
  son.fermer();
}
