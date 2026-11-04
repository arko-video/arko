// Sons importés et son guide gardés sur l'appareil (stockage du moteur), pour reprendre un projet
// sans re-choisir ses sons. Un son introuvable est retiré de la recette, avec un message.

import { rouvrirSourcesAudio, sauverFichierAudio, type SourceOuverte } from '../moteur/api';
import { definirGuide, supprimerSon } from '../recette/operations';
import type { Recette } from '../recette/types';
import { T } from '../textes-fr';

/** Garde le fichier d'un son importé (ou du son guide) sur l'appareil. Sans attendre : un échec n'empêche rien. */
export function garderFichier(s: SourceOuverte) {
  sauverFichierAudio(s).catch((e) => console.error('Son non gardé', e));
}

/** Retire de la recette les sons et le son guide dont la source fait partie de `ids`. Pure. */
export function retirerSonsManquants(r: Recette, ids: readonly string[]): Recette {
  let res = r;
  for (let i = res.sons.length - 1; i >= 0; i--) {
    const s = res.sons[i];
    if (s && ids.includes(s.id)) res = supprimerSon(res, i);
  }
  if (res.guide && ids.includes(res.guide.src)) res = definirGuide(res, null);
  return res;
}

/**
 * À la reprise : rouvre les sources audio gardées. Renvoie la recette sans les sons introuvables,
 * les sources rouvertes et un message par son retiré (« Le son « X » n'a pas été retrouvé : il est retiré »).
 */
export async function rouvrirSons(r: Recette): Promise<{ recette: Recette; audio: SourceOuverte[]; messages: string[] }> {
  if (!r.sources.some((s) => s.type === 'audio')) return { recette: r, audio: [], messages: [] };
  let ouvertes: SourceOuverte[] = [];
  let manquants: string[];
  try {
    const res = await rouvrirSourcesAudio(r);
    ouvertes = res.sources;
    manquants = res.manquants;
  } catch (e) {
    console.error(e);
    manquants = r.sources.filter((s) => s.type === 'audio').map((s) => s.id);
  }
  // Seuls les sons encore utilisés sont signalés (une source déjà retirée de tout son reste muette).
  const utilises = manquants.filter((id) => r.guide?.src === id || r.sons.some((s) => s.id === id));
  const messages = utilises.map((id) => T.sons.introuvable(r.sources.find((s) => s.id === id)?.nom ?? id));
  return { recette: retirerSonsManquants(r, manquants), audio: ouvertes, messages };
}
