// D. Choix du rendu d'un style (dev 3) : les 3 styles d'origine (rendu-classique.ts) et les 6 styles « Persos »
// (persos/rendus-persos.ts). Le style Pixel a son propre rendu sur une grille (persos/pixel.ts), passé au pinceau
// par persos/dessin-perso.ts ; ici il retombe sur le rendu « dessin animé » (jamais utilisé tel quel).

import type { StyleChibi } from './catalogue';
import type { Rendu } from './pinceau';
import { RenduClassique } from './rendu-classique';
import { RenduPerso } from './persos/rendus-persos';

const RENDUS = new Map<string, Rendu>();

export function renduPour(style: StyleChibi): Rendu {
  let r = RENDUS.get(style);
  if (r) return r;
  if (style === 'feutre' || style === 'crayon' || style === 'paint') r = new RenduClassique(style);
  else if (style === 'bd' || style === 'rate' || style === 'mascotte' || style === 'papier' || style === 'cartoon') r = new RenduPerso(style);
  else if (style === 'pixel') r = new RenduPerso('cartoon');
  else r = new RenduClassique('feutre'); // style inconnu : comme le feutre
  RENDUS.set(style, r);
  return r;
}
