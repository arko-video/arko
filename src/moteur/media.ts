// Ouverture bas niveau d'un fichier avec Mediabunny, utilisable dans la page ET dans le Worker d'export.
// Une Input par source, lecture à la demande (BlobSource avec un cache de 16 Mio : jamais tout le fichier en mémoire).

import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  Input,
  UnsupportedInputFormatError,
  VideoSampleSink,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { ErreurArko } from './erreurs';

export const CACHE_LECTURE = 16 * 1024 * 1024;

/** Un fichier ouvert : pistes et « robinets » de décodage. Contenu interne au moteur. */
export interface MediaOuvert {
  input: Input;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  /** null si la piste audio est absente ou indécodable ici. */
  sinkAudio: AudioSampleSink | null;
  sinkVideo: VideoSampleSink | null;
  duree: number;
  /** Dimensions affichées (après rotation). */
  largeur: number;
  hauteur: number;
  codecVideo: string | null;
  /** v3 (E) : toutes les pistes audio du fichier (OBS : micro, Discord…), dans l'ordre. Absent dans les anciens tests. */
  pistesAudio?: InputAudioTrack[];
}

/** Ouvre un fichier. Lève ErreurArko ("format", "pas_de_video", "codec_video", "lecture"). */
export async function ouvrirMedia(fichier: Blob, attendu: 'video' | 'audio' = 'video'): Promise<MediaOuvert> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(fichier, { maxCacheSize: CACHE_LECTURE }) });
  try {
    await input.getFormat();
  } catch (e) {
    input.dispose();
    if (e instanceof UnsupportedInputFormatError) {
      throw new ErreurArko('Format de fichier non reconnu. Choisis une vidéo MP4, MOV ou WebM.', 'format');
    }
    throw new ErreurArko('Impossible de lire ce fichier. Il est peut-être abîmé.', 'lecture');
  }
  try {
    const video = await input.getPrimaryVideoTrack();
    if (attendu === 'video' && !video) {
      throw new ErreurArko('Ce fichier ne contient pas de vidéo.', 'pas_de_video');
    }
    const codecVideo = video ? await video.getCodec() : null;
    // On ne vérifie le codec vidéo que pour une VIDÉO : pour un son importé (même tiré d'une vidéo HEVC),
    // seule la piste audio compte.
    if (attendu === 'video' && video && !(await video.canDecode())) {
      const hevc = codecVideo === 'hevc';
      throw new ErreurArko(
        hevc
          ? 'Cette vidéo est en HEVC (H.265), un format que ton navigateur ne sait pas lire. Dans l\'appareil photo, choisis « H.264 » ou « Plus compatible », ou convertis la vidéo, puis réessaie.'
          : `Le format de cette vidéo (${codecVideo ?? 'inconnu'}) n'est pas pris en charge par ton navigateur. Essaie une vidéo MP4 en H.264.`,
        'codec_video',
      );
    }
    const audio = await input.getPrimaryAudioTrack();
    const audioOk = audio ? await audio.canDecode() : false;
    const duree = await input.computeDuration();
    const pistesAudio = await input.getAudioTracks().catch(() => (audio ? [audio] : []));
    return {
      pistesAudio,
      input,
      video,
      audio,
      sinkVideo: video ? new VideoSampleSink(video) : null,
      sinkAudio: audio && audioOk ? new AudioSampleSink(audio) : null,
      duree,
      largeur: video ? await video.getDisplayWidth() : 0,
      hauteur: video ? await video.getDisplayHeight() : 0,
      codecVideo,
    };
  } catch (e) {
    input.dispose();
    if (e instanceof ErreurArko) throw e;
    throw new ErreurArko('Impossible de lire ce fichier. Il est peut-être abîmé.', 'lecture');
  }
}

export function fermerMedia(m: MediaOuvert) {
  m.input.dispose();
}
