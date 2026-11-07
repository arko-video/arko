// Tests purs des options du banc v4 (chaine/chaine-v4.ts) : modules simulés, étapes « --seul » / « --ancien ».
import { describe, expect, it } from 'vitest';
import { NOMS_ETAPES } from '../../../src/auto/express/chaine-best-of';
import { dossierV4, lireEtapes, lireModules } from '../chaine/chaine-v4';

describe('options du banc v4', () => {
  it('modules : présents par défaut sauf l\'empreinte ; liste = présents ; paires = états', () => {
    expect(lireModules(undefined, false)).toEqual({ whisper: 'present', vad: 'present', empreinte: 'absent' });
    expect(lireModules('whisper', false)).toEqual({ whisper: 'present', vad: 'absent', empreinte: 'absent' });
    expect(lireModules('vad=refuse,whisper=horsLigne', true)).toEqual({ whisper: 'horsLigne', vad: 'refuse', empreinte: 'present' });
    expect(() => lireModules('vad=peutetre', false)).toThrow();
  });

  it('--seul = toutes les autres étapes en ancien ; --ancien tout = toutes', () => {
    expect(lireEtapes(undefined, 'coupes')).toEqual(NOMS_ETAPES.filter((n) => n !== 'coupes'));
    expect(lireEtapes('tout', undefined)).toEqual([...NOMS_ETAPES]);
    expect(lireEtapes('voix,coupes', undefined)).toEqual(['voix', 'coupes']);
    expect(lireEtapes(undefined, undefined)).toEqual([]);
    expect(() => lireEtapes('voies', undefined)).toThrow(/inconnue/);
  });

  it('un dossier de sortie par combinaison (plusieurs devs en même temps)', () => {
    const a = dossierV4('voix', NOMS_ETAPES.filter((n) => n !== 'coupes'), 'coupes', false, null, null);
    const b = dossierV4('voix', [], null, true, { de: 0, a: 600 }, null);
    expect(a).toMatch(/v4\/seul-coupes\/voix$/);
    expect(b).toMatch(/v4\/complet_reglages-avant_plage-0-600\/voix$/);
  });
});
