// Mèmes et fonds verts AUTOMATIQUES (9/11/2026) : Arko pose les clips de Ma bibliothèque (rayons Mèmes et Fonds verts)
// aux mêmes moments que les bruitages (mots déclencheurs, rires forts, jurons criés, silences gênants), juste APRÈS
// la phrase (mode réaction), choisis par leur nom / dossier (« explosion », « bruh », « wasted »…). Pure.
// Règles : jamais dans l'accroche, un mème toutes les 25 s au plus, jamais sur une incrustation déjà posée ni à côté
// d'un bruitage (pas deux sons l'un sur l'autre), le même clip pas deux fois de suite, 4 s gardées au plus.
// Tout reste modifiable ensuite (position, taille, début / fin, détourage) dans l'outil Mèmes / Fond vert.

import { MOTS_CLES_CATEGORIES, scoreFlou } from '../son/choix-son';
import { DECLENCHEURS_DEFAUT, NOMS_CATEGORIES, type CategorieBruitage } from '../son/declencheurs';
import { proposerBruitages } from '../son/bruitages';
import { compiler, sortiesDe } from '../../recette/chronologie';
import { reperesEffets } from '../../recette/operations-effets';
import type { Mot, Recette, Sec } from '../../recette/types';
import type { SignauxSource } from '../types';

export const MEMES_AUTO = { ecart: 25, durMax: 4, clipMax: 12, pres: 1.5 } as const;

/** Ce qu'il faut savoir d'un clip de Ma bibliothèque (forme de MonClip). */
export interface ClipAuto {
  id: string;
  nom: string;
  etiquette: string;
  duree: Sec;
  /** Un fond vert / bleu à détourer. */
  fond: boolean;
}

export interface MemeAuto {
  clip: string;
  /** Temps de SORTIE du début. */
  t: Sec;
  de: Sec;
  a: Sec;
  categorie: CategorieBruitage;
  pourquoi: string;
}

/** Mots en plus pour les CLIPS (vidéos de mèmes et de fonds verts), en plus de ceux des bruitages. */
export const MOTS_CLIPS: Readonly<Partial<Record<CategorieBruitage, readonly string[]>>> = {
  reussite: ['victory royale', 'confetti', 'strike', 'nice', 'thumbs up', 'happy'],
  wow: ['eddy wally', 'that s hot', 'oooh', 'woooo'],
  bruh: ['confused', 'okay meme', 'staring', 'what did you say', 'what do you mean', 'weird', 'eww', 'westbrook what', 'scarce'],
  triste: ['crying', 'shrek crying', 'sad'],
  rate: ['you re a loser', 'loser', 'stupid stamp', 'facepalm'],
  destin: ['to be continued', 'alert', 'breaking news', 'dramatic'],
  explosion: ['explosion', 'explosion fire', 'nuke'],
  ohnon: ['facepalm', 'get it away from me', 'disgusted', 'help'],
  wasted: ['wasted', 'you died', 'minecraft death', 'ko', 'finish him'],
  rire: ['laugh', 'laughing', 'man i m dead', 'dolphin'],
  boom: ['hitmarker', 'triggered', 'rage', 'keyboard smash', 'punches'],
  grillons: ['staring', 'meanwhile', 'years later', 'time card', 'tv no signal'],
  fin: ['we ll be right back', 'well be right back', 'tv turn off', 'to be continued'],
};

/** Clips jamais posés tout seuls : boutons, logos, fonds décoratifs, cadres (à poser à la main). */
const CLIPS_DECOR = /subscribe|abonne|like button|play button|logo|background|math|rainbow|matrix|laptop|curtain|camera hud|rec |banner|countdown|blue screen|vhs|noise|tv tv|green screen pack/i;

/** Meilleur clip pour une catégorie (0 : aucun ne va). */
export function meilleurClip(clips: readonly ClipAuto[], c: CategorieBruitage, eviter: string | null): ClipAuto | null {
  const cles = [...(MOTS_CLIPS[c] ?? []), ...MOTS_CLES_CATEGORIES[c], NOMS_CATEGORIES[c].toLowerCase(), c];
  let best: { clip: ClipAuto; note: number } | null = null;
  for (const clip of clips) {
    if (clip.duree <= 0 || clip.duree > MEMES_AUTO.clipMax) continue;
    if (CLIPS_DECOR.test(clip.nom.replace(/[_]+/g, ' '))) continue;
    let note = 0;
    cles.forEach((cle, rang) => {
      const s = scoreFlou(clip, cle);
      if (s > 0) note = Math.max(note, (cles.length - rang) * 10 + s);
    });
    if (note === 0) continue;
    if (clip.id === eviter) note -= 5;
    if (!best || note > best.note) best = { clip, note };
  }
  return best?.clip ?? null;
}

