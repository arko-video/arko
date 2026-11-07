// Côté page des « sous-titres précis » (dev-mots-2) : état du modèle (Whisper small), et réécoute des tours de la voix
// faible des passages gardés par le Worker Whisper small (worker-precis.ts), lancé pour UNE demande puis arrêté
// (terminate) à la fin ou dès qu'on annule. Même protocole que Whisper base (messages.ts, comme pilote.ts).

import { ErreurArko } from '../moteur/erreurs';
import type { SourceOuverte } from '../moteur/api';
import type { Mot } from '../recette/types';
import { TAILLE_PRECIS } from './config-precis';
import { appliquerCorrections } from './corrections';
import type { DepuisWorker, MotBrut, Plage, VersWorker } from './messages';
import { nettoyer } from './nettoyage';
import type { OptionsPilote } from './pilote';
import { fichiersPrecisManquants } from './precis-cache';

/** Le module est-il entièrement sur l'appareil ? `octets` = ce qu'il reste à télécharger (0 s'il est là). */
export async function modulePrecis(): Promise<{ present: boolean; octets: number }> {
  const manquants = await fichiersPrecisManquants();
  return { present: manquants.length === 0, octets: manquants.length === 0 ? 0 : manquants.reduce((s, f) => s + f.octets, 0) };
}

/** Vérifie la place (ce qui manque + 20 %) et demande au navigateur de garder le module. */
async function preparerPlace(octets: number) {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Pas grave : le module sera retéléchargé si Chrome l'efface.
  }
  let libre: number | null = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota !== undefined && e.usage !== undefined) libre = e.quota - e.usage;
  } catch {
    libre = null;
  }
  if (libre !== null && libre < octets * 1.2) throw new ErreurArko(`Il faut environ ${Math.ceil((octets * 1.2) / 1e6)} Mo de libre pour les sous-titres précis.`, 'place');
}

/** Envoie la demande à un Worker « précis » neuf et attend ses mots bruts (comme pilote.ts → executer). */
export function executerPrecis(demande: VersWorker, options: OptionsPilote = {}): Promise<MotBrut[]> {
  const { signal, surProgression } = options;
  if (signal?.aborted) return Promise.reject(new ErreurArko('Sous-titres précis annulés.', 'annule'));
  return new Promise<MotBrut[]>((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-precis.ts', import.meta.url), { type: 'module', name: 'arko-sous-titres-precis' });
    } catch {
      rejeter(new ErreurArko('Impossible de démarrer les sous-titres précis dans ce navigateur.', 'module'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', annuler);
    };
    const annuler = () => {
      if (termine) return;
      finir();
      rejeter(new ErreurArko('Sous-titres précis annulés.', 'annule'));
    };
    signal?.addEventListener('abort', annuler);
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (termine) return;
      finir();
      rejeter(new ErreurArko('Les sous-titres précis ont planté.', 'module'));
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

/**
 * Réécoute `plages` (temps source, les tours de la voix faible) avec Whisper small, chaque tour remonté (gain) et les
 * tours collés dans des fenêtres de 28 s, et rend les mots nettoyés comme ceux de Whisper base (nettoyer +
 * corrections). Télécharge le modèle s'il manque : à n'appeler qu'APRÈS l'accord de l'utilisateur. Lève une
 * ErreurArko (annule, reseau, place, module).
 */
export async function transcrirePrecis(source: SourceOuverte, plages: readonly Plage[], options: OptionsPilote & { langue?: string } = {}): Promise<Mot[]> {
  if (plages.length === 0) return [];
  const { octets, present } = await modulePrecis();
  if (!present) await preparerPlace(octets || TAILLE_PRECIS);
  const langue = options.langue ?? 'fr';
  const bruts = await executerPrecis({ type: 'transcrire', fichier: source.fichier, plages: plages.map((p) => ({ de: p.de, a: p.a })), langue, gain: true }, options);
  return appliquerCorrections(nettoyer(bruts, langue));
}
