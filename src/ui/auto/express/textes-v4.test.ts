// Textes du Best-of v4 (intégrateur, relecture point 4) : l'écran d'analyse ne promet pas une reprise qui
// n'existe pas (rien ne repart tout seul quand on rouvre Arko) ; il dit ce qui est vrai.

import { describe, expect, it } from 'vitest';
import { TEXTES_V4 } from './textes-v4';

describe('textes du Best-of v4', () => {
  it('l\'analyse : garder Arko ouvert, et relancer l\'analyse si on le ferme (les sous-titres écrits sont gardés)', () => {
    const t = TEXTES_V4.analyse.fermer;
    expect(t).toMatch(/Garde Arko ouvert/);
    expect(t).toMatch(/relance l'analyse/);
    expect(t).not.toMatch(/Tu peux fermer/);
  });
});
