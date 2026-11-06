// .mp4 d'un pack → son seul (.m4a), sans réencoder l'AAC (mediabunny, sans navigateur).
import { readFileSync } from 'node:fs';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { estVideo, nomDuSon, sonDeVideo } from './son-de-video';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';

describe('son des vidéos du pack', () => {
  it('reconnaît une vidéo et nomme son son', () => {
    expect(estVideo(new File([], 'clip.MP4'))).toBe(true);
    expect(estVideo(new File([], 'x.webm'))).toBe(true);
    expect(estVideo(new File([], 'son.mp3'))).toBe(false);
    expect(nomDuSon('Wow meme.mp4')).toBe('Wow meme.m4a');
  });

  it('garde seulement la piste son (AAC copié), plus légère que la vidéo', async () => {
    const octets = readFileSync(VIDEO);
    const f = new File([octets], 'clip.mp4', { type: 'video/mp4' });
    const son = await sonDeVideo(f);
    expect(son.name).toBe('clip.m4a');
    expect(son.type).toBe('audio/mp4');
    expect(son.size).toBeLessThan(f.size / 3);
    const input = new Input({ source: new BlobSource(son), formats: ALL_FORMATS });
    const pistes = await input.getTracks();
    expect(pistes.filter((p) => p.isVideoTrack())).toHaveLength(0);
    const audio = pistes.find((p) => p.isAudioTrack());
    expect(audio).toBeDefined();
    expect(await audio!.getCodec()).toBe('aac');
    const avant = await new Input({ source: new BlobSource(f), formats: ALL_FORMATS }).computeDuration();
    expect(Math.abs((await input.computeDuration()) - avant)).toBeLessThan(0.1);
    input.dispose();
  });

  it('une vidéo sans son est refusée', async () => {
    await expect(sonDeVideo(new File([new Uint8Array(100)], 'x.mp4'))).rejects.toMatchObject({ code: 'pas_de_son' });
  });
});
