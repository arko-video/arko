// Les clips de Ma bibliothèque DANS le montage (outils Fond vert et Mèmes de Habiller) : ouvrir un clip comme source
// vidéo du montage (référencée par son identifiant de bibliothèque, jamais copiée), poser un fond vert ou un mème à la
// tête de lecture, régler, retirer ; et à la reprise d'un montage, rouvrir ces clips (ou les retirer proprement).

import { signal } from '@preact/signals';
import { ErreurArko, ouvrirSource, type SourceOuverte } from '../moteur/api';
import { CHROMA_DEFAUT } from '../moteur/incrustation/chroma';
import {
  ajouterIncrustation,
  couperMeme,
  idClip,
  insererMeme,
  modifierIncrustation,
  retirerClipsManquants,
  supprimerIncrustation,
} from '../recette/operations-bibliotheque';
import type { CleChroma, Incrustation, Recette } from '../recette/types';
import { ficheClip, lireClip, type MonClip } from '../moteur/api';
import { afficherToast, ajouterSourceOuverte, idsPris, modifier, recette, sources, teteLecture } from './etat';
import { mettreEnPause } from './lecture';
import { TB } from './textes-bibliotheque';

/** Incrustation choisie (réglages ouverts dans Fond vert ou Mèmes), ou null. */
export const incrustationChoisie = signal<number | null>(null);
/** Mème « Coupure » choisi (indice du plan), ou null. */
export const memeChoisi = signal<number | null>(null);
/** Clip en cours d'ouverture (id de bibliothèque), pour afficher l'attente. */
export const clipEnCours = signal<string | null>(null);

export function reinitialiserClips() {
  incrustationChoisie.value = null;
  memeChoisi.value = null;
}

function message(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return TB.plusLa;
}

/** Ouvre le clip comme source vidéo du montage (une seule fois : un clip déjà ouvert garde son id). */
async function sourceDuClip(clip: MonClip): Promise<SourceOuverte> {
  const r = recette.peek();
  const deja = sources.peek().find((s) => s.infos.bib === clip.id);
  if (deja) return deja;
  const fichier = await lireClip(clip.id);
  if (!fichier) throw new ErreurArko(TB.plusLa, 'introuvable');
  const s = await ouvrirSource(fichier);
  s.infos = { ...s.infos, id: r ? idClip(r, idsPris()) : 'b1', nom: clip.nom, bib: clip.id };
  ajouterSourceOuverte(s);
  return s;
}

/** Détourage par défaut d'un clip (couleur trouvée sur ses bords, sinon un vert « standard »). */
export function cleParDefaut(clip: Pick<MonClip, 'fond'> | null): CleChroma {
  return { couleur: clip?.fond?.couleur ?? [0, 177, 64], ...CHROMA_DEFAUT };
}

async function avecClip<T>(clip: MonClip, faire: (s: SourceOuverte) => T): Promise<T | null> {
  if (clipEnCours.peek()) return null;
  mettreEnPause();
  clipEnCours.value = clip.id;
  try {
    return faire(await sourceDuClip(clip));
  } catch (e) {
    afficherToast(message(e));
    return null;
  } finally {
    clipEnCours.value = null;
  }
}

/** Fond vert (ou mème en incrustation) posé à la tête de lecture : détouré si le clip a un fond vert (ou `cle`). */
export async function poserIncrustation(clip: MonClip, genre: 'fondVert' | 'meme') {
  await avecClip(clip, (s) => {
    const inc: Incrustation = { src: s.infos.id, t: Math.max(0, teteLecture.peek()), de: 0, a: s.infos.duree, genre };
    if (genre === 'fondVert' || clip.fond) inc.cle = cleParDefaut(clip);
    if (genre === 'meme') Object.assign(inc, { taille: 0.42, x: 0.72, y: 0.3 });
    let i = -1;
    const ok = modifier((r) => {
      const res = ajouterIncrustation(r, inc, s.infos);
      i = res.i;
      return res.recette;
    });
    if (ok && i >= 0) {
      incrustationChoisie.value = i;
      afficherToast(TB.fondVert.pose(clip.nom), 2500);
    }
  });
}

/** Mème « Coupure » : inséré dans la vidéo à la tête de lecture. */
export async function insererMemeCoupure(clip: MonClip) {
  await avecClip(clip, (s) => {
    let i = -1;
    const ok = modifier((r) => {
      const res = insererMeme(r, teteLecture.peek(), s.infos, 0, s.infos.duree);
      i = res.i;
      return res.recette;
    });
    if (ok && i >= 0) {
      memeChoisi.value = i;
      afficherToast(TB.memes.insere(clip.nom), 2500);
    }
  });
}

export function reglerIncrustation(i: number, partiel: Partial<Incrustation>) {
  modifier((r) => modifierIncrustation(r, i, partiel));
}

export function retirerIncrustation(i: number) {
  if (modifier((r) => supprimerIncrustation(r, i))) afficherToast(TB.reglages.retire);
  incrustationChoisie.value = null;
}

export function reglerCoupure(i: number, de: number, a: number) {
  modifier((r) => couperMeme(r, i, de, a));
}

/** Active / coupe le détourage d'une incrustation (couleur de la fiche du clip si elle existe). */
export async function basculerDetourage(i: number, oui: boolean) {
  const r = recette.peek();
  const x = r?.incrustations?.[i];
  if (!r || !x) return;
  if (!oui) return reglerIncrustation(i, { cle: undefined });
  const bib = r.sources.find((s) => s.id === x.src)?.bib;
  const fiche = bib ? await ficheClip(bib).catch(() => null) : null;
  reglerIncrustation(i, { cle: cleParDefaut(fiche) });
}

/**
 * À la reprise d'un montage : rouvre les clips de Ma bibliothèque qu'il utilise. Un clip disparu est retiré
 * proprement (fonds verts, mèmes en incrustation, mèmes « Coupure »), avec un message.
 */
export async function rouvrirClips(r: Recette): Promise<{ recette: Recette; ouvertes: SourceOuverte[]; messages: string[] }> {
  const utilises = new Set([...r.plans.map((p) => p.src), ...(r.incrustations ?? []).map((x) => x.src)]);
  const ouvertes: SourceOuverte[] = [];
  const manquants: string[] = [];
  const messages: string[] = [];
  for (const s of r.sources) {
    if (!s.bib || !utilises.has(s.id)) continue;
    try {
      const fichier = await lireClip(s.bib);
      if (!fichier) throw new Error('absent');
      const o = await ouvrirSource(fichier);
      o.infos = { ...o.infos, id: s.id, nom: s.nom, bib: s.bib };
      ouvertes.push(o);
    } catch {
      manquants.push(s.id);
      messages.push(TB.introuvable(s.nom));
    }
  }
  return { recette: retirerClipsManquants(r, manquants), ouvertes, messages };
}
