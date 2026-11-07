// Best-of (intégrateur) : « Sous-titres pour : <personne> ». En mode punchlines, TOUTES les phrases d'une personne
// (la voix qu'on entend mal, retour de Romain sur son vrai montage) sont aussi sous-titrées, en style « boîte », en bas :
// 7 mots au plus, 0,7 à 2,8 s par ligne ; jamais en même temps qu'une punchline (elle a la priorité).
// Une ligne reste 0,4 s après la fin de son dernier mot (comme la punchline de la DA, + 0,2 s ; demande de dev-persos :
// + 11 sous-titres de Romain recouverts sur les plans de la vérité), sans dépasser 2,8 s ni toucher la suivante.
// Pures : appelées par sous-titres-places.ts, donc par le scénario (un seul chemin : aperçu = export).

import type { MotPlace, LignePlacee } from './sous-titres-places';
import type { Mot, Sec, TourDeParole } from './types';

export const SOUS_TITRES_VOIX = { style: 'boite', motsMax: 7, min: 0.7, max: 2.8, tenue: 0.4, yPaysage: 0.88 } as const;

/** Personne d'un mot : celle dont les tours le recouvrent le plus (tours triés par début) ; null si aucun. */
export function personneDuMotRapide(tours: readonly TourDeParole[], longueurMax: Sec, mot: Mot): string | null {
  const [, a, b] = mot;
  // Premier tour qui commence à b ou après (recherche dichotomique), puis on remonte.
  let bas = 0;
  let haut = tours.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (tours[m]!.ts < b) bas = m + 1;
    else haut = m;
  }
  const parPersonne = new Map<string, number>();
  for (let i = bas - 1; i >= 0; i--) {
    const t = tours[i]!;
    if (t.ts < a - longueurMax) break;
    const rec = Math.min(b, t.fin) - Math.max(a, t.ts);
    if (rec > 0) parPersonne.set(t.p, (parPersonne.get(t.p) ?? 0) + rec);
  }
  let meilleur: string | null = null;
  let max = 0;
  for (const [p, d] of parPersonne) if (d > max) [meilleur, max] = [p, d];
  return meilleur;
}

/** Tours de la vidéo `src` (absent = 1re vidéo), triés. */
export function toursDeLaVideo(paroles: readonly TourDeParole[], src: string, premiere: string): TourDeParole[] {
  return paroles.filter((t) => (t.src ?? premiere) === src).sort((x, y) => x.ts - y.ts);
}

/**
 * Lignes de la personne `p` : ses mots placés qui ne sont pas dans une punchline (`dansPunchline`), regroupés par
 * `decouper`, tenus 0,7 s au moins ; une ligne qui croiserait une punchline est retirée. Renvoie les punchlines et
 * ces lignes, triées et sans chevauchement.
 */
export function avecLignesVoix(
  punch: readonly LignePlacee[],
  mots: readonly MotPlace[],
  tours: readonly TourDeParole[],
  p: string,
  y: number,
  dansPunchline: (m: Mot) => boolean,
  decouper: (mots: MotPlace[], parLigne: number, dureeMax: number) => LignePlacee[],
): LignePlacee[] {
  if (tours.length === 0) return [...punch];
  const longueurMax = tours.reduce((m, t) => Math.max(m, t.fin - t.ts), 0);
  const siens = mots.filter((m) => !dansPunchline(m.mot) && personneDuMotRapide(tours, longueurMax, m.mot) === p);
  const S = SOUS_TITRES_VOIX;
  const croise = (l: { t0: Sec; t1: Sec }) => punch.some((x) => l.t0 < x.t1 && x.t0 < l.t1);
  const voix = decouper(siens, S.motsMax, S.max)
    .map((l) => ({ ...l, t1: Math.max(l.t0 + S.min, Math.min(l.t1 + S.tenue, Math.max(l.t1, l.t0 + S.max))), style: S.style, y }))
    .filter((l) => !croise({ t0: l.t0, t1: l.mots[l.mots.length - 1]!.t1 }));
  const toutes = [...punch, ...voix].sort((x, z) => x.t0 - z.t0);
  // Une ligne tenue (0,7 s au moins) s'arrête où la suivante commence.
  return toutes.map((l, i) => {
    const suivante = toutes[i + 1]?.t0 ?? Infinity;
    return l.style && l.t1 > suivante ? { ...l, t1: Math.max(l.t0 + 0.01, suivante) } : l;
  });
}
