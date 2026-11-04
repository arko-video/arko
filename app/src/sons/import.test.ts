// Import d'un vrai fichier WAV (Mediabunny décode le PCM sans navigateur) : source audio, durée, temps forts, PCM.
import { describe, expect, it } from 'vitest';
import { importerSon, pcmSource } from './import';
import { tempsForts } from './rythme';

/** Fichier WAV mono 16 bits à 44,1 kHz : un clic toutes les 0,5 s pendant `duree` secondes. */
function wavClics(duree: number): File {
  const f = 44100;
  const n = Math.round(duree * f);
  const octets = new DataView(new ArrayBuffer(44 + n * 2));
  const ecrire = (pos: number, texte: string) => [...texte].forEach((c, i) => octets.setUint8(pos + i, c.charCodeAt(0)));
  ecrire(0, 'RIFF');
  octets.setUint32(4, 36 + n * 2, true);
  ecrire(8, 'WAVEfmt ');
  octets.setUint32(16, 16, true);
  octets.setUint16(20, 1, true);
  octets.setUint16(22, 1, true);
  octets.setUint32(24, f, true);
  octets.setUint32(28, f * 2, true);
  octets.setUint16(32, 2, true);
  octets.setUint16(34, 16, true);
  ecrire(36, 'data');
  octets.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / f;
    const dansClic = (t - 0.25) % 0.5;
    const v = t >= 0.25 && dansClic < 0.01 ? Math.exp(-dansClic / 0.002) * (i % 2 ? 0.8 : -0.8) : 0.02 * Math.sin(2 * Math.PI * 220 * t);
    octets.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return new File([octets.buffer], 'clics.wav', { type: 'audio/wav' });
}

describe('importerSon', () => {
  it('ouvre un WAV comme source audio, lit son PCM et trouve ses temps forts', async () => {
    const source = await importerSon(wavClics(6));
    expect(source.infos.type).toBe('audio');
    expect(source.infos.id).toMatch(/^a\d+$/);
    expect(source.infos.duree).toBeCloseTo(6, 1);
    expect(source.infos.emp.length).toBeGreaterThan(10);
    const pcm = await pcmSource(source, 1, 2);
    expect(pcm?.frequence).toBe(44100);
    expect(pcm!.debut).toBeLessThanOrEqual(1);
    const temps = await tempsForts(source);
    const attendus = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 4.25, 4.75, 5.25, 5.75];
    const bons = attendus.filter((t) => temps.some((x) => Math.abs(x - t) <= 0.03));
    expect(bons.length / attendus.length).toBeGreaterThanOrEqual(0.9);
  });

  it('donne le premier id « aN » libre, sans collision avec la recette', async () => {
    const source = await importerSon(wavClics(1), ['s1', 'a1', 'a2', 'a3', 'a4', 'a5']);
    expect(source.infos.id).toBe('a6');
    const autre = await importerSon(wavClics(1), ['s1', 'a1', 'a2', 'a3', 'a4', 'a5']);
    expect(autre.infos.id).toBe('a7'); // a6 vient d'être donné, même s'il n'est pas encore dans la recette
  });

  it('refuse un fichier qui n\'est pas un son', async () => {
    const faux = new File([new Uint8Array(1000).fill(7)], 'faux.mp3');
    await expect(importerSon(faux)).rejects.toMatchObject({ code: 'format' });
  });
});
