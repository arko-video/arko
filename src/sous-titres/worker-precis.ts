// Worker « sous-titres précis » (dev-mots-2) : comme worker.ts (Whisper base), mais avec Whisper small
// (config-precis.ts). Télécharge le modèle, écoute les plages demandées (les tours de la voix faible, collés et
// remontés : `gain`) avec la MÊME boucle que le Worker de base (ecoute.ts) et renvoie les mots bruts en temps source.
// La page l'arrête par terminate() pour annuler, et à la fin. Même protocole de messages (messages.ts).

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { ErreurArko } from '../moteur/erreurs';
import { corrigerTempsWhisper, reparerDecodageVide } from './correction-temps';
import { ORT_MJS, ORT_WASM } from './config';
import { DTYPE_PRECIS, MODELE_PRECIS, REVISION_PRECIS } from './config-precis';
import { ecouterPlages } from './ecoute';
import { dureeTotale } from './fenetres';
import { ouvrirSon } from './lecture-son';
import type { DepuisWorker, FenetreSautee, MotBrut, Plage, VersWorker } from './messages';
import { fichiersPrecisManquants } from './precis-cache';

const PART_PREPARATION = 0.05;
const PART_TELECHARGEMENT = 0.5;
const PREPARER = 'Je prépare les sous-titres précis…';
const VERSION_ORT = `?v=${encodeURIComponent(env.backends.onnx.versions?.web ?? '0')}`;

let dernierP = 0;
function envoyer(m: DepuisWorker) {
  self.postMessage(m);
}
function progression(p: number, etape: string) {
  dernierP = Math.max(dernierP, Math.min(1, p));
  envoyer({ type: 'progression', p: dernierP, etape });
}

/** WASM d'onnxruntime livré avec Arko (le même que Whisper base), 1 fil, modèle depuis huggingface.co seulement. */
function configurer() {
  const ort = import.meta.env.DEV ? new URL(import.meta.env.BASE_URL + 'ort/', self.location.origin).href : new URL('../ort/', self.location.href).href;
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = { mjs: ort + ORT_MJS + VERSION_ORT, wasm: ort + ORT_WASM + VERSION_ORT };
    wasm.numThreads = 1;
  }
}

interface InfoProgression {
  status: string;
  file?: string;
  loaded?: number;
}

/** Charge le modèle ; « Je télécharge… X / Y Mo » en ne comptant que les fichiers absents du cache. */
async function chargerModele(part: number, partSiTelechargement = part): Promise<AutomaticSpeechRecognitionPipeline> {
  configurer();
  const manquants = await fichiersPrecisManquants();
  const fin = manquants.length > 0 ? partSiTelechargement : part;
  const aTelecharger = new Map(manquants.map((f) => [f.chemin, f.octets]));
  const total = Math.max(1, manquants.reduce((s, f) => s + f.octets, 0));
  const recus = new Map<string, number>();
  const mo = (o: number) => Math.round(o / 1e6);
  progression(0, manquants.length > 0 ? `Je télécharge les sous-titres précis… 0 / ${mo(total)} Mo` : PREPARER);
  const suivre = (info: InfoProgression) => {
    if (info.status !== 'progress' || !info.file || !aTelecharger.has(info.file)) return;
    recus.set(info.file, Math.min(info.loaded ?? 0, aTelecharger.get(info.file)!));
    const n = [...recus.values()].reduce((s, o) => s + o, 0);
    progression(fin * 0.95 * (n / total), `Je télécharge les sous-titres précis… ${mo(n)} / ${mo(total)} Mo`);
  };
  const asr = await pipeline('automatic-speech-recognition', MODELE_PRECIS, {
    revision: REVISION_PRECIS,
    device: 'wasm',
    dtype: DTYPE_PRECIS as never,
    progress_callback: suivre as never,
  });
  corrigerTempsWhisper(asr);
  reparerDecodageVide(asr);
  progression(fin, PREPARER);
  return asr;
}

async function transcrire(fichier: File, plagesDemandees: Plage[], langue: string, gain: boolean): Promise<{ mots: MotBrut[]; sautees: FenetreSautee[] }> {
  const son = await ouvrirSon(fichier);
  if (!son) throw new ErreurArko('Cette vidéo n\'a pas de son.', 'pas_de_son');
  try {
    const plages = plagesDemandees.map((p) => ({ de: Math.max(0, p.de), a: Math.min(son.duree, p.a) })).filter((p) => p.a - p.de > 0.05);
    if (dureeTotale(plages) <= 0) return { mots: [], sautees: [] };
    const asr = await chargerModele(PART_PREPARATION, PART_TELECHARGEMENT);
    const debut = dernierP;
    const sautees: FenetreSautee[] = [];
    const mots = await ecouterPlages(son, plages, (pcm, options) => asr(pcm, options), {
      langue,
      gain,
      sautees,
      surAvancement: (fait, tout) => progression(debut + (1 - debut) * (fait / tout), 'J\'écoute mieux les phrases gardées…'),
    });
    progression(1, 'Sous-titres précis prêts.');
    return { mots, sautees };
  } finally {
    son.fermer();
  }
}

function versErreur(e: unknown): { message: string; code: string } {
  if (e instanceof ErreurArko) return { message: e.message, code: e.code };
  const texte = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/quota/i.test(texte)) return { message: 'Il n\'y a plus assez de place pour les sous-titres précis.', code: 'place' };
  if (/fetch|network|réseau|Failed to load|404|403|500/i.test(texte)) return { message: 'Le téléchargement des sous-titres précis a échoué.', code: 'reseau' };
  return { message: 'Les sous-titres précis n\'ont pas pu démarrer.', code: 'module' };
}

self.onmessage = async (ev: MessageEvent<VersWorker>) => {
  const demande = ev.data;
  try {
    if (demande.type === 'telecharger') {
      await chargerModele(1);
      envoyer({ type: 'fini', mots: [] });
    } else {
      const { mots, sautees } = await transcrire(demande.fichier, demande.plages, demande.langue, demande.gain === true);
      envoyer({ type: 'fini', mots, ...(sautees.length > 0 ? { sautees } : {}) });
    }
  } catch (e) {
    console.warn('[sous-titres précis]', e);
    envoyer({ type: 'erreur', ...versErreur(e) });
  }
};
