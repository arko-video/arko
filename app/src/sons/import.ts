// Import d'un son de l'utilisateur (MP3, M4A, WAV, OGG, le son d'une vidéo, ou un enregistrement du micro).
// Le moteur ouvre le fichier (ouvrirSourceAudio) : l'aperçu et l'export savent ensuite le mixer.
// pcmSource() lit un morceau de ce son en PCM (pour l'écoute, les temps forts, ou le mixeur).

import type { Pcm } from '../moteur/audio/reechantillonner';
import { LecteurAudio } from '../moteur/audio/lecteur-audio';
import type { SourceOuverte } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import type { MediaOuvert } from '../moteur/media';
import { fermerSource, mediaDe, ouvrirSourceAudio } from '../moteur/sources';
import type { Sec } from '../recette/types';
import { premierIdLibre } from './ids';

/** Durée maximale d'un son importé : 10 minutes. */
export const DUREE_MAX_SON_S = 600;

/** Ids déjà donnés pendant cette session (deux imports d'affilée n'ont jamais le même id). */
const idsDonnes = new Set<string>();

/**
 * Ouvre un son choisi par l'utilisateur. `idsPris` : ids des sources déjà dans la recette
 * (recette.sources.map((s) => s.id)) ; le son reçoit le premier id « aN » libre, même après un rechargement.
 */
export async function importerSon(fichier: File, idsPris: string[] = []): Promise<SourceOuverte> {
  const id = premierIdLibre([...idsPris, ...idsDonnes]);
  let source: SourceOuverte;
  try {
    source = await ouvrirSourceAudio(fichier, id);
  } catch (e) {
    throw messageSon(e);
  }
  if (source.infos.duree > DUREE_MAX_SON_S) {
    fermerSource(source);
    throw new ErreurArko('Ce son dure plus de 10 minutes. Choisis un son plus court.', 'trop_long');
  }
  idsDonnes.add(id);
  return source;
}

/** Remplace les messages pensés pour les vidéos par des messages pour un son. */
function messageSon(e: unknown): ErreurArko {
  if (!(e instanceof ErreurArko)) return new ErreurArko('Impossible de lire ce son. Il est peut-être abîmé.', 'lecture');
  if (e.code === 'format') {
    return new ErreurArko('Format non reconnu. Choisis un son MP3, M4A, WAV ou OGG, ou une vidéo.', 'format');
  }
  if (e.code === 'codec_video') {
    return new ErreurArko('Je ne sais pas lire cette vidéo ici. Choisis plutôt le son seul (MP3, M4A…).', 'format');
  }
  return e;
}

/** Un lecteur par média ouvert : lire des morceaux qui se suivent ne re-décode pas tout. */
const lecteurs = new WeakMap<MediaOuvert, LecteurAudio>();

/**
 * PCM d'un son importé entre `de` et `a` (secondes dans le fichier), à sa fréquence d'origine.
 * Le PCM peut commencer un peu avant `de` (voir pcm.debut). null si le fichier n'a pas de son lisible.
 * Lève ErreurArko "lecture" si la source a été fermée.
 */
export async function pcmSource(source: SourceOuverte, de: Sec, a: Sec): Promise<Pcm | null> {
  const media = mediaDe(source);
  if (!media.sinkAudio || !media.audio) return null;
  let lecteur = lecteurs.get(media);
  if (!lecteur) {
    lecteur = new LecteurAudio(media.sinkAudio);
    lecteurs.set(media, lecteur);
  }
  return lecteur.lire(de, a);
}

/** Parcourt tout le son de la source, morceau par morceau (pour les temps forts). Mono, à la fréquence d'origine ; `debut` = temps du morceau. */
export async function parcourirSon(
  source: SourceOuverte,
  recevoir: (mono: Float32Array, frequence: number, debut: Sec) => void,
): Promise<void> {
  const media = mediaDe(source);
  if (!media.sinkAudio) return;
  for await (const morceau of media.sinkAudio.samples()) {
    try {
      const n = morceau.numberOfFrames;
      const mono = new Float32Array(n);
      const canal = new Float32Array(n);
      for (let c = 0; c < morceau.numberOfChannels; c++) {
        morceau.copyTo(canal, { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < n; i++) mono[i] += canal[i] / morceau.numberOfChannels;
      }
      recevoir(mono, morceau.sampleRate, morceau.timestamp);
    } finally {
      morceau.close();
    }
  }
}
