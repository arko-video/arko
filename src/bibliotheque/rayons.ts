// « Ma bibliothèque » (pur) : les 4 rayons, et le rangement automatique d'un import d'après le NOM DES DOSSIERS
// (« sound effect », « son de fond », « effet de fond vert », « meme » et leurs variantes) et le type de fichier.
// Rien ici ne touche au navigateur : tout est testé avec Vitest.

import { sansAccents } from '../sons/recherche';

export type Rayon = 'bruitages' | 'musiques' | 'fondsVerts' | 'memes';
export const RAYONS: readonly Rayon[] = ['bruitages', 'musiques', 'fondsVerts', 'memes'];
/** Rayons de vidéos (gardées en entier) ; les deux autres gardent des sons. */
export const RAYONS_VIDEO: readonly Rayon[] = ['fondsVerts', 'memes'];
export const estRayonVideo = (r: Rayon) => RAYONS_VIDEO.includes(r);

/**
 * Noms de dossiers reconnus, du plus précis au plus large (l'ordre compte : « son de fond » est une musique avant
 * d'être un « son », « effet de fond vert » est un fond vert avant d'être un « effet »). Comparés sans accents ni
 * majuscules, « _ » et « - » comptés comme des espaces, au singulier comme au pluriel.
 */
const MOTS_RAYONS: readonly [Rayon, readonly string[]][] = [
  ['fondsVerts', ['effet de fond vert', 'effets de fond vert', 'effets fond vert', 'fond vert', 'fonds verts', 'fond bleu', 'green screen', 'greenscreen', 'green screens', 'chroma key', 'chromakey', 'chroma', 'gs']],
  ['memes', ['meme', 'memes', 'meme video', 'meme videos', 'video meme', 'videos memes', 'memes videos']],
  ['musiques', ['son de fond', 'sons de fond', 'musique de fond', 'musiques de fond', 'musique', 'musiques', 'music', 'musics', 'bgm', 'background music', 'ost', 'instrumental', 'instrumentales', 'songs']],
  ['bruitages', ['sound effect', 'sound effects', 'sounds effects', 'soundeffects', 'sound fx', 'sfx', 'fx', 'effet sonore', 'effets sonores', 'bruitage', 'bruitages', 'son', 'sons', 'sound', 'sounds', 'mes sons']],
];

/** Mots trop courts ou trop vagues pour compter à l'intérieur d'un nom plus long. */
const SEULS_EXACTS = new Set(['son', 'ost', 'fx', 'gs']);

/** Nom de dossier ramené à sa forme simple : « Sound_Effects » → « sound effects ». */
export function nomSimple(nom: string): string {
  return sansAccents(nom)
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rayon d'un nom de dossier, ou null. Nom exact d'abord ; sinon le nom CONTIENT une expression connue en mots
 * entiers (« Mes sound effects 2024 », « pack meme fr », « SFX TikTok ») ; « fx », « gs », « son », « ost » ne comptent
 * qu'en nom exact.
 */
export function rayonDuDossier(nom: string): Rayon | null {
  const s = nomSimple(nom);
  if (!s) return null;
  for (const [rayon, mots] of MOTS_RAYONS) if (mots.includes(s)) return rayon;
  const entoure = ` ${s} `;
  for (const [rayon, mots] of MOTS_RAYONS) {
    for (const m of mots) if (m.length >= 3 && !SEULS_EXACTS.has(m) && entoure.includes(` ${m} `)) return rayon;
  }
  return null;
}

/** Rayon d'un fichier d'après son chemin (« Pack/sound effect/Rires/x.mp3 ») : le dossier reconnu le plus proche. */
export function rayonDuChemin(chemin: string): Rayon | null {
  const morceaux = chemin.split(/[\\/]+/);
  morceaux.pop();
  for (let i = morceaux.length - 1; i >= 0; i--) {
    const r = rayonDuDossier(morceaux[i] ?? '');
    if (r) return r;
  }
  return null;
}

export type Nature = 'son' | 'video' | 'zip' | 'aConvertir' | 'ignore';

const EXT_SONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba']);
const EXT_VIDEOS = new Set(['mp4', 'm4v', 'webm', 'mov', 'mkv']);
/** Vidéos que le navigateur ne sait pas lire : on explique comment les convertir. */
const EXT_A_CONVERTIR = new Set(['wmv', 'avi', 'flv', 'mpg', 'mpeg', '3gp', 'vob', 'ts', 'mts', 'm2ts', 'wma', 'gif']);

export function extensionDe(nom: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nom);
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * Nature d'un fichier d'après son nom (et son type si connu). Les fichiers des logiciels de son (.sfk, .pk, .asd,
 * .reapeaks), les images, textes, raccourcis et fichiers cachés sont ignorés sans bruit.
 */
export function natureFichier(nom: string, type = ''): Nature {
  const base = nom.split(/[\\/]/).pop() ?? '';
  if (!base || base.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(base)) return 'ignore';
  const ext = extensionDe(base);
  if (ext === 'zip' || type === 'application/zip' || type === 'application/x-zip-compressed') return 'zip';
  if (EXT_A_CONVERTIR.has(ext)) return 'aConvertir';
  if (EXT_SONS.has(ext)) return 'son';
  if (EXT_VIDEOS.has(ext)) return 'video';
  if (!ext && type.startsWith('audio/')) return 'son';
  if (!ext && type.startsWith('video/')) return 'video';
  return 'ignore';
}

/**
 * Rayon final d'un fichier : celui de son dossier, sinon `choisi` (demandé à l'utilisateur), sinon null (à demander).
 * Un SON rangé dans un rayon de vidéos va dans Bruitages ; une VIDÉO rangée dans un rayon de sons ne garde que son son.
 */
export function rayonFinal(nature: 'son' | 'video', chemin: string, choisi: Rayon | null): Rayon | null {
  const r = rayonDuChemin(chemin) ?? choisi;
  if (!r) return null;
  if (nature === 'son' && estRayonVideo(r)) return 'bruitages';
  return r;
}

/** Ce qu'un import va faire, fichier par fichier (pour l'annoncer et pour savoir s'il faut demander le rayon). */
export interface PlanImport {
  parRayon: Record<Rayon, number>;
  /** Fichiers lisibles mais sans dossier reconnu : il faut demander le rayon. */
  sansRayon: number;
  /** Noms des vidéos à convertir (.wmv, .avi…). */
  aConvertir: string[];
  /** Fichiers ignorés sans bruit (.sfk, images, textes…). */
  ignores: number;
}

/** Plan d'import (pur) à partir des noms / chemins. Les .zip sont comptés à part par l'appelant (lus plus tard). */
export function planifierImport(fichiers: readonly { nom: string; chemin: string; type?: string }[], choisi: Rayon | null): PlanImport {
  const plan: PlanImport = { parRayon: { bruitages: 0, musiques: 0, fondsVerts: 0, memes: 0 }, sansRayon: 0, aConvertir: [], ignores: 0 };
  for (const f of fichiers) {
    const n = natureFichier(f.nom, f.type);
    if (n === 'aConvertir') plan.aConvertir.push(f.nom.split(/[\\/]/).pop() ?? f.nom);
    else if (n === 'ignore' || n === 'zip') plan.ignores += n === 'ignore' ? 1 : 0;
    else {
      const r = rayonFinal(n, f.chemin || f.nom, choisi);
      if (r) plan.parRayon[r]++;
      else plan.sansRayon++;
    }
  }
  return plan;
}
