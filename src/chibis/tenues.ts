// D. Les 10 tenues des chibis (dev 3) : couleurs du corps (torse, bras, mains, jambes, chaussures) et détails dessinés
// par-dessus (capuche, poche, plaques d'armure, panneau d'astronaute, gilet, rayures, cravate, ceinture, étoiles…).
// Les chapeaux des tenues (cow-boy, sorcier, pirate) et le casque-bulle sont dans chapeaux.ts.

import type { DefinitionChibi } from '../recette/types';
import { assombrir, eclaircir, estClaire, melanger } from './couleurs';
import type { Pinceau, Pt } from './pinceau';
import { poignetSweat, sweatPapier } from './persos/perso-1-papier';
import { costumePapier } from './persos/perso-5-papier';

export interface Habits {
  torse: string;
  bras: string;
  mains: string;
  jambes: string;
  chaussures: string;
  /** Manches courtes : le bras est de la couleur de la peau sous l'épaule. */
  mancheCourte?: string;
  /** Robe longue (sorcier) : couvre les jambes. */
  robe?: boolean;
}

const JEAN = '#4A6FA5';

export function habits(def: DefinitionChibi): Habits {
  const c = def.couleur;
  const p = def.peau;
  switch (def.tenue) {
    case 'sweat': return { torse: c, bras: c, mains: p, jambes: '#3B4A6B', chaussures: '#F2F2F2' };
    case 'tshirt': return { torse: c, bras: p, mains: p, jambes: JEAN, chaussures: '#E8E8E8', mancheCourte: c };
    case 'armure': return { torse: '#AEB7C2', bras: '#AEB7C2', mains: '#7D8794', jambes: '#8E98A4', chaussures: '#59616B' };
    case 'astronaute': return { torse: '#F4F4F0', bras: '#F4F4F0', mains: '#C9CDD2', jambes: '#F4F4F0', chaussures: '#8F969E' };
    case 'cowboy': return { torse: '#F1E2C2', bras: '#F1E2C2', mains: p, jambes: JEAN, chaussures: '#7A4B2A' };
    case 'pyjama': return { torse: c, bras: c, mains: p, jambes: c, chaussures: '#F6C8DA' };
    case 'costume': return { torse: '#2D3142', bras: '#2D3142', mains: p, jambes: '#2D3142', chaussures: '#151515' };
    case 'ninja': return { torse: '#262A3A', bras: '#262A3A', mains: p, jambes: '#262A3A', chaussures: '#1A1C26' };
    case 'sorcier': return { torse: c, bras: c, mains: p, jambes: c, chaussures: '#5B3A29', robe: true };
    case 'pirate': return { torse: '#FBFBF5', bras: '#FBFBF5', mains: p, jambes: '#3A3A3A', chaussures: '#2A1C14' };
    case 'chemise': return { torse: c, bras: c, mains: p, jambes: '#3B3F4A', chaussures: '#4A3326' };
  }
}

/** Ce qui se dessine DERRIÈRE le corps (capuche, sac à dos d'astronaute). */
export function tenueArriere(pi: Pinceau, def: DefinitionChibi) {
  // Papier : capuche relevée (accessoire) → pas de deuxième capuche baissée derrière le cou.
  const capucheRelevee = pi.style === 'papier' && def.accessoire === 'capuche';
  if (def.tenue === 'sweat' && !capucheRelevee) pi.forme('capuche', [[-17, -40], [-12, -45], [0, -43], [12, -45], [17, -40], [10, -35], [-10, -35]], assombrir(def.couleur, 0.15));
  if (def.tenue === 'astronaute') pi.forme('sac', [[-17, -38], [17, -38], [18, -16], [-18, -16]], '#C9CDD2', { lisse: false });
  if (def.tenue === 'sorcier') pi.forme('cape', [[-14, -39], [14, -39], [22, -4], [-22, -4]], assombrir(def.couleur, 0.3), { lisse: false });
}

