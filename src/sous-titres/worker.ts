// Worker Whisper : télécharge le modèle, écoute les plages demandées et renvoie les mots en temps source.
// Tout tourne ici (WASM d'onnxruntime inclus dans l'appli, 1 seul fil) : la page reste fluide.
// La page arrête ce Worker par terminate() pour annuler, et aussi à la fin.

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { ErreurArko } from '../moteur/erreurs';
import { corrigerTempsWhisper } from './correction-temps';
import { fichiersManquants } from './cache-module';
import { CLE_CACHE, MODELE, ORT_MJS, ORT_WASM } from './config';
import { dureeTotale, motEnSource } from './fenetres';
import { ouvrirSon, remplirFenetre } from './lecture-son';
import type { DepuisWorker, MotBrut, Plage, VersWorker } from './messages';
import { niveau } from './pcm';

/** Part de la barre réservée au chargement du modèle : 10 % s'il est en cache, 60 % s'il faut le télécharger. */
const PART_PREPARATION = 0.1;
const PART_TELECHARGEMENT = 0.6;

function envoyer(m: DepuisWorker) {
  self.postMessage(m);
}

/** La barre ne recule jamais : on garde la plus grande valeur déjà envoyée. */
let dernierP = 0;
function progression(p: number, etape: string) {
  dernierP = Math.max(dernierP, Math.min(1, p));
  envoyer({ type: 'progression', p: dernierP, etape });
}

/** Version d'onnxruntime-web, ajoutée aux adresses du WASM : une mise à jour ne relit pas un vieux WASM du cache. */
const VERSION_ORT = `?v=${encodeURIComponent(env.backends.onnx.versions?.web ?? '0')}`;

/** Réglages de transformers.js : WASM local, 1 fil, modèle depuis huggingface.co uniquement. */
function configurer() {
  const ort = new URL(import.meta.env.BASE_URL + 'ort/', self.location.origin).href;
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    // Objet { mjs, wasm } : aucun fichier n'est demandé à un CDN (jsdelivr), et transformers.js
    // garde aussi ce WASM dans son Cache Storage (marche ensuite sans internet).
    wasm.wasmPaths = { mjs: ort + ORT_MJS + VERSION_ORT, wasm: ort + ORT_WASM + VERSION_ORT };
    wasm.numThreads = 1;
  }
}

/** Efface du cache les WASM d'une ancienne version d'onnxruntime (14 Mo chacun). */
async function oublierAnciensOrt() {
  try {
    const cache = await caches.open(CLE_CACHE);
    for (const r of await cache.keys()) {
      const u = new URL(r.url);
      if (u.pathname.includes('/ort/') && u.search !== VERSION_ORT) await cache.delete(r);
    }
  } catch {
    // Pas grave : il restera un vieux fichier.
  }
}

interface InfoProgression {
  status: string;
  file?: string;
  loaded?: number;
}

const PREPARER = 'Je prépare le module sous-titres…';

/**
 * Charge le modèle. S'il manque des fichiers, ils sont téléchargés : « Je télécharge… X / Y Mo »,
 * en comptant SEULEMENT les octets des fichiers absents du cache. Sinon : « Je prépare… ».
 * La progression va de 0 à `part` (`partSiTelechargement` s'il faut télécharger).
 */
async function chargerModele(part: number, partSiTelechargement = part): Promise<AutomaticSpeechRecognitionPipeline> {
  configurer();
  const manquants = await fichiersManquants();
  const fin = manquants.length > 0 ? partSiTelechargement : part;
  const aTelecharger = new Map(manquants.map((f) => [f.chemin, f.octets]));
  const total = manquants.reduce((s, f) => s + f.octets, 0);
  const recus = new Map<string, number>();
  const mo = (o: number) => Math.round(o / 1e6);
  progression(0, manquants.length > 0 ? `Je télécharge le module sous-titres… 0 / ${mo(total)} Mo` : PREPARER);
  const suivre = (info: InfoProgression) => {
    if (info.status !== 'progress' || !info.file || !aTelecharger.has(info.file)) return;
    recus.set(info.file, Math.min(info.loaded ?? 0, aTelecharger.get(info.file)!));
    const n = [...recus.values()].reduce((s, o) => s + o, 0);
    // Le WASM (servi par Arko) n'envoie pas de progression : il est compté quand le modèle est prêt.
    const fichiersFinis = [...aTelecharger].every(([c, o]) => c === 'ort' || (recus.get(c) ?? 0) >= o);
    progression(fin * 0.95 * (n / total), fichiersFinis ? PREPARER : `Je télécharge le module sous-titres… ${mo(n)} / ${mo(total)} Mo`);
  };
  const asr = await pipeline('automatic-speech-recognition', MODELE, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: suivre as never,
  });
  corrigerTempsWhisper(asr);
  await oublierAnciensOrt();
  progression(fin, PREPARER);
  return asr;
}

