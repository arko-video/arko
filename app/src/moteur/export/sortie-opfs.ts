// Écriture du MP4 SANS le garder en mémoire : fichier OPFS ouvert en accès synchrone (dans le Worker),
// enveloppé dans un WritableStream pour la StreamTarget de Mediabunny. On garde les 3 derniers exports.
// Repli si l'OPFS manque : BufferTarget (en mémoire, réservé aux petits exports).

import { BufferTarget, StreamTarget, type StreamTargetChunk, type Target } from 'mediabunny';
import { ErreurArko } from '../erreurs';

const DOSSIER = 'exports';
const GARDER = 3;
const TAILLE_MORCEAU = 4 * 1024 * 1024;
/** Sans OPFS, l'export est gardé en mémoire : seulement pour les clips courts. */
export const DUREE_MAX_MEMOIRE = 60;

/** Poignée d'accès synchrone OPFS (types minimaux, disponibles seulement dans un Worker). */
interface AccesSynchrone {
  write(data: BufferSource, options?: { at?: number }): number;
  truncate(taille: number): void;
  flush(): void;
  close(): void;
}
type FichierOpfs = FileSystemFileHandle & { createSyncAccessHandle(): Promise<AccesSynchrone> };

export interface Sortie {
  target: Target;
  /** true si le fichier est écrit sur le disque (OPFS). */
  surDisque: boolean;
  /** Fichier final, une fois l'export finalisé. */
  fichierFinal(): Promise<File>;
  /** Abandon : ferme et efface le fichier. */
  abandonner(): Promise<void>;
}

/** Nom du fichier exporté : arko-AAAAMMJJ-HHMMSS.mp4 (heure locale). */
export function nomExport(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `arko-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.mp4`;
}

/** Sortie sur le disque (OPFS) ; repli en mémoire seulement si la vidéo dure 60 s ou moins. */
export async function creerSortie(nom: string, duree: number): Promise<Sortie> {
  try {
    return await sortieOpfs(nom);
  } catch {
    if (duree > DUREE_MAX_MEMOIRE) {
      throw new ErreurArko(
        `Ton navigateur ne me laisse pas écrire la vidéo sur le téléphone : je ne peux exporter que des clips de ${DUREE_MAX_MEMOIRE} s ou moins. Raccourcis ton montage, ou mets Chrome à jour.`,
        'stockage',
      );
    }
    return sortieMemoire(nom);
  }
}

/**
 * Efface un export inachevé depuis la PAGE (après l'arrêt brutal du Worker). Le fichier reste verrouillé
 * tant que le Worker n'est pas vraiment arrêté : on réessaie, ce qui sert aussi à attendre cet arrêt.
 */
export async function effacerExport(nom: string, essais = 20, pauseMs = 100): Promise<void> {
  let dossier: FileSystemDirectoryHandle;
  try {
    dossier = await (await navigator.storage.getDirectory()).getDirectoryHandle(DOSSIER);
  } catch {
    return; // pas d'OPFS ou dossier absent : rien à effacer
  }
  for (let i = 0; i < essais; i++) {
    try {
      await dossier.removeEntry(nom);
      return;
    } catch (e) {
      if ((e as DOMException | undefined)?.name === 'NotFoundError') return;
      await new Promise((ok) => setTimeout(ok, pauseMs));
    }
  }
}

async function sortieOpfs(nom: string): Promise<Sortie> {
  const racine = await navigator.storage.getDirectory();
  const dossier = await racine.getDirectoryHandle(DOSSIER, { create: true });
  await nettoyer(dossier);
  const poignee = (await dossier.getFileHandle(nom, { create: true })) as FichierOpfs;
  if (typeof poignee.createSyncAccessHandle !== 'function') throw new Error('Accès synchrone OPFS indisponible');
  const acces = await poignee.createSyncAccessHandle();
  acces.truncate(0);
  let ouvert = true;
  const fermer = () => {
    if (!ouvert) return;
    ouvert = false;
    acces.flush();
    acces.close();
  };
  const flux = new WritableStream<StreamTargetChunk>({
    write(morceau) {
      acces.write(morceau.data, { at: morceau.position });
    },
    close: fermer,
    abort: fermer,
  });
  return {
    target: new StreamTarget(flux, { chunked: true, chunkSize: TAILLE_MORCEAU }),
    surDisque: true,
    async fichierFinal() {
      fermer();
      const f = await poignee.getFile();
      return new File([f], nom, { type: 'video/mp4' });
    },
    async abandonner() {
      try {
        fermer();
      } catch {
        /* déjà fermé */
      }
      await dossier.removeEntry(nom).catch(() => undefined);
    },
  };
}

function sortieMemoire(nom: string): Sortie {
  const target = new BufferTarget();
  return {
    target,
    surDisque: false,
    async fichierFinal() {
      if (!target.buffer) throw new Error('Export incomplet');
      return new File([target.buffer], nom, { type: 'video/mp4' });
    },
    async abandonner() {
      /* rien à effacer */
    },
  };
}

/** Ne garde que les (GARDER − 1) exports les plus récents, pour faire de la place au nouveau. */
async function nettoyer(dossier: FileSystemDirectoryHandle) {
  const fichiers: string[] = [];
  const iterable = dossier as unknown as { keys(): AsyncIterable<string> };
  for await (const nom of iterable.keys()) if (nom.endsWith('.mp4')) fichiers.push(nom);
  fichiers.sort(); // le nom contient la date : ordre alphabétique = ordre chronologique
  for (const nom of fichiers.slice(0, Math.max(0, fichiers.length - (GARDER - 1)))) {
    await dossier.removeEntry(nom).catch(() => undefined);
  }
}
