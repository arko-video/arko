// Chargement des musiques proposées par Arko, sans réseau : adresse des morceaux de Kevin MacLeod, téléchargement à la
// demande puis gardé sur l'appareil (Cache Storage simulé), hors ligne ensuite ; musique fabriquée → WAV ouvert par le
// moteur comme un son importé.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importerSon } from '../../sons/import';
import { CACHE_MUSIQUES, fichierKevin, fichierPropose, kevinDisponibles, kevinGardes, urlKevin } from './musiques-arko';

/** Cache Storage en mémoire (seulement ce dont le chargeur a besoin). */
function fauxCaches() {
  const boites = new Map<string, Map<string, Response>>();
  return {
    boites,
    async open(nom: string) {
      if (!boites.has(nom)) boites.set(nom, new Map());
      const b = boites.get(nom)!;
      return {
        async match(url: string) {
          return b.get(url)?.clone();
        },
        async put(url: string, r: Response) {
          b.set(url, r);
        },
      };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('musiques proposées par Arko', () => {
  it('adresse des morceaux de Kevin MacLeod sous la base du site', () => {
    expect(urlKevin('carefree.m4a', '/arko/')).toBe('http://localhost/arko/musiques/kevin-macleod/carefree.m4a');
    expect(urlKevin('a b.m4a', '/')).toBe('http://localhost/musiques/kevin-macleod/a%20b.m4a');
  });

  it('téléchargé à la demande, gardé sur l\'appareil, puis disponible sans internet', async () => {
    const caches = fauxCaches();
    vi.stubGlobal('caches', caches);
    const octets = new Uint8Array([1, 2, 3, 4]);
    const fetch = vi.fn(async () => new Response(octets, { status: 200, headers: { 'content-type': 'audio/mp4' } }));
    vi.stubGlobal('fetch', fetch);
    expect((await kevinGardes()).size).toBe(0);
    const f = await fichierKevin('carefree');
    expect(f.name).toBe('Kevin MacLeod - Carefree.m4a');
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(octets);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(caches.boites.get(CACHE_MUSIQUES)?.size).toBe(1);
    // La fois suivante, hors ligne : depuis l'appareil, sans réseau.
    vi.stubGlobal('navigator', { onLine: false });
    expect([...(await kevinGardes())]).toEqual(['carefree']);
    const dispo = await kevinDisponibles();
    expect(dispo('carefree')).toBe(true);
    expect(dispo('investigations')).toBe(false);
    const g = await fichierKevin('carefree');
    expect(g.size).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(fichierKevin('inconnu')).rejects.toThrow();
  });

  it('téléchargement raté : une erreur (la page met alors une musique fabriquée)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(fichierKevin('investigations')).rejects.toThrow();
  });

  it('musique fabriquée : un WAV, rendu une seule fois, ouvert par le moteur comme un son importé', async () => {
    const f = (await fichierPropose('arko:rigolo:2'))!;
    expect(f.name).toBe('Musique Arko - Rigolo 2.wav');
    expect(await fichierPropose('arko:rigolo:2')).toBe(f);
    expect(await fichierPropose('bib:m1')).toBeNull();
    const s = await importerSon(f);
    expect(s.infos.type).toBe('audio');
    expect(s.infos.duree).toBeGreaterThan(25);
    expect(s.infos.duree).toBeLessThan(45);
  });
});
