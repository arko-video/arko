// « Mes montages » — partie pure : l'index des projets, la migration de l'ancienne sauvegarde, la copie.
// L'index (clé arko.projets) liste les résumés ; chaque projet est rangé sous arko.projet.<id>.

import type { ProjetSauvegarde } from '../moteur/api';
import { normaliser } from '../recette/normaliser';
import { arrondir, dureePlan } from '../recette/temps';
import type { Recette } from '../recette/types';
import type { ResumeProjet } from './projets';

export const CLE_INDEX = 'arko.projets';
/** Ancienne clé (un seul projet, phases 1 à 3) : migrée automatiquement. */
export const CLE_ANCIENNE = 'arko.projet';
export const cleProjet = (id: string) => `arko.projet.${id}`;
const VIGNETTE_MAX = 24 * 1024;
const TITRE_MAX = 120;

export interface IndexProjets {
  /** Projet en cours d'édition (null = le prochain enregistrement crée un nouveau projet). */
  courant: string | null;
  /** Du plus récent au plus ancien. */
  projets: ResumeProjet[];
}

export function indexVide(): IndexProjets {
  return { courant: null, projets: [] };
}

/** Une vignette n'est gardée que si c'est une petite image en data URL. */
export function vignetteValide(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.length <= VIGNETTE_MAX;
}

/** Lit un index sauvegardé (null s'il est absent ou illisible). */
export function lireIndex(brut: unknown): IndexProjets | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as Partial<IndexProjets>;
  if (!Array.isArray(b.projets)) return null;
  const projets = b.projets.filter((p): p is ResumeProjet => !!p && typeof p === 'object' && typeof p.id === 'string');
  const courant = typeof b.courant === 'string' && projets.some((p) => p.id === b.courant) ? b.courant : null;
  return { courant, projets: trier(projets) };
}

/** Projet sauvegardé et normalisé, ou null (sauvegarde illisible ou sans plan). */
export function lireSauvegarde(brut: unknown): ProjetSauvegarde | null {
  if (!brut || typeof brut !== 'object') return null;
  const p = brut as Partial<ProjetSauvegarde>;
  if (!p.recette) return null;
  const n = normaliser(p.recette, { sources: Array.isArray(p.recette.sources) ? p.recette.sources : [] }, { retirerSourcesAudioInutiles: true });
  if (n.bloquant || n.recette.sources.length === 0) return null;
  return {
    recette: n.recette,
    etape: typeof p.etape === 'string' ? p.etape : 'couper',
    modifieLe: typeof p.modifieLe === 'number' ? p.modifieLe : Date.now(),
    ...(vignetteValide(p.vignette) ? { vignette: p.vignette } : {}),
  };
}

/** Un identifiant court et unique (« lx3k9a2b »). */
export function nouvelId(maintenant = Date.now(), alea = Math.random()): string {
  return maintenant.toString(36) + Math.floor(alea * 36 ** 4).toString(36).padStart(4, '0');
}

/** Nom de la première vidéo, sans extension (« partie ranked.mp4 » → « partie ranked »). */
export function nomSource(recette: Recette): string {
  return recette.sources.find((s) => s.type === 'video')?.nom ?? '';
}

/** Titre par défaut : le titre de la recette, sinon le nom du fichier sans extension. */
export function titreParDefaut(recette: Recette): string {
  const t = recette.titre?.trim() || nomSource(recette).replace(/\.[^.]+$/, '').trim();
  return (t || 'Mon montage').slice(0, TITRE_MAX);
}

/** Titre saisi par l'utilisateur : nettoyé (null s'il est vide). */
export function nettoyerTitre(titre: string): string | null {
  const t = titre.replace(/\s+/g, ' ').trim().slice(0, TITRE_MAX);
  return t || null;
}

export function resumeDe(id: string, projet: ProjetSauvegarde, titre: string): ResumeProjet {
  const r: ResumeProjet = {
    id,
    titre,
    duree: arrondir(projet.recette.plans.reduce((s, p) => s + dureePlan(p), 0)),
    modifieLe: projet.modifieLe,
    etape: projet.etape,
    nomSource: nomSource(projet.recette),
  };
  if (vignetteValide(projet.vignette)) r.vignette = projet.vignette;
  return r;
}

function trier(projets: ResumeProjet[]): ResumeProjet[] {
  return [...projets].sort((a, b) => b.modifieLe - a.modifieLe);
}

/** Ajoute ou remplace un résumé (l'index reste trié du plus récent au plus ancien). */
export function enregistrerDansIndex(index: IndexProjets, resume: ResumeProjet, courant = index.courant): IndexProjets {
  return { courant, projets: trier([...index.projets.filter((p) => p.id !== resume.id), resume]) };
}

/** Retire un projet de l'index (s'il était courant, il n'y a plus de projet courant). */
export function retirerDuIndex(index: IndexProjets, id: string): IndexProjets {
  return { courant: index.courant === id ? null : index.courant, projets: index.projets.filter((p) => p.id !== id) };
}

/** Migration de l'ancienne clé : le projet unique devient le projet courant de la liste (null si illisible). */
export function migrerAncien(ancien: unknown, id: string): { index: IndexProjets; projet: ProjetSauvegarde } | null {
  const projet = lireSauvegarde(ancien);
  if (!projet) return null;
  const index = enregistrerDansIndex(indexVide(), resumeDe(id, projet, titreParDefaut(projet.recette)), id);
  return { index, projet };
}

/** Copie d'un projet sous un nouvel id, titre « … (copie) », datée de maintenant. */
export function copieDe(projet: ProjetSauvegarde, resume: ResumeProjet, id: string, maintenant: number) {
  const copie = JSON.parse(JSON.stringify(projet)) as ProjetSauvegarde;
  copie.modifieLe = maintenant;
  const titre = `${resume.titre} (copie)`.slice(0, TITRE_MAX);
  return { projet: copie, resume: resumeDe(id, copie, titre) };
}
