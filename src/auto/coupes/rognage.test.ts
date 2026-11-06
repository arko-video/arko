// D. Rogner une capture OBS : bandes fixes trouvées sur des images fabriquées (barre de titre + barre des tâches
// fixes, jeu qui bouge), aucune bande sur une image qui bouge partout, l'exemple 1280 × 720, imageRognee (le dessin
// reçoit le bon rectangle source) et l'opération rognerSource.

import { describe, expect, it } from 'vitest';
import { hasard } from '../../ia/synthese-test';
import type { ImageSource } from '../../moteur/canevas';
import { imageRognee, rognagesParSource } from '../../moteur/rognage';
import { normaliser } from '../../recette/normaliser';
import { rognerSource } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import { cadreRognage, detecterBords, MARGE_PX, type ImageGrise } from './rognage-detection';

/** 20 images 320 × 180 (une source 1280 × 720 réduite 4 fois) : jeu aléatoire, bandes fixes en haut/bas/côtés. */
function images(haut: number, bas: number, gauche = 0, droite = 0, n = 20): ImageGrise[] {
  const l = 320;
  const h = 180;
  const alea = hasard(3);
  return Array.from({ length: n }, (_, k) => {
    const px = new Uint8Array(l * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        let v = Math.floor(alea() * 256); // le jeu bouge
        if (y < haut) v = 40; // barre de titre
        else if (y >= h - bas) v = x >= 300 && x < 310 ? 200 + ((k * 13) % 50) : 25; // barre des tâches + horloge qui change
        else if (x < gauche || x >= l - droite) v = 0; // bandes noires sur les côtés
        px[y * l + x] = v;
      }
    }
    return { l, h, px };
  });
}

describe('detecterBords', () => {
  it('trouve la barre de titre (20 px) et la barre des tâches (40 px) d\'une capture 1280 × 720, + 2 px de marge', () => {
    expect(MARGE_PX).toBe(2);
    expect(detecterBords(images(5, 10), 1280, 720)).toEqual({ haut: 22, bas: 42, gauche: 0, droite: 0 });
  });

  it('trouve aussi des bandes sur les côtés', () => {
    expect(detecterBords(images(0, 0, 8, 8), 1280, 720)).toEqual({ haut: 0, bas: 0, gauche: 34, droite: 34 });
  });

  it('aucune bande sur une image qui bouge partout', () => {
    expect(detecterBords(images(0, 0), 1280, 720)).toEqual({ haut: 0, bas: 0, gauche: 0, droite: 0 });
  });

  it('une image fixe partout (vidéo figée) n\'est pas une barre : rien', () => {
    const fixe = images(0, 0, 0, 0, 1)[0]!;
    expect(detecterBords(Array(20).fill(fixe), 1280, 720)).toEqual({ haut: 0, bas: 0, gauche: 0, droite: 0 });
  });

  it('une ligne à moitié dans la barre part avec elle (arrondi vers le haut en pixels source)', () => {
    // 5 lignes réduites (180 → 1080 : × 6) = 30 px sur une source 1920 × 1080, + 2 px de marge.
    expect(detecterBords(images(5, 0), 1920, 1080).haut).toBe(32);
    // Tolérance : une barre qui « bouge » de 3 niveaux de gris reste fixe ; de 20, non.
    const im = images(5, 0);
    im.forEach((x, k) => x.px.fill(40 + (k % 2) * 3, 0, 320 * 5));
    expect(detecterBords(im, 1280, 720).haut).toBe(22);
    im.forEach((x, k) => x.px.fill(40 + (k % 2) * 20, 0, 320 * 5));
    expect(detecterBords(im, 1280, 720).haut).toBe(0);
  });

  it('moins de 2 images : rien', () => {
    expect(detecterBords(images(5, 10, 0, 0, 1), 1280, 720)).toEqual({ haut: 0, bas: 0, gauche: 0, droite: 0 });
  });
});

