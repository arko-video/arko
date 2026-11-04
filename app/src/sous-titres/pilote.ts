// Côté page : lance le Worker Whisper pour UNE demande, relaie la progression,
// et l'arrête (terminate) à la fin ou dès qu'on annule.

import { ErreurArko } from '../moteur/erreurs';
import type { DepuisWorker, MotBrut, VersWorker } from './messages';

export interface OptionsPilote {
  surProgression?: (p: number, etape: string) => void;
  signal?: AbortSignal;
}

function erreurAnnule() {
  return new ErreurArko('Sous-titres annulés.', 'annule');
}

/** Envoie la demande à un Worker neuf et attend sa réponse (les mots bruts). */
export function executer(demande: VersWorker, options: OptionsPilote = {}): Promise<MotBrut[]> {
  const { signal, surProgression } = options;
  if (signal?.aborted) return Promise.reject(erreurAnnule());
  return new Promise<MotBrut[]>((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'arko-sous-titres' });
    } catch {
      rejeter(new ErreurArko('Impossible de démarrer les sous-titres dans ce navigateur. Mets Chrome à jour.', 'module'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', annuler);
    };
    // Annuler = arrêter net le Worker (Whisper ne sait pas s'interrompre tout seul).
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
      rejeter(new ErreurArko('Le module sous-titres a planté. Réessaie ; si ça recommence, redémarre Chrome.', 'module'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorker>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') surProgression?.(m.p, m.etape);
      else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre(m.mots);
      }
    };
    worker.postMessage(demande);
  });
}
