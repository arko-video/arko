// Normalisation des champs « insertion », « pistes audio » et « bips » de la v3 (dev 2) : élément inséré d'un plan
// (`plan.ins`), images fixes, pistes audio gardées, bips. FACULTATIFS : jamais ajoutés s'ils sont absents.
// `normaliserInsere` est appelé par normaliser-plans.ts ; le reste par normaliser-v3.ts.
// Contrat : conception/contrat-wankil.md §4.

import { estCouleur } from '../chibis/catalogue';
import { STYLES_TEXTE, STYLES_TEXTE_AUTO } from './defauts';
import { normaliserChibi, normaliserEmotion, normaliserSituation } from './normaliser-chibis';
import { estObjet, lireNombre, verifierCles, type Journal } from './normaliser-outils';
import { DUREE_INSERE, type ElementInsere, type ImageRecette, type PisteGardee, type ReglagePistes, type ReglagesBips } from './types-insertion';
import type { Source } from './types';

export const INSERTION = { imagesMax: 50, txtMax: 120, txtChibiMax: 60, pistesMax: 8, nomPisteMax: 24 } as const;

/** Ce que le normaliseur des plans doit connaître pour lire un élément inséré. */
export interface ContexteInsertion {
  images: readonly string[];
  personnes: readonly string[];
}

const STYLES = [...STYLES_TEXTE, ...STYLES_TEXTE_AUTO] as readonly string[];

/**
 * Élément inséré d'un plan. undefined = absent ; null = illisible ou impossible (le PLAN est alors supprimé :
 * image inconnue, carton vide, type inconnu).
 */
export function normaliserInsere(brut: unknown, ch: string, journal: Journal, ctx: ContexteInsertion): ElementInsere | null | undefined {
  if (brut === undefined) return undefined;
  if (!estObjet(brut)) {
    journal.corrige(ch, 'L\'élément inséré est illisible : plan supprimé.');
    return null;
  }
  const type = brut.type;
  if (type === 'clip') {
    verifierCles(brut, ['type'], ch, journal);
    return { type: 'clip' };
  }
  if (type === 'image') {
    verifierCles(brut, ['type', 'img'], ch, journal);
    if (typeof brut.img === 'string' && ctx.images.includes(brut.img)) return { type: 'image', img: brut.img };
    journal.corrige(`${ch}.img`, `L'image "${String(brut.img)}" n'est pas dans le montage : plan supprimé.`);
    return null;
  }
  if (type === 'carton') {
    verifierCles(brut, ['type', 'txt', 'fond', 'couleur', 'style'], ch, journal);
    const txt = typeof brut.txt === 'string' ? brut.txt.trim().slice(0, INSERTION.txtMax) : '';
    if (!txt) {
      journal.corrige(`${ch}.txt`, 'Le carton n\'a pas de texte : plan supprimé.');
      return null;
    }
    const el: Extract<ElementInsere, { type: 'carton' }> = { type: 'carton', txt };
    if (estCouleur(brut.fond)) el.fond = brut.fond.toUpperCase();
    if (estCouleur(brut.couleur)) el.couleur = brut.couleur.toUpperCase();
    if (typeof brut.style === 'string' && STYLES.includes(brut.style)) el.style = brut.style;
    else if (brut.style !== undefined) journal.corrige(`${ch}.style`, `Le style "${String(brut.style)}" n'existe pas : style par défaut.`);
    return el;
  }
  if (type === 'chibi') {
    verifierCles(brut, ['type', 'emo', 'p', 'chibi', 'txt', 'fond', 'sit'], ch, journal);
    const el: Extract<ElementInsere, { type: 'chibi' }> = { type: 'chibi', emo: normaliserEmotion(brut.emo, `${ch}.emo`, journal) ?? 'parle' };
    if (typeof brut.p === 'string' && ctx.personnes.includes(brut.p)) el.p = brut.p;
    else if (brut.p !== undefined) journal.corrige(`${ch}.p`, `La personne "${String(brut.p)}" n'existe pas : retirée.`);
    const chibi = normaliserChibi(brut.chibi, `${ch}.chibi`, journal);
    if (chibi) el.chibi = chibi;
    if (typeof brut.txt === 'string' && brut.txt.trim()) el.txt = brut.txt.trim().slice(0, INSERTION.txtChibiMax);
    if (estCouleur(brut.fond)) el.fond = brut.fond.toUpperCase();
    const sit = normaliserSituation(brut.sit, `${ch}.sit`, journal);
    if (sit) el.sit = sit;
    return el;
  }
  journal.corrige(`${ch}.type`, `L'élément inséré "${String(type)}" n'existe pas : plan supprimé.`);
  return null;
}

