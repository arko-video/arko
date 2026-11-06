// Ma bibliothèque : import d'un DOSSIER entier, de plusieurs fichiers ou d'un .zip, rangé dans les 4 rayons d'après le
// nom des dossiers (rayons.ts). Sons → Bruitages / Musiques (base de Mes sons) ; vidéos → Fonds verts / Mèmes, gardées
// EN ENTIER sur l'appareil (stockage/clips.ts). Un fichier à la fois : un dossier de 2 Go n'est jamais en mémoire.
// Ignorés proprement : .sfk et autres fichiers non lisibles ; .wmv / .avi… : « convertis-le en .mp4 ».

import { estVideo, sonDeVideo } from '../auto/son/son-de-video';
import { etiquettePour } from '../sons/dossiers';
import { ErreurArko } from '../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../moteur/media';
import { annoncesZip, parcourirZip, type OptionsZip } from '../sons/zip';
import { garderClip, placeLibre, refusPlaceClips } from '../stockage/clips';
import { garderMonSon, nomDepuisFichier, placeUtilisee, type RayonSon } from '../stockage/mes-sons';
import { inspecterClip } from './inspecter-clip';
import { estRayonVideo, natureFichier, planifierImport, rayonFinal, type PlanImport, type Rayon } from './rayons';

/** Durée maximale d'une musique (un bruitage : 10 min, comme Mes sons). */
export const DUREE_MAX_MUSIQUE_S = 30 * 60;
const MIME: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm' };

