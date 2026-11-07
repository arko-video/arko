// D. Accessoires (9) et chapeaux des tenues (cow-boy, sorcier, pirate, bandeau de ninja, casque-bulle d'astronaute)
// des chibis (dev 3). Une tenue à chapeau cache les accessoires de tête (casquette, bonnet, couronne).

import type { DefinitionChibi, Emotion } from '../recette/types';
import { assombrir } from './couleurs';
import { HAUT_CHEVEUX, TETE, VISAGE } from './geometrie';
import type { Pinceau, Pt } from './pinceau';
import { etoile } from './tenues';
import { casquePapier } from './persos/perso-1-papier';
import { casquetteEnversPapier } from './persos/casquette-envers';
import { barbePapier } from './persos/perso-5-papier';
import { bonnetPapier } from './persos/bonnet';

const OR = '#F5C542';
const NOIR = '#1D1D22';

/** Émotions où les lunettes de soleil restent sur les yeux (sinon elles sont relevées sur le front). */
const SOLEIL_SUR_LES_YEUX: ReadonlySet<Emotion> = new Set(['parle', 'frime', 'moqueur', 'enerve', 'determine', 'content', 'reflechit', 'rit', 'crie', 'hurle', 'rage']);

function aChapeau(def: DefinitionChibi): boolean {
  return def.tenue === 'cowboy' || def.tenue === 'sorcier' || def.tenue === 'pirate';
}

/** Écharpe (au cou, sur le torse). */
export function autourDuCou(pi: Pinceau, def: DefinitionChibi) {
  if (def.accessoire !== 'echarpe') return;
  // L'écharpe tranche avec la tenue : jaune, ou rouge si la couleur principale est déjà jaune / orange.
  const c = /^#F[1-9A-F]C40F|^#E67E22/i.test(def.couleur) ? '#E74C3C' : '#F7D046';
  pi.forme('echarpeBout', [[7, -38], [13, -37], [14, -22], [9, -21]], assombrir(c, 0.1), { epais: 0.8 });
  pi.forme('echarpe', [[-15, -41], [15, -41], [16, -35], [0, -33], [-16, -35]], c, { epais: 0.85 });
  for (const x of [-8, 0, 8]) pi.ligne(`echarpeRaie${x}`, [[x, -40.5], [x + 0.5, -34]], { epais: 0.4, encre: '#FFFFFF' });
}

/** Ce qui va SOUS les yeux (masque de super-héros). */
export function sousLesYeux(pi: Pinceau, def: DefinitionChibi, bouche: 'normale' | 'grande' = 'normale') {
  if (def.accessoire === 'barbe') return pi.style === 'papier' ? barbePapier(pi, def, bouche) : barbe(pi, def.cheveux);
  if (def.accessoire !== 'masque') return;
  const y = VISAGE.yeuxY;
  pi.forme('masque', [[-25, y - 9], [-6, y - 7], [0, y - 4], [6, y - 7], [25, y - 9], [24, y + 6], [8, y + 8], [0, y + 4], [-8, y + 8], [-24, y + 6]], NOIR, { epais: 0.7 });
}

/** Barbe (sous les yeux et la bouche) : joues et menton, une petite moustache en pointe. */
function barbe(pi: Pinceau, c: string) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((4 + (172 * i) / 10) * Math.PI) / 180;
    pts.push([Math.cos(a) * 34, -65 + Math.sin(a) * 31]);
  }
  pts.push([-31, -61], [-17, -56], [-8, -55.5], [0, -57.5], [8, -55.5], [17, -56], [31, -61]);
  pi.forme('barbe', pts, c, { ombre: true, epais: 0.8 });
}

/** Arc d'ellipse (centre (0, cy), rayons rx × ry ; `ryHaut` pour la moitié du haut), de a0 à a1 degrés. */
function arcE(rx: number, ry: number, cy: number, a0: number, a1: number, n: number, ryHaut = ry): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([Math.cos(a) * rx, cy + Math.sin(a) * (Math.sin(a) < 0 ? ryHaut : ry)]);
  }
  return pts;
}