/** Durée d'un élément sans vidéo (image, carton, chibi) : 0,3 à 30 s. */
export function dureeInsere(brut: unknown, ch: string, journal: Journal): number {
  return lireNombre(brut, ch, journal, { defaut: DUREE_INSERE.carton, min: DUREE_INSERE.min, max: DUREE_INSERE.max, nom: "la durée de l'élément inséré" });
}

/** Images fixes : id unique, dimensions positives ; 50 au plus. */
export function normaliserImages(brut: unknown, journal: Journal): ImageRecette[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('images', '"images" doit être une liste : ignoré.');
    return undefined;
  }
  const res: ImageRecette[] = [];
  brut.slice(0, INSERTION.imagesMax).forEach((b, i) => {
    const ch = `images[${i}]`;
    if (!estObjet(b) || typeof b.id !== 'string' || !b.id) return journal.corrige(ch, 'Image sans identifiant : retirée.');
    if (res.some((x) => x.id === b.id)) return journal.corrige(ch, `L'image "${b.id}" apparaît deux fois : doublon retiré.`);
    verifierCles(b, ['id', 'nom', 'emp', 'taille', 'l', 'h'], ch, journal);
    const l = Math.round(Number(b.l) || 0);
    const h = Math.round(Number(b.h) || 0);
    if (l <= 0 || h <= 0) return journal.corrige(ch, 'Image sans dimensions : retirée.');
    res.push({ id: b.id.slice(0, 12), nom: typeof b.nom === 'string' ? b.nom.slice(0, 120) : b.id, emp: typeof b.emp === 'string' ? b.emp : '', taille: Math.max(0, Number(b.taille) || 0), l, h });
  });
  return res;
}

/** Pistes audio gardées : source vidéo connue, numéros uniques (et dans le fichier s'il est connu), volume 0 à 1,5. */
export function normaliserPistesAudio(brut: unknown, videos: readonly Source[], journal: Journal): ReglagePistes[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('pistesAudio', '"pistesAudio" doit être une liste : ignoré.');
    return undefined;
  }
  const res: ReglagePistes[] = [];
  brut.forEach((b, i) => {
    const ch = `pistesAudio[${i}]`;
    if (!estObjet(b)) return journal.corrige(ch, 'Réglage des pistes illisible : retiré.');
    verifierCles(b, ['src', 'pistes'], ch, journal);
    const source = videos.find((s) => s.id === b.src);
    if (!source) return journal.corrige(`${ch}.src`, `La vidéo "${String(b.src)}" n'existe pas : réglage retiré.`);
    if (res.some((x) => x.src === source.id)) return journal.corrige(ch, 'Deux réglages pour la même vidéo : le second est retiré.');
    const pistes: PisteGardee[] = [];
    (Array.isArray(b.pistes) ? b.pistes : []).slice(0, INSERTION.pistesMax).forEach((x, k) => {
      const chp = `${ch}.pistes[${k}]`;
      if (!estObjet(x) || typeof x.n !== 'number' || !Number.isInteger(x.n) || x.n < 0) return journal.corrige(chp, 'Piste sans numéro : retirée.');
      if (source.pistes !== undefined && x.n >= source.pistes) return journal.corrige(chp, `La piste ${x.n + 1} n'existe pas dans "${source.nom}" : retirée.`);
      if (pistes.some((y) => y.n === x.n)) return journal.corrige(chp, 'Piste en double : retirée.');
      verifierCles(x, ['n', 'vol', 'nom'], chp, journal);
      const p: PisteGardee = { n: x.n };
      if (x.vol !== undefined) p.vol = lireNombre(x.vol, `${chp}.vol`, journal, { defaut: 1, min: 0, max: 1.5, nom: 'le volume de la piste' });
      if (typeof x.nom === 'string' && x.nom.trim()) p.nom = x.nom.trim().slice(0, INSERTION.nomPisteMax);
      pistes.push(p);
    });
    if (pistes.length === 0) return journal.corrige(ch, 'Aucune piste gardée : réglage retiré (piste principale).');
    res.push({ src: source.id, pistes });
  });
  return res.length > 0 ? res : undefined;
}

/** Bips : `true` = bip ; { son: 'bip' | 'muet' }. */
export function normaliserBips(brut: unknown, journal: Journal): ReglagesBips | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (brut === true) return { son: 'bip' };
  if (estObjet(brut) && (brut.son === 'bip' || brut.son === 'muet')) {
    verifierCles(brut, ['son'], 'bips', journal);
    return { son: brut.son };
  }
  journal.corrige('bips', 'Le réglage des gros mots est illisible : bip.');
  return { son: 'bip' };
}
