import { describe, expect, it } from 'vitest';
import { calculerEmpreinte, memeSource } from './fichiers';

const fichier = (n: number, graine: number, nom = 'a.mp4') => {
  const o = new Uint8Array(n);
  for (let i = 0; i < n; i++) o[i] = (i * 31 + graine) & 255;
  return new File([o], nom);
};

describe('empreinte', () => {
  it('stable, et différente si le contenu change', async () => {
    const a = await calculerEmpreinte(fichier(300_000, 1));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await calculerEmpreinte(fichier(300_000, 1, 'autre-nom.mp4'))).toBe(a);
    expect(await calculerEmpreinte(fichier(300_000, 2))).not.toBe(a);
    expect(await calculerEmpreinte(fichier(300_001, 1))).not.toBe(a);
  });
  it('memeSource compare taille et empreinte', async () => {
    const f = fichier(200_000, 7);
    const source = { id: 's1', nom: 'a.mp4', taille: f.size, emp: await calculerEmpreinte(f), duree: 1, type: 'video' as const };
    expect(await memeSource(f, source)).toBe(true);
    expect(await memeSource(fichier(200_000, 8), source)).toBe(false);
    expect(await memeSource(fichier(10, 7), source)).toBe(false);
  });
});
