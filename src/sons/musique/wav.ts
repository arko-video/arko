// WAV 16 bits (PCM) : la musique fabriquée par Arko est enregistrée dans ce format, puis ouverte comme n'importe quel
// son importé (le moteur la lit avec le même lecteur dans l'aperçu et dans l'export). Pur et déterministe.

import { mulberry32 } from '../synthese/briques';

/**
 * Fichier WAV PCM 16 bits entrelacé. Un très léger bruit de « dither » (triangulaire, ±1 bit, à graine fixe) évite
 * la petite distorsion de l'arrondi dans les passages doux. Les valeurs sont bornées à [−1, 1].
 */
export function encoderWav(canaux: readonly Float32Array[], frequence: number, graine = 1): Uint8Array<ArrayBuffer> {
  const nc = canaux.length;
  const n = canaux[0]?.length ?? 0;
  const octets = new Uint8Array(44 + n * nc * 2);
  const vue = new DataView(octets.buffer);
  const ecrire = (pos: number, texte: string) => {
    for (let i = 0; i < texte.length; i++) octets[pos + i] = texte.charCodeAt(i);
  };
  ecrire(0, 'RIFF');
  vue.setUint32(4, 36 + n * nc * 2, true);
  ecrire(8, 'WAVEfmt ');
  vue.setUint32(16, 16, true);
  vue.setUint16(20, 1, true);
  vue.setUint16(22, nc, true);
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * nc * 2, true);
  vue.setUint16(32, nc * 2, true);
  vue.setUint16(34, 16, true);
  ecrire(36, 'data');
  vue.setUint32(40, n * nc * 2, true);
  const hasard = mulberry32(graine);
  let pos = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const x = canaux[c]![i]!;
      const v = Number.isFinite(x) ? x : 0;
      const d = (hasard() - hasard()) / 32768;
      const s = Math.round(Math.max(-1, Math.min(1, v + d)) * 32767);
      vue.setInt16(pos, s, true);
      pos += 2;
    }
  }
  return octets;
}
