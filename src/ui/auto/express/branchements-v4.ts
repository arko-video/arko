// Best-of v4 (dev-ui) — les fonctions des AUTRES devs dont l'interface a besoin, à BRANCHER par l'intégrateur quand
// elles existent (contrat §4.9 « Consomme »). Tant qu'une fonction vaut null, le bouton qui l'utilise est caché :
// l'interface ne fait jamais elle-même de logique de montage (tout passe par la chaîne et src/recette/operations*.ts).
//
// Branchement attendu (une seule fois, au démarrage, par exemple dans best-of-v4.ts) :
//   brancherV4({
//     ajusterSequence,                                   // src/auto/derush/ajuster.ts (dev-scenes)
//     emotionDuPassage,                                  // src/recette/operations-chibis.ts (dev-persos)
//     recouperBestOf: async (r, niveau) => …,            // lireMesuresGardees (dev-vad) + recouperMontage (dev-coupes)
//     morceauxPassage: async (r, p) => …,                // lireMesuresGardees (dev-vad) + morceauxDuPassage (dev-coupes)
//   });
// Aucun import ici (sauf des types) : ce fichier se charge aussi dans les tests (Node).

import type { Emotion } from '../../../chibis/catalogue';
import type { PlageTemps } from '../../../auto/types';
import type { EntreeSequences, SequenceV4 } from '../../../auto/types-v4';
import type { Mot, NiveauBlancs, PassageNote, Recette, Sec } from '../../../recette/types';

export interface BranchementsV4 {
  /**
   * dev-scenes, `ajusterSequence(s, e, cote, sens)` (pur) : « Plus de contexte / Moins » sur la revue. Convention de
   * l'écran : sens = +1 → UNE PHRASE DE PLUS de ce côté (début plus tôt, ou fin plus tard) ; −1 → une phrase de moins.
   * Rend la séquence (même objet si rien ne bouge) avec `duree` APRÈS coupes recalculée par `e.dureeDe`.
   */
  ajusterSequence: ((s: SequenceV4, e: EntreeSequences, cote: 'debut' | 'fin', sens: 1 | -1) => SequenceV4) | null;
  /** dev-persos, `emotionDuPassage(r, ts, fin, emo, src?)` : l'émotion du perso pendant une phrase (« parle » = d'office). */
  emotionDuPassage: ((r: Recette, ts: Sec, fin: Sec, emo: Emotion, src?: string) => Recette) | null;
  /**
   * Habiller → Couper : recoupe un Best-of en Serré / Normal / Large comme le Best-of (mesures gardées de dev-vad +
   * `recouperMontage` de dev-coupes), sans réécouter. Rend la nouvelle recette, ou null si les mesures manquent.
   */
  recouperBestOf: ((r: Recette, niveau: NiveauBlancs) => Promise<Recette | null>) | null;
  /**
   * Passages pas retenus → Ajouter : les morceaux du passage coupés comme le Best-of (`morceauxDuPassage`), ou null
   * si les mesures manquent (on garde alors l'ajout d'avant, qui coupe avec Couper les blancs).
   */
  morceauxPassage: ((r: Recette, p: PassageNote, mots?: readonly Mot[]) => Promise<PlageTemps[] | null>) | null;
}

export const BRANCHEMENTS: BranchementsV4 = {
  ajusterSequence: null,
  emotionDuPassage: null,
  recouperBestOf: null,
  morceauxPassage: null,
};

/** Branche (ou débranche avec null) des fonctions des autres devs. */
export function brancherV4(b: Partial<BranchementsV4>) {
  Object.assign(BRANCHEMENTS, b);
}
