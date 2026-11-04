// État global de l'interface, en signals. La recette n'est JAMAIS modifiée ici directement :
// on passe toujours par une opération de src/recette/operations.ts puis par l'historique.

import { computed, effect, signal } from '@preact/signals';
import type { Recette } from '../recette/types';
import { annuler, nouvelHistorique, pousser, retablir, type Historique } from '../recette/operations';
import {
  fermerSource,
  nouveauProjet,
  sauverProjet,
  type ResultatExport,
  type SourceOuverte,
} from '../moteur/api';
import { viderVignettes, vignetteJpeg } from './vignettes';

export type Ecran = 'importer' | 'couper' | 'vertical' | 'habiller' | 'exporter';
export const ORDRE_ECRANS: Ecran[] = ['importer', 'couper', 'vertical', 'habiller', 'exporter'];

/** Écran affiché. Changé uniquement par navigation.ts (pour garder l'historique du navigateur juste). */
export const ecran = signal<Ecran>('importer');

/** Historique annuler / rétablir de la recette (null tant qu'aucune vidéo n'est ouverte). */
export const historique = signal<Historique | null>(null);

/** Recette affichée « en cours de geste » (glissé d'une poignée, cadrage) : pas encore dans l'historique. */
export const recetteTemporaire = signal<Recette | null>(null);

/** La recette validée. */
export const recette = computed<Recette | null>(() => historique.value?.present ?? null);

/** Ce qu'on affiche : la recette temporaire pendant un geste, sinon la recette validée. */
export const recetteAffichee = computed<Recette | null>(() => recetteTemporaire.value ?? recette.value);

/** Sources ouvertes (lecteur, export) : la vidéo EN PREMIER, puis sons importés et son guide (ajouterSourceOuverte). */
export const sources = signal<SourceOuverte[]>([]);

/** Ids déjà pris (recette et sources ouvertes) : un son importé en reçoit un nouveau (importerSon). */
export function idsPris(): string[] {
  return [...(recette.peek()?.sources.map((s) => s.id) ?? []), ...sources.peek().map((s) => s.infos.id)];
}

/** Ajoute une source audio ouverte (son importé, son guide), une seule fois par id. */
export function ajouterSourceOuverte(s: SourceOuverte) {
  if (!sources.peek().some((x) => x.infos.id === s.infos.id)) sources.value = [...sources.peek(), s];
}

/** true si la vidéo est déjà verticale : l'étape Vertical est sautée. */
export const sourceVerticale = computed(() => sources.value[0]?.verticale ?? false);

/** Indice du plan sélectionné sur la frise (null = aucun). */
export const selection = signal<number | null>(null);

/** Temps de la tête de lecture (temps de sortie, secondes). */
export const teteLecture = signal(0);

/** Zone sûre TikTok affichée (désactivée par défaut). */
export const zoneSure = signal(false);

/** Dernière étape de montage visitée (pour la sauvegarde). */
export const derniereEtape = signal<Exclude<Ecran, 'importer'>>('couper');

/** Indicateur discret « Enregistré ». */
export const etatSauvegarde = signal<'rien' | 'enregistre' | 'erreur'>('rien');

/** Message temporaire en bas de l'écran, avec un bouton facultatif (« Annuler »). */
export const toast = signal<string | null>(null);
export const toastAction = signal<{ label: string; agir: () => void } | null>(null);

/** Une mise à jour de l'appli est prête (service worker). */
export const majDisponible = signal<null | (() => void)>(null);

/* ------------------------------------------------------------------ export */

export type EtatExport =
  | { phase: 'avant' }
  | { phase: 'encours'; p: number; resteS: number | null; annuler: () => void }
  | { phase: 'fini'; resultat: ResultatExport; url: string }
  | { phase: 'erreur'; code: string; message: string; pendantAbsence: boolean };

export const etatExport = signal<EtatExport>({ phase: 'avant' });
/** Recette pour laquelle le résultat d'export est valable. */
let recetteExportee: Recette | null = null;

export function exportTermine(resultat: ResultatExport, pour: Recette) {
  recetteExportee = pour;
  etatExport.value = { phase: 'fini', resultat, url: URL.createObjectURL(resultat.fichier) };
}

function oublierExport() {
  const e = etatExport.peek();
  if (e.phase === 'fini') URL.revokeObjectURL(e.url);
  if (e.phase === 'encours') e.annuler();
  recetteExportee = null;
  etatExport.value = { phase: 'avant' };
}

/* ------------------------------------------------------------------ actions */

/** Applique une opération d'édition. Ne pousse dans l'historique que si la recette a changé. */
export function modifier(operation: (r: Recette) => Recette): boolean {
  const h = historique.peek();
  if (!h) return false;
  const nouvelle = operation(h.present);
  if (nouvelle === h.present || JSON.stringify(nouvelle) === JSON.stringify(h.present)) return false;
  historique.value = pousser(h, nouvelle);
  return true;
}

/** Après Annuler / Rétablir, ce qui est choisi par indice (plan, son, zoom, coupe) est remis à zéro (M-8). */
const surVoyage = new Set<() => void>();
export const quandAnnuleOuRetabli = (cb: () => void) => void surVoyage.add(cb);
function voyager(h: Historique) {
  historique.value = h;
  selection.value = null;
  surVoyage.forEach((cb) => cb());
}

export function annulerAction() {
  const h = historique.peek();
  if (h?.peutAnnuler) voyager(annuler(h));
}

export function retablirAction() {
  const h = historique.peek();
  if (h?.peutRetablir) voyager(retablir(h));
}

/** Numéro du projet ouvert, changé à chaque nouveau projet ou fermeture : un travail long (transcription…)
 *  le note au départ et jette son résultat s'il a changé entre-temps. */