/** Il s'enfonce dans sa capuche (rabattue sur le front) ; ses cordons s'affolent. */
const CAPUCHE_RABATTUE: ReadonlySet<Emotion> = new Set(['dort', 'malade']);
const CORDONS_FOUS: ReadonlySet<Emotion> = new Set(['panique', 'hurle', 'rage', 'mortDeRire']);
/** De surprise, le haut de la capuche se soulève (le bas reste sur les épaules). */
const CAPUCHE_SAUTE: ReadonlySet<Emotion> = new Set(['choque', 'surpris']);

/** Capuche relevée : un croissant qui tombe sur les épaules, doublure foncée autour du visage, couture au sommet. */
function capuche(pi: Pinceau, def: DefinitionChibi, emo: Emotion) {
  const c = def.couleur;
  const h = CAPUCHE_RABATTUE.has(emo) ? 22 : 27;
  const dy = CAPUCHE_SAUTE.has(emo) ? -7 : 0;
  const up = (p: Pt[]) => p.map(([x, y]): Pt => [x, y + dy * Math.min(1, Math.max(0, (-40 - y) / 60))]);
  pi.forme('capuche', up([[-31, -35], ...arcE(41, 38, -64, 150, 390, 20), [31, -35], [21, -39], ...arcE(28.5, 27, -62, 40, -220, 16, h), [-21, -39]]), c, { ombre: true });
  pi.forme('doublure', up([...arcE(33, 31, -62.5, 146, 394, 16, h + 4.5), ...arcE(28.5, 27, -62, 34, -214, 16, h)]), assombrir(c, 0.4), { epais: 0.5 });
  pi.ligne('couture', up([[0, -101.5], [0.7, -98], [0, -94]]), { epais: 0.45, encre: assombrir(c, 0.3) });
  const fous = CORDONS_FOUS.has(emo);
  // Le sweat a déjà ses cordons sur le torse : ceux de la capuche ne sortent que quand ils s'affolent.
  if (def.tenue === 'sweat' && !fous) return;
  for (const s of [-1, 1]) {
    const p: Pt[] = fous ? [[s * 21, -44], [s * 30, -49], [s * 37, -41], [s * 46, -48]] : [[s * 20, -45], [s * 20.5, -37], [s * 20, -30]];
    pi.ligne(`cordonBord${s}`, p, { epais: 1.6, encre: assombrir(def.couleur, 0.45) });
    pi.ligne(`cordon${s}`, p, { epais: 0.9, encre: '#F7F1E6' });
    pi.rond(p[p.length - 1]![0], p[p.length - 1]![1], 1.7, '#F7F1E6');
  }
}

/** Lunettes (après les yeux). */
export function surLesYeux(pi: Pinceau, def: DefinitionChibi, emo: Emotion) {
  const y = VISAGE.yeuxY;
  const x = VISAGE.yeuxX;
  if (def.accessoire === 'lunettes' && pi.style === 'papier') lunettesPapier(pi, emo);
  else if (def.accessoire === 'lunettes') {
    for (const s of [-1, 1]) pi.forme(`verre${s}`, pi.ovale(`verre${s}`, s * x, y, 8.6, 8.2, 9, 0.03), '#FFFFFF', { alpha: 0.08, epais: 0.75 });
    pi.ligne('pont', [[-4, y - 1], [0, y - 2.5], [4, y - 1]], { epais: 0.7 });
  }
  if (def.accessoire === 'lunettesSoleil' && SOLEIL_SUR_LES_YEUX.has(emo)) lunettesSoleil(pi, y);
}

