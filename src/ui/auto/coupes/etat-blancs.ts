// État du panneau « Couper les blancs » (A, dev 1) : choix (sur quoi, comment, réglage), analyse sur l'appareil
// (signaux du son + mots de Whisper ou voix au son), aperçu calculé à chaque changement de réglage, puis UNE
// opération de la recette (un seul Annuler). Les analyses déjà faites sont gardées tant que le projet est ouvert.

import { computed, signal } from '@preact/signals';
import { apercuBlancs, morceauxDeParole, morceauxDeVoix, REGLAGES_BLANCS, type ApercuBlancs } from '../../../auto/coupes/blancs';
import { premiereVideo } from '../../../auto/coupes/decoupe';
import { mesurerVoix } from '../../../auto/coupes/mesures';
import type { EnergieVoix } from '../../../auto/coupes/voix';
import { lireSignauxSource } from '../../../auto/signaux-source';
import type { Morceau, PlageTemps, SignauxSource } from '../../../auto/types';
import { ErreurArko, type SourceOuverte } from '../../../moteur/api';
import { couperLesBlancs, dureeFinale } from '../../../recette/operations';
import type { Mot, NiveauBlancs } from '../../../recette/types';
import { transcrireLongue } from '../../../sous-titres/transcription-longue';
import { TA } from '../../../textes-auto';
import { T } from '../../../textes-fr';
import { agirCoupe } from '../../coupes';
import { afficherToast, annulerAction, quandProjetQuitte, recette, selection, sources } from '../../etat';
import { formatHeure } from '../../format';
import { plagesDuChoix, type SurQuoi } from './choix-blancs';

export type { SurQuoi } from './choix-blancs';
export type Methode = 'mots' | 'voix';
export type EtapeBlancs = 'reglages' | 'analyse' | 'apercu' | 'erreur';

/** Résultat d'une analyse : de quoi recalculer les morceaux pour chaque réglage, sans réécouter. */
export interface AnalyseBlancs {
  methode: Methode;
  /** Partie écoutée (temps source). */
  zone: PlageTemps;
  /** Plage passée à couperLesBlancs (absente = les plans actuels). */
  coupe?: PlageTemps;
  mots: Mot[] | null;
  voix: EnergieVoix | null;
  signaux: SignauxSource;
}

export const ouvertBlancs = signal(false);
export const surQuoi = signal<SurQuoi>('montage');
export const methode = signal<Methode>('mots');
export const deTexte = signal('0:00');
export const aTexte = signal('0:00');
export const niveau = signal<NiveauBlancs>('normal');
export const etape = signal<EtapeBlancs>('reglages');
export const progression = signal<{ p: number; message: string }>({ p: 0, message: '' });
export const erreur = signal('');
export const analyse = signal<AnalyseBlancs | null>(null);

let controleur: AbortController | null = null;
const dejaFaites = new Map<string, AnalyseBlancs>();
quandProjetQuitte(() => {
  controleur?.abort();
  dejaFaites.clear();
  analyse.value = null;
  ouvertBlancs.value = false;
});

/** Source vidéo des plans sans `src` (celle qu'on coupe). */
export function sourceACouper(): SourceOuverte | undefined {
  const r = recette.peek();
  const id = r ? premiereVideo(r) : undefined;
  return sources.peek().find((s) => s.infos.id === id) ?? sources.peek()[0];
}

/** À l'ouverture : « toute la vidéo » pour une longue vidéo pas encore coupée, sinon « mon montage ». */
export function ouvrirBlancs() {
  const r = recette.peek();
  const s = sourceACouper();
  if (!r || !s) return;
  const longue = r.plans.length === 1 && s.infos.duree > dureeFinale(r) + 1;
  surQuoi.value = longue ? 'toute' : 'montage';
  deTexte.value = formatHeure(0);
  aTexte.value = formatHeure(s.infos.duree);
  etape.value = 'reglages';
  erreur.value = '';
  ouvertBlancs.value = true;
}

export function fermerBlancs() {
  controleur?.abort();
  ouvertBlancs.value = false;
}

async function garderEcranAllume(): Promise<() => void> {
  try {
    if (!('wakeLock' in navigator)) return () => {};
    const v = await navigator.wakeLock.request('screen');
    return () => void v.release().catch(() => {});
  } catch {
    return () => {};
  }
}

/** Écoute la vidéo (ou reprend une analyse déjà faite), puis montre l'aperçu. */
export async function analyser() {
  const r = recette.peek();
  const source = sourceACouper();
  if (!r || !source) return;
  const plages = plagesDuChoix(r, source.infos.duree, surQuoi.peek(), deTexte.peek(), aTexte.peek());
  if (typeof plages === 'string') {
    erreur.value = plages;
    return;
  }
  erreur.value = '';
  const m = methode.peek();
  const cle = `${source.infos.emp}|${m}|${plages.zone.de}|${plages.zone.a}`;
  const connue = dejaFaites.get(cle);
  if (connue) {
    analyse.value = { ...connue, coupe: plages.coupe };
    etape.value = 'apercu';
    return;
  }
  controleur?.abort();
  const c = new AbortController();
  controleur = c;
  etape.value = 'analyse';
  progression.value = { p: 0, message: TA.coupes.blancs.signaux };
  const relacher = await garderEcranAllume();
  try {
    const signaux = await lireSignauxSource(source, { signal: c.signal, surProgression: (p) => (progression.value = { p: p * 0.2, message: TA.coupes.blancs.signaux }) });
    const suite = (p: number, message: string) => (progression.value = { p: 0.2 + 0.8 * p, message });
    let mots: Mot[] | null = null;
    let voix: EnergieVoix | null = null;
    if (m === 'mots') mots = (await transcrireLongue(source, { plage: plages.zone, signal: c.signal, surProgression: suite })).mots;
    else voix = await mesurerVoix(source, { plage: plages.zone, signal: c.signal, surProgression: suite });
    if (controleur !== c) return;
    const res: AnalyseBlancs = { methode: m, zone: plages.zone, coupe: plages.coupe, mots, voix, signaux };
    dejaFaites.set(cle, res);
    analyse.value = res;
    etape.value = 'apercu';
  } catch (e) {
    if (controleur !== c) return;
    if (e instanceof ErreurArko && e.code === 'annule') {
      etape.value = 'reglages';
      afficherToast(TA.coupes.blancs.annule);
      return;
    }
    console.error(e);
    erreur.value = e instanceof ErreurArko ? e.message : TA.commun.erreur;
    etape.value = 'erreur';
  } finally {
    relacher();
    if (controleur === c) controleur = null;
  }
}

export function arreter() {
  controleur?.abort();
}

/** Morceaux gardés pour le réglage choisi (recalculés sans réécouter). */
export const morceaux = computed<Morceau[]>(() => {
  const a = analyse.value;
  if (!a) return [];
  const reglages = REGLAGES_BLANCS[niveau.value];
  return a.mots ? morceauxDeParole(a.mots, a.signaux, reglages, a.zone) : a.voix ? morceauxDeVoix(a.voix, a.signaux, reglages, a.zone) : [];
});

/** Aperçu « 2 h 03 → 41 min de parole · 312 coupes » sur la recette actuelle. */
export const apercu = computed<ApercuBlancs | null>(() => {
  const r = recette.value;
  const a = analyse.value;
  if (!r || !a) return null;
  return apercuBlancs(r, morceaux.value, a.coupe, niveau.value);
});

/** Applique : une seule opération, donc un seul Annuler. */
export function appliquer() {
  const a = analyse.peek();
  const ap = apercu.peek();
  if (!a || !ap || morceaux.peek().length === 0) return;
  const liste = morceaux.peek();
  const n = niveau.peek();
  if (!agirCoupe((r) => couperLesBlancs(r, liste, n, { plage: a.coupe }), 0)) return;
  selection.value = null;
  ouvertBlancs.value = false;
  afficherToast(TA.coupes.blancs.applique(ap.coupes), 6000, { label: T.annuler, agir: annulerAction });
}

export { dureeLisible, plagesDuChoix } from './choix-blancs';
