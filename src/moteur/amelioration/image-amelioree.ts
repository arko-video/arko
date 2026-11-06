// Améliorer l'image — branchement dans LE chemin de rendu (rendre.ts) : l'image source décodée est enveloppée AVANT
// le rognage, la mise en page (recadrage, fond flou, jeu + webcam) et les zooms. Au premier dessin agrandi d'une
// image, elle passe UNE fois par la carte graphique (gpu.ts) ; les dessins suivants de la même image (transitions,
// flou de mouvement) recopient le résultat. Aperçu = export ; repli : l'image telle quelle si WebGL2 manque,
// si la carte graphique échoue, ou dans l'aperçu seulement quand il est trop lent (ou si on l'a demandé).

import type { Ctx2D, ImageSource } from '../canevas';
import { MoteurGpu } from './gpu';
import { apercuTropLent, doitMesurer, MesuresTemps } from './mesures';
import { choisirPlan, clePlan, facteurDuPlan, type ModeMoteur, type PlanTraitement, type ReglagesAmelioration } from './reglages';

/** En dessous de cette échelle (fond flou 90 × 160, vignettes), on dessine l'image d'origine : rien à gagner. */
const ECHELLE_MIN_TRAITER = 0.5;
const CLE_APERCU = 'arko.image.apercu';

/** true dans la page (aperçu, comparaison, miniature) ; false dans le Worker d'export. */
const DANS_LA_PAGE = typeof document !== 'undefined';

let moteur: MoteurGpu | null | undefined;
let panne = false;
let staging: { c: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D } | null = null;
/** Numéro du dernier traitement : le canevas du moteur ne contient que le résultat du dernier. */
let dernier = 0;
let forcer = 0;
let apercuExportSeulement = lireApercu();
let apercuCoupeLent = false;
const ecouteurs = new Set<() => void>();

/** Temps par image mesurés dans ce fil (page : aperçu ; Worker : export). */
export const mesures = new MesuresTemps();

function lireApercu(): boolean {
  try {
    return DANS_LA_PAGE && localStorage.getItem(CLE_APERCU) === 'export';
  } catch {
    return false;
  }
}

function prevenir() {
  for (const e of ecouteurs) e();
}

/** Le moteur WebGL2 de ce fil (créé à la première demande ; null si indisponible ou en panne). */
export function moteurGpu(): MoteurGpu | null {
  if (moteur === undefined) moteur = MoteurGpu.creer();
  return panne || !moteur || moteur.perdu ? null : moteur;
}

/** Ce que cet appareil sait faire. */
export function modeMoteur(): ModeMoteur {
  return moteurGpu()?.mode ?? 'aucun';
}

/** État pour l'interface. */
export function etatAmelioration() {
  return {
    mode: modeMoteur(),
    apercuExportSeulement,
    apercuCoupeLent,
    msParImage: mesures.moyenne,
    mesures: mesures.n,
  };
}

export function surChangementAmelioration(cb: () => void): () => void {
  ecouteurs.add(cb);
  return () => void ecouteurs.delete(cb);
}

/** « Seulement à l'export » (réglage de l'appareil, pas du montage) : l'aperçu montre l'image d'origine. */
export function definirApercuExportSeulement(oui: boolean) {
  apercuExportSeulement = oui;
  apercuCoupeLent = false;
  mesures.vider();
  try {
    if (oui) localStorage.setItem(CLE_APERCU, 'export');
    else localStorage.removeItem(CLE_APERCU);
  } catch {
    /* stockage indisponible : réglage gardé pour cette session */
  }
  prevenir();
}

/** Les rendus créés pendant `fn` améliorent l'image même si l'aperçu ne le fait pas (avant / après, miniature). */
export async function avecAmeliorationForcee<T>(fn: () => Promise<T>): Promise<T> {
  forcer++;
  let p: Promise<T>;
  try {
    p = fn(); // rendre() est appelé tout de suite (avant le premier await) : il lit `forcer` maintenant
  } finally {
    forcer--;
  }
  return p;
}