/** Gags des lunettes du papier (perso 3) : elles sautent (choqué), penchent (rage), glissent sur le nez (dort). */
const GAGS_LUNETTES: Partial<Record<Emotion, [number, number]>> = {
  choque: [-4, 0], surpris: [-3.5, 0], panique: [-2.5, 7], crie: [-2, 0], rage: [0, 9], hurle: [-1, -8],
  mortDeRire: [1.5, -12], defaite: [1.5, 7], malade: [1.5, -6], confus: [0, -9], dort: [4.5, 5],
};

/** Lunettes rondes du papier : verres un peu plus grands (spirales et croix ne touchent pas la monture), branches. */
function lunettesPapier(pi: Pinceau, emo: Emotion) {
  const x = VISAGE.yeuxX;
  const [dy, a] = GAGS_LUNETTES[emo] ?? [0, 0];
  const y = VISAGE.yeuxY + dy;
  pi.tourner(a, 0, y, () => {
    for (const s of [-1, 1]) {
      pi.ligne(`branche${s}`, [[s * (x + 9.4), y - 1.5], [s * 28, y - 3.5]], { epais: 0.85, lisse: false });
      pi.forme(`verre${s}`, pi.ovale(`verre${s}`, s * x, y, 9.6, 9, 11, 0.025), '#FFFFFF', { alpha: 0.08, epais: 1 });
      // Reflet sur le bord du verre (en haut, côté extérieur) : jamais sur l'œil.
      const r: Pt[] = [200, 222, 244].map((d) => [s * x + s * Math.cos((d * Math.PI) / 180) * 7.4, y + Math.sin((d * Math.PI) / 180) * 6.9]);
      pi.ligne(`refletVerre${s}`, r, { epais: 0.7, encre: '#FFFFFF' });
    }
    pi.ligne('pont', [[-3.2, y - 1], [0, y - 3], [3.2, y - 1]], { epais: 0.9 });
    // Verre fêlé quand on a perdu.
    if (emo === 'defaite') pi.ligne('felure', [[x + 9, y + 3], [x + 7, y + 4.3], [x + 7.6, y + 6.2], [x + 5.6, y + 7.4]], { epais: 0.5, lisse: false });
    // Éclat qui brille (frime, victoire, déterminé) : petite étoile sur la monture.
    if (emo === 'frime' || emo === 'victoire' || emo === 'determine') {
      const [ex, ey] = [x + 7.6, y - 7];
      pi.forme('eclat', [[ex, ey - 4.2], [ex + 1, ey - 1], [ex + 4.2, ey], [ex + 1, ey + 1], [ex, ey + 4.2], [ex - 1, ey + 1], [ex - 4.2, ey], [ex - 1, ey - 1]], '#FFF6C8', { lisse: false, epais: 0.45 });
    }
  });
}

function lunettesSoleil(pi: Pinceau, y: number) {
  const x = VISAGE.yeuxX;
  for (const s of [-1, 1]) {
    pi.forme(`soleil${s}`, [[s * (x - 8.5), y - 6], [s * (x + 8.5), y - 6.5], [s * (x + 7.5), y + 4], [s * x, y + 6.5], [s * (x - 7.5), y + 4]], NOIR, { epais: 0.7 });
    pi.ligne(`reflet${s}`, [[s * (x - 4), y - 3.5], [s * (x - 1), y - 3.8]], { epais: 0.6, encre: '#FFFFFF' });
  }
  pi.ligne('pontSoleil', [[-4.5, y - 4], [4.5, y - 4]], { epais: 0.8 });
}

