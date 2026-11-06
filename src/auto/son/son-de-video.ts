// E. Son d'une vidéo courte d'un pack (dev 3) : on ne garde QUE le son, dans un .m4a en mémoire.
// Conversion audio seule de mediabunny : les paquets AAC sont copiés tels quels (pas de réencodage) ; un autre codec
// est copié si le MP4 l'accepte, sinon réencodé. Tout se passe sur l'appareil.

import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';
import { ErreurArko } from '../../moteur/erreurs';
import { EXTENSIONS_VIDEO, extension } from '../../sons/zip';

/** Est-ce une vidéo (dont on ne gardera que le son) ? */
export function estVideo(f: File): boolean {
  return f.type.startsWith('video/') || !!EXTENSIONS_VIDEO[extension(f.name)];
}

/** « clip.mp4 » → « clip.m4a ». */
export function nomDuSon(nom: string): string {
  return `${nom.replace(/\.[a-z0-9]{1,5}$/i, '')}.m4a`;
}

/** Le son d'une vidéo, en .m4a (audio/mp4). Lève ErreurArko « pas_de_son » si la vidéo est muette. */
export async function sonDeVideo(f: File): Promise<File> {
  const input = new Input({ source: new BlobSource(f), formats: ALL_FORMATS });
  try {
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, showWarnings: false });
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isAudioTrack())) {
      throw new ErreurArko('Cette vidéo n\'a pas de son lisible.', 'pas_de_son');
    }
    await conversion.execute();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new ErreurArko('Cette vidéo n\'a pas de son lisible.', 'pas_de_son');
    return new File([buffer], nomDuSon(f.name), { type: 'audio/mp4' });
  } catch (e) {
    if (e instanceof ErreurArko) throw e;
    throw new ErreurArko('Impossible de lire le son de cette vidéo.', 'pas_de_son');
  } finally {
    input.dispose();
  }
}
