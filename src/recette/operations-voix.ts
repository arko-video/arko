// C. Opérations « Qui parle » (dev 1). Mêmes règles que operations.ts : NOUVELLE recette normalisée ; la recette
// d'origine si rien ne change ; une opération = un seul Annuler. Contrat : conception/contrat-wankil.md §3.3.

import { estPasEncoreFait } from '../auto/pas-encore-fait';
import type { SignauxSource } from '../auto/types';
import type { EmpreintesVoix, VoixDetectees } from '../auto/types-v3';
import { personneDe } from '../auto/voix/attribution';
import { completerTours } from '../chibis/bouche';
import { normaliser } from './normaliser';
import type { Mot, Personne, Recette, Sec, TourDeParole } from './types';

export interface OptionsQuiParle {
  /** Noms choisis sur l'écran « Qui parle ? » (id de la voix → nom). */
  noms?: Readonly<Record<string, string>>;
  /** Empreintes mesurées : la bouche des avatars en est tirée (completerTours du dev 3). */
  empreintes?: readonly EmpreintesVoix[];
  mots?: readonly Mot[];
  signaux?: SignauxSource | null;
}

/** Pastilles des personnes, dans l'ordre (contrastées entre elles, lisibles sur fond sombre). */
export const COULEURS_VOIX = ['#4FC3F7', '#FFB74D', '#81C784', '#F06292', '#BA68C8', '#FFF176', '#A1887F', '#90A4AE'] as const;

function finir(origine: Recette, r: Recette): Recette {
  const n = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(n) === JSON.stringify(origine) ? origine : n;
}

/**
 * Écrit `personnes` et `paroles` à partir des voix détectées (remplace les anciennes ; garde le chibi et la place
 * d'une personne qui garde le même id). Complète émotion et bouche avec `completerTours` (dev 3) quand il est prêt ;
 * sinon les tours restent sans `emo` ni `b` (l'avatar parle normalement).
 */
export function definirQuiParle(recette: Recette, d: VoixDetectees, o: OptionsQuiParle = {}): Recette {
  if (d.voix.length === 0) return retirerQuiParle(recette);
  const anciennes = new Map((recette.personnes ?? []).map((p) => [p.id, p]));
  const personnes: Personne[] = d.voix.slice(0, 8).map((v, i) => {
    const a = anciennes.get(v.id);
    const p: Personne = { ...(a ?? {}), id: v.id, nom: (o.noms?.[v.id] ?? a?.nom ?? `Voix ${i + 1}`).trim().slice(0, 24) || `Voix ${i + 1}` };
    p.couleur = a?.couleur ?? COULEURS_VOIX[i % COULEURS_VOIX.length];
    if (v.piste !== undefined) p.piste = v.piste;
    else delete p.piste;
    p.niveauDb = Math.round(v.niveauDb * 10) / 10;
    return p;
  });
  const videos = recette.sources.filter((s) => s.type === 'video').map((s) => s.id);
  const avecSrc = videos.includes(d.src) && d.src !== videos[0];
  let paroles: TourDeParole[] = d.tours.map((t) => {
    const x: TourDeParole = { ts: t.ts, fin: t.fin, p: t.p };
    if (avecSrc) x.src = d.src;
    if (t.sur === false) x.sur = false;
    return x;
  });
  try {
    const piste = new Map(personnes.map((p) => [p.id, p.piste]));
    const enveloppe = (t: TourDeParole) => o.empreintes?.find((e) => e.piste === piste.get(t.p)) ?? o.empreintes?.[0] ?? null;
    // Seuil de la bouche = niveau habituel de la personne − 10 dB (dev 3 : plus juste que la médiane du tour).
    const niveaux = Object.fromEntries(personnes.filter((p) => p.niveauDb !== undefined).map((p) => [p.id, p.niveauDb!]));
    paroles = completerTours(paroles, { enveloppe, mots: o.mots, signaux: o.signaux ?? null, niveaux });
  } catch (e) {
    if (!estPasEncoreFait(e)) throw e;
  }
  return finir(recette, { ...recette, personnes, paroles });
}

export function renommerPersonne(recette: Recette, p: string, nom: string): Recette {
  const propre = nom.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!propre || !recette.personnes?.some((x) => x.id === p)) return recette;
  return finir(recette, { ...recette, personnes: recette.personnes.map((x) => (x.id === p ? { ...x, nom: propre } : x)) });
}

/** Tours de la même vidéo que `src` (absent = la 1re vidéo). */
function memeVideo(recette: Recette, t: TourDeParole, src?: string): boolean {
  const premiere = recette.sources.find((s) => s.type === 'video')?.id;
  return (t.src ?? premiere) === (src ?? premiere);
}

/** La phrase [ts, fin] (temps source) est dite par `p` : les tours qui la couvrent sont découpés et réattribués. */
export function attribuerPhrase(recette: Recette, ts: Sec, fin: Sec, p: string, src?: string): Recette {
  if (!(fin > ts) || !recette.personnes?.some((x) => x.id === p)) return recette;
  const premiere = recette.sources.find((s) => s.type === 'video')?.id;
  const paroles: TourDeParole[] = [];
  for (const t of recette.paroles ?? []) {
    if (!memeVideo(recette, t, src) || t.fin <= ts || t.ts >= fin) {
      paroles.push(t);
      continue;
    }
    // Les morceaux hors de la phrase restent à leur personne ; ils perdent leur bouche (calée sur l'ancien début).
    const { b: _b, ...reste } = t;
    void _b;
    if (t.ts < ts) paroles.push({ ...reste, fin: ts });
    if (t.fin > fin) paroles.push({ ...reste, ts: fin });
  }
  const nouveau: TourDeParole = { ts, fin, p };
  if (src && src !== premiere) nouveau.src = src;
  paroles.push(nouveau);
  paroles.sort((x, y) => x.ts - y.ts || x.fin - y.fin);
  return finir(recette, { ...recette, paroles });
}

/** Correction d'un toucher : la phrase passe à la personne suivante (p1 → p2 → … → p1). */
export function personneSuivante(recette: Recette, ts: Sec, fin: Sec, src?: string): Recette {
  const personnes = recette.personnes ?? [];
  if (personnes.length === 0) return recette;
  const tours = (recette.paroles ?? []).filter((t) => memeVideo(recette, t, src));
  const actuelle = personneDe(tours, ts, fin);
  const i = personnes.findIndex((x) => x.id === actuelle);
  const suivante = personnes[(i + 1) % personnes.length]!;
  return attribuerPhrase(recette, ts, fin, suivante.id, src);
}

/** Retire personnes, tours de parole et avatars. */
export function retirerQuiParle(recette: Recette): Recette {
  if (!recette.personnes && !recette.paroles && !recette.avatars) return recette;
  const { personnes: _p, paroles: _t, avatars: _a, ...reste } = recette;
  void _p;
  void _t;
  void _a;
  return finir(recette, reste as Recette);
}
