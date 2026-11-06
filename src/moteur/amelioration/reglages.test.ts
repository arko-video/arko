// Améliorer l'image — choix du traitement (mode IA / sans IA / rien), mesures de temps et replis.

import { describe, expect, it } from 'vitest';
import type { ImageSource } from '../canevas';
import { avecAmeliorationForcee, imageAmelioree, modeMoteur, preparerAmelioration } from './image-amelioree';
import { apercuTropLent, doitMesurer, mediane, MesuresTemps, surcoutExport, vitesse } from './mesures';
import { ameliorationActive, choisirPlan, clePlan, facteurDuPlan, type ReglagesAmelioration } from './reglages';

const LEGER: ReglagesAmelioration = { niveau: 'leger', nettoyer: true, agrandir: true };
const FORT: ReglagesAmelioration = { niveau: 'fort', nettoyer: true, agrandir: true };

describe('choisirPlan', () => {
  it('« Non » ou appareil sans WebGL2 : rien à faire (image telle quelle)', () => {
    expect(choisirPlan(undefined, 'ia', 1280, 720, 2)).toBeNull();
    expect(choisirPlan(LEGER, 'aucun', 1280, 720, 2)).toBeNull();
    expect(ameliorationActive({})).toBe(false);
    expect(ameliorationActive({ amelioration: LEGER })).toBe(true);
  });

  it('capture 720p exportée en 1440p : déblocage + agrandissement IA ; Fort ajoute le Restore à moitié', () => {
    expect(choisirPlan(LEGER, 'ia', 1280, 720, 2)).toEqual({ mode: 'ia', deblocage: true, nettoyage: 0, agrandissement: 'ia', contours: 0 });
    expect(choisirPlan(FORT, 'ia', 1280, 720, 2)).toEqual({ mode: 'ia', deblocage: true, nettoyage: 0.5, agrandissement: 'ia', contours: 0 });
  });

  it('agrandi moins de 1,2 fois (aperçu, 1080p → 1080p) : pas d’agrandissement, un peu de netteté', () => {
    const p = choisirPlan(LEGER, 'ia', 1280, 720, 0.75)!;
    expect(p.agrandissement).toBeNull();
    expect(p.contours).toBeGreaterThan(0);
    expect(facteurDuPlan(p)).toBe(1);
    expect(facteurDuPlan(choisirPlan(LEGER, 'ia', 1280, 720, 1.2)!)).toBe(2);
  });

  it('repli sans IA (carte graphique sans rendu à virgule) : déblocage, bicubique, contours', () => {
    expect(choisirPlan(FORT, 'classique', 1280, 720, 2)).toEqual({ mode: 'classique', deblocage: true, nettoyage: 0, agrandissement: 'bicubique', contours: 0.45 });
  });

  it('« Nettoyer » et « Agrandir » se coupent séparément', () => {
    expect(choisirPlan({ ...FORT, nettoyer: false }, 'ia', 1280, 720, 2)).toMatchObject({ deblocage: false, nettoyage: 0, agrandissement: 'ia' });
    expect(choisirPlan({ ...FORT, agrandir: false }, 'ia', 1280, 720, 2)).toMatchObject({ deblocage: true, nettoyage: 0.5, agrandissement: null });
  });

  it('grandes vidéos : pas de ×2 au-delà de 1080p, pas de réseau au-delà de 1440p', () => {
    expect(choisirPlan(LEGER, 'ia', 1920, 1080, 1.33)!.agrandissement).toBe('ia');
    expect(choisirPlan(LEGER, 'ia', 2560, 1440, 1.5)!).toMatchObject({ mode: 'ia', agrandissement: null });
    expect(choisirPlan(FORT, 'ia', 3840, 2160, 1)!).toMatchObject({ mode: 'classique', deblocage: false, nettoyage: 0, agrandissement: null });
  });

  it('la clé change avec le plan', () => {
    expect(clePlan(choisirPlan(LEGER, 'ia', 1280, 720, 2)!)).not.toBe(clePlan(choisirPlan(FORT, 'ia', 1280, 720, 2)!));
  });
});

describe('mesures du temps par image', () => {
  it('moyenne glissante, sans valeur fausse', () => {
    const m = new MesuresTemps();
    [10, 20, NaN, -3, 30].forEach((v) => m.ajouter(v));
    expect(m.n).toBe(3);
    expect(m.moyenne).toBe(20);
    for (let i = 0; i < 20; i++) m.ajouter(100);
    expect(m.moyenne).toBe(100);
  });

  it('on mesure les 3 premières images, puis une sur 15', () => {
    expect([0, 1, 2, 3, 14, 15, 16, 30].map(doitMesurer)).toEqual([true, true, true, false, false, true, false, true]);
  });

  it('aperçu trop lent après 4 mesures au-delà de 80 ms', () => {
    expect(apercuTropLent({ n: 3, moyenne: 500 })).toBe(false);
    expect(apercuTropLent({ n: 4, moyenne: 79 })).toBe(false);
    expect(apercuTropLent({ n: 4, moyenne: 120 })).toBe(true);
  });

  it('vitesse, temps d’export en plus, médiane', () => {
    expect([12, 50, 300].map(vitesse)).toEqual(['fluide', 'lent', 'tres-lent']);
    expect(surcoutExport(40, 60)).toBeCloseTo(72); // 1 800 images × 40 ms
    expect(mediane([5, 1, 900, 3])).toBe(4);
  });
});

describe('repli dans le chemin de rendu', () => {
  /** Fausse image source : note chaque dessin. */
  function fausseImage() {
    const appels: number[][] = [];
    const image: ImageSource = { largeur: 1280, hauteur: 720, dessiner: (_c, ...r) => void appels.push(r) };
    return { image, appels };
  }

  it('sans le champ : la même image (rien n’est enveloppé)', () => {
    const { image } = fausseImage();
    expect(preparerAmelioration({})(image)).toBe(image);
  });

  it('sans WebGL2 (ici, Node) : mode « aucun », l’image d’origine est dessinée telle quelle', async () => {
    expect(modeMoteur()).toBe('aucun');
    const { image, appels } = fausseImage();
    const env = await avecAmeliorationForcee(async () => preparerAmelioration({ amelioration: FORT })(image));
    const ctx = {} as CanvasRenderingContext2D;
    env.dessiner(ctx, 0, 0, 1280, 720, 0, 0, 2560, 1440);
    imageAmelioree(image, LEGER, false).dessiner(ctx, 10, 20, 100, 50, 0, 0, 25, 12);
    expect(env.largeur).toBe(1280);
    expect(appels).toEqual([
      [0, 0, 1280, 720, 0, 0, 2560, 1440],
      [10, 20, 100, 50, 0, 0, 25, 12],
    ]);
  });
});
