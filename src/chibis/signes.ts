// D. Petits signes des chibis (dev 3) : sueur, veine de colère, « zzz », rougeurs, larmes qui coulent, étoiles,
// cœurs, « ! », « ? », vapeur, traits de cri, front bleu, nuage de pluie, flammes… `ph` (0 à 1) = phase de
// l'animation des signes qui bougent (6 images par seconde, boucle d'une seconde).

import type { Signe } from './expressions';
import { TETE, VISAGE } from './geometrie';
import type { Pinceau, Pt } from './pinceau';
import { etoile } from './tenues';
import { coeur } from './visage';

const BLEU_LARME = '#7FD3F7';
const ROUGE = '#E8344E';

function goutte(pi: Pinceau, nom: string, x: number, y: number, r: number, couleur = BLEU_LARME) {
  pi.forme(nom, [[x, y - r * 2], [x + r, y - r * 0.2], [x + r * 0.7, y + r * 0.7], [x, y + r], [x - r * 0.7, y + r * 0.7], [x - r, y - r * 0.2]], couleur, { epais: 0.55 });
}

/** Teintes posées sur la tête, juste après elle (sous le visage). */
export function teintes(pi: Pinceau, signes: readonly Signe[]) {
  const haut: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    haut.push([Math.cos(a) * (TETE.rx - 1.5), TETE.cy + Math.sin(a) * (TETE.ry - 1.5)]);
  }
  const front = [...haut, [26, -70], [-26, -70]] as Pt[];
  if (signes.includes('rouge')) pi.forme('teinteRouge', pi.ovale('teinteR', 0, -66, 31.5, 27.5, 10, 0), '#FF3B30', { alpha: 0.32, trait: false });
  if (signes.includes('vert')) pi.forme('teinteVerte', pi.ovale('teinteV', 0, -66, 31.5, 27.5, 10, 0), '#8BD35D', { alpha: 0.38, trait: false });
  if (signes.includes('bleu')) {
    pi.forme('teinteBleue', front, '#5B6EE1', { alpha: 0.35, trait: false });
    for (const x of [-12, -6, 0, 6, 12]) pi.ligne(`bleu${x}`, [[x, -90 + Math.abs(x) * 0.3], [x, -80]], { epais: 0.4, encre: '#3A47A8' });
  }
}

/** Signes collés au visage (ils penchent avec la tête). */
export function signesVisage(pi: Pinceau, signes: readonly Signe[], ph: number) {
  const { yeuxX: ex, yeuxY: ey, jouesX: jx, jouesY: jy } = VISAGE;
  for (const s of signes) {
    switch (s) {
      case 'rougeur':
        for (const c of [-1, 1]) {
          pi.forme(`joue${c}`, pi.ovale(`joue${c}`, c * jx, jy, 5.5, 3, 7), '#FF7A8A', { alpha: 0.55, trait: false });
          for (const d of [-2.5, 0, 2.5]) pi.ligne(`rougeur${c}${d}`, [[c * jx + d + 1, jy - 1.8], [c * jx + d - 1, jy + 1.8]], { epais: 0.3, encre: '#E0405A' });
        }
        break;
      case 'cernes':
        for (const c of [-1, 1]) pi.ligne(`cerne${c}`, [[c * ex - 5, ey + 7], [c * ex, ey + 9], [c * ex + 5, ey + 7]], { epais: 0.4, encre: '#6B4E8A' });
        break;
      case 'sueur':
        goutte(pi, 'sueur', 28, -82, 3.4);
        break;
      case 'larme':
        goutte(pi, 'larme', ex + 6, ey + 7, 2.2);
        break;
      case 'veine': {
        const x = 21;
        const y = -86;
        for (const [a, b] of [[[-4, -1], [-1, -1]], [[1, -1], [4, -1]], [[-4, 1.5], [-1, 1.5]], [[1, 1.5], [4, 1.5]]] as [Pt, Pt][]) {
          pi.ligne(`veine${a[0]}${a[1]}`, [[x + a[0], y + a[1] - 2.5], [x + (a[0] + b[0]) / 2, y + a[1]], [x + b[0], y + b[1] - 2.5]], { epais: 0.7, encre: ROUGE });
        }
        break;
      }
      case 'larmesQuiCoulent':
        for (const c of [-1, 1]) {
          pi.forme(`flot${c}`, [[c * ex - 3, ey + 4], [c * ex + 3, ey + 4], [c * (ex + 4), -30], [c * (ex - 4), -30]], BLEU_LARME, { alpha: 0.85, epais: 0.5 });
          goutte(pi, `goutteFlot${c}`, c * (ex + 1), -42 + ph * 12, 1.6, '#FFFFFF');
        }
        break;
      case 'larmesVolent':
        for (const c of [-1, 1]) {
          for (const i of [0, 1]) {
            const t = (ph + i / 2) % 1;
            goutte(pi, `vol${c}${i}`, c * (ex + 9 + t * 12), ey - 4 - Math.sin(t * Math.PI) * 9 + t * 6, 2.2 - t * 0.6);
          }
        }
        break;
      case 'bulle': {
        const r = 2.5 + 4 * Math.sin(ph * Math.PI);
        pi.forme('morve', pi.ovale('morve', 7 + r * 0.6, -56 + 0.2 * r, r, r, 8, 0.02), '#BFE6FF', { alpha: 0.7, epais: 0.5 });
        break;
      }
    }
  }
}

