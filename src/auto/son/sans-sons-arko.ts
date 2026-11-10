// Demande de Romain (10/11/2026) : « oublie tes sons de base, ils sont vraiment trop mauvais, n'utilise que les sound
// effects que j'ai ajoutés dans la bibliothèque ». Les montages automatiques (Montage express, Best-of, monteur IA)
// ne gardent AUCUN son fabriqué par Arko : les sons du catalogue d'Arko sont retirés (titres de section, Top 3,
// effets…), et les transitions n'ont plus leur son d'office (son: false). Les sons de Ma bibliothèque restent. Pure.

import type { Recette } from '../../recette/types';
import { CATALOGUE } from '../../sons/catalogue';

const IDS_ARKO = new Set(CATALOGUE.map((s) => s.id));

/** Vrai pour un son fabriqué par Arko (pas un fichier de l'utilisateur). */
export const estSonArko = (id: string) => IDS_ARKO.has(id);

export function sansSonsArko(r: Recette): Recette {
  const sons = r.sons ?? [];
  const gardes = sons.filter((s) => !estSonArko(s.id));
  let change = gardes.length !== sons.length;
  const plans = r.plans.map((p) => {
    if (!p.trans) return p;
    // Une transition écrite en court (« zoom ») a le son d'office : on la passe en objet, sans son.
    const tr = typeof p.trans === 'string' ? { type: p.trans } : p.trans;
    if (tr.son === false || (typeof tr.son === 'string' && !estSonArko(tr.son))) return p;
    change = true;
    return { ...p, trans: { ...tr, son: false as const } };
  });
  if (!change) return r;
  const res: Recette = { ...r, plans };
  if (r.sons) res.sons = gardes;
  return res;
}
