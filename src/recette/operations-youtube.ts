// Opérations YouTube sur la recette (pures, repassées par le normaliseur) : chapitres, intro et outro.
// Comme toutes les opérations, elles renvoient une NOUVELLE recette ; l'interface les passe à modifier().

import { CHAPITRES } from './chapitres';
import { normaliser } from './normaliser';
import { dureeCorps, type Place } from './generiques';
import { arrondir } from './temps';
import type { Generique, Recette, Sec, Source } from './types';

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

/** Pose un chapitre au temps de sortie t (aucun si un chapitre existe déjà à moins d'1 s). */
export function ajouterChapitre(r: Recette, t: Sec, nom: string): { recette: Recette; i: number } {
  const liste = r.chapitres ?? [];
  const tt = arrondir(Math.min(Math.max(0, t), dureeCorps(r)));
  const proche = liste.findIndex((c) => Math.abs(c.t - tt) < 1);
  if (proche >= 0 || liste.length >= CHAPITRES.max) return { recette: r, i: proche };
  const recette = finir({ ...r, chapitres: [...liste, { t: tt, nom: nom.slice(0, CHAPITRES.nomMax) }] });
  return { recette, i: (recette.chapitres ?? []).findIndex((c) => c.t === tt) };
}

export function renommerChapitre(r: Recette, i: number, nom: string): Recette {
  const liste = r.chapitres ?? [];
  if (!liste[i]) return r;
  return finir({ ...r, chapitres: liste.map((c, k) => (k === i ? { ...c, nom: nom.slice(0, CHAPITRES.nomMax) } : c)) });
}

export function supprimerChapitre(r: Recette, i: number): Recette {
  const liste = r.chapitres ?? [];
  if (!liste[i]) return r;
  return finir({ ...r, chapitres: liste.filter((_, k) => k !== i) });
}

/** Premier id libre « g1 », « g2 »… pour la vidéo d'une intro ou d'une outro. */
export function idGenerique(r: Recette, autres: readonly string[] = []): string {
  const pris = new Set([...r.sources.map((s) => s.id), ...autres]);
  let n = 1;
  while (pris.has(`g${n}`)) n++;
  return `g${n}`;
}

/** Sources vidéo d'intro / outro que plus rien n'utilise : retirées (le montage ne garde que les siennes). */
function sansSourcesOrphelines(r: Recette): Recette {
  // Les clips de Ma bibliothèque posés par-dessus la vidéo (fonds verts, mèmes) sont aussi « utilisés ».
  const utilisees = new Set([r.intro?.src, r.outro?.src, ...r.plans.map((p) => p.src), ...(r.incrustations ?? []).map((i) => i.src)]);
  const premiere = r.sources.find((s) => s.type === 'video')?.id;
  return { ...r, sources: r.sources.filter((s) => s.type !== 'video' || s.id === premiere || utilisees.has(s.id)) };
}

/**
 * Met (ou retire, avec null) l'intro ou l'outro. Pour une vidéo de l'utilisateur, `source` est sa fiche
 * (même id que g.src) : elle est ajoutée à la recette, à la FIN des sources (la vidéo du montage reste la 1ʳᵉ).
 */
export function choisirGenerique(r: Recette, place: Place, g: Generique | null, source?: Source): Recette {
  let res: Recette = { ...r };
  if (g) res[place] = { ...g };
  else delete res[place];
  if (g?.src && source && !res.sources.some((s) => s.id === source.id)) res.sources = [...res.sources, { ...source }];
  res = sansSourcesOrphelines(res);
  return finir(res);
}

/** Change seulement la durée (ou le texte, la chaîne) de l'intro / outro existante. */
export function reglerGenerique(r: Recette, place: Place, partiel: Partial<Omit<Generique, 'src'>>): Recette {
  const g = r[place];
  return g ? finir({ ...r, [place]: { ...g, ...partiel } }) : r;
}

/** Qualité d'export : 'haute' = 1440p en YouTube 16:9 (si l'appareil sait l'encoder). */
export function choisirQualite(r: Recette, qualite: 'normale' | 'haute'): Recette {
  return finir({ ...r, export: { ...r.export, qualite } });
}
