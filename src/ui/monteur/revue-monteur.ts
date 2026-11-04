// Revue du monteur IA : un brouillon à la fois, Garder (nouveau projet dans « Mes montages ») ou Jeter.
// Les brouillons pas encore vus sont gardés dans IndexedDB (idb-keyval) pour reprendre la revue plus tard.

import { del, get, set } from 'idb-keyval';
import {
  listerProjets,
  memeSource,
  nouveauProjet,
  ouvrirProjet,
  ouvrirSource,
  sauverProjet,
  type SourceOuverte,
} from '../../moteur/api';
import type { Source } from '../../recette/types';
import { T } from '../../textes-fr';
import { demarrerProjet, fermerSession, historique, sauverEnAttente, sources, vignetteProjet } from '../etat';
import { idCourant, rafraichirMontages } from '../montages';
import { reprendreA } from '../navigation';
import { vignetteJpeg } from '../vignettes';
import { ecranMonteur, nouvelUid, revue, sourceMonteur, type Brouillon, type Revue } from './etat-monteur';

const CLE_REVUE = 'arko.monteur.revue';

/** Écritures des projets gardés, l'une après l'autre (un projet est écrit en entier avant le suivant). */
let file: Promise<unknown> = Promise.resolve();
function ensuite<T>(travail: () => Promise<T>): Promise<T> {
  const p = file.then(travail);
  file = p.catch((e: unknown) => console.error(e));
  return p;
}

/** Changements de la revue, l'un après l'autre : chacun est ÉCRIT dans IndexedDB avant d'être affiché (M-5). */
let fileRevue: Promise<unknown> = Promise.resolve();
function majRevue(f: (r: Revue | null) => Revue | null): Promise<void> {
  const p = fileRevue.then(async () => {
    const r = f(revue.peek());
    try {
      if (r && (r.restants.length > 0 || (r.aEcrire?.length ?? 0) > 0)) await set(CLE_REVUE, r);
      else await del(CLE_REVUE);
    } catch {
      // Stockage bloqué : la revue ne pourra simplement pas être reprise.
    }
    revue.value = r;
  });
  fileRevue = p.catch((e: unknown) => console.error(e));
  return p;
}

/** Revue lue dans IndexedDB : vérifiée, et un uid donné aux brouillons qui n'en ont pas (anciennes versions). */
function lisible(x: unknown): Revue | null {
  const r = x as Partial<Revue> | null;
  if (!r || typeof r.source?.emp !== 'string' || !Array.isArray(r.restants) || !Array.isArray(r.gardes))
    return null;
  if (typeof r.total !== 'number') return null;
  const restants = r.restants.map((b) => ({ ...b, uid: b.uid || nouvelUid() }));
  const gardes = r.gardes.map((g) => ({ ...g, uid: g.uid || nouvelUid() }));
  return { ...(r as Revue), restants, gardes, aEcrire: (r.aEcrire ?? []).filter((a) => a.uid && a.quand) };
}

/** Relit une revue gardée (écran Importer), si aucune n'est déjà en mémoire. */
export async function chargerRevue() {
  if (revue.peek()) return;
  let lue: Revue | null = null;
  try {
    lue = lisible(await get(CLE_REVUE));
  } catch {
    return;
  }
  if (!lue || revue.peek()) return;
  const r = lue;
  await majRevue((actuelle) => actuelle ?? (r.restants.length > 0 || r.aEcrire?.length ? r : null));
  // Clips gardés juste avant la fermeture d'Arko, pas encore écrits dans « Mes montages » : on finit le travail.
  // (Seulement sans montage ouvert : son enregistrement automatique viserait le même « projet courant ».)
  if (!historique.peek()) for (const a of r.aEcrire ?? []) void ensuite(() => ecrireGarde(a, null));
}

export async function commencerRevue(source: Source, brouillons: Brouillon[]) {
  await file;
  await majRevue(() => ({ source, restants: brouillons, total: brouillons.length, gardes: [] }));
}

/** « Oublier ces clips » ; renvoie la revue oubliée (pour « Annuler »). */
export function oublierRevue(): Revue | null {
  const avant = revue.peek();
  void majRevue(() => null);
  return avant;
}

export function restaurerRevue(r: Revue) {
  void majRevue(() => r);
}

/** Ferme le projet ouvert (enregistré) : les clips gardés deviennent chacun un nouveau projet. */
export async function entrerMonteur() {
  await sauverEnAttente();
  if (sources.peek().some((s) => s === sourceMonteur.peek())) sourceMonteur.value = null;
  fermerSession();
}