/** Détails dessinés sur le torse (après lui, avant les bras). */
export function tenueDevant(pi: Pinceau, def: DefinitionChibi) {
  const c = def.couleur;
  const encre = estClaire(c) ? '#2B2B30' : '#FFFFFF';
  switch (def.tenue) {
    case 'sweat':
      if (pi.style === 'papier') return sweatPapier(pi, c);
      pi.forme('poche', [[-9, -22], [9, -22], [11, -14], [-11, -14]], assombrir(c, 0.12), { epais: 0.6 });
      pi.ligne('cordon1', [[-3, -38], [-3.5, -31]], { epais: 0.5 });
      pi.ligne('cordon2', [[3, -38], [3.5, -31]], { epais: 0.5 });
      return;
    case 'tshirt':
      if (pi.style === 'papier') {
        // Papier (persos 2 et 4) : col rond côtelé, et une grande étoile collée un peu de travers (lisible en petit).
        pi.forme('colTshirt', [[-9.5, -39.6], [-4.5, -36.6], [0, -35.8], [4.5, -36.6], [9.5, -39.6], [10.4, -38.4], [4.7, -34.9], [0, -34.1], [-4.7, -34.9], [-10.4, -38.4]], assombrir(c, 0.25), { epais: 0.6 });
        pi.tourner(-12, 0, -26, () => etoile(pi, 'logo', 0, -26, 6.4, encre === '#FFFFFF' ? '#FFFFFF' : assombrir(c, 0.35), 0.6));
        return;
      }
      etoile(pi, 'logo', 0, -27, 4.5, encre === '#FFFFFF' ? '#FFFFFF' : assombrir(c, 0.35));
      return;
    case 'armure':
      pi.forme('plastron', [[-10, -36], [10, -36], [11, -24], [0, -19], [-11, -24]], '#CBD2DA', { epais: 0.7, ombre: true });
      pi.forme('ceinture', [[-15, -16], [15, -16], [15, -12], [-15, -12]], c, { lisse: false, epais: 0.6 });
      pi.forme('epaule1', pi.ovale('ep1', -14, -36, 7, 4.5, 8), c, { epais: 0.8 });
      pi.forme('epaule2', pi.ovale('ep2', 14, -36, 7, 4.5, 8), c, { epais: 0.8 });
      return;
    case 'astronaute':
      pi.forme('panneau', [[-7, -33], [7, -33], [7, -22], [-7, -22]], c, { lisse: false, epais: 0.6 });
      pi.rond(-3.5, -27.5, 1.6, '#FFE14D');
      pi.rond(0.5, -27.5, 1.6, '#3DDC84');
      pi.rond(4, -27.5, 1.2, '#FF4D4D');
      pi.ligne('col', [[-12, -38], [0, -35], [12, -38]], { epais: 0.6 });
      return;
    case 'cowboy':
      pi.forme('gilet1', [[-12, -38], [-4, -36], [-6, -13], [-15, -14], [-16, -25]], c, { epais: 0.8 });
      pi.forme('gilet2', [[12, -38], [4, -36], [6, -13], [15, -14], [16, -25]], c, { epais: 0.8 });
      pi.forme('bandana', [[-9, -39], [9, -39], [0, -29]], '#D7263D', { lisse: false, epais: 0.7 });
      return;
    case 'pyjama':
      for (const x of [-10, -4, 2, 8]) pi.ligne(`rayure${x}`, [[x, -37], [x + 0.6, -12]], { epais: 0.35, encre: eclaircir(c, 0.6) });
      for (const y of [-31, -25, -19]) pi.rond(0.5, y, 1.1, assombrir(c, 0.4));
      return;
    case 'costume':
      if (pi.style === 'papier') return costumePapier(pi, def);
      pi.forme('chemise', [[-6, -38], [6, -38], [0, -22]], '#FFFFFF', { lisse: false, epais: 0.6 });
      pi.forme('cravate', [[-1.6, -36], [1.6, -36], [2.6, -24], [0, -21], [-2.6, -24]], c, { lisse: false, epais: 0.5 });
      return;
    case 'ninja':
      pi.forme('ceinture', [[-15, -18], [15, -18], [15, -13], [-15, -13]], c, { lisse: false, epais: 0.6 });
      pi.ligne('croise', [[-11, -37], [5, -18]], { epais: 0.5, encre: '#4A5068' });
      return;
    case 'sorcier':
      etoile(pi, 'etoileRobe1', -6, -24, 3, '#FFD23F');
      etoile(pi, 'etoileRobe2', 7, -12, 2.4, '#FFD23F');
      pi.rond(5, -31, 1, '#FFD23F');
      return;
    case 'chemise':
      pi.forme('col1', [[-8, -39], [0, -35], [-3, -31.5]], eclaircir(c, 0.55), { lisse: false, epais: 0.6 });
      pi.forme('col2', [[8, -39], [0, -35], [3, -31.5]], eclaircir(c, 0.55), { lisse: false, epais: 0.6 });
      pi.ligne('patte', [[0, -35], [0.4, -12]], { epais: 0.45, encre: assombrir(c, 0.35) });
      for (const y of [-30, -24, -18]) pi.rond(1.6, y, 0.9, eclaircir(c, 0.6));
      // Papier (perso 3) : un stylo bleu qui dépasse de la poche.
      if (pi.style === 'papier') {
        pi.forme('stylo', [[-9.6, -34], [-7.6, -34], [-7.6, -28], [-9.6, -28]], '#2F6FDE', { lisse: false, epais: 0.45 });
        pi.ligne('clipStylo', [[-8, -33.5], [-8, -30.5]], { epais: 0.4, encre: '#E8EEF8', lisse: false });
      }
      pi.forme('poche', [[-11, -31], [-5, -31], [-5.5, -25.5], [-10.5, -25.5]], assombrir(c, pi.style === 'papier' ? 0.14 : 0.08), { lisse: false, epais: 0.5 });
      return;
    case 'pirate':
      for (const y of [-34, -29, -24, -19]) pi.ligne(`raie${y}`, [[-14, y], [14, y + 0.4]], { epais: 0.9, encre: c });
      pi.forme('gilet1', [[-12, -38], [-5, -37], [-7, -13], [-15, -14]], '#2B2B30', { epais: 0.7 });
      pi.forme('gilet2', [[12, -38], [5, -37], [7, -13], [15, -14]], '#2B2B30', { epais: 0.7 });
      pi.forme('ceinture', [[-15.5, -17], [15.5, -17], [15.5, -12.5], [-15.5, -12.5]], melanger(c, '#000000', 0.1), { lisse: false, epais: 0.6 });
      return;
  }
}

/** Petit détail au bout des manches (gants, manchettes). */
export function poignet(pi: Pinceau, def: DefinitionChibi, nom: string, a: Pt, b: Pt) {
  if (def.tenue === 'sweat' && pi.style === 'papier') return poignetSweat(pi, def.couleur, nom, a, b);
  const couleurs: Partial<Record<DefinitionChibi['tenue'], string>> = { astronaute: def.couleur, armure: def.couleur, ninja: def.couleur };
  const c = couleurs[def.tenue];
  if (!c) return;
  const t = 0.78;
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  pi.forme(`poignet${nom}`, pi.ovale(`pg${nom}`, x, y, 3.8, 3.8, 6), c, { epais: 0.6 });
}

/** Étoile à 5 branches pleine. */
export function etoile(pi: Pinceau, nom: string, cx: number, cy: number, r: number, couleur: string, epais = 0.5) {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  pi.forme(nom, pts, couleur, { lisse: false, epais });
}

