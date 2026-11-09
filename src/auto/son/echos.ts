// « ÉCHOS » (9/11/2026, bibliothèque réelle de Romain : des centaines de répliques de mèmes — « FBI Open Up »,
// « John Cena », « Nani », « Oof »…) : quand quelqu'un DIT dans la vidéo les mots du nom d'un son, ce son-là est
// proposé juste après la phrase (mode réaction). C'est ce que fait un monteur : la réplique qui répond à ce qu'on
// vient de dire. Pure. Les propositions vont dans la revue des bruitages (cochées, tout reste modifiable).

import type { Mot, Sec } from '../../recette/types';
import type { SignauxSource } from '../types';
import { sansAccents } from '../../sons/recherche';
import { BRUITAGES, limiterParMinute, minutesSecondes, trouverExpression, volDepuisDb, type PropositionBruitage } from './bruitages';
import type { CategorieBruitage } from './declencheurs';
import { placerSurReaction } from './reaction';

/** Mots des noms de fichiers qui ne disent rien (bruit des sites de téléchargement). */
const BRUIT = new Set(
  'sound effect effects sfx hd kbps 160kbps 128kbps 256k 128k 1080p mlg gaming meme memes original version short download free link mpgun com mp3 wav m4a mp4 the a an of and to in is it you your my me i im de la le les un une des du et en'.split(' '),
);

/** Mots trop courants pour déclencher seuls (il faut au moins 2 mots du nom à la suite). */
const COURANTS = new Set(
  ('what that this there here with have just like they them when where come go get got are was were not no yes yeah oh hey ok okay why who how all one two out off on up down again right good bad big little love guy man boy kid sad down well very much more next time back last first fast slow call ' +
    // Mots qui DÉCRIVENT le son (pas une réplique) :
    'cartoon comical comedy scream screaming screams yell laugh laughing laughter noise noises loud sound sounds music song songs theme remix template startup transition reaction reactions funny epic cinematic dramatic background ' +
    // Mots qui existent aussi en français (dits sans penser au mème) :
    'super moment moments internet minute minutes place plan plus pas total normal simple question version base cool top stop final fin photo video radio piano solo mission ' +
    // Noms de jeux : dits tout le temps pendant une partie (ils ne déclenchent qu'avec un 2e mot du nom).
    'minecraft fortnite roblox mario sonic among gta pokemon zelda valorant warzone cod duty csgo counter strike apex').split(' '),
);

export interface SonEcho {
  id: string;
  nom: string;
  duree: Sec;
}

/** Les mots utiles d'un nom de fichier (« FBI Open Up - Sound Effect (HD) » → fbi open up). */
export function motsDuNom(nom: string): string[] {
  return sansAccents(nom.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').replace(/\[[^\]]*\]|\([^)]*\)/g, ' '))
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length >= 2 && !BRUIT.has(w) && !/^\d+$/.test(w));
}

/**
 * Expressions qui déclenchent un son : 2 ou 3 mots du nom à la suite (« open up », « john cena »), ou UN mot rare et
 * marquant (4 lettres au moins, pas un mot courant : « nani », « yeet », « illuminati », « headshot », « fbi »).
 */
export function expressionsDuSon(nom: string): string[] {
  const m = motsDuNom(nom).slice(0, 6);
  const res = new Set<string>();
  for (let i = 0; i + 1 < m.length; i++) {
    const deux = [m[i]!, m[i + 1]!];
    if (deux.some((w) => !COURANTS.has(w) && w.length >= 3)) res.add(deux.join(' '));
  }
  for (const w of m) if ((w.length >= 4 || w === 'fbi' || w === 'oof') && !COURANTS.has(w)) res.add(w);
  return [...res];
}

export type PropositionEcho = PropositionBruitage & { son: string; nomSon: string };

/** Échos d'UNE source, triés, au plus `parMinute` (2 par défaut), 4 s d'écart. */
export function proposerEchos(mots: readonly Mot[], src: string, signaux: SignauxSource | null, sons: readonly SonEcho[], o: { parMinute?: number } = {}): PropositionEcho[] {
  const res: (PropositionEcho & { surete: number })[] = [];
  for (const s of sons) {
    if (s.duree <= 0 || s.duree > 15) continue;
    for (const expr of expressionsDuSon(s.nom)) {
      for (const { k0, k1 } of trouverExpression(mots, expr)) {
        const place = placerSurReaction(mots, k1, signaux);
        if (!place) continue;
        const texte = mots.slice(k0, k1 + 1).map((x) => x[0].trim()).join(' ');
        const categorie: CategorieBruitage = 'wow';
        res.push({
          ts: place.ts,
          src,
          categorie,
          pourquoi: `« ${texte} » à ${minutesSecondes(mots[k0]![1])} → ${s.nom}`,
          k: k0,
          vol: volDepuisDb(BRUITAGES.gainDb),
          dur: Math.min(place.dur, Math.max(BRUITAGES.durMin, Math.min(s.duree, BRUITAGES.durMax))),
          fondu: BRUITAGES.fondu,
          son: s.id,
          nomSon: s.nom,
          // Plusieurs mots à la suite : plus sûr qu'un mot seul.
          surete: expr.includes(' ') ? 5 : 4,
        });
      }
    }
  }
  return limiterParMinute(res, o.parMinute ?? 2).map(({ surete: _s, ...p }) => p);
}
