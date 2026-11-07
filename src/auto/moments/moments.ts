// Étape « moments » de la chaîne v4 (dev-moments), PURE : rires, cris, réactions, phrases fortes, sons forts.
// Les règles sont dans regles.ts (calibrées sur la vraie session : « voix sans mots », niveau et hauteur relatifs à
// SA voix, haché comme un rire, réaction après un pic) ; la hauteur de la voix vient de hauteur.ts (passe du son).
// Aucun modèle de sons (CED-tiny et YAMNet : 0 rire trouvé sur 9). Le détecteur d'avant (ia/rires.ts = débit des
// syllabes : 378 « rires » sur la session) n'est plus cru. Signatures GELÉES (types-v4.ts). Une erreur ici fait
// reprendre l'étape d'avant par la chaîne (chaine-best-of.ts → appeler).

import type { PlageSignal, SignauxSource } from '../types';
import type { EntreeMoments, MomentV4 } from '../types-v4';
import { trouverMoments } from './regles';

export function trouverMomentsV4(e: EntreeMoments): MomentV4[] {
  return trouverMoments(e);
}

const enPlage = (m: MomentV4): PlageSignal => ({ de: m.de, a: m.a, t: m.t, force: m.force });

/**
 * Les signaux d'avant dont les rires et les cris sont remplacés par ceux des moments : tout le code d'avant qui lit
 * `signaux.rires` / `signaux.cris` (punchlines, zooms, émotions des persos, notation) voit les moments v4. Pure.
 */
export function signauxAvecMoments(s: SignauxSource, moments: readonly MomentV4[]): SignauxSource {
  return {
    ...s,
    rires: moments.filter((m) => m.genre === 'rire' || m.genre === 'fouRire').map(enPlage),
    cris: moments.filter((m) => m.genre === 'cri').map(enPlage),
  };
}
