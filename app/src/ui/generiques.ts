// Intro / outro (YouTube 16:9) côté interface : choisir un modèle, importer sa vidéo, « Mes génériques »,
// et rouvrir la vidéo d'une intro / outro quand on reprend un montage (elle est gardée sur l'appareil).

import { signal } from '@preact/signals';
import {
  fichierGenerique,
  garderGenerique,
  listerGeneriques,
  ouvrirSource,
  supprimerGenerique,
  type MonGenerique,
  type SourceOuverte,
} from '../moteur/api';
import { DUREES_GENERIQUE, texteParDefaut, type ModeleGenerique, type Place } from '../recette/generiques';
import { choisirGenerique, idGenerique } from '../recette/operations';
import type { Generique, Recette } from '../recette/types';
import { TY } from '../textes-youtube';
import { afficherToast, ajouterSourceOuverte, idsPris, modifier, recette } from './etat';

const CLE_CHAINE = 'arko.chaine';

/** Intro ou outro en cours de réglage dans l'outil. */
export const placeChoisie = signal<Place>('outro');
/** « Mes génériques » (null = pas encore lus). */
export const mesGeneriques = signal<MonGenerique[] | null>(null);

export function lireChaine(): string {
  try {
    return localStorage.getItem(CLE_CHAINE) ?? '';
  } catch {
    return '';
  }
}

export function memoriserChaine(nom: string) {
  try {
    localStorage.setItem(CLE_CHAINE, nom.trim());
  } catch {
    /* stockage bloqué */
  }
}

export async function rafraichirGeneriques() {
  try {
    mesGeneriques.value = await listerGeneriques();
  } catch (e) {
    console.error(e);
    mesGeneriques.value = [];
  }
}

/** Met un modèle animé en intro ou en outro (avec le nom de la chaîne mémorisé). */
export function mettreModele(place: Place, modele: ModeleGenerique) {
  const actuel = recette.peek()?.[place];
  const g: Generique = {
    modele,
    chaine: actuel?.chaine ?? lireChaine(),
    texte: actuel?.texte ?? texteParDefaut(place),
    dur: actuel && !actuel.src ? actuel.dur : DUREES_GENERIQUE[place].defaut,
  };
  modifier((r) => choisirGenerique(r, place, g));
}

export function retirer(place: Place) {
  modifier((r) => choisirGenerique(r, place, null));
}

/** Ouvre une vidéo d'intro / outro avec l'id voulu et l'ajoute aux sources ouvertes (export, reprise). */
async function ouvrirAvecId(fichier: File, id: string): Promise<SourceOuverte> {
  const s = await ouvrirSource(fichier);
  s.infos = { ...s.infos, id };
  ajouterSourceOuverte(s);
  return s;
}

/** Ajoute une vidéo de l'utilisateur en intro / outro ; elle est gardée sur l'appareil (Mes génériques). */
export async function importerVideo(place: Place, fichier: File) {
  const r = recette.peek();
  if (!r) return;
  const s = await ouvrirAvecId(fichier, idGenerique(r, idsPris()));
  const b = DUREES_GENERIQUE[place];
  const dur = Math.min(b.max, Math.max(b.min, Math.floor(s.infos.duree * 100) / 100));
  modifier((x) => choisirGenerique(x, place, { src: s.infos.id, dur }, s.infos));
  const { id: _id, ...video } = s.infos;
  await garderGenerique({ nom: s.infos.nom.replace(/\.[^.]+$/, ''), g: { dur }, video }, fichier).catch((e: unknown) => {
    afficherToast(e instanceof Error ? e.message : String(e));
  });
  afficherToast(TY.generiques.importe(s.infos.nom));
  await rafraichirGeneriques();
}

/** Garde le modèle réglé pour les prochains montages. */
export async function garderModele(place: Place) {
  const g = recette.peek()?.[place];
  if (!g?.modele) return;
  memoriserChaine(g.chaine ?? '');
  await garderGenerique({ nom: `${TY.generiques.modeles[g.modele]} · ${g.texte ?? texteParDefaut(place)}`, g: { ...g } });
  afficherToast(TY.generiques.garde);
  await rafraichirGeneriques();
}

/** Applique un générique gardé (modèle, ou vidéo rouverte depuis l'appareil). */
export async function appliquer(place: Place, m: MonGenerique) {
  const r = recette.peek();
  if (!r) return;
  if (!m.video) return void modifier((x) => choisirGenerique(x, place, { ...m.g }));
  const fichier = await fichierGenerique(m.video.emp, m.video.nom);
  if (!fichier) return afficherToast(TY.generiques.introuvable);
  const s = await ouvrirAvecId(fichier, idGenerique(r, idsPris()));
  modifier((x) => choisirGenerique(x, place, { src: s.infos.id, dur: Math.min(m.g.dur, s.infos.duree) }, s.infos));
}

export async function oublier(m: MonGenerique) {
  await supprimerGenerique(m.id);
  await rafraichirGeneriques();
}

/**
 * À la reprise d'un montage : rouvre les vidéos d'intro / outro gardées sur l'appareil.
 * Une vidéo introuvable est retirée de la recette (avec un message).
 */
export async function rouvrirGeneriques(r: Recette): Promise<{ recette: Recette; ouvertes: SourceOuverte[]; messages: string[] }> {
  let res = r;
  const ouvertes: SourceOuverte[] = [];
  const messages: string[] = [];
  for (const place of ['intro', 'outro'] as const) {
    const id = res[place]?.src;
    const infos = id ? res.sources.find((s) => s.id === id) : undefined;
    if (!id) continue;
    const deja = ouvertes.find((s) => s.infos.id === id);
    if (deja) continue;
    const fichier = infos ? await fichierGenerique(infos.emp, infos.nom).catch(() => null) : null;
    if (!fichier) {
      res = choisirGenerique(res, place, null);
      messages.push(TY.generiques.introuvable);
      continue;
    }
    const s = await ouvrirSource(fichier);
    s.infos = { ...s.infos, id };
    ouvertes.push(s);
  }
  return { recette: res, ouvertes, messages };
}
