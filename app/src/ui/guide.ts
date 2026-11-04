// Son guide (étape Couper) : le son tendance joué dans l'aperçu, JAMAIS exporté.
// Ses temps forts (tempsForts du moteur, en temps du fichier) sont ramenés en temps de sortie pour la frise ;
// « Caler les coupes sur le rythme » aimante Scinder et les poignées à ±0,12 s d'un temps fort.

import { computed, signal } from '@preact/signals';
import { ErreurArko, importerSon, tempsForts, type SourceOuverte } from '../moteur/api';
import { ajouterSource, definirGuide, dureeFinale } from '../recette/operations';
import { GUIDE } from '../recette/defauts';
import type { Recette, SonGuide } from '../recette/types';
import { T } from '../textes-fr';
import {
  afficherToast,
  ajouterSourceOuverte,
  idsPris,
  modifier,
  projetActuel,
  quandProjetQuitte,
  recette,
  recetteAffichee,
  sources,
} from './etat';
import { garderFichier } from './sons-gardes';
import { auCentieme } from './format';

/** Écart maximal pour l'aimant au rythme (secondes). */
export const AIMANT_RYTHME = 0.12;

/** Option « Caler les coupes sur le rythme ». */
export const caleRythme = signal(false);
/** Import du son guide en cours. */
export const guideEnCours = signal(false);
/** Temps forts du son guide, en secondes DANS LE FICHIER (null = pas encore calculés). */
export const tempsFortsGuide = signal<{ src: string; t: number[] } | null>(null);

quandProjetQuitte(() => {
  caleRythme.value = false;
  tempsFortsGuide.value = null;
});

/** Source ouverte du son guide (null s'il n'y en a pas, ou si le fichier n'est pas ouvert). */
export const sourceGuide = computed<SourceOuverte | null>(() => {
  const src = recetteAffichee.value?.guide?.src;
  return (src && sources.value.find((s) => s.infos.id === src)) || null;
});

/** Temps forts en temps de la vidéo finale : t (0) + temps dans le fichier − début. */
export function tempsFortsSortie(r: Recette): number[] {
  const g = r.guide;
  const tf = tempsFortsGuide.value;
  if (!g || !tf || tf.src !== g.src) return [];
  const d = dureeFinale(r);
  return tf.t.map((b) => (g.t ?? 0) + b - (g.debut ?? 0)).filter((t) => t >= 0 && t <= d);
}

/** Temps fort le plus proche de t (à ±0,12 s), si l'option est active ; sinon null. */
export function aimanterRythme(t: number): number | null {
  const r = recetteAffichee.peek();
  if (!caleRythme.peek() || !r) return null;
  let meilleur: number | null = null;
  for (const b of tempsFortsSortie(r)) {
    if (Math.abs(b - t) <= AIMANT_RYTHME && (meilleur === null || Math.abs(b - t) < Math.abs(meilleur - t))) meilleur = b;
  }
  return meilleur;
}

/** Petite vibration quand une coupe se cale (si le téléphone sait vibrer). */
export function vibrer() {
  if ('vibrate' in navigator) navigator.vibrate(10);
}

/** Calcule les temps forts du son guide (une fois par source). */
export async function analyserGuide(s: SourceOuverte) {
  const id = s.infos.id;
  if (tempsFortsGuide.peek()?.src === id) return;
  const projet = projetActuel();
  try {
    const t = await tempsForts(s);
    if (projet === projetActuel()) tempsFortsGuide.value = { src: id, t };
  } catch (e) {
    console.error(e);
    if (projet === projetActuel()) tempsFortsGuide.value = { src: id, t: [] };
  }
}

/** Importe le son tendance (fichier audio ou vidéo) et en fait le son guide, démarré au début de la vidéo. */
export async function choisirGuide(f: File) {
  guideEnCours.value = true;
  const projet = projetActuel();
  try {
    const so = await importerSon(f, idsPris());
    if (projet !== projetActuel()) return;
    ajouterSourceOuverte(so);
    garderFichier(so);
    const ancien = recette.peek()?.guide;
    const guide: SonGuide = { src: so.infos.id, t: 0, debut: 0, vol: ancien?.vol ?? GUIDE.vol };
    modifier((r) => definirGuide(ajouterSource(r, so.infos), guide));
    void analyserGuide(so);
  } catch (e) {
    afficherToast(e instanceof ErreurArko ? e.message : T.erreurInconnue);
    if (!(e instanceof ErreurArko)) console.error(e);
  } finally {
    guideEnCours.value = false;
  }
}

/** Modifie le son guide (début, volume). `t` reste à 0 : on ne le règle pas dans l'interface. */
export function reglerGuide(partiel: Pick<SonGuide, 'debut' | 'vol'>) {
  modifier((r) => (r.guide ? definirGuide(r, { ...r.guide, ...partiel, t: 0 }) : r));
}

/** Décale le début du son de d secondes (borné au fichier). */
export function decalerGuide(d: number) {
  const g = recette.peek()?.guide;
  if (!g) return;
  const max = sourceGuide.peek()?.infos.duree ?? Infinity;
  reglerGuide({ debut: auCentieme(Math.min(max, Math.max(0, (g.debut ?? 0) + d))) });
}

export function retirerGuide() {
  modifier((r) => definirGuide(r, null));
  caleRythme.value = false;
}

/** « 0:12 » : minute et seconde où démarrer le son dans TikTok (rappel après l'export). */
export function formatDebutTikTok(debut: number): string {
  const s = Math.max(0, Math.round(debut));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
