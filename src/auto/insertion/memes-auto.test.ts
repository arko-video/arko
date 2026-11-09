import { describe, expect, it } from 'vitest';
import { recetteVide } from '../../recette/defauts';
import { normaliser } from '../../recette/normaliser';
import type { Mot, Recette } from '../../recette/types';
import { SOURCE_TEST, signauxTest } from '../habillage/montage-test';
import { placeMeme, proposerMemes, type ClipAuto } from './memes-auto';

function recette(): Recette {
  const r = recetteVide();
  return normaliser({ ...r, sources: [SOURCE_TEST], plans: [{ de: 0, a: 120 }] }).recette;
}
const phrase = (t: number, texte: string): Mot[] => texte.split(' ').map((w, i) => [w, t + i * 0.4, t + i * 0.4 + 0.3]);

describe('mèmes automatiques', () => {
  const clips: ClipAuto[] = [
    { id: 'v1', nom: 'explosion green screen', etiquette: 'Fonds verts', duree: 3, fond: true },
    { id: 'v2', nom: 'wasted gta', etiquette: '', duree: 5, fond: false },
    { id: 'v3', nom: 'chat qui danse', etiquette: '', duree: 6, fond: false },
  ];
  const mots = [...phrase(10, 'attention ça explose'), ...phrase(20, 'bon on continue'), ...phrase(60, 'et là je suis mort'), ...phrase(70, 'on recommence alors')];

  it('le bon clip au bon mot, après la phrase, 4 s au plus, jamais un clip sans rapport', () => {
    const m = proposerMemes(recette(), mots, SOURCE_TEST.id, signauxTest(), clips);
    expect(m.map((x) => x.clip)).toEqual(['v1', 'v2']);
    expect(m[0]!.t).toBeGreaterThan(10);
    expect(m.every((x) => x.a - x.de <= 4)).toBe(true);
  });

  it('rien dans l\'accroche, rien sans clips', () => {
    expect(proposerMemes(recette(), mots, SOURCE_TEST.id, signauxTest(), clips, { finAccroche: 30 }).map((x) => x.clip)).toEqual(['v2']);
    expect(proposerMemes(recette(), mots, SOURCE_TEST.id, signauxTest(), [])).toEqual([]);
  });

  it('fond vert : plein écran détouré ; mème : en haut, hors des persos', () => {
    expect(placeMeme({ fond: true }, true).taille).toBe(1);
    expect(placeMeme({ fond: false }, false).y).toBeLessThan(0.5);
  });
});

describe('décor automatique (bouton s\'abonner)', () => {
  it('tôt puis avant la fin, jamais sans bouton dans la bibliothèque', async () => {
    const { proposerDecor } = await import('./memes-auto');
    const { recetteVide } = await import('../../recette/defauts');
    const { normaliser } = await import('../../recette/normaliser');
    const { SOURCE_TEST } = await import('../habillage/montage-test');
    const r = normaliser({ ...recetteVide(), sources: [SOURCE_TEST], plans: [{ de: 0, a: 300 }] }).recette;
    const bouton = { id: 'b', nom: 'Animated Subscribe Button', etiquette: 'effet de fond vert', duree: 6, fond: true };
    const d = proposerDecor(r, [bouton], { finAccroche: 6 });
    expect(d.map((x) => x.t)).toEqual([31, 285]);
    expect(d[0]!.a).toBe(5);
    expect(proposerDecor(r, [{ ...bouton, nom: 'explosion' }])).toEqual([]);
  });
});
