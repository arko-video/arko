// Recherche dans Mes sons : sans accents ni majuscules, début de mot, le nom compte plus que l'étiquette.
import { describe, expect, it } from 'vitest';
import { chercher, sansAccents, score } from './recherche';

const sons = [
  { nom: 'Éternuement', etiquette: 'Memes' },
  { nom: 'Boum dramatique', etiquette: '' },
  { nom: 'Rire', etiquette: 'Mème drôle' },
];
const cherchable = (s: (typeof sons)[number]) => ({ nom: s.nom, autres: [s.etiquette] });

describe('recherche', () => {
  it('sans accents ni ponctuation', () => {
    expect(sansAccents('Éternuement !')).toBe('eternuement');
    expect(sansAccents('Cœur')).toBe('coeur');
  });

  it('début de mot, tous les mots doivent correspondre', () => {
    expect(chercher(sons, 'eter', cherchable).map((s) => s.nom)).toEqual(['Éternuement']);
    expect(chercher(sons, 'boum drama', cherchable).map((s) => s.nom)).toEqual(['Boum dramatique']);
    expect(chercher(sons, 'boum rire', cherchable)).toEqual([]);
    expect(chercher(sons, '  ', cherchable)).toEqual([]);
  });

  it('cherche aussi dans l\'étiquette, le nom passe devant', () => {
    expect(chercher(sons, 'meme', cherchable).map((s) => s.nom)).toEqual(['Rire', 'Éternuement']); // mot entier avant début de mot
    expect(score({ nom: 'Mème', autres: [] }, 'meme')).toBeGreaterThan(score({ nom: 'X', autres: ['meme'] }, 'meme'));
  });
});
