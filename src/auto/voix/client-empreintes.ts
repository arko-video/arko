// Empreinte de voix CAM++ (dev-voix), NAVIGATEUR : 2ᵉ passe FACULTATIVE sur quelques morceaux de parole (≈ 150 +
// les ambigus : morceauxAEmpreinter), dans un Worker neuf (« arko-empreintes », worker-empreintes.ts) : lecture des
// morceaux à 16 kHz, fbank 80 « Kaldi » (fbank.ts), modèle (28 Mo, téléchargé SEULEMENT après le geste de
// l'utilisateur sur la revue), empreintes normées. Jamais lancée d'office : la chaîne la demande (besoinsChaine) et
// mesurerPourBestOf ne l'appelle que si le modèle est déjà sur l'appareil.
// Le « lanceur » est injectable (definirLanceurEmpreintes) : le banc y branche onnxruntime-node ; sinon le Worker
// (le faux Worker du banc répond aussi, même protocole).

import { ErreurArko } from '../../moteur/erreurs';
import type { SourceOuverte } from '../../moteur/api';
import type { OptionsTache, PlageTemps } from '../types';
import type { DemandeEmpreintesNeurales, DepuisWorkerEmpreintesNeurales, EmpreintesNeurales } from '../types-v4';

/** Ce que rend un lanceur : n × dim valeurs (dans l'ordre des morceaux), chaque empreinte normée. */
export type ResultatLanceur = Omit<Extract<DepuisWorkerEmpreintesNeurales, { type: 'fini' }>, 'type'>;

/** Calcule les empreintes d'une demande (Worker du navigateur, ou onnxruntime-node dans le banc). */
export type LanceurEmpreintes = (d: DemandeEmpreintesNeurales, o: OptionsTache) => Promise<ResultatLanceur>;

function annule() {
  return new ErreurArko('Analyse annulée.', 'annule');
}

/** Le lanceur du navigateur : un Worker neuf, arrêté net à la fin (ou à l'annulation). */
export const lanceurWorker: LanceurEmpreintes = (demande, o) => {
  const { signal, surProgression } = o;
  if (signal?.aborted) return Promise.reject(annule());
  return new Promise((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-empreintes.ts', import.meta.url), { type: 'module', name: 'arko-empreintes' });
    } catch {
      rejeter(new ErreurArko('Impossible d\'écouter la vidéo dans ce navigateur. Mets Chrome à jour.', 'analyse'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', arreter);
    };
    const arreter = () => {
      if (termine) return;
      finir();
      rejeter(annule());
    };
    signal?.addEventListener('abort', arreter);
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (termine) return;
      finir();
      rejeter(new ErreurArko('L\'empreinte de voix a planté. Réessaie.', 'analyse'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorkerEmpreintesNeurales>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') surProgression?.(m.p, `J'écoute les voix de plus près… ${Math.round(m.p * 100)} %`);
      else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre({ modele: m.modele, dim: m.dim, v: m.v });
      }
    };
    worker.postMessage(demande);
  });
};

let lanceur: LanceurEmpreintes = lanceurWorker;

/** Change le lanceur (banc : onnxruntime-node) ; null = le Worker du navigateur. */
export function definirLanceurEmpreintes(l: LanceurEmpreintes | null): void {
  lanceur = l ?? lanceurWorker;
}

/** Empreintes des morceaux (dans l'ordre donné). Lève ErreurArko 'module' si le modèle n'est pas sur l'appareil. */
export async function calculerEmpreintesNeurales(source: SourceOuverte, morceaux: readonly PlageTemps[], o: OptionsTache = {}): Promise<EmpreintesNeurales> {
  if (o.signal?.aborted) throw annule();
  const plages = morceaux.filter((p) => p.a > p.de).map((p) => ({ de: p.de, a: p.a }));
  if (plages.length === 0) return { modele: 'campplus-zh-en', morceaux: [] };
  const demande: DemandeEmpreintesNeurales = { fichier: source.fichier, duree: source.infos.duree, morceaux: plages };
  const r = await lanceur(demande, o);
  if (r.dim <= 0 || r.v.length !== r.dim * plages.length) throw new ErreurArko('L\'empreinte de voix n\'a pas rendu le bon nombre de morceaux.', 'analyse');
  return { modele: r.modele, morceaux: plages.map((p, i) => ({ de: p.de, a: p.a, v: r.v.slice(i * r.dim, (i + 1) * r.dim) })) };
}
