// Mini-frise des outils Fond vert et Mèmes : une barre par clip posé par-dessus la vidéo (id = indice de
// l'incrustation) et, dans Mèmes, une barre par mème « Coupure » (id = −1 − indice du plan, genre « meme »).

import { bornesDesPlans } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import type { Calque } from './MiniFrise';

export function calquesClips(r: Recette, outil: 'fondVert' | 'memes', choisi: number | null): Calque[] {
  const nom = (src: string) => r.sources.find((s) => s.id === src)?.nom.replace(/\.[a-z0-9]{1,5}$/i, '') ?? src;
  const res: Calque[] = [];
  (r.incrustations ?? []).forEach((x, i) => {
    const genre = x.genre ?? 'fondVert';
    if (genre !== outil.replace('memes', 'meme')) return;
    res.push({ id: i, t0: x.t, t1: x.t + (x.a - x.de), label: nom(x.src), genre: 'clip', choisi: choisi === i });
  });
  if (outil === 'memes') {
    const bornes = bornesDesPlans(r);
    r.plans.forEach((p, i) => {
      const s = r.sources.find((x) => x.id === p.src);
      if (!s?.bib) return;
      res.push({ id: -1 - i, t0: bornes[i]!, t1: bornes[i + 1]!, label: nom(s.id), genre: 'meme', choisi: choisi === -1 - i });
    });
  }
  return res.sort((a, b) => a.t0 - b.t0);
}
