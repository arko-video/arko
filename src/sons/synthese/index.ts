// Registre de la synthèse : id du catalogue → fonction qui fabrique le son.
// synthetiser(id) donne le son FINI (mono, 48 kHz, crête −1 dBFS, fondu de 2 ms à la fin).
// Utilisable dans la page et dans le Worker d'export (aucune API du navigateur).

import { boom, boomMeme, claque, bassDrop } from './sons-impact';
import { whooshRapide, whooshMontant, riser, coeur } from './sons-mouvement';
import { klaxon, disqueRaye, tapeStop, photo } from './sons-meme';
import { tromboneTriste, criquets, baDumTss } from './sons-comedie';
import { piece, degat, bonus, ding, erreur } from './sons-jeu';
import { finir } from './finition';

export { FREQ } from './briques';

/** Fabriques des sons bruts, rangées par id « famille.nom ». */
const FABRIQUES: Record<string, () => Float32Array> = {
  'impact.boom': boom,
  'impact.meme': boomMeme,
  'impact.claque': claque,
  'impact.bass-drop': bassDrop,
  'whoosh.rapide': whooshRapide,
  'whoosh.montant': whooshMontant,
  'meme.klaxon': klaxon,
  'meme.disque-raye': disqueRaye,
  'meme.tape-stop': tapeStop,
  'meme.photo': photo,
  'comedie.trombone-triste': tromboneTriste,
  'comedie.criquets': criquets,
  'comedie.ba-dum-tss': baDumTss,
  'interface.ding': ding,
  'interface.erreur': erreur,
  'tension.riser': riser,
  'tension.coeur': coeur,
  'jeu.piece': piece,
  'jeu.degat': degat,
  'jeu.bonus': bonus,
};

/** Ids de tous les sons que la synthèse sait fabriquer. */
export function idsSynthese(): string[] {
  return Object.keys(FABRIQUES);
}

/** Fabrique le son fini `id` (toujours le même pour un même id). Renvoie null si l'id est inconnu. */
export function synthetiser(id: string): Float32Array | null {
  if (!Object.hasOwn(FABRIQUES, id)) return null;
  return finir(FABRIQUES[id]());
}
