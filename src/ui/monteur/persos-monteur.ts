// « Persos de qui parle » dans le monteur SANS IA (clips TikTok, Shorts, YouTube), 7/11/2026 : la même étape que le
// Best-of (auto/voix/voix-montage.ts + persos-montage.ts). On écoute les voix une fois pour tous les clips, puis chaque
// clip reçoit les personnes qui parlent dans son passage, leur perso (choisi, sinon perso tout prêt 1, 2, 3…) et les
// avatars. Réglage « Persos de qui parle » coché d'office, mémorisé (localStorage `arko.monteur.persos`).
// Revue : « Qui parle ? » nomme les voix et change leur perso dans tous les clips pas encore triés.

import { signal } from '@preact/signals';
import { poserPersos, type VoixEcoutees } from '../../auto/voix/persos-montage';
import { ecouterVoix } from '../../auto/voix/voix-montage';
import type { SignauxSource } from '../../auto/types';
import type { Moment, SourceOuverte } from '../../moteur/api';
import { renommerPersonne } from '../../recette/operations';
import { donnerChibi } from '../../recette/operations-chibis';
import type { DefinitionChibi, Mot, Recette } from '../../recette/types';
import { motsDejaTranscrits } from '../../sous-titres/transcription-longue';
import type { Brouillon } from './etat-monteur';

export const CLE_PERSOS = 'arko.monteur.persos';

function lire(): boolean {
  try {
    return localStorage.getItem(CLE_PERSOS) !== '0';
  } catch {
    return true;
  }
}

/** Réglage « Persos de qui parle » (coché d'office). */
export const persosSurClips = signal(lire());

export function reglerPersos(oui: boolean) {
  persosSurClips.value = oui;
  try {
    localStorage.setItem(CLE_PERSOS, oui ? '1' : '0');
  } catch {
    // Stockage bloqué : le réglage vaut pour cette fois.
  }
}

/** Les voix écoutées pour la revue en cours (cartes « Qui parle ? » de la revue). */
export const voixClips = signal<(VoixEcoutees & { source: SourceOuverte }) | null>(null);

/** Moments sans mots : on prend ceux déjà transcrits sur l'appareil (Montage express, Couper les blancs), s'il y en a. */
export async function avecMotsGardes(source: SourceOuverte, moments: Moment[]): Promise<Moment[]> {
  if (moments.every((m) => m.mots && m.mots.length > 0)) return moments;
  const d = source.infos.duree;
  const plages = moments.map((m) => ({ de: Math.max(0, m.debut - 20), a: Math.min(d, m.fin + 10) }));
  const mots = await motsDejaTranscrits(source, plages).catch(() => null);
  if (!mots) return moments;
  return moments.map((m, i) => (m.mots && m.mots.length > 0 ? m : { ...m, mots: mots.filter((w) => w[1] >= plages[i]!.de && w[1] < plages[i]!.a) }));
}

/**
 * Écoute les voix (sur le passage de la source couvert par les clips) et pose les persos dans chaque brouillon.
 * Réglage décoché, ou aucune voix : les brouillons sont rendus tels quels.
 */
export async function persosDesClips(
  source: SourceOuverte,
  brouillons: Brouillon[],
  o: { signal?: AbortSignal; surProgression?: (p: number, m: string) => void; signaux?: SignauxSource | null } = {},
): Promise<{ brouillons: Brouillon[]; avertissement?: string }> {
  voixClips.value = null;
  if (!persosSurClips.peek() || brouillons.length === 0) return { brouillons };
  const plans = brouillons.flatMap((b) => b.recette.plans.filter((p) => !p.ins));
  if (plans.length === 0) return { brouillons };
  const d = source.infos.duree;
  const plage = { de: Math.max(0, Math.min(...plans.map((p) => p.de)) - 5), a: Math.min(d, Math.max(...plans.map((p) => p.a)) + 5) };
  const mots = brouillons.flatMap((b) => motsDe(b.recette)).sort((a, b) => a[1] - b[1]);
  const ecoute = await ecouterVoix(source, { signal: o.signal, surProgression: o.surProgression, mots, plage });
  if (!ecoute.voix) return { brouillons, ...(ecoute.avertissement ? { avertissement: ecoute.avertissement } : {}) };
  voixClips.value = { ...ecoute, source };
  return {
    brouillons: brouillons.map((b) => {
      const p = b.recette.plans.find((x) => !x.ins);
      if (!p) return b;
      const m = motsDe(b.recette);
      const recette = poserPersos(b.recette, ecoute, { ...(m.length > 0 ? { mots: m } : {}), signaux: o.signaux ?? null, plage: { de: p.de, a: p.a } });
      return recette === b.recette ? b : { ...b, recette };
    }),
  };
}

function motsDe(r: Recette): Mot[] {
  return Array.isArray(r.sousTitres?.mots) ? r.sousTitres.mots : [];
}

/** « Qui parle ? » de la revue : nom d'une voix, dans un brouillon (sans effet si la voix n'y parle pas). */
export function nommerDansClip(r: Recette, p: string, nom: string): Recette {
  return r.personnes?.some((x) => x.id === p) ? renommerPersonne(r, p, nom) : r;
}

/** « Qui parle ? » de la revue : perso d'une voix, dans un brouillon. */
export function persoDansClip(r: Recette, p: string, def: DefinitionChibi, bib?: string): Recette {
  return r.personnes?.some((x) => x.id === p) ? donnerChibi(r, p, def, bib) : r;
}
