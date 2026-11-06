// H. Montage express « avec l'IA » (INTÉGRATEUR), fonctions PURES : le texte envoyé (résumé des scènes + phrases
// fortes, JAMAIS le son ni l'image) et la lecture de la réponse (scènes à garder, titres, mots mal compris).
// L'appel lui-même passe par les fournisseurs du monteur IA (ia/fournisseurs), avec la clé de l'utilisateur.

import type { Mot, Sec } from '../../recette/types';
import { trouverPunchlines } from '../habillage/punchlines';
import type { SignauxSource } from '../types';
import { horodatage, motsDans, type SceneProposee } from './scenes';

export const FORMAT_EXPRESS = 'ARKO-EXPRESS/1';
/** Au plus tant de mots d'extrait par scène, et de scènes envoyées. */
export const IA_EXPRESS = { motsParScene: 40, scenesMax: 200, punchlinesMax: 120, maxTokens: 8000 };

export interface ReponseExpress {
  /** Scènes (numéro 1..n) : garder ou non, et un titre court. */
  scenes: { n: number; garder: boolean; titre?: string }[];
  /** Mots mal compris par la transcription : « de » → « vers ». */
  corrections: { de: string; vers: string }[];
}

export function consignesExpress(): string {
  return [
    'Tu es le monteur d\'une vidéo YouTube de jeu vidéo (style Laink et Terracid : rythmé, drôle).',
    'On te donne les scènes d\'un long enregistrement (temps, durée gardée, signaux du son, début du texte dit),',
    'et les phrases fortes déjà repérées. Choisis les scènes à garder pour viser la durée demandée, en gardant',
    'l\'histoire compréhensible, et donne à chaque scène gardée un titre court (3 à 6 mots, en français, sans émoji).',
    'Corrige aussi les mots mal compris par la transcription dans les phrases fortes (pseudos, noms du jeu).',
    'Réponds UNIQUEMENT en JSON : {"scenes":[{"n":1,"garder":true,"titre":"…"}],"corrections":[{"de":"mot","vers":"mot"}]}',
  ].join('\n');
}

const texte = (mots: readonly Mot[]) => mots.map((m) => m[0]).join(' ').replace(/\s+/g, ' ').trim();

/** Le texte envoyé à l'IA (montré tel quel par « Voir ce qui est envoyé »). */
export function messageExpress(scenes: readonly SceneProposee[], mots: readonly Mot[], signaux: SignauxSource | null, dureeVisee: Sec): string {
  const lignes = [FORMAT_EXPRESS, `duree_visee: ${horodatage(dureeVisee)}`, 'scenes:'];
  scenes.slice(0, IA_EXPRESS.scenesMax).forEach((s, i) => {
    const extrait = texte(motsDans(mots, s).slice(0, IA_EXPRESS.motsParScene));
    lignes.push(`#${i + 1} ${horodatage(s.de)}-${horodatage(s.a)} | ${Math.round(s.duree)} s | ${s.raison} | « ${extrait} »`);
  });
  lignes.push('phrases_fortes:');
  for (const p of trouverPunchlines(mots, signaux).slice(0, IA_EXPRESS.punchlinesMax)) {
    lignes.push(`${horodatage(p.ts)} « ${texte(mots.slice(p.k0, p.k1))} »`);
  }
  return lignes.join('\n');
}

/** Lit la réponse (JSON, éventuellement entouré de texte ou de ```). null si illisible. */
export function lireReponseExpress(reponse: string, nScenes: number): ReponseExpress | null {
  const debut = reponse.indexOf('{');
  const fin = reponse.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(reponse.slice(debut, fin + 1).replace(/,\s*([}\]])/g, '$1'));
  } catch {
    return null;
  }
  const o = brut as { scenes?: unknown; corrections?: unknown };
  const scenes: ReponseExpress['scenes'] = [];
  for (const x of Array.isArray(o.scenes) ? o.scenes : []) {
    const e = x as { n?: unknown; garder?: unknown; titre?: unknown };
    const n = Number(e.n);
    if (!Number.isInteger(n) || n < 1 || n > nScenes || scenes.some((s) => s.n === n)) continue;
    const titre = typeof e.titre === 'string' ? e.titre.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    scenes.push({ n, garder: e.garder !== false, ...(titre ? { titre } : {}) });
  }
  const corrections: ReponseExpress['corrections'] = [];
  for (const x of Array.isArray(o.corrections) ? o.corrections : []) {
    const e = x as { de?: unknown; vers?: unknown };
    if (typeof e.de !== 'string' || typeof e.vers !== 'string') continue;
    const de = e.de.trim();
    const vers = e.vers.trim();
    if (de && vers && de !== vers && !/\s/.test(de) && vers.length <= 40) corrections.push({ de, vers });
  }
  if (scenes.length === 0 && corrections.length === 0) return null;
  return { scenes, corrections };
}

const nu = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Applique la réponse : scènes cochées / titres (les scènes non citées sont décochées), mots corrigés. */
export function appliquerReponseExpress(scenes: readonly SceneProposee[], mots: readonly Mot[], rep: ReponseExpress): { scenes: SceneProposee[]; mots: Mot[] } {
  const cites = rep.scenes.length > 0;
  const res = scenes.map((s, i) => {
    const r = rep.scenes.find((x) => x.n === i + 1);
    return { ...s, garde: cites ? !!r?.garder : s.garde, titre: r?.titre ?? s.titre };
  });
  const table = new Map(rep.corrections.map((c) => [nu(c.de), c.vers]));
  const corriges = mots.map((m): Mot => {
    const vers = table.get(nu(m[0]));
    if (!vers) return m;
    const ponctuation = /[!?…,.]+$/.exec(m[0])?.[0] ?? '';
    const txt = vers.endsWith(ponctuation) ? vers : `${vers}${ponctuation}`;
    return m[3] === 1 ? [txt, m[1], m[2], 1] : [txt, m[1], m[2]];
  });
  return { scenes: res, mots: corriges };
}