/** Casque audio (derrière la tête : rien) et tout ce qui coiffe la tête, après les cheveux. */
export function surLaTete(pi: Pinceau, def: DefinitionChibi, emo: Emotion) {
  const haut = HAUT_CHEVEUX[def.coiffure] ?? -98;
  const c = def.couleur;
  if (def.tenue === 'ninja') bandeau(pi, '#262A3A', c, -83, true);
  if (!aChapeau(def)) {
    switch (def.accessoire) {
      case 'casquette': {
        pi.forme('visiere', [[18, -90], [40, -95], [42, -90], [24, -84]], assombrir(c, 0.25), { epais: 0.8 });
        pi.forme('casquette', [...arcTete(196, 344, 3.5, haut + 96), [31, -80], [0, -82], [-31, -80]], c, { ombre: true });
        pi.forme('bouton', pi.ovale('bouton', 0, haut - 3.5, 2.6, 1.6, 6), assombrir(c, 0.25), { epais: 0.6 });
        break;
      }
      case 'casquetteEnvers': {
        // Visière derrière, qui dépasse en haut ; la petite ouverture de réglage devant.
        if (pi.style === 'papier') {
          casquetteEnversPapier(pi, def, emo, haut);
          break;
        }
        pi.forme('visiere', [[-12, haut + 4], [-38, haut - 6], [-40, haut], [-18, haut + 10]], assombrir(c, 0.25), { epais: 0.8 });
        pi.forme('casquette', [...arcTete(196, 344, 3.5, haut + 96), [31, -80], [0, -82], [-31, -80]], c, { ombre: true });
        pi.forme('reglage', [[-5, -81.5], [5, -81.5], [3, -86], [-3, -86]], assombrir(c, 0.45), { epais: 0.5 });
        break;
      }
      case 'capuche':
        capuche(pi, def, emo);
        break;
      case 'bonnet': {
        if (pi.style === 'papier') {
          bonnetPapier(pi, c, emo, haut);
          break;
        }
        pi.forme('bonnet', [...arcTete(198, 342, 4, haut + 96), [31, -80], [-31, -80]], c, { ombre: true });
        pi.forme('revers', [[-33, -84], [33, -84], [33, -76], [-33, -76]], assombrir(c, 0.15), { epais: 0.8, lisse: false });
        for (let i = -28; i <= 28; i += 7) pi.ligne(`cote${i}`, [[i, -83], [i, -77]], { epais: 0.35, encre: assombrir(c, 0.45) });
        pi.forme('pompon', pi.ovale('pompon', 0, haut - 6, 6.5, 6, 9, 0.12), '#FFFFFF', { epais: 0.7 });
        break;
      }
      case 'couronne': {
        const y = haut + 4;
        pi.forme('couronne', [[-15, y], [15, y - 3], [17, y - 15], [9, y - 9], [4, y - 19], [-2, y - 9], [-9, y - 17], [-14, y - 7], [-18, y - 12]], OR, { lisse: false, epais: 0.8 });
        pi.rond(4, y - 5, 1.8, '#E74C3C');
        pi.rond(-8, y - 4, 1.5, '#3498DB');
        break;
      }
    }
  }
  if (def.accessoire === 'bandeau') bandeau(pi, c, c, -84, false);
  if (def.accessoire === 'casqueAudio' && pi.style === 'papier') casquePapier(pi, def, emo, def.coiffure === 'afro' ? (haut + 96) * 0.8 : 0);
  else if (def.accessoire === 'casqueAudio') {
    // Posé sur le crâne : les mèches dépassent par-dessus (seul l'afro le soulève).
    const a = arcTete(200, 340, 2, def.coiffure === 'afro' ? (haut + 96) * 0.8 : 0, 7);
    pi.ligne('arceau', a, { epais: 1.9 });
    pi.ligne('arceauC', a, { epais: 0.9, encre: assombrir(c, 0.2) });
    for (const s of [-1, 1]) pi.forme(`oreillette${s}`, pi.ovale(`oreillette${s}`, s * 34, -66, 5.6, 9, 8), c, { epais: 0.85 });
    pi.ligne('micro', [[-35, -58], [-28, -48], [-16, -47]], { epais: 0.7 });
    pi.rond(-15, -47, 2.2, NOIR);
  }
  if (def.accessoire === 'lunettesSoleil' && !SOLEIL_SUR_LES_YEUX.has(emo)) lunettesSoleil(pi, -84);
  chapeauDeTenue(pi, def, haut);
}

