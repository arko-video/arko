// C. Opérations du derush (dev 1) : garder la liste des passages pas retenus, et en AJOUTER un au montage d'un
// toucher (à sa place chronologique parmi les plans de la même vidéo). Contrat : conception/contrat-wankil.md §3.2.

import { morceauxDeParole, REGLAGES_BLANCS } from '../auto/coupes/blancs';
import { premiereVideo } from '../auto/coupes/decoupe';
import type { PlageTemps, SignauxSource } from '../auto/types';
import { normaliser } from './normaliser';
import type { Mot, PassageNote, Plan, Recette } from './types';

/** Ce qui aide à ajouter un passage (facultatif) : mots de la source (Couper les blancs, sous-titres), signaux. */
export interface ContextePassage {
  mots?: readonly Mot[];
  signaux?: SignauxSource | null;
  /**
   * Best-of v4 : les morceaux du passage DÉJÀ coupés comme le Best-of (`morceauxDuPassage`, dev-coupes : VAD,
   * creux, marges de la DA). Donnés : ils sont pris tels quels (bornés au passage) au lieu de Couper les blancs ;
   * `[]` = garder le passage entier ; absents = comme avant.
   */
  morceaux?: readonly PlageTemps[];
}

function finir(origine: Recette, r: Recette): Recette {
  const n = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(n) === JSON.stringify(origine) ? origine : n;
}

function memePassage(x: PassageNote, y: PassageNote): boolean {
  return Math.abs(x.de - y.de) < 0.011 && Math.abs(x.a - y.a) < 0.011 && (x.src ?? '') === (y.src ?? '');
}

/** Écrit (ou retire avec null) la liste des passages pas retenus. */
export function definirPassages(recette: Recette, passages: readonly PassageNote[] | null): Recette {
  if (!passages || passages.length === 0) {
    if (!recette.derush) return recette;
    const { derush: _d, ...reste } = recette;
    void _d;
    return finir(recette, reste as Recette);
  }
  return finir(recette, { ...recette, derush: { passages: passages.map((p) => ({ ...p })) } });
}

/** Où insérer un plan qui commence en `de` (temps source de `src`) : après le dernier plan de la même vidéo avant lui. */
function placeChronologique(recette: Recette, src: string, de: number): number {
  const premiere = premiereVideo(recette);
  const siens = recette.plans.map((p, i) => ({ p, i })).filter(({ p }) => (p.src ?? premiere) === src && !p.ins);
  const avant = siens.filter(({ p }) => p.de <= de);
  if (avant.length > 0) return avant[avant.length - 1]!.i + 1;
  if (siens.length > 0) return siens[0]!.i;
  return recette.plans.length;
}

/**
 * Ajoute le passage au montage : un plan [de, a] inséré à sa place chronologique (après le dernier plan de la même
 * vidéo qui commence avant lui), avec Couper les blancs si la recette en a (`blancs`) ; il quitte la liste. Renvoie
 * aussi l'indice du 1er plan ajouté (−1 si rien). `c` (facultatif) : mots et signaux de la source.
 */
export function ajouterPassage(recette: Recette, passage: PassageNote, c: ContextePassage = {}): { recette: Recette; i: number } {
  const src = passage.src ?? premiereVideo(recette);
  const video = recette.sources.find((s) => s.id === src && s.type === 'video');
  if (!src || !video || !(passage.a > passage.de)) return { recette, i: -1 };
  const de = Math.max(0, passage.de);
  const a = Math.min(video.duree > 0 ? video.duree : passage.a, passage.a);
  const motsSt = Array.isArray(recette.sousTitres?.mots) ? recette.sousTitres.mots : [];
  const mots = c.mots ?? motsSt;
  let morceaux: { de: number; a: number }[] = [{ de, a }];
  if (c.morceaux) {
    const dedans = c.morceaux.map((m) => ({ de: Math.max(de, m.de), a: Math.min(a, m.a) })).filter((m) => m.a - m.de > 0.01).sort((x, y) => x.de - y.de);
    if (dedans.length > 0) morceaux = dedans;
  } else if (recette.blancs) {
    const reglages = REGLAGES_BLANCS[recette.blancs.niveau] ?? REGLAGES_BLANCS.normal;
    const parole = morceauxDeParole(mots, c.signaux ?? null, reglages, { de, a }).filter((m) => m.a - m.de >= reglages.morceauMin);
    if (parole.length > 0) morceaux = parole.map((m) => ({ de: m.de, a: m.a }));
  }
  const i = placeChronologique(recette, src, de);
  const premiere = premiereVideo(recette);
  const plans: Plan[] = morceaux.map((m) => ({ ...(src !== premiere ? { src } : {}), de: m.de, a: m.a }));
  const r: Recette = { ...recette, plans: [...recette.plans.slice(0, i), ...plans, ...recette.plans.slice(i)] };
  // Les sous-titres reçoivent les mots du passage (s'ils n'y sont pas déjà).
  if (recette.sousTitres && Array.isArray(recette.sousTitres.mots) && c.mots) {
    const deja = new Set(motsSt.map((m) => `${m[1]}|${m[0]}`));
    const nouveaux = c.mots.filter((m) => m[1] >= de && m[1] < a && !deja.has(`${m[1]}|${m[0]}`)).map((m) => [...m] as Mot);
    if (nouveaux.length > 0) r.sousTitres = { ...recette.sousTitres, mots: [...motsSt, ...nouveaux].sort((x, y) => x[1] - y[1]) };
  }
  const reste = (recette.derush?.passages ?? []).filter((p) => !memePassage(p, passage));
  if (reste.length > 0) r.derush = { passages: reste };
  else delete r.derush;
  const fini = finir(recette, r);
  return fini === recette ? { recette, i: -1 } : { recette: fini, i };
}
