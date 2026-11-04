import { describe, expect, it } from 'vitest';
import { CASCADE } from './cascade';
import { nombreImages, paquetsMax } from './exporter';
import { tailleEstimee } from './client';
import { nomExport } from './sortie-opfs';

describe('export (parties pures)', () => {
  it('cascade : 1080 avant 1072, matériel avant logiciel, 720p en dernier', () => {
    expect(CASCADE[0]).toMatchObject({ largeur: 1080, hauteur: 1920, acceleration: 'prefer-hardware', codec: 'avc1.640028' });
    expect(CASCADE[1]).toMatchObject({ largeur: 1072, acceleration: 'prefer-hardware' });
    expect(CASCADE.at(-1)).toMatchObject({ largeur: 720, hauteur: 1280, codec: 'avc1.4d401f', debit: 6_000_000, qualite: '720p' });
    expect(CASCADE.every((e, i) => e.rang === i)).toBe(true);
  });
  it('nombres d\'images et de paquets réservés', () => {
    expect(nombreImages(2)).toBe(60);
    expect(paquetsMax(2)).toEqual({ video: Math.ceil(60 * 1.33) + 10, audio: Math.ceil(200 * 1.33) + 10 });
  });
  it('taille estimée ≈ 1,3 Mo/s en 1080p', () => {
    expect(tailleEstimee(10)).toBeGreaterThan(12_000_000);
    expect(tailleEstimee(10)).toBeLessThan(14_000_000);
    expect(tailleEstimee(10, 1280)).toBeLessThan(tailleEstimee(10));
  });
  it('nom de fichier', () => {
    expect(nomExport(new Date(2026, 10, 3, 9, 5, 7))).toBe('arko-20261103-090507.mp4');
  });
});
