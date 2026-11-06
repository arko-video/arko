import { describe, expect, it } from 'vitest';
import { formatHeure, formatTemps, lireHeure, niveauDuree, pasImage } from './format';

describe('pasImage', () => {
  it('30 pas de +1 image font exactement 1 s', () => {
    let t = 0;
    for (let k = 0; k < 30; k++) t = pasImage(t, 1);
    expect(t).toBe(1);
  });
  it('se recale sur la grille depuis un temps arrondi au 1/100', () => {
    expect(pasImage(0.47, 1)).toBeCloseTo(15 / 30, 10);
    expect(pasImage(0, -1)).toBe(0);
  });
});

describe('formats', () => {
  it('formatTemps', () => expect(formatTemps(12.43)).toBe('0:12,4'));
  it('formatHeure', () => {
    expect(formatHeure(5400)).toBe('1:30:00');
    expect(formatHeure(75)).toBe('1:15');
  });
  it('niveauDuree', () => {
    expect(niveauDuree(24)).toBe('bien');
    expect(niveauDuree(40)).toBe('neutre');
    expect(niveauDuree(52)).toBe('long');
    // Selon la destination : en YouTube 16:9, une vidéo de 20 min est « bien » ; en Short, 4 min est trop long.
    const youtube = { id: 'youtube', dureeMax: 3600, dureeLimite: null } as const;
    const short = { id: 'short', dureeMax: 600, dureeLimite: 180 } as const;
    expect(niveauDuree(1200, youtube)).toBe('bien');
    expect(niveauDuree(40, youtube)).toBe('neutre');
    expect(niveauDuree(3700, youtube)).toBe('long');
    expect(niveauDuree(45, short)).toBe('bien');
    expect(niveauDuree(120, short)).toBe('neutre');
    expect(niveauDuree(240, short)).toBe('long');
  });
});

describe('lireHeure', () => {
  it.each([
    ['1:30:00', 5400],
    ['90:00', 5400],
    ['5400', 5400],
    ['1h30', 5400],
    ['1 h 30 min 5 s', 5405],
    ['45s', 45],
    ['2m', 120],
    ['12,5', 12.5],
  ])('%s', (texte, attendu) => expect(lireHeure(texte)).toBe(attendu));
  it.each(['', 'abc', '1:2:3:4', '1::2'])('refuse « %s »', (texte) => expect(lireHeure(texte)).toBeNull());
});
