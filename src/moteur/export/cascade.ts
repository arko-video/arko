// Cascade d'encodage : on essaie des réglages H.264 du plus beau au plus sûr, avec un VRAI essai de 15 images
// vers une NullTarget (certains Android annoncent un encodeur qui échoue ensuite). 1072 de large est accepté
// quand 1080 est refusé (encodeurs matériels qui veulent un multiple de 16).

import { CanvasSource, canEncodeVideo, Mp4OutputFormat, NullTarget, Output, Quality, type VideoEncodingConfig } from 'mediabunny';
import type { Canevas } from '../canevas';
import { contexte2D, creerCanevas } from '../canevas';

export interface EssaiEncodage {
  /** Rang dans la cascade (mémorisé par la page). */
  rang: number;
  largeur: number;
  hauteur: number;
  codec: string;
  acceleration: 'prefer-hardware' | 'no-preference' | 'prefer-software';
  debit: number;
  qualite: '1080p' | '720p';
}

const IPS = 30;

/** Les essais, dans l'ordre (tableau 4.7 de l'architecture, avec la variante 1072). */
export const CASCADE: readonly EssaiEncodage[] = (() => {
  const res: EssaiEncodage[] = [];
  const hd = [
    ['prefer-hardware', 1080], ['prefer-hardware', 1072],
    ['no-preference', 1080], ['no-preference', 1072],
    ['prefer-software', 1080], ['prefer-software', 1072],
  ] as const;
  for (const [acceleration, largeur] of hd) {
    res.push({ rang: res.length, largeur, hauteur: 1920, codec: 'avc1.640028', acceleration, debit: 10_000_000, qualite: '1080p' });
  }
  res.push({ rang: res.length, largeur: 720, hauteur: 1280, codec: 'avc1.4d401f', acceleration: 'no-preference', debit: 6_000_000, qualite: '720p' });
  return res;
})();

/** Configuration Mediabunny d'un essai. */
export function configVideo(e: EssaiEncodage, surConfig?: (c: VideoEncoderConfig) => void): VideoEncodingConfig {
  return {
    codec: 'avc',
    fullCodecString: e.codec,
    hardwareAcceleration: e.acceleration,
    quality: new Quality({ bitrate: e.debit }),
    keyFrameInterval: 2,
    latencyMode: 'quality',
    ...(surConfig ? { onEncoderConfig: surConfig } : {}),
  };
}

/** Le navigateur annonce-t-il savoir encoder cet essai ? */
export async function annonceOk(e: EssaiEncodage): Promise<boolean> {
  try {
    return await canEncodeVideo('avc', {
      width: e.largeur,
      height: e.hauteur,
      frameRate: IPS,
      fullCodecString: e.codec,
      hardwareAcceleration: e.acceleration,
      quality: new Quality({ bitrate: e.debit }),
    });
  } catch {
    return false;
  }
}

/** Essai réel : 15 images encodées vers une NullTarget, en moins de `delaiMs`. */
export async function essaiReel(e: EssaiEncodage, delaiMs = 10_000): Promise<boolean> {
  const canevas: Canevas = creerCanevas(e.largeur, e.hauteur);
  const ctx = contexte2D(canevas);
  const sortie = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
  const source = new CanvasSource(canevas, configVideo(e));
  sortie.addVideoTrack(source, { frameRate: IPS });
  const travail = (async () => {
    await sortie.start();
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = `hsl(${i * 24}, 70%, 50%)`;
      ctx.fillRect(0, 0, e.largeur, e.hauteur);
      ctx.fillStyle = '#fff';
      ctx.fillRect((i * 37) % e.largeur, (i * 91) % e.hauteur, 200, 200);
      await source.add(i / IPS, 1 / IPS);
    }
    await sortie.finalize();
    return true;
  })();
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<boolean>((ok) => (minuteur = setTimeout(() => ok(false), delaiMs)));
  try {
    return await Promise.race([travail, delai]);
  } catch {
    return false;
  } finally {
    clearTimeout(minuteur);
    if (sortie.state !== 'finalized') await sortie.cancel().catch(() => undefined);
  }
}

/**
 * Premier essai qui marche à partir du rang `depuis` (ou null si aucun).
 * `seul720` = l'utilisateur a demandé du 720p : on commence directement par là.
 */
export async function choisirEncodage(depuis = 0, seul720 = false): Promise<EssaiEncodage | null> {
  for (const e of CASCADE) {
    if (e.rang < depuis || (seul720 && e.qualite !== '720p')) continue;
    if ((await annonceOk(e)) && (await essaiReel(e))) return e;
  }
  return null;
}
