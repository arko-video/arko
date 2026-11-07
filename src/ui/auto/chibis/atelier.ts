// État et actions de l'atelier des chibis (D, dev 3) : le chibi en cours (brouillon), l'émotion montrée, le nom,
// la liste de Ma bibliothèque → Chibis, l'horloge de la bouche animée (12 demi-battements par seconde).

import { signal } from '@preact/signals';
import { chibiAuHasard, graineValide } from '../../../chibis/hasard';
import { chibiEnPng, chibisEnZip, nomFichier } from '../../../chibis/png';
import type { Situation } from '../../../chibis/catalogue';
import { DEF_SITUATIONS } from '../../../chibis/persos/situations';
import type { DefinitionChibi, Emotion } from '../../../recette/types';
import { garderChibi, listerChibis, modifierChibi, supprimerChibi, type MonChibi } from '../../../stockage/chibis';
import { TV } from '../../../textes-v3';
import { afficherToast } from '../../etat';
import { atelierOuvert, type DemandeAtelier } from './etat-chibis';

export const brouillon = signal<DefinitionChibi>(chibiAuHasard(1));
export const emoChoisie = signal<Emotion>('parle');
/** Situation de jeu montrée dans l'atelier (et exportée en PNG). */
export const sitChoisie = signal<Situation>('aucune');
export const nomBrouillon = signal('');
/** Id dans Ma bibliothèque du chibi en cours (null = pas encore gardé). */
export const idBrouillon = signal<string | null>(null);
export const mesChibis = signal<MonChibi[] | null>(null);
/** Horloge de l'animation (12 par seconde) : bouche ouverte quand elle est paire. */
export const battement = signal(0);
export const occupe = signal(false);

let minuterie: ReturnType<typeof setInterval> | null = null;

export function demarrerHorloge() {
  minuterie ??= setInterval(() => (battement.value = (battement.value + 1) % 1200), 1000 / 12);
}

export function arreterHorloge() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}

export async function chargerChibis(): Promise<MonChibi[]> {
  try {
    mesChibis.value = await listerChibis();
  } catch {
    mesChibis.value = [];
  }
  return mesChibis.value;
}

/** Prépare l'atelier pour une demande : chibi de Ma bibliothèque à modifier, ou nouveau chibi au hasard. */
export async function preparer(d: DemandeAtelier) {
  emoChoisie.value = 'parle';
  sitChoisie.value = 'aucune';
  const liste = await chargerChibis();
  const c = d.id ? liste.find((x) => x.id === d.id) : undefined;
  idBrouillon.value = c?.id ?? null;
  nomBrouillon.value = c?.nom ?? '';
  brouillon.value = c?.def ?? d.def ?? chibiAuHasard(graineValide(Date.now() & 0x7fffffff));
}

export function auHasard() {
  brouillon.value = chibiAuHasard(graineValide(Date.now() & 0x7fffffff), brouillon.value.style);
}

/** Une situation : son émotion par défaut est montrée (on peut la changer ensuite). */
export function choisirSituation(s: Situation) {
  sitChoisie.value = s;
  emoChoisie.value = DEF_SITUATIONS[s].emo;
}

/** Part d'un des persos tout prêts (on peut ensuite tout changer). */
export function partirDe(def: DefinitionChibi) {
  brouillon.value = { ...def };
}

export function changerTrait(partiel: Partial<DefinitionChibi>) {
  brouillon.value = { ...brouillon.value, ...partiel };
}

const nomOuDefaut = () => nomBrouillon.value.trim() || TV.chibis.nomDefaut;

/** Garde (ou enregistre) le chibi dans Ma bibliothèque ; renvoie son id. */
export async function garder(): Promise<string | null> {
  try {
    const id = idBrouillon.value;
    const c = id ? await modifierChibi(id, { nom: nomOuDefaut(), def: brouillon.value }) : await garderChibi(brouillon.value, nomOuDefaut());
    if (!c) return null;
    idBrouillon.value = c.id;
    await chargerChibis();
    afficherToast(id ? TV.chibis.enregistre(c.nom) : TV.chibis.garde(c.nom));
    return c.id;
  } catch (e) {
    afficherToast(e instanceof Error ? e.message : TV.chibis.plein, 5000);
    return null;
  }
}

/** « Choisir ce chibi » (ouvert depuis ChoixChibi) : gardé dans Ma bibliothèque, puis rendu à l'appelant. */
export async function choisir(def: DefinitionChibi = brouillon.value, bib?: string) {
  const d = atelierOuvert.peek();
  if (!d?.pour) return;
  const id = bib ?? (await garder()) ?? undefined;
  d.pour(def, id);
  atelierOuvert.value = null;
}

export async function supprimer(c: MonChibi) {
  await supprimerChibi(c.id);
  if (idBrouillon.value === c.id) idBrouillon.value = null;
  await chargerChibis();
  afficherToast(TV.chibis.supprime(c.nom));
}

export async function renommer(c: MonChibi, nom: string) {
  await modifierChibi(c.id, { nom });
  await chargerChibis();
}

/** Propose le fichier à l'appareil (téléchargement). */
export function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exporterPng() {
  const sit = sitChoisie.value;
  const nom = `${nomFichier(nomOuDefaut())}-${emoChoisie.value}${sit !== 'aucune' ? `-${sit}` : ''}.png`;
  telecharger(await chibiEnPng(brouillon.value, { emo: emoChoisie.value, bouche: false, ...(sit !== 'aucune' ? { sit } : {}) }), nom);
  afficherToast(TV.chibis.exportPng(nom));
}

export async function exporterZip() {
  if (occupe.value) return;
  occupe.value = true;
  afficherToast(TV.chibis.fabrication);
  try {
    const zip = await chibisEnZip(brouillon.value, nomOuDefaut());
    telecharger(zip, `${nomFichier(nomOuDefaut())}-${brouillon.value.style}.zip`);
    afficherToast(TV.chibis.exportZip(48));
  } finally {
    occupe.value = false;
  }
}
