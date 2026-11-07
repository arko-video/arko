// Données communes des tests de « Insérer ici » (dev 2) : une recette habillée dans tous les genres de champs.
import { normaliserRecette } from '../../../recette/normaliser';
import type { ElementInsere, Recette, Source } from '../../../recette/types';
export const v: Source = {
  id: 's1',
  nom: 'v.mp4',
  taille: 1,
  emp: 'e1',
  duree: 120,
  type: 'video',
  l: 1920,
  h: 1080,
  pistes: 2,
};
export const a1: Source = { id: 'a1', nom: 'musique.mp3', taille: 1, emp: 'ea', duree: 200, type: 'audio' };
export const b1: Source = {
  id: 'b1',
  nom: 'chat.mp4',
  taille: 1,
  emp: 'eb',
  duree: 6,
  type: 'video',
  l: 1280,
  h: 720,
  bib: 'v123',
};
export const carton: ElementInsere = { type: 'carton', txt: 'Plus tard…' };

/** 2 plans : [0 ; 10] puis [20 ; 30] → coupe à 10 s, durée 20 s. Habillage dans tous les genres de champs. */
export const base = (): Recette =>
  normaliserRecette(
    {
      destination: 'youtube',
      plans: [
        { de: 0, a: 10 },
        { de: 20, a: 30, trans: 'flash' },
      ],
      textes: [
        { txt: 'Avant', t: 1, dur: 2 },
        { txt: 'Après', t: 6, dur: 2 },
        { txt: 'Fin', t: 15, dur: 2 },
      ],
      sons: [
        { id: 'impact.boom', t: 7 },
        { id: 'impact.boom', ts: 25 },
        { id: 'impact.boom', t: 2 },
      ],
      zooms: [
        { t: 8, dur: 1 },
        { ts: 22, dur: 1 },
      ],
      sousTitres: {
        mots: [
          ['salut', 4, 4.5],
          ['ça', 21, 21.3],
          ['va', 26, 26.4],
        ],
      },
      chapitres: [
        { t: 0, nom: 'Début' },
        { t: 6, nom: 'Milieu' },
        { t: 12, nom: 'Suite' },
      ],
      musique: { morceaux: [{ src: 'a1', t: 0, fin: 18 }] },
      incrustations: [{ src: 'b1', t: 9, de: 0, a: 2 }],
      guide: { src: 'a1', t: 0 },
    },
    { sources: [v, a1, b1] },
  );