function bandeau(pi: Pinceau, fond: string, noeud: string, y: number, long: boolean) {
  pi.forme('bandeauNoeud', [[-31, y - 1], [-44, y - 6 - (long ? 2 : 0)], [-46, y + 1], [-41, y + 3], [-48, y + 8 + (long ? 6 : 0)], [-31, y + 4]], noeud, { epais: 0.7 });
  pi.forme('bandeau', [[-34, y - 3], [34, y - 3], [34, y + 4], [-34, y + 4]], fond, { epais: 0.8, lisse: false });
  if (long) pi.forme('plaque', [[-7, y - 2], [7, y - 2], [7, y + 3], [-7, y + 3]], '#AEB7C2', { epais: 0.6, lisse: false });
}

/** Points du bord de la tête (comme les cheveux), décalés vers le haut de `monte` unités. */
function arcTete(a0: number, a1: number, plus: number, monte: number, n = 9): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([Math.cos(a) * (TETE.rx + plus), TETE.cy + Math.sin(a) * (TETE.ry + plus) + Math.min(0, monte) * (Math.sin(a) < 0 ? -Math.sin(a) : 0)]);
  }
  return pts;
}

function chapeauDeTenue(pi: Pinceau, def: DefinitionChibi, haut: number) {
  const c = def.couleur;
  const y = Math.min(-90, haut + 8);
  if (def.tenue === 'cowboy') {
    const brun = '#9B6A3C';
    pi.forme('chapeau', [[-19, y], [-17, y - 17], [-7, y - 20], [0, y - 15], [7, y - 20], [17, y - 17], [19, y]], brun, { ombre: true });
    pi.forme('ruban', [[-19, y - 1], [19, y - 1], [18.5, y - 5], [-18.5, y - 5]], c, { lisse: false, epais: 0.6 });
    pi.forme('bord', [[-42, y - 3], [-30, y + 1], [0, y + 3.5], [30, y + 1], [42, y - 3], [36, y + 4], [0, y + 8], [-36, y + 4]], brun, { epais: 0.9 });
  }
  if (def.tenue === 'sorcier') {
    const f = assombrir(c, 0.12);
    pi.forme('chapeau', [[-22, y + 1], [-6, y - 26], [6, y - 42], [22, y - 46], [13, y - 36], [12, y - 22], [22, y + 1]], f, { ombre: true });
    pi.forme('bord', pi.ovale('bordSorcier', 0, y + 1, 36, 6.5, 10, 0.03), f, { epais: 0.9 });
    etoile(pi, 'etoileChapeau', 2, y - 14, 5, '#FFD23F', 0.6);
  }
  if (def.tenue === 'pirate') {
    pi.forme('chapeau', [[-38, y - 2], [-26, y - 22], [-10, y - 15], [0, y - 27], [10, y - 15], [26, y - 22], [38, y - 2], [0, y + 5]], NOIR, { epais: 0.9 });
    pi.ligne('galon', [[-34, y - 2], [0, y + 2.5], [34, y - 2]], { epais: 0.7, encre: OR });
    pi.rond(0, y - 10, 3.2, '#F4F4F0');
    pi.rond(-1.2, y - 10.5, 0.8, NOIR);
    pi.rond(1.2, y - 10.5, 0.8, NOIR);
  }
}

/** Casque-bulle de l'astronaute (en dernier sur la tête : on voit le visage à travers). */
export function bulle(pi: Pinceau, def: DefinitionChibi) {
  if (def.tenue !== 'astronaute') return;
  pi.forme('bulle', pi.ovale('bulle', 0, -68, 41, 38, 12, 0.02), '#D8F0FF', { alpha: 0.1, epais: 1 });
  pi.ligne('refletBulle', [[-30, -80], [-24, -94], [-12, -101]], { epais: 1.1, encre: '#FFFFFF' });
  pi.forme('colBulle', [[-22, -38], [22, -38], [20, -32], [-20, -32]], '#C9CDD2', { epais: 0.8, lisse: false });
}
