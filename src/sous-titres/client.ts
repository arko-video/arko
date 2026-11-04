// Côté page du module sous-titres : état du module, téléchargement, transcription d'une recette.
// Le travail lourd se fait dans le Worker Whisper (worker.ts), lancé par pilote.ts.

import { ErreurArko } from '../moteur/erreurs';
import type { ModuleSousTitres, OptionsSousTitres, SourceOuverte } from '../moteur/api';
import type { Mot, Recette } from '../recette/types';
import { fichiersManquants } from './cache-module';
import { TAILLE_MODULE } from './config';
import { appliquerCorrections } from './corrections';
import { plagesAEcouter, sourceDesSousTitres } from './fenetres';
import { nettoyer } from './nettoyage';
import { executer } from './pilote';

/** Tous les fichiers du modèle (et le WASM d'onnxruntime) sont-ils dans le Cache Storage de transformers.js ? */
async function moduleEnCache(): Promise<boolean> {
  return (await fichiersManquants()).length === 0;
}

export async function moduleSousTitres(): Promise<ModuleSousTitres> {
  return { present: await moduleEnCache(), tailleOctets: TAILLE_MODULE };
}

/** Demande au navigateur de ne pas effacer le module quand la place manque (réponse ignorée). */
async function demanderPersistance() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Pas grave : le module sera retéléchargé si Chrome l'efface.
  }
}

/** Vérifie qu'il reste assez de place (taille du module + 20 % de marge). */
async function verifierPlace() {
  let libre: number | null = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota !== undefined && e.usage !== undefined) libre = e.quota - e.usage;
  } catch {
    libre = null;
  }
  const besoin = TAILLE_MODULE * 1.2;
  if (libre !== null && libre < besoin) {
    throw new ErreurArko(
      `Il faut environ ${Math.ceil(besoin / 1e6)} Mo de libre pour le module sous-titres. Libère de la place sur ton téléphone et réessaie.`,
      'place',
    );
  }
}

export async function telechargerModuleSousTitres(options: OptionsSousTitres = {}): Promise<void> {
  if (await moduleEnCache()) return;
  await demanderPersistance();
  await verifierPlace();
  await executer({ type: 'telecharger' }, options);
}

export async function transcrireRecette(recette: Recette, sources: SourceOuverte[], options: OptionsSousTitres = {}): Promise<Mot[]> {
  const src = sourceDesSousTitres(recette);
  const source = sources.find((s) => s.infos.id === src);
  if (!source) throw new ErreurArko('La vidéo d\'origine n\'est plus ouverte. Choisis-la à nouveau.', 'source');
  const plages = plagesAEcouter(recette, src);
  if (plages.length === 0) throw new ErreurArko('Il n\'y a aucun morceau gardé à sous-titrer.', 'pas_de_son');
  // Le module manque : le Worker va le télécharger, on prépare la place d'abord.
  if (!(await moduleEnCache())) {
    await demanderPersistance();
    await verifierPlace();
  }
  const langue = options.langue ?? 'fr';
  const bruts = await executer({ type: 'transcrire', fichier: source.fichier, plages, langue }, options);
  return appliquerCorrections(nettoyer(bruts, langue));
}