/** Lecture d'un .zip pour la bibliothèque : sons et vidéos, 1 Go par fichier, 8 Go en tout (la place décide). */
export const ZIP_BIBLIOTHEQUE: OptionsZip = {
  accepte: (nom) => {
    const n = natureFichier(nom);
    return n === 'son' || n === 'video' ? (MIME[nom.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream') : '';
  },
  maxFichier: 1024 * 1024 * 1024,
  maxTotal: 8 * 1024 * 1024 * 1024,
};

const cheminDe = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

export interface AnalyseImport {
  plan: PlanImport;
  /** Octets des vidéos (Fonds verts, Mèmes) et des sons, par catégorie de place. */
  octetsVideos: number;
  octetsSons: number;
}

/** Ce que l'import va faire (lit seulement la fin des .zip). Sert à demander le rayon et à vérifier la place. */
export async function analyserImport(fichiers: readonly File[], choisi: Rayon | null): Promise<AnalyseImport> {
  const entrees: { nom: string; chemin: string; type?: string; taille: number }[] = [];
  for (const f of fichiers) {
    if (natureFichier(f.name, f.type) === 'zip') {
      const a = await annoncesZip(f, ZIP_BIBLIOTHEQUE);
      for (const e of a.annonces) entrees.push({ nom: e.nom, chemin: e.chemin, taille: e.taille });
      for (const c of a.nomsIgnores) entrees.push({ nom: c, chemin: c, taille: 0 });
    } else entrees.push({ nom: f.name, chemin: cheminDe(f), type: f.type, taille: f.size });
  }
  const plan = planifierImport(entrees, choisi);
  let octetsVideos = 0;
  let octetsSons = 0;
  for (const e of entrees) {
    const n = natureFichier(e.nom, e.type);
    if (n !== 'son' && n !== 'video') continue;
    const r = rayonFinal(n, e.chemin, choisi);
    if (r && estRayonVideo(r)) octetsVideos += e.taille;
    else octetsSons += e.taille;
  }
  return { plan, octetsVideos, octetsSons };
}

export interface BilanBibliotheque {
  gardes: Record<Rayon, number>;
  /** Déjà dans la bibliothèque (même fichier). */
  deja: number;
  /** Ignorés sans bruit (.sfk, images, textes…). */
  ignores: number;
  /** Vidéos à convertir en .mp4 (.wmv, .avi…). */
  aConvertir: string[];
  /** Fichiers qu'on n'a pas pu lire, avec la raison. */
  illisibles: { nom: string; raison: string }[];
  /** Import arrêté (plus de place…). */
  erreur?: string;
}

async function verifierSonRayon(f: File, rayon: RayonSon): Promise<number> {
  const media = await ouvrirMedia(f, 'audio');
  try {
    if (!media.sinkAudio) throw new ErreurArko('Pas de son lisible.', 'pas_de_son');
    const max = rayon === 'musiques' ? DUREE_MAX_MUSIQUE_S : 600;
    if (media.duree > max) throw new ErreurArko(rayon === 'musiques' ? 'Dure plus de 30 minutes.' : 'Dure plus de 10 minutes.', 'trop_long');
    return Math.round(media.duree * 100) / 100;
  } finally {
    fermerMedia(media);
  }
}

async function* entrees(fichiers: readonly File[], ignorer: (chemin?: string) => void): AsyncGenerator<{ fichier: File; chemin: string }> {
  for (const f of fichiers) {
    if (natureFichier(f.name, f.type) === 'zip') yield* parcourirZip(f, ignorer, ZIP_BIBLIOTHEQUE);
    else yield { fichier: f, chemin: cheminDe(f) };
  }
}

/**
 * Importe dans Ma bibliothèque. `choisi` : rayon des fichiers sans dossier reconnu (null = on les laisse de côté :
 * l'interface demande d'abord). `etiquette` : celle des fichiers sans dossier. Ne lève pas : tout est dans le bilan.
 */
export async function importerBibliotheque(
  fichiers: readonly File[],
  choisi: Rayon | null,
  o: { etiquette?: string; surProgres?: (fait: number, total: number) => void } = {},
): Promise<BilanBibliotheque> {
  const bilan: BilanBibliotheque = { gardes: { bruitages: 0, musiques: 0, fondsVerts: 0, memes: 0 }, deja: 0, ignores: 0, aConvertir: [], illisibles: [] };
  let total = 0;
  const place: Record<RayonSon, number> = { bruitages: 0, musiques: 0 };
  try {
    const a = await analyserImport(fichiers, choisi);
    total = Object.values(a.plan.parRayon).reduce((s, n) => s + n, 0);
    const refus = refusPlaceClips(a.octetsVideos + a.octetsSons, await placeLibre());
    if (refus) return { ...bilan, erreur: refus };
    place.bruitages = await placeUtilisee('bruitages');
    place.musiques = await placeUtilisee('musiques');
  } catch (e) {
    return { ...bilan, erreur: e instanceof ErreurArko ? e.message : 'Impossible de lire ces fichiers.' };
  }
  let fait = 0;
  o.surProgres?.(0, total);
  const ignorer = (chemin?: string) => {
    const nom = (chemin ?? '').split(/[\\/]/).pop() ?? '';
    if (chemin && natureFichier(nom) === 'aConvertir') bilan.aConvertir.push(nom);
    else bilan.ignores++;
  };
  try {
    for await (const { fichier, chemin } of entrees(fichiers, ignorer)) {
      const nature = natureFichier(fichier.name, fichier.type);
      if (nature !== 'son' && nature !== 'video') {
        ignorer(nature === 'aConvertir' ? fichier.name : undefined);
        continue;
      }
      const rayon = rayonFinal(nature, chemin, choisi);
      if (!rayon) continue; // sans rayon : l'interface l'a demandé avant ; sinon laissé de côté
      o.surProgres?.(fait++, total);
      const nom = nomDepuisFichier(fichier.name);
      const etiquette = etiquettePour(chemin, o.etiquette ?? '');
      try {
        if (estRayonVideo(rayon)) {
          const infos = await inspecterClip(fichier);
          const r = await garderClip(fichier, { rayon: rayon as 'fondsVerts' | 'memes', nom, etiquette, ...infos });
          if (r.nouveau) bilan.gardes[rayon]++;
          else bilan.deja++;
        } else {
          const rs = rayon as RayonSon;
          const son = estVideo(fichier) ? await sonDeVideo(fichier) : fichier;
          const duree = await verifierSonRayon(son, rs);
          const r = await garderMonSon(son, { nom, etiquette, duree, rayon: rs }, { placeUtilisee: place[rs] });
          if (r.nouveau) {
            bilan.gardes[rayon]++;
            place[rs] += r.son.taille;
          } else bilan.deja++;
        }
      } catch (e) {
        if (e instanceof ErreurArko && e.code === 'place') throw e;
        bilan.illisibles.push({ nom: fichier.name, raison: raisonIllisible(e) });
      }
    }
  } catch (e) {
    bilan.erreur = e instanceof ErreurArko ? e.message : 'Impossible de garder ces fichiers sur l\'appareil.';
  }
  o.surProgres?.(total, total);
  return bilan;
}

/** Raison courte d'un fichier illisible (HEVC, format inconnu, trop long…). */
export function raisonIllisible(e: unknown): string {
  if (!(e instanceof ErreurArko)) return 'illisible';
  if (e.code === 'codec_video') return /HEVC/.test(e.message) ? 'vidéo en HEVC (H.265), non lue par le navigateur : convertis-la en .mp4 H.264' : 'format vidéo non lu par le navigateur : convertis-le en .mp4';
  if (e.code === 'trop_long') return e.message.toLowerCase();
  if (e.code === 'pas_de_son') return 'pas de son lisible';
  if (e.code === 'format') return 'format non reconnu';
  return 'illisible';
}
