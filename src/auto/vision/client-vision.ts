// « Arko regarde l'image », NAVIGATEUR : lance le Worker « arko-regard » (worker-vision.ts) et garde le résultat
// sur l'appareil (IndexedDB, clé `arko.regard.<emp>`) : une 2ᵉ analyse de la même vidéo ne la regarde pas deux fois.
// Le modèle (89 Mo) n'est téléchargé que par regarderPourMontage (ui), après le geste de l'utilisateur.

import { get, set } from 'idb-keyval';
import { ErreurArko } from '../../moteur/erreurs';
import type { SourceOuverte } from '../../moteur/api';
import type { OptionsTache } from '../types';
import type { DemandeRegard, DepuisWorkerRegard } from './messages-vision';
import type { ImageRegardee } from './regard';

const VERSION = 1;
const cle = (emp: string) => `arko.regard.${emp}`;

function annule() {
  return new ErreurArko('Analyse annulée.', 'annule');
}

function lancer(demande: DemandeRegard, o: OptionsTache): Promise<ImageRegardee[]> {
  const { signal, surProgression } = o;
  if (signal?.aborted) return Promise.reject(annule());
  return new Promise((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-vision.ts', import.meta.url), { type: 'module', name: 'arko-regard' });
    } catch {
      rejeter(new ErreurArko('Impossible de regarder la vidéo dans ce navigateur. Mets Chrome à jour.', 'analyse'));
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
      rejeter(new ErreurArko('Le regard sur l\'image a planté. Réessaie.', 'analyse'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorkerRegard>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') surProgression?.(m.p, `Je regarde l'image (menus, chargements)… ${Math.round(m.p * 100)} %`);
      else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre(m.images);
      }
    };
    worker.postMessage(demande);
  });
}

/** Les images regardées de la vidéo (gardées sur l'appareil). Lève ErreurArko 'module' si le modèle manque. */
export async function regarderVideo(source: SourceOuverte, emp: string, o: OptionsTache = {}): Promise<ImageRegardee[]> {
  try {
    const g = (await get(cle(emp))) as { v?: number; images?: ImageRegardee[] } | undefined;
    if (g?.v === VERSION && Array.isArray(g.images)) return g.images;
  } catch {
    /* on regarde à nouveau */
  }
  const images = await lancer({ fichier: source.fichier, duree: source.infos.duree }, o);
  try {
    await set(cle(emp), { v: VERSION, images });
  } catch {
    /* stockage plein : on regardera à nouveau */
  }
  return images;
}