let numeroProjet = 0;
export function projetActuel(): number {
  return numeroProjet;
}

/** Appelés quand on quitte le projet (nouveau projet, reprise, « Monter un autre clip »). */
const surFermeture = new Set<() => void>();
export function quandProjetQuitte(cb: () => void): () => void {
  surFermeture.add(cb);
  return () => surFermeture.delete(cb);
}
function quitterProjet() {
  numeroProjet++;
  for (const cb of surFermeture) {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  }
}

/** Ouvre un projet (nouvelle vidéo ou reprise, avec ses sons importés et son guide rouverts). */
export function demarrerProjet(source: SourceOuverte, r: Recette, audio: SourceOuverte[] = []) {
  quitterProjet();
  for (const s of sources.peek()) if (s !== source && !audio.includes(s)) fermerSource(s);
  viderVignettes();
  vignetteProjet.value = undefined;
  cleVignette = '';
  oublierExport();
  sources.value = [source, ...audio];
  historique.value = nouvelHistorique(r);
  recetteTemporaire.value = null;
  selection.value = null;
  teteLecture.value = 0;
}

/** « Monter un autre clip » : on enregistre puis on ferme tout. Le montage reste dans « Mes montages ». */
export async function toutFermer() {
  await sauverEnAttente();
  fermerSession();
  await nouveauProjet().catch((e: unknown) => console.error(e));
}

/** Ferme le projet ouvert SANS l'enregistrer (il vient d'être supprimé, ou il est déjà enregistré). */
export function fermerSession() {
  quitterProjet();
  oublierExport();
  for (const s of sources.peek()) fermerSource(s);
  viderVignettes();
  vignetteProjet.value = undefined;
  cleVignette = '';
  sources.value = [];
  historique.value = null;
  recetteTemporaire.value = null;
  selection.value = null;
  teteLecture.value = 0;
  derniereEtape.value = 'couper';
  annulerSauvegarde();
}

export function afficherToast(
  message: string,
  dureeMs = 3500,
  action: { label: string; agir: () => void } | null = null,
) {
  toast.value = message;
  toastAction.value = action;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => ((toast.value = null), (toastAction.value = null)), dureeMs);
}
let minuteurToast: ReturnType<typeof setTimeout> | undefined;

/* ------------------------------------------------------------------ sauvegarde automatique */

/** Petite image JPEG (data URL) du début du premier plan, pour « Mes montages ». */
export const vignetteProjet = signal<string | undefined>(undefined);
let cleVignette = '';

let minuteurSauvegarde: ReturnType<typeof setTimeout> | undefined;
let minuteurIndicateur: ReturnType<typeof setTimeout> | undefined;
/** Sauvegarde demandée mais pas encore écrite. */
let enAttente: { recette: Recette; etape: string } | null = null;

function annulerSauvegarde() {
  clearTimeout(minuteurSauvegarde);
  enAttente = null;
}

function planifier(r: Recette, etape: string) {
  enAttente = { recette: r, etape };
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(() => void sauverEnAttente(), 1000);
}

/** Écritures enchaînées (jamais deux en même temps). */
let ecriture: Promise<void> = Promise.resolve();

/** Écrit la sauvegarde en attente ; la promesse se résout quand tout est écrit (avant de changer de projet). */
export function sauverEnAttente(): Promise<void> {
  if (enAttente) ecriture = ecriture.then(ecrire);
  return ecriture;
}

async function ecrire() {
  clearTimeout(minuteurSauvegarde);
  const a = enAttente;
  if (!a) return;
  enAttente = null;
  try {
    await sauverProjet({
      recette: a.recette,
      etape: a.etape,
      modifieLe: Date.now(),
      vignette: vignetteProjet.peek(),
    });
    // Les sons qu'aucun montage n'utilise plus sont retirés par le stockage (il connaît TOUS les projets).
    etatSauvegarde.value = 'enregistre';
  } catch {
    etatSauvegarde.value = 'erreur';
  }
  clearTimeout(minuteurIndicateur);
  minuteurIndicateur = setTimeout(() => {
    if (etatSauvegarde.peek() === 'enregistre') etatSauvegarde.value = 'rien';
  }, 2500);
}

/** Écrit tout de suite la sauvegarde en attente (onglet caché ou fermé). */
export function sauverMaintenant() {
  void sauverEnAttente();
}

/** Refait la vignette quand le début du premier plan change, puis la sauvegarde. */
function mettreAJourVignette(r: Recette) {
  const source = sources.peek()[0];
  const p = r.plans[0];
  if (!source || !p) return;
  const cle = `${source.infos.emp}|${p.src ?? ''}|${p.de}`;
  if (cle === cleVignette) return;
  cleVignette = cle;
  void vignetteJpeg(source, p.de).then((url) => {
    if (cle !== cleVignette || !url) return;
    vignetteProjet.value = url;
    const actuelle = recette.peek();
    if (actuelle) planifier(actuelle, derniereEtape.peek());
  });
}

/** Démarre la sauvegarde automatique : 1 s après chaque modification, et tout de suite si on quitte la page. */
export function activerSauvegardeAuto() {
  effect(() => {
    const r = recette.value;
    const etape = derniereEtape.value;
    if (!r) return;
    planifier(r, etape);
    mettreAJourVignette(r);
  });

  window.addEventListener('pagehide', sauverMaintenant);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sauverMaintenant();
  });

  // Toute modification de la recette rend l'export précédent périmé.
  effect(() => {
    const r = recette.value;
    if (recetteExportee && r !== recetteExportee) oublierExport();
  });
}
