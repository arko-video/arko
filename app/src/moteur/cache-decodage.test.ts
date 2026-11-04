// I-4 : les décodeurs sont gardés d'un rendu à l'autre tant que la source et le plan ne changent pas.
import { describe, expect, it } from 'vitest';
import { CacheDecodage, clesDesPlans } from './cache-decodage';
import type { MediaOuvert } from './media';

const media = () => ({}) as MediaOuvert;
function cacheCompte() {
  const crees = { video: 0, audio: 0 };
  const cache = new CacheDecodage({
    video: () => (crees.video++, { samples: () => (async function* () {})() }),
    audio: () => (crees.audio++, null),
  });
  return { cache, crees };
}

describe('CacheDecodage (I-4)', () => {
  it('clés : (src, de, a, vit) + rang pour un passage réutilisé', () => {
    const p = { src: 's1', de: 1, a: 2, vit: 1 };
    expect(clesDesPlans([p, { ...p, vit: 2 }, p])).toEqual(['s1|1|2|1#0', 's1|1|2|2#0', 's1|1|2|1#1']);
  });

  it('même média : sinks gardés ; plan inchangé : même curseur', () => {
    const { cache, crees } = cacheCompte();
    const m = media();
    const medias = new Map([['s1', m]]);
    cache.preparer(medias);
    const plan = { src: 's1', a: 5 };
    const c1 = cache.curseur('s1|0|5|1#0', plan);
    // Nouveau rendu (ex. seule la mise en page a changé) :
    cache.preparer(new Map([['s1', m]]));
    expect(cache.curseur('s1|0|5|1#0', plan)).toBe(c1);
    expect(crees.video).toBe(1);
    // Plan rogné : nouveau curseur, mais toujours la même sink.
    cache.garderSeulement(new Set(['s1|0|4|1#0']));
    const c2 = cache.curseur('s1|0|4|1#0', { src: 's1', a: 4 });
    expect(c2).not.toBe(c1);
    expect(cache.nombreCurseurs).toBe(1);
    expect(crees.video).toBe(1);
  });

  it('média changé ou fermé : tout est recréé ou oublié', async () => {
    const { cache, crees } = cacheCompte();
    cache.preparer(new Map([['s1', media()]]));
    cache.curseur('k', { src: 's1', a: 1 });
    cache.preparer(new Map([['s1', media()]]));
    expect(crees.video).toBe(2);
    expect(cache.nombreCurseurs).toBe(0);
    cache.preparer(new Map());
    expect(cache.curseur('k', { src: 's1', a: 1 })).toBeNull();
    await cache.fermer();
  });
});