describe('cadreRognage', () => {
  it('exemple vérifié : 1280 × 720, haut 20, bas 40 → 1173 × 660 à (53, 20)', () => {
    const c = cadreRognage({ haut: 20, bas: 40, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)!;
    expect(c.x * 1280).toBeCloseTo(53, 6);
    expect(c.y * 720).toBeCloseTo(20, 6);
    expect(c.l * 1280).toBeCloseTo(1173, 6);
    expect(c.h * 720).toBeCloseTo(660, 6);
  });

  it('bandes sur les côtés : la hauteur est réduite au format, centrée', () => {
    const c = cadreRognage({ haut: 0, bas: 0, gauche: 100, droite: 100 }, 1280, 720, 16 / 9)!;
    expect(c.l * 1280).toBeCloseTo(1080, 6);
    expect(c.h * 720).toBeCloseTo(607, 6);
    expect(c.x * 1280).toBeCloseTo(100, 6);
    expect(c.y * 720).toBeCloseTo(56, 6);
  });

  it('rien à enlever, ou trop à enlever : null', () => {
    expect(cadreRognage({ haut: 0, bas: 0, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)).toBeNull();
    expect(cadreRognage({ haut: 200, bas: 200, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)).toBeNull();
  });
});

describe('imageRognee (moteur, même chemin pour l\'aperçu et l\'export)', () => {
  const appels: number[][] = [];
  const image: ImageSource = { largeur: 1280, hauteur: 720, dessiner: (_c, ...r) => void appels.push(r) };
  const r = normaliser({ sources: [{ id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e', duree: 60, type: 'video', l: 1280, h: 720 }], plans: [{ de: 0, a: 10 }], rognages: [{ src: 's1', ...cadreRognage({ haut: 20, bas: 40, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)! }] }).recette;

  it('la partie gardée devient toute l\'image : 1173 × 660 ; dessiner lit à partir de (53, 20)', () => {
    const vue = imageRognee(image, rognagesParSource(r).get('s1'));
    expect([vue.largeur, vue.hauteur]).toEqual([1173, 660]);
    appels.length = 0;
    vue.dessiner({} as never, 0, 0, 1173, 660, 0, 0, 1280, 720);
    vue.dessiner({} as never, 100, 50, 200, 100, 10, 20, 30, 40);
    expect(appels).toEqual([
      [53, 20, 1173, 660, 0, 0, 1280, 720],
      [153, 70, 200, 100, 10, 20, 30, 40],
    ]);
  });

  it('sans rognage (ou rognage de toute l\'image) : la même image', () => {
    expect(imageRognee(image, undefined)).toBe(image);
    expect(imageRognee(image, { src: 's1', x: 0, y: 0, l: 1, h: 1 })).toBe(image);
  });
});

describe('rognerSource', () => {
  const base: Recette = normaliser({ sources: [{ id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e', duree: 60, type: 'video', l: 1280, h: 720 }], plans: [{ de: 0, a: 10 }] }).recette;
  const cadre = cadreRognage({ haut: 20, bas: 40, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)!;

  it('écrit le rognage (arrondi au 1/10 000), une seule fois par source', () => {
    const r = rognerSource(base, 's1', cadre);
    expect(r.rognages).toEqual([{ src: 's1', x: 0.0414, y: 0.0278, l: 0.9164, h: 0.9167 }]);
    expect(rognerSource(r, 's1', cadre)).toBe(r);
    expect(rognerSource(r, 's1', { x: 0, y: 0, l: 0.9, h: 0.9 }).rognages).toHaveLength(1);
  });

  it('null remet les bords ; source inconnue ou rien à retirer : sans effet', () => {
    const r = rognerSource(base, 's1', cadre);
    const remis = rognerSource(r, 's1', null);
    expect(remis).not.toHaveProperty('rognages');
    expect(rognerSource(base, 's1', null)).toBe(base);
    expect(rognerSource(base, 's9', cadre)).toBe(base);
  });
});
