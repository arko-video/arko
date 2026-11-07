// Mesures gardées sur l'appareil (intégrateur, relecture point 9) : ≈ 22 Mo par longue vidéo, donc seules les
// MESURES_MAX dernières vidéos sont gardées ; relire une vidéo la remet en tête ; oublier la retire. IndexedDB simulé.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => memoire.get(k),
  set: async (k: string, v: unknown) => void memoire.set(k, v),
  del: async (k: string) => void memoire.delete(k),
}));

const { CLE_LISTE_MESURES, cleMesures, garderPasseSon, MESURES_MAX, oublierMesures, relireMesures, relirePasseSon } = await import('./gardees');

const passe = () => ({ empreintes: [{ pas: 0.02, duree: 10, db: new Float32Array(500), bandes: new Float32Array(4000) }], vad: null, hauteur: null });

beforeEach(() => memoire.clear());

describe('mesures gardées : les plus anciennes vidéos sont effacées', () => {
  it(`${MESURES_MAX} vidéos au plus ; la plus ancienne part ; relire remet en tête ; oublier retire`, async () => {
    for (let i = 0; i < MESURES_MAX; i++) await garderPasseSon(`v${i}`, 10, [], 'silero', passe());
    expect(memoire.get(CLE_LISTE_MESURES)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4'].slice(0, MESURES_MAX));
    // v0 relue (2ᵉ analyse) : elle passe en tête, c'est v1 qui part quand une nouvelle arrive.
    expect(await relirePasseSon('v0', 10, [], 'silero', false)).not.toBeNull();
    await garderPasseSon('neuve', 10, [], 'silero', passe());
    expect(memoire.has(cleMesures('v1'))).toBe(false);
    expect(memoire.has(cleMesures('v0'))).toBe(true);
    expect(await relireMesures('v1')).toBeNull();
    expect((memoire.get(CLE_LISTE_MESURES) as string[]).length).toBe(MESURES_MAX);
    await oublierMesures('neuve');
    expect(memoire.has(cleMesures('neuve'))).toBe(false);
    expect(memoire.get(CLE_LISTE_MESURES)).not.toContain('neuve');
  });
});
