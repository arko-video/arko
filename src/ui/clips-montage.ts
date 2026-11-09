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
import { ficheClip, lireClip, listerClips, type MonClip } from '../moteur/api';
import { placeMeme, proposerDecor, proposerMemes } from '../auto/insertion/memes-auto';
import { rejete } from '../auto/apprentissage/gouts';
import { gouts } from './apprentissage';
import { gabaritDe } from '../recette/destination';
import type { Mot, Sec } from '../recette/types';
import type { SignauxSource } from '../auto/types';
import { afficherToast, ajouterSourceOuverte, annulerAction, idsPris, modifier, recette, sources, teteLecture } from './etat';
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

/** Ouvre le clip comme source vidéo du montage (une seule fois : un clip déjà ouvert garde son id). Aussi pour « Insérer ici ». */
export async function sourceDuClip(clip: MonClip): Promise<SourceOuverte> {
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

/**
 * Montage auto : pose les mèmes et fonds verts de Ma bibliothèque aux moments forts (auto/insertion/memes-auto.ts),
 * en UNE opération (un Annuler les retire tous). Rien sans clips dans la bibliothèque. Renvoie le nombre posé.
 */
export async function poserMemesAuto(mots: readonly Mot[], src: string, signaux: SignauxSource | null, finAccroche: Sec = 0, silencieux = false): Promise<number> {
  const r0 = recette.peek();
  if (!r0) return 0;
  const clips = await listerClips().catch(() => [] as MonClip[]);
  const g = gouts.peek();
  const fiches = clips.filter((c) => !rejete(g, c.nom)).map((c) => ({ id: c.id, nom: c.nom, etiquette: c.etiquette, duree: c.duree, fond: c.fond !== null }));
  const props = proposerMemes(r0, mots, src, signaux, fiches, { finAccroche, facteur: g.densite.memes });
  // Décor (YouTube 16:9) : le bouton « s'abonner » de la bibliothèque, tôt et avant la fin. Retirable comme un mème.
  const decor = gabaritDe(r0).paysage ? proposerDecor(r0, fiches, { finAccroche, dejaPoses: props.map((p) => ({ t: p.t, a: p.a - p.de })) }) : [];
  if (props.length === 0 && decor.length === 0) return 0;
  const ouvertes = new Map<string, SourceOuverte>();
  for (const p of [...props, ...decor]) {
    const clip = clips.find((c) => c.id === p.clip)!;
    if (!ouvertes.has(clip.id)) {
      const s = await sourceDuClip(clip).catch(() => null);
      if (s) ouvertes.set(clip.id, s);
    }
  }
  let n = 0;
  const ok = modifier((r) => {
    let res = r;
    const paysage = gabaritDe(r).paysage;
    for (const p of props) {
      const clip = clips.find((c) => c.id === p.clip)!;
      const s = ouvertes.get(clip.id);
      if (!s) continue;
      const inc: Incrustation = { src: s.infos.id, t: p.t, de: p.de, a: p.a, genre: clip.fond ? 'fondVert' : 'meme', ...placeMeme({ fond: clip.fond !== null }, paysage) };
      if (clip.fond) inc.cle = cleParDefaut(clip);
      const x = ajouterIncrustation(res, inc, s.infos);
      if (x.i >= 0) {
        res = x.recette;
        n++;
      }
    }
    for (const d of decor) {
      const clip = clips.find((c) => c.id === d.clip)!;
      const s = ouvertes.get(clip.id);
      if (!s) continue;
      const inc: Incrustation = { src: s.infos.id, t: d.t, de: d.de, a: d.a, genre: clip.fond ? 'fondVert' : 'meme', x: 0.5, y: 0.8, taille: 0.45 };
      if (clip.fond) inc.cle = cleParDefaut(clip);
      const x = ajouterIncrustation(res, inc, s.infos);
      if (x.i >= 0) {
        res = x.recette;
        n++;
      }
    }
    return res;
  });
  if (ok && n > 0 && !silencieux) afficherToast(`${n} mème${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''} aux moments forts.`, 6000, { label: 'Annuler', agir: annulerAction });
  return ok ? n : 0;
}