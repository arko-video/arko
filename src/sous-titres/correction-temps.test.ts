import { describe, expect, it } from 'vitest';
import { corrigerTempsWhisper, recentrer, reparerDecodageVide } from './correction-temps';

describe('recentrer', () => {
  it('donne à chaque jeton généré la moyenne de son temps et du précédent', () => {
    const t = Float32Array.from([0, 0, 0, 0, 1, 2, 4]);
    recentrer(t, 3);
    expect(Array.from(t)).toEqual([0, 0, 0, 0, 0.5, 1.5, 3]);
  });
});

describe('corrigerTempsWhisper', () => {
  it('enveloppe la méthode interne du modèle', () => {
    const modele = {
      _extract_token_timestamps: (..._a: unknown[]) => ({ dims: [1, 4], data: Float32Array.from([0, 0, 2, 4]) }),
    };
    corrigerTempsWhisper({ model: modele });
    expect(Array.from(modele._extract_token_timestamps(null, null, 0, 0.02, 1).data)).toEqual([0, 0, 1, 3]);
  });
  it('ne casse rien si la méthode n\'existe plus', () => {
    expect(() => corrigerTempsWhisper({ model: {} })).not.toThrow();
  });
});

describe('reparerDecodageVide', () => {
  it("un segment vide donne un texte vide au lieu de faire planter toute la fenêtre", () => {
    const tokenizer = {
      decode(ids: unknown) {
        if (!Array.isArray(ids) || ids.length === 0) throw Error('token_ids must be a non-empty array of integers.');
        return `${ids.length} jetons`;
      },
    };
    const asr = { tokenizer };
    expect(() => tokenizer.decode([])).toThrow(/non-empty/);
    reparerDecodageVide(asr);
    expect(asr.tokenizer.decode([])).toBe('');
    expect(asr.tokenizer.decode([1, 2])).toBe('2 jetons');
    // Installée une seule fois.
    const une = asr.tokenizer.decode;
    reparerDecodageVide(asr);
    expect(asr.tokenizer.decode).toBe(une);
  });
  it("ne casse rien si le découpeur n'a pas cette forme", () => {
    expect(() => reparerDecodageVide({ tokenizer: null })).not.toThrow();
    expect(() => reparerDecodageVide({ tokenizer: {} })).not.toThrow();
  });
});
