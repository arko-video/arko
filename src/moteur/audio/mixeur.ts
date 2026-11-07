// Mixage (pur, 48 kHz stéréo) d'un bloc de la vidéo finale :
// morceaux des plans (rééchantillonnés × vit) → fondu de 5 ms aux coupes → effets sonores × vol
// Pendant un arrêt sur image (de tFige à t1), le plan est MUET : son morceau s'arrête à tFige.
// → son guide seulement si demandé → musique de fond (baissée quand on parle) → limiteur doux (linéaire jusqu'à
// −1 dBFS, jamais plus de −0,3 dBFS).
// Ce fichier ne lit aucun fichier : on lui fournit le PCM déjà décodé (testable avec du PCM synthétique).

import { ETAT_BAISSE_REPOS, gainsBaisse, voixDuBloc, type EtatBaisse } from '../../auto/son/baisse';
import type { PlanPlace, Scenario } from '../../recette/chronologie';
import { FONDUS_HABITUELS, type FondusCoupes } from './fondus-coupes';
import { courbeSecurite, limiter } from './limiteur';
import type { BlocMusique } from './musique';
import { FREQUENCE_SORTIE, reechantillonnerDans, type Pcm } from './reechantillonner';

export const FONDU_S = FONDUS_HABITUELS.entree;

/** Morceau d'un plan qui tombe dans le bloc demandé. */
export interface MorceauBloc {
  plan: PlanPlace;
  /** Index du premier échantillon dans le bloc, et nombre d'échantillons. */
  k0: number;
  n: number;
  /** Temps source au premier échantillon. */
  ts0: number;
  /** Temps source (exclu) atteint au dernier échantillon : plage à décoder [ts0, ts1]. */
  ts1: number;
}

/** Découpe le bloc [t0, t0 + n / f[ en morceaux de plans (pur). */
export function morceauxDuBloc(s: Scenario, t0: number, n: number, f = FREQUENCE_SORTIE): MorceauBloc[] {
  const res: MorceauBloc[] = [];
  const t1 = t0 + n / f;
  for (const plan of s.plans) {
    if (plan.tFige <= t0 || plan.t0 >= t1) continue;
    const k0 = Math.max(0, Math.ceil((plan.t0 - t0) * f - 1e-6));
    const kFin = Math.min(n, Math.ceil((plan.tFige - t0) * f - 1e-6));
    if (kFin <= k0) continue;
    const ts0 = plan.de + (t0 + k0 / f - plan.t0) * plan.vit;
    res.push({ plan, k0, n: kFin - k0, ts0, ts1: ts0 + ((kFin - k0) * plan.vit) / f });
  }
  return res;
}

/** Effet sonore (ou son guide) posé à un temps de sortie, avec son PCM. */
export interface SonPose {
  t: number;
  vol: number;
  pcm: Pcm;
}

export interface EntreeMixage {
  scenario: Scenario;
  t0: number;
  n: number;
  /** PCM de chaque morceau (même ordre que morceauxDuBloc) ; null = silence (pas de son dans la source). */
  pcmMorceaux: (Pcm | null)[];
  sons?: SonPose[];
  /** Son guide (déjà positionné) : mixé seulement si `avecGuide`. */
  guide?: SonPose | null;
  avecGuide?: boolean;
  frequence?: number;
  /** Fondus du son aux coupes (Montage auto A ; défaut 5 ms). */
  fondus?: FondusCoupes;
  /** Musique de fond du bloc (Montage auto F) : mixée avant le limiteur, baissée quand on parle. */
  musique?: BlocMusique | null;
}

/** Gain du limiteur à la fin du dernier bloc mixé, par scénario (un rendu = un scénario). */
const gainsLimiteur = new WeakMap<Scenario, { fin: number; gain: number }>();
/** État de la baisse de la musique à la fin du dernier bloc, par scénario (comme le limiteur). */
const etatsBaisse = new WeakMap<Scenario, { fin: number; etat: EtatBaisse }>();