/** À appeler une fois par rendu (rendre.ts) : renvoie l'enveloppe à mettre autour de chaque image décodée. */
export function preparerAmelioration(recette: { amelioration?: ReglagesAmelioration }): (image: ImageSource) => ImageSource {
  const reglages = recette.amelioration;
  if (!reglages) return (image) => image;
  const force = forcer > 0;
  return (image) => {
    if (DANS_LA_PAGE && !force && (apercuExportSeulement || apercuCoupeLent)) return image;
    return imageAmelioree(image, reglages, DANS_LA_PAGE && !force);
  };
}

function preparerStaging(l: number, h: number): Ctx2D | null {
  if (!staging) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(l, h) : DANS_LA_PAGE ? document.createElement('canvas') : null;
    const ctx = c?.getContext('2d', { alpha: false }) as Ctx2D | null | undefined;
    if (!c || !ctx) return null;
    staging = { c, ctx };
  }
  if (staging.c.width !== l) staging.c.width = l;
  if (staging.c.height !== h) staging.c.height = h;
  return staging.ctx;
}

/** Plan pour un moteur donné (agrandissement retiré si la texture ×2 dépasserait la taille permise). */
function planPour(m: MoteurGpu, reglages: ReglagesAmelioration, l: number, h: number, echelle: number): PlanTraitement | null {
  const plan = choisirPlan(reglages, m.mode, l, h, echelle);
  if (plan?.agrandissement && Math.max(2 * l, 2 * h) > m.tailleMax) plan.agrandissement = null;
  return plan;
}

/** Enveloppe une image : même taille annoncée, mais dessinée depuis le résultat de la carte graphique. */
export function imageAmelioree(image: ImageSource, reglages: ReglagesAmelioration, apercu: boolean): ImageSource {
  const l = Math.round(image.largeur);
  const h = Math.round(image.hauteur);
  let fait: { cle: string; numero: number; k: number } | null = null;
  return {
    largeur: image.largeur,
    hauteur: image.hauteur,
    dessiner(ctx, sx, sy, sl, sh, dx, dy, dl, dh) {
      const echelle = Math.max(Math.abs(dl / (sl || 1)), Math.abs(dh / (sh || 1)));
      const m = echelle >= ECHELLE_MIN_TRAITER ? moteurGpu() : null;
      const plan = m ? planPour(m, reglages, l, h, echelle) : null;
      if (!m || !plan) return image.dessiner(ctx, sx, sy, sl, sh, dx, dy, dl, dh);
      const cle = clePlan(plan);
      if (!fait || fait.cle !== cle || fait.numero !== dernier) {
        const ok = traiter(m, image, l, h, plan, apercu);
        if (!ok) return image.dessiner(ctx, sx, sy, sl, sh, dx, dy, dl, dh);
        fait = { cle, numero: dernier, k: facteurDuPlan(plan) };
      }
      const k = fait.k;
      ctx.drawImage(m.canevas, sx * k, sy * k, sl * k, sh * k, dx, dy, dl, dh);
    },
  };
}

/** Une image dans la carte graphique, avec mesure du temps de temps en temps. false = échec (repli). */
function traiter(m: MoteurGpu, image: ImageSource, l: number, h: number, plan: PlanTraitement, apercu: boolean): boolean {
  const ctx = preparerStaging(l, h);
  if (!ctx) return false;
  const mesurer = doitMesurer(mesures.images);
  const t0 = performance.now();
  try {
    image.dessiner(ctx, 0, 0, l, h, 0, 0, l, h);
    m.traiter(staging!.c, l, h, plan, mesurer);
  } catch (e) {
    // Shader refusé, mémoire de la carte graphique pleine… : on n'essaie plus, l'image reste celle d'origine.
    console.warn('[Arko] Améliorer l’image : repli sur l’image d’origine.', e);
    panne = true;
    prevenir();
    return false;
  }
  dernier++;
  // La 1ʳᵉ image compile les shaders : elle ne compte pas dans la moyenne.
  if (mesurer && mesures.images > 0) mesures.ajouter(performance.now() - t0);
  mesures.images++;
  if (apercu && !apercuCoupeLent && apercuTropLent(mesures)) {
    apercuCoupeLent = true;
    prevenir();
  }
  return true;
}
