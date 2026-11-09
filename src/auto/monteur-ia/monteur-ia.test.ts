import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { construireDossier, phrasesDe } from './dossier';
import { validerPlan } from './plan';

const phrase = (t: number, texte: string): Mot[] => texte.split(' ').map((w, i) => [w, t + i * 0.4, t + i * 0.4 + 0.3]);

describe('monteur IA : dossier', () => {
  it('phrases avec qui parle, coupées aux pauses et aux changements de personne', () => {
    const mots = [...phrase(0, 'on y va'), ...phrase(1.25, 'attends moi'), ...phrase(5, 'je suis mort')];
    const tours = [{ ts: 0, fin: 1.2, p: 'p1' }, { ts: 1.2, fin: 3, p: 'p2' }, { ts: 4.9, fin: 7, p: 'p1', emo: 'panique' as const }];
    const ph = phrasesDe(mots, tours);
    expect(ph.map((p) => [p.texte, p.qui])).toEqual([['on y va', 'p1'], ['attends moi', 'p2'], ['je suis mort', 'p1']]);
    expect(ph[2]!.emo).toBe('panique');
  });

  it('dossier compact : bibliothèque en noms + durées, goûts seulement s\'il y en a', () => {
    const d = construireDossier({ da: 'youtube', duree: 7200, dureeVisee: { min: 900, max: 1200 }, mots: phrase(0, 'salut'), bibliotheque: [{ nom: 'Bruh.mp3', duree: 1.234, rayon: 'bruitages' }] });
    expect(d.bibliotheque[0]!.duree).toBe(1.23);
    expect(d.gouts).toBeUndefined();
    expect(JSON.stringify(d).length).toBeLessThan(1000);
  });
});

describe('monteur IA : validation du plan', () => {
  const d = construireDossier({ da: 'youtube', duree: 600, dureeVisee: { min: 60, max: 120 }, mots: [], bibliotheque: [{ nom: 'Bruh - Sound Effect.mp3', duree: 1, rayon: 'bruitages' }, { nom: 'shrek crying meme.mp4', duree: 8, rayon: 'memes' }] });

  it('garde ce qui est juste, corrige ou retire le reste, et le dit', () => {
    const v = validerPlan(
      {
        accroche: { de: 100, a: 120, texte: 'ATTENDS…' },
        sequences: [{ de: 50, a: 80, titre: 'Le début' }, { de: 70, a: 100, titre: 'Chevauche' }, { de: 900, a: 950 }],
        effets: [
          { t: 60, type: 'bruitage', quoi: 'bruh sound effect', pourquoi: 'il dit bruh' },
          { t: 61, type: 'meme', quoi: 'fichier inventé', pourquoi: 'x' },
          { t: 62, type: 'zoom', quoi: '9' },
          { t: 63, type: 'explosion3D', quoi: 'x' },
        ],
        titres: ['100 Jours sur Minecraft ONE BLOCK !'],
      },
      d,
    );
    expect(v.plan.accroche).toEqual({ de: 100, a: 108, texte: 'ATTENDS…' });
    expect(v.plan.sequences.map((s) => [s.de, s.a])).toEqual([[50, 80], [80, 100]]);
    expect(v.plan.effets.map((e) => [e.type, e.quoi])).toEqual([['bruitage', 'Bruh - Sound Effect.mp3'], ['zoom', '2']]);
    expect(v.journal.join(' ')).toMatch(/pas dans ta bibliothèque/);
    expect(v.plan.titres).toEqual(['100 Jours sur Minecraft ONE BLOCK !']);
  });

  it('un plan illisible donne un plan vide, sans planter', () => {
    expect(validerPlan('n importe quoi', d).plan).toEqual({ accroche: null, intro: null, sequences: [], effets: [], titres: [], miniature: null });
    expect(validerPlan(null, d).plan.effets).toEqual([]);
  });

  it('densité plafonnée à 12 effets par minute', () => {
    const effets = Array.from({ length: 30 }, (_, i) => ({ t: 100 + i, type: 'zoom', quoi: '1.3' }));
    const v = validerPlan({ effets }, d);
    expect(v.plan.effets.length).toBeLessThanOrEqual(12);
    expect(v.journal.some((j) => j.includes('en trop'))).toBe(true);
  });
});