/** Mixe un bloc et renvoie 2 canaux de `n` échantillons. */
export function mixerBloc(e: EntreeMixage): Float32Array[] {
  const f = e.frequence ?? FREQUENCE_SORTIE;
  const sortie = [new Float32Array(e.n), new Float32Array(e.n)];
  const morceaux = morceauxDuBloc(e.scenario, e.t0, e.n, f);
  morceaux.forEach((m, i) => {
    const pcm = e.pcmMorceaux[i];
    if (!pcm) return;
    reechantillonnerDans(sortie, m.k0, m.n, pcm, m.ts0, m.plan.vit, f);
    appliquerFondus(sortie, m, e.scenario, e.t0, f, e.fondus ?? FONDUS_HABITUELS);
  });
  // La voix qui commande la baisse de la musique : le son des plans seuls (avant les effets).
  const voix = e.musique?.baisse ? voixDuBloc(sortie, e.t0, f, e.musique.parole, e.musique.niveauParole) : null;
  for (const son of e.sons ?? []) ajouterSon(sortie, son, e.t0, f);
  if (e.avecGuide && e.guide) ajouterSon(sortie, e.guide, e.t0, f);
  if (e.musique && e.musique.sons.length > 0) ajouterMusique(sortie, e, voix, f);
  // Limiteur : si ce bloc suit directement le précédent (lecture ou export), on reprend son gain (pas d'à-coup).
  const avant = gainsLimiteur.get(e.scenario);
  const suite = !!avant && Math.abs(avant.fin - e.t0) < 0.5 / f;
  const gain = limiter(sortie, f, { gainDepart: suite ? avant.gain : 1 });
  gainsLimiteur.set(e.scenario, { fin: e.t0 + e.n / f, gain });
  return sortie;
}

/** Mixe la musique du bloc, baissée quand on parle (état de la baisse repris si ce bloc suit le précédent). */
function ajouterMusique(sortie: Float32Array[], e: EntreeMixage, voix: Float32Array | null, f: number) {
  const n = e.n;
  const tmp = [new Float32Array(n), new Float32Array(n)];
  for (const son of e.musique!.sons) ajouterSon(tmp, son, e.t0, f);
  if (voix) {
    const avant = etatsBaisse.get(e.scenario);
    const etat = avant && Math.abs(avant.fin - e.t0) < 0.5 / f ? avant.etat : { ...ETAT_BAISSE_REPOS };
    const gains = gainsBaisse(voix, f, etat);
    etatsBaisse.set(e.scenario, { fin: e.t0 + n / f, etat });
    for (let c = 0; c < 2; c++) for (let k = 0; k < n; k++) tmp[c]![k]! *= gains[k]!;
  }
  for (let c = 0; c < 2; c++) {
    const s = sortie[c]!;
    const a = tmp[c]!;
    for (let k = 0; k < n; k++) s[k]! += a[k]!;
  }
}

/** Fondu de 5 ms à l'entrée et à la sortie de chaque plan, sauf au tout début et à la toute fin de la vidéo. */
function appliquerFondus(sortie: Float32Array[], m: MorceauBloc, s: Scenario, t0: number, f: number, fondus: FondusCoupes) {
  const nfEntree = fondus.entree * f;
  const nfSortie = fondus.sortie * f;
  const premier = m.plan.i === 0;
  // Un plan suivi d'un arrêt sur image a toujours un fondu de sortie (le son se coupe au début de l'arrêt).
  const dernier = m.plan.i === s.plans.length - 1 && m.plan.tFige >= m.plan.t1;
  for (let k = m.k0; k < m.k0 + m.n; k++) {
    const t = t0 + k / f;
    let g = 1;
    if (!premier) g = Math.min(g, ((t - m.plan.t0) * f + 0.5) / nfEntree);
    if (!dernier) g = Math.min(g, ((m.plan.tFige - t) * f - 0.5) / nfSortie);
    if (g < 1) {
      const gg = Math.max(0, g);
      sortie[0]![k]! *= gg;
      sortie[1]![k]! *= gg;
    }
  }
}

/** Ajoute un son (lu à vitesse normale) dans le bloc. */
function ajouterSon(sortie: Float32Array[], son: SonPose, t0: number, f: number) {
  const n = sortie[0]!.length;
  const debutDansBloc = Math.max(0, Math.ceil((son.t - t0) * f - 1e-6));
  if (debutDansBloc >= n) return;
  const tmp = [new Float32Array(n), new Float32Array(n)];
  const tsSon = son.pcm.debut + (t0 + debutDansBloc / f - son.t);
  reechantillonnerDans(tmp, debutDansBloc, n - debutDansBloc, son.pcm, tsSon, 1, f);
  for (let c = 0; c < 2; c++) {
    const s = sortie[c]!;
    const a = tmp[c]!;
    for (let k = debutDansBloc; k < n; k++) s[k]! += a[k]! * son.vol;
  }
}

/** Courbe de sécurité de la sortie (sous −1 dBFS : identique ; jamais au-dessus de −0,3 dBFS). */
export function ecretageDoux(x: number): number {
  return courbeSecurite(x);
}