/** Signes autour du chibi (ils ne penchent pas ; « ! », « ? », « z » ne sont jamais retournés). */
export function signesAutour(pi: Pinceau, signes: readonly Signe[], ph: number, haut: number) {
  for (const s of signes) {
    switch (s) {
      case 'zzz':
        [0, 1, 2].forEach((i) => {
          const t = (ph + i / 3) % 1;
          const k = 3 + t * 4;
          pi.signe(`z${i}`, [24 + t * 14, haut + 6 - t * 24], [[[-k, -k], [k, -k], [-k, k], [k, k]]], { epais: 0.75 });
        });
        break;
      case 'exclamation':
        pi.signe('point!', [27, haut - 4], [[[0, -14], [0.6, -3]], [[0.3, 1.5], [0.3, 2.3]]], { epais: 1.3 });
        break;
      case 'questions':
        pi.signe('q1', [24, haut - 2], [[[-4, -10], [-2, -14], [3, -14], [5, -10], [0, -5], [0, -1.5]], [[0, 2.5], [0, 3.2]]], { epais: 1.1 });
        pi.signe('q2', [-27, haut + 4], [[[-3, -7], [-1.5, -10], [2, -10], [3.5, -7], [0, -3.5], [0, -1]], [[0, 2], [0, 2.6]]], { epais: 0.9 });
        break;
      case 'points':
        for (const i of [0, 1, 2]) pi.rond(18 + i * 6, haut - 4 - i * 3, 1.8, '#18181C');
        break;
      case 'eclat':
        etoile(pi, 'eclat', -30, haut + 8, 5, '#FFF3A0', 0.6);
        etoile(pi, 'eclat2', 33, -50, 3, '#FFF3A0', 0.5);
        break;
      case 'etoiles':
        [[-34, haut + 12, 0], [34, haut + 4, 0.33], [-30, -46, 0.66], [36, -60, 0.5]].forEach(([x, y, d], i) => {
          etoile(pi, `etoile${i}`, x!, y!, 2.5 + 3 * Math.abs(Math.sin((ph + d!) * Math.PI)), ['#FFD23F', '#FF6FB5', '#3DDCFF', '#7BE36B'][i]!, 0.5);
        });
        break;
      case 'coeurs':
        [0, 1].forEach((i) => {
          const t = (ph + i / 2) % 1;
          coeur(pi, `coeur${i}`, (i ? -30 : 30) + Math.sin(t * 6.28) * 2, -60 - t * 34, 4 + t * 2, '#FF5C7A', 0.5);
        });
        break;
      case 'vapeur':
        for (const c of [-1, 1]) {
          const r = 3.5 + ph * 4;
          pi.forme(`vapeur${c}`, pi.ovale(`vap${c}`, c * (34 + ph * 8), haut + 6 - ph * 10, r, r * 0.8, 8, 0.12), '#FFFFFF', { alpha: 0.9 - ph * 0.4, epais: 0.6 });
        }
        break;
      case 'traitsCri':
        for (const c of [-1, 1]) for (const [a, b] of [[-0.5, -8], [0, 0], [0.5, 8]]) {
          pi.ligne(`cri${c}${a}`, [[c * 20, -50 + b! * 0.6], [c * 28, -50 + b!]], { epais: 0.7 });
        }
        break;
      case 'gouttes':
        for (const [i, a] of [[0, -0.6], [1, 0.4], [2, -2.4]] as const) {
          const t = (ph + i / 3) % 1;
          goutte(pi, `goutteVol${i}`, Math.cos(a) * (36 + t * 10), -72 + Math.sin(a) * (30 + t * 10), 2.4);
        }
        break;
      case 'traitsVitesse':
        // Le rire secoue : deux petites parenthèses de chaque côté de la tête.
        for (const c of [-1, 1]) for (const k of [0, 1]) {
          const x = c * (TETE.rx + 5 + k * 5);
          pi.ligne(`secoue${c}${k}`, [[x, -76 + k * 2], [x + c * 2.2, -68], [x, -60 - k * 2]], { epais: 0.6 });
        }
        break;
      case 'nuage': {
        const y = haut - 14;
        pi.forme('nuage', [[-18, y + 4], [-20, y - 2], [-12, y - 8], [-3, y - 11], [8, y - 9], [16, y - 5], [19, y + 3]], '#8A929C', { epais: 0.8 });
        for (const x of [-12, -2, 9]) pi.ligne(`pluie${x}`, [[x, y + 7 + ph * 8], [x - 1.5, y + 11 + ph * 8]], { epais: 0.5, encre: '#4F8BD6' });
        break;
      }
    }
  }
}

/** Flammes derrière le chibi (déterminé) : une aura qui lèche le contour, pointes qui bougent. */
export function signesDerriere(pi: Pinceau, signes: readonly Signe[], ph: number) {
  if (!signes.includes('feu')) return;
  const aura = (k: number, nom: string, couleur: string) => {
    const pts: Pt[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      const haut = Math.sin(a) < -0.2;
      const pointe = haut && i % 2 === 0 ? 1.25 + 0.12 * Math.sin((ph * 6 + i) * 2.1) : 1;
      pts.push([Math.cos(a) * 34 * k * (haut ? 0.9 : 1), -48 + Math.sin(a) * 50 * k * pointe]);
    }
    pi.forme(nom, pts, couleur, { epais: 0.6, alpha: 0.9, lisse: true });
  };
  aura(1, 'feu', '#FF7A30');
  aura(0.78, 'feuCoeur', '#FFD23F');
}
