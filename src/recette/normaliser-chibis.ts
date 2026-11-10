// Normalisation des champs « chibis » de la v3 (dev 3) : définition d'un chibi, place d'un avatar, réglages des
// avatars, émotion. Champs FACULTATIFS : jamais ajoutés s'ils sont absents (un ancien montage s'ouvre pareil).
// Branché par normaliser-voix.ts (chibi et place d'une personne, émotion d'un tour), normaliser-insertion.ts
// (chibi plein écran) et normaliser-v3.ts (`recette.avatars`). Contrat : conception/contrat-wankil.md §5.

import { ACCESSOIRES, COIFFURES, COULEURS, EMOTIONS, estCouleur, PEAUX, SITUATIONS, STYLES_CHIBI, TENUES, YEUX, type Emotion, type Situation } from '../chibis/catalogue';
import { borner, estObjet, lireNombre, verifierCles, type Journal } from './normaliser-outils';
import type { DefinitionChibi, PlaceAvatar, ReglagesAvatars } from './types';

export const GRAINE_MAX = 2147483647;
export const PLACE_AVATAR = { tailleMin: 0.1, tailleMax: 0.6, tailleDefaut: 0.3 } as const;
export const AVATARS = { tenue: 0.5, tenueMax: 2 } as const;

const CLES_CHIBI = ['style', 'graine', 'peau', 'coiffure', 'cheveux', 'tenue', 'accessoire', 'couleur', 'yeux'] as const;

/** Un identifiant de la liste, sinon le défaut (avec un message). */
function choix<T extends string>(v: unknown, liste: readonly T[], defaut: T, ch: string, nom: string, journal: Journal): T {
  if (typeof v === 'string' && (liste as readonly string[]).includes(v)) return v as T;
  if (v !== undefined) journal.corrige(ch, `${nom} "${String(v)}" n'existe pas : remplacé par "${defaut}".`);
  return defaut;
}

function couleur(v: unknown, defaut: string, ch: string, journal: Journal): string {
  if (estCouleur(v)) return v.toUpperCase();
  if (v !== undefined) journal.corrige(ch, `La couleur "${String(v)}" n'est pas une couleur « #RRGGBB » : remplacée.`);
  return defaut;
}

/** Une émotion connue, sinon undefined (avec un message si elle était écrite). */
export function normaliserEmotion(v: unknown, ch: string, journal: Journal): Emotion | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string' && (EMOTIONS as readonly string[]).includes(v)) return v as Emotion;
  journal.corrige(ch, `L'émotion "${String(v)}" n'existe pas : retirée (le chibi parle normalement).`);
  return undefined;
}

/** Une situation de jeu connue (sauf « aucune », qui s'écrit en n'écrivant rien), sinon undefined (avec un message). */
export function normaliserSituation(v: unknown, ch: string, journal: Journal): Situation | undefined {
  if (v === undefined || v === 'aucune') return undefined;
  if (typeof v === 'string' && (SITUATIONS as readonly string[]).includes(v)) return v as Situation;
  journal.corrige(ch, `La situation "${String(v)}" n'existe pas : retirée (le perso garde juste son émotion).`);
  return undefined;
}

/** Définition d'un chibi : chaque valeur inconnue est remplacée par celle par défaut. undefined si absente ou illisible. */
export function normaliserChibi(brut: unknown, ch: string, journal: Journal): DefinitionChibi | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!estObjet(brut)) {
    journal.corrige(ch, 'Le chibi est illisible : retiré.');
    return undefined;
  }
  verifierCles(brut, CLES_CHIBI, ch, journal);
  const g = typeof brut.graine === 'number' && Number.isFinite(brut.graine) ? Math.round(borner(brut.graine, 0, GRAINE_MAX)) : 1;
  if (brut.graine !== undefined && g !== brut.graine) journal.corrige(`${ch}.graine`, 'La graine du chibi doit être un entier positif : corrigée.');
  const def: DefinitionChibi = {
    style: choix(brut.style, STYLES_CHIBI, 'feutre', `${ch}.style`, 'Le style', journal),
    graine: g,
    peau: couleur(brut.peau, PEAUX[1], `${ch}.peau`, journal),
    coiffure: choix(brut.coiffure, COIFFURES, 'courts', `${ch}.coiffure`, 'La coiffure', journal),
    cheveux: couleur(brut.cheveux, '#4A2C1A', `${ch}.cheveux`, journal),
    tenue: choix(brut.tenue, TENUES, 'sweat', `${ch}.tenue`, 'La tenue', journal),
    accessoire: choix(brut.accessoire, ACCESSOIRES, 'aucun', `${ch}.accessoire`, "L'accessoire", journal),
    couleur: couleur(brut.couleur, COULEURS[0], `${ch}.couleur`, journal),
  };
  if (brut.yeux !== undefined) {
    if (typeof brut.yeux === 'string' && (YEUX as readonly string[]).includes(brut.yeux)) def.yeux = brut.yeux as DefinitionChibi['yeux'];
    else journal.corrige(`${ch}.yeux`, `Les yeux "${String(brut.yeux)}" n'existent pas : retirés.`);
  }
  return def;
}

/** Place d'un avatar : x, y dans [0, 1], taille dans [0,1 ; 0,6]. undefined si absente ou illisible. */
export function normaliserPlaceAvatar(brut: unknown, ch: string, journal: Journal): PlaceAvatar | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!estObjet(brut)) {
    journal.corrige(ch, "La place de l'avatar est illisible : place par défaut.");
    return undefined;
  }
  verifierCles(brut, ['x', 'y', 'taille'], ch, journal);
  return {
    x: lireNombre(brut.x, `${ch}.x`, journal, { defaut: 0.12, min: 0, max: 1, nom: 'la position x' }),
    y: lireNombre(brut.y, `${ch}.y`, journal, { defaut: 0.97, min: 0, max: 1, nom: 'la position y' }),
    taille: lireNombre(brut.taille, `${ch}.taille`, journal, { defaut: PLACE_AVATAR.tailleDefaut, min: PLACE_AVATAR.tailleMin, max: PLACE_AVATAR.tailleMax, nom: "la taille de l'avatar" }),
  };
}

/** `recette.avatars` : `true` = réglages par défaut ; false / null / absent = pas d'avatars. */
export function normaliserAvatars(brut: unknown, journal: Journal): ReglagesAvatars | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (brut === true) return {};
  if (!estObjet(brut)) {
    journal.corrige('avatars', 'Les réglages des avatars sont illisibles : réglages par défaut.');
    return {};
  }
  verifierCles(brut, ['mode', 'rebond', 'tenue', 'style'], 'avatars', journal);
  const res: ReglagesAvatars = {};
  if (brut.mode === 'parle' || brut.mode === 'toujours' || brut.mode === 'reactions') res.mode = brut.mode;
  else if (brut.mode !== undefined) journal.corrige('avatars.mode', `Le mode "${String(brut.mode)}" n'existe pas : « quand la personne parle ».`);
  if (typeof brut.rebond === 'boolean') res.rebond = brut.rebond;
  if (brut.tenue !== undefined) res.tenue = lireNombre(brut.tenue, 'avatars.tenue', journal, { defaut: AVATARS.tenue, min: 0, max: AVATARS.tenueMax, nom: 'la tenue après la parole' });
  if (brut.style !== undefined) {
    if (typeof brut.style === 'string' && (STYLES_CHIBI as readonly string[]).includes(brut.style)) res.style = brut.style as ReglagesAvatars['style'];
    else journal.corrige('avatars.style', `Le style "${String(brut.style)}" n'existe pas : retiré.`);
  }
  return res;
}