export function proposerMemes(r: Recette, mots: readonly Mot[], src: string, signaux: SignauxSource | null, clips: readonly ClipAuto[], o: { finAccroche?: Sec; facteur?: number } = {}): MemeAuto[] {
  if (clips.length === 0 || mots.length === 0) return [];
  const ecart = MEMES_AUTO.ecart / Math.min(3, Math.max(0.25, o.facteur ?? 1));
  const sc = compiler(r);
  const sons = reperesEffets(r).sons.map((s) => s.t);
  const deja = (r.incrustations ?? []).map((i) => ({ de: i.t, a: i.t + (i.a - i.de) }));
  const props = proposerBruitages(mots, src, signaux, DECLENCHEURS_DEFAUT, { parMinute: 2, seuilSurete: 2, placement: 'reaction' });
  const res: MemeAuto[] = [];
  let dernier: string | null = null;
  for (const p of props) {
    const t = sortiesDe(sc, src, p.ts)[0];
    if (t === undefined || t < (o.finAccroche ?? 0)) continue;
    if (res.some((m) => Math.abs(m.t - t) < ecart)) continue;
    if (sons.some((s) => Math.abs(s - t) < MEMES_AUTO.pres)) continue;
    const clip = meilleurClip(clips, p.categorie, dernier);
    if (!clip) continue;
    const a = Math.min(clip.duree, MEMES_AUTO.durMax);
    if (t + a > sc.duree) continue;
    if (deja.some((d) => t < d.a && t + a > d.de)) continue;
    res.push({ clip: clip.id, t: Math.round(t * 100) / 100, de: 0, a, categorie: p.categorie, pourquoi: p.pourquoi });
    dernier = clip.id;
  }
  return res;
}

/** Place à l'écran : un fond vert détouré couvre l'image (explosion…), un mème va en haut, hors des persos. */
export function placeMeme(clip: Pick<ClipAuto, 'fond'>, paysage: boolean): { x: number; y: number; taille: number } {
  if (clip.fond) return { x: 0.5, y: 0.5, taille: 1 };
  return paysage ? { x: 0.72, y: 0.32, taille: 0.4 } : { x: 0.5, y: 0.34, taille: 0.7 };
}

/** Décor : un bouton « s'abonner » / « like » de Ma bibliothèque (YouTube seulement : un TikTok n'en a pas besoin). */
export const DECOR = /subscribe|abonne|like button|like_button/i;

export interface DecorAuto {
  clip: string;
  t: Sec;
  de: Sec;
  a: Sec;
}

/**
 * Où poser le bouton d'abonnement : une fois tôt (25 s après l'accroche, au plus tôt à 30 s), et une fois 15 s avant
 * la fin pour une vidéo de plus de 3 min. Jamais sur une incrustation déjà posée. 5 s gardées au plus. Pure.
 */
export function proposerDecor(r: Recette, clips: readonly ClipAuto[], o: { finAccroche?: Sec; dejaPoses?: readonly { t: Sec; a: Sec }[] } = {}): DecorAuto[] {
  const bouton = clips.filter((c) => DECOR.test(c.nom.replace(/[_]+/g, ' ')) && c.duree > 0).sort((a, b) => a.duree - b.duree)[0];
  if (!bouton) return [];
  const duree = compiler(r).duree;
  if (duree < 90) return [];
  const a = Math.min(bouton.duree, 5);
  const occupe = [...(r.incrustations ?? []).map((i) => ({ de: i.t, a: i.t + (i.a - i.de) })), ...(o.dejaPoses ?? []).map((x) => ({ de: x.t, a: x.t + x.a }))];
  const libre = (t: Sec) => !occupe.some((d) => t < d.a + 1 && t + a > d.de - 1);
  const res: DecorAuto[] = [];
  const tot = Math.max(30, (o.finAccroche ?? 0) + 25);
  for (const t0 of [tot, ...(duree > 180 ? [duree - 15] : [])]) {
    // Si la place est prise, on essaie un peu plus tard (jusqu'à 20 s).
    for (let d = 0; d <= 20; d += 2) {
      const t = t0 + d;
      if (t + a <= duree && libre(t)) {
        res.push({ clip: bouton.id, t: Math.round(t * 100) / 100, de: 0, a });
        break;
      }
    }
  }
  return res;
}
