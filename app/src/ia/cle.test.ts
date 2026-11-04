// Clé API : rangée dans IndexedDB (ici simulé en mémoire), une par fournisseur, jamais dans localStorage.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Faux idb-keyval : une simple Map en mémoire (Node n'a pas IndexedDB).
const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'magasin-test',
  get: async (k: string) => memoire.get(k),
  set: async (k: string, v: unknown) => void memoire.set(k, v),
  del: async (k: string) => void memoire.delete(k),
}));

const { lireCle, masquer, oublierCle, sauverCle } = await import('./cle');

describe('clé API', () => {
  const localStorageEspion = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };

  beforeEach(() => {
    memoire.clear();
    vi.stubGlobal('localStorage', localStorageEspion);
  });

  it('garde une clé par fournisseur, nettoyée du copier-coller', async () => {
    await sauverCle('anthropic', '  sk-ant-faux-0000\n');
    await sauverCle('gemini', 'AIza-faux-1111');
    expect(await lireCle('anthropic')).toBe('sk-ant-faux-0000');
    expect(await lireCle('gemini')).toBe('AIza-faux-1111');
    expect(await lireCle('openai')).toBeNull();
  });

  it('« Oublier ma clé » l\'efface ; une clé vide revient à l\'oublier', async () => {
    await sauverCle('openai', 'sk-faux-2222');
    await oublierCle('openai');
    expect(await lireCle('openai')).toBeNull();
    await sauverCle('openai', 'sk-faux-3333');
    await sauverCle('openai', '   ');
    expect(await lireCle('openai')).toBeNull();
  });

  it('ne touche jamais à localStorage', async () => {
    await sauverCle('anthropic', 'sk-faux-4444');
    await lireCle('anthropic');
    await oublierCle('anthropic');
    expect(localStorageEspion.setItem).not.toHaveBeenCalled();
    expect(localStorageEspion.getItem).not.toHaveBeenCalled();
  });

  it('masquer : le préfixe et les 4 derniers caractères', () => {
    expect(masquer('sk-proj-faux0000000000a1B2')).toBe('sk-…a1B2');
    expect(masquer('AIzaSyFaux000000000000wXyZ')).toBe('AIz…wXyZ');
    expect(masquer('court')).toBe('••••');
  });
});