/** Date d'enregistrement unique pour chaque clip gardé (elle sert aussi à le retrouver). */
let dernierQuand = 0;
function horodater(): number {
  dernierQuand = Math.max(Date.now(), dernierQuand + 1);
  return dernierQuand;
}

/** Garder : le brouillon devient un projet de « Mes montages » (statut « garde »), à retoucher plus tard. */
export async function garder() {
  const source = sourceMonteur.peek();
  const pris: { a?: NonNullable<Revue['aEcrire']>[number] } = {};
  await majRevue((r) => {
    const b = r?.restants[0];
    if (!r || !b) return r;
    const a = { uid: b.uid, quand: horodater(), brouillon: b };
    pris.a = a;
    const titre = b.recette.titre?.trim() || T.monteur.nom;
    const gardes = [...r.gardes, { uid: b.uid, id: '', titre }];
    return { ...r, restants: r.restants.slice(1), gardes, aEcrire: [...(r.aEcrire ?? []), a] };
  });
  const a = pris.a;
  if (a) void ensuite(() => ecrireGarde(a, source));
}

/** Écrit un clip gardé comme nouveau projet, puis note son id (et qu'il n'est plus à écrire). */
async function ecrireGarde(a: NonNullable<Revue['aEcrire']>[number], source: SourceOuverte | null) {
  const nom = a.brouillon.recette.sources[0]?.nom;
  const trouver = async () =>
    (await listerProjets()).find((p) => p.modifieLe === a.quand && p.nomSource === nom);
  // Reprise après une fermeture : le projet a peut-être été écrit juste avant (même date d'enregistrement).
  const deja = await trouver();
  if (deja) return noterEcrit(a.uid, deja.id);
  const debut = a.brouillon.recette.plans[0]?.de ?? 0;
  const vignette = source ? await Promise.race([vignetteJpeg(source, debut), attendre(2000)]) : null;
  await nouveauProjet();
  const recette = { ...a.brouillon.recette, statut: 'garde' as const };
  await sauverProjet({ recette, etape: 'couper', modifieLe: a.quand, vignette: vignette ?? undefined });
  const id = (await trouver())?.id ?? '';
  await nouveauProjet();
  await noterEcrit(a.uid, id);
}

function noterEcrit(uid: string, id: string): Promise<void> {
  return majRevue((r) =>
    r
      ? {
          ...r,
          gardes: r.gardes.map((g) => (g.uid === uid ? { ...g, id } : g)),
          aEcrire: (r.aEcrire ?? []).filter((x) => x.uid !== uid),
        }
      : r,
  );
}

function attendre(ms: number): Promise<null> {
  return new Promise((r) => setTimeout(() => r(null), ms));
}

export function jeter(): Promise<void> {
  return majRevue((r) => (r && r.restants.length > 0 ? { ...r, restants: r.restants.slice(1) } : r));
}

/** Attend que les clips gardés soient tous écrits (avant de montrer « Mes montages »). */
export async function gardesEcrits(): Promise<void> {
  await file;
  await fileRevue;
}

/** « Retoucher le 1er » : ouvre le premier clip gardé dans Couper, avec la vidéo déjà ouverte. */
export async function retoucherPremier(): Promise<boolean> {
  await gardesEcrits();
  const id = revue.peek()?.gardes[0]?.id;
  const source = sourceMonteur.peek();
  if (!id || !source) return false;
  const p = await ouvrirProjet(id);
  if (!p) return false;
  ecranMonteur.value = null;
  // La vidéo passe au projet ouvert : elle sera fermée avec lui.
  sourceMonteur.value = null;
  demarrerProjet(source, p.recette);
  idCourant.value = id;
  vignetteProjet.value = p.vignette;
  reprendreA('couper');
  return true;
}

/** Revue reprise après un rechargement : la vidéo re-choisie doit être la même (empreinte). Renvoie un message d'erreur, sinon null. */
export async function rouvrirPourRevue(
  fichier: File,
  progression: (etape: string) => void,
): Promise<string | null> {
  const r = revue.peek();
  if (!r) return null;
  if (!(await memeSource(fichier, r.source))) return T.importer.pasLaMeme(r.source.nom);
  const s: SourceOuverte = await ouvrirSource(fichier, progression);
  await entrerMonteur();
  sourceMonteur.value = s;
  await rafraichirMontages();
  return null;
}