interface MorceauWhisper {
  text: string;
  timestamp: [number, number | null];
}

/** Écoute les plages du fichier, fenêtre par fenêtre, et renvoie les mots bruts en temps source. */
async function transcrire(fichier: File, plagesDemandees: Plage[], langue: string): Promise<MotBrut[]> {
  const son = await ouvrirSon(fichier);
  if (!son) throw new ErreurArko('Cette vidéo n\'a pas de son : il n\'y a rien à sous-titrer.', 'pas_de_son');
  try {
    const plages = plagesDemandees
      .map((p) => ({ de: Math.max(0, p.de), a: Math.min(son.duree, p.a) }))
      .filter((p) => p.a - p.de > 0.05);
    const total = dureeTotale(plages);
    if (total <= 0) throw new ErreurArko('Il n\'y a pas de son dans les morceaux gardés.', 'pas_de_son');
    const asr = await chargerModele(PART_PREPARATION, PART_TELECHARGEMENT);
    const debut = dernierP;
    const mots: MotBrut[] = [];
    let fait = 0;
    let i = 0;
    let curseur = plages[0]!.de;
    while (i < plages.length) {
      progression(debut + (1 - debut) * (fait / total), 'J\'écoute ta vidéo…');
      const fenetre = await remplirFenetre(son, plages, i, curseur);
      i = fenetre.i;
      curseur = fenetre.curseur;
      if (fenetre.pieces.length === 0) break;
      fait += fenetre.pieces.reduce((s, x) => s + (x.a - x.de), 0);
      // Langue « auto » : on ne donne pas `language`, Whisper la détecte.
      const options = { return_timestamps: 'word' as const, chunk_length_s: 30, stride_length_s: 5 };
      const sortie = await asr(fenetre.pcm, langue === 'auto' ? options : { ...options, language: langue });
      const morceaux = ((Array.isArray(sortie) ? sortie[0] : sortie)?.chunks ?? []) as MorceauWhisper[];
      for (const m of morceaux) {
        const [t0, t1Brut] = m.timestamp;
        const t1 = t1Brut ?? t0 + 0.3;
        const temps = motEnSource(t0, t1, fenetre.pieces);
        if (temps) mots.push({ txt: m.text, ...temps, niveau: niveau(fenetre.pcm, t0, t1) });
      }
    }
    progression(1, 'Sous-titres prêts.');
    return mots;
  } finally {
    son.fermer();
  }
}

/** Erreur lisible par l'utilisateur, avec un code stable pour l'interface. */
function versErreur(e: unknown): { message: string; code: string } {
  if (e instanceof ErreurArko) return { message: e.message, code: e.code };
  const texte = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/quota/i.test(texte)) return { message: 'Il n\'y a plus assez de place sur ton téléphone pour le module sous-titres.', code: 'place' };
  if (/fetch|network|réseau|Failed to load|404|403|500/i.test(texte)) {
    return { message: 'Le téléchargement du module sous-titres a échoué. Vérifie ta connexion internet et réessaie.', code: 'reseau' };
  }
  return { message: 'Le module sous-titres n\'a pas pu démarrer. Redémarre Chrome et réessaie.', code: 'module' };
}

self.onmessage = async (ev: MessageEvent<VersWorker>) => {
  const demande = ev.data;
  try {
    if (demande.type === 'telecharger') {
      await chargerModele(1);
      progression(1, 'Le module sous-titres est prêt.');
      envoyer({ type: 'fini', mots: [] });
    } else {
      envoyer({ type: 'fini', mots: await transcrire(demande.fichier, demande.plages, demande.langue) });
    }
  } catch (e) {
    console.warn('[sous-titres]', e);
    envoyer({ type: 'erreur', ...versErreur(e) });
  }
};
