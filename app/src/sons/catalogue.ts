// Catalogue des effets sonores d'Arko (phase 3). Tous les sons sont FABRIQUÉS par le code d'Arko
// (synthèse déterministe, src/sons/synthese/) : aucun fichier, aucun enregistrement copié → CC0.
// L'interface et le normaliseur lisent CATALOGUE. Fabrication des sons : src/sons/synthese/index.ts.

export type FamilleSon = 'impact' | 'whoosh' | 'meme' | 'comedie' | 'interface' | 'tension' | 'jeu';

export interface SonCatalogue {
  /** Identifiant stable « famille.nom » (ex. "impact.boom"). */
  id: string;
  /** Nom affiché en français (« Boom »). */
  nom: string;
  famille: FamilleSon;
  /** Durée en secondes. */
  duree: number;
  licence: 'CC0';
  /** Version du dessin du son (change si on retouche le son : invalide le cache). */
  version: number;
}

/** Familles dans l'ordre d'affichage, avec leur nom français. */
export const FAMILLES: readonly { id: FamilleSon; nom: string }[] = [
  { id: 'impact', nom: 'Impacts' },
  { id: 'whoosh', nom: 'Whoosh' },
  { id: 'meme', nom: 'Mèmes' },
  { id: 'comedie', nom: 'Comédie' },
  { id: 'tension', nom: 'Tension' },
  { id: 'jeu', nom: 'Jeu' },
  { id: 'interface', nom: 'Interface' },
];

/** Raccourci pour écrire le catalogue : licence CC0 ; version 2 = niveau réglé en sonie (QA I-2). */
function son(id: string, nom: string, duree: number): SonCatalogue {
  const famille = id.split('.')[0] as FamilleSon;
  return { id, nom, famille, duree, licence: 'CC0', version: 2 };
}

/** Les 20 sons d'Arko. La durée doit être celle du son fabriqué (vérifié par les tests). */
export const CATALOGUE: readonly SonCatalogue[] = [
  son('impact.boom', 'Boom', 1.5),
  son('impact.meme', 'Boom mème', 2.2),
  son('impact.claque', 'Claque', 0.45),
  son('impact.bass-drop', 'Bass drop', 2.5),
  son('whoosh.rapide', 'Whoosh rapide', 0.6),
  son('whoosh.montant', 'Whoosh montant', 1.6),
  son('meme.klaxon', 'Klaxon', 1.7),
  son('meme.disque-raye', 'Disque rayé', 0.7),
  son('meme.tape-stop', 'Tape stop', 1.4),
  son('meme.photo', 'Photo', 0.4),
  son('comedie.trombone-triste', 'Trombone triste', 2.9),
  son('comedie.criquets', 'Criquets', 2.6),
  son('comedie.ba-dum-tss', 'Ba-dum-tss', 1.8),
  son('interface.ding', 'Ding', 1.3),
  son('interface.erreur', 'Erreur', 0.48),
  son('tension.riser', 'Riser', 3),
  son('tension.coeur', 'Cœur', 2.4),
  son('jeu.piece', 'Pièce', 0.55),
  son('jeu.degat', 'Dégât', 0.4),
  son('jeu.bonus', 'Bonus', 0.75),
];

/** Identifiants de tous les sons du catalogue. */
export function catalogueIds(): string[] {
  return CATALOGUE.map((s) => s.id);
}

export function trouverSon(id: string): SonCatalogue | undefined {
  return CATALOGUE.find((s) => s.id === id);
}
