// H. Montage express avec l'IA : seul du TEXTE est envoyé (scènes + phrases fortes), réponse lue avec tolérance.

import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { appliquerReponseExpress, FORMAT_EXPRESS, lireReponseExpress, messageExpress } from './ia-express';
import type { SceneProposee } from './scenes';

const MOTS: Mot[] = [
  ['bon', 10, 10.3], ['on', 10.4, 10.6], ['y', 10.7, 10.8], ['va', 10.9, 11.2],
  ['non!', 200, 200.4], ['le', 200.5, 200.6], ['creper', 200.7, 201.1, 1],
];
const SCENES: SceneProposee[] = [
  { de: 9.5, a: 12, titre: 'Partie 1', raison: 'De la parole', score: 10, garde: true, duree: 2 },
  { de: 199.5, a: 202, titre: 'Non! le creper', raison: '1 pic de son', score: 80, garde: true, duree: 2 },
];

describe('Montage express avec l\'IA', () => {
  it('le message : format, scènes avec temps et extrait, phrases fortes ; aucun son', () => {
    const m = messageExpress(SCENES, MOTS, null, 960);
    expect(m.startsWith(FORMAT_EXPRESS)).toBe(true);
    expect(m).toContain('duree_visee: 16:00');
    expect(m).toContain('#1 0:09-0:12 | 2 s | De la parole | « bon on y va »');
    expect(m).toContain('#2 3:19-3:22');
    expect(m).toContain('3:20 « le creper »');
    expect(m).not.toMatch(/data:|base64|pcm/i);
  });

  it('lit une réponse entourée de texte, avec virgules en trop ; ignore les numéros faux', () => {
    const rep = lireReponseExpress('Voilà :\n```json\n{"scenes":[{"n":2,"garder":true,"titre":"Le creeper explose",},{"n":9,"garder":true},{"n":1,"garder":false}],"corrections":[{"de":"creper","vers":"creeper"},{"de":"deux mots","vers":"x"}]}\n```', 2);
    expect(rep).toEqual({ scenes: [{ n: 2, garder: true, titre: 'Le creeper explose' }, { n: 1, garder: false }], corrections: [{ de: 'creper', vers: 'creeper' }] });
    expect(lireReponseExpress('pas de json', 2)).toBeNull();
    expect(lireReponseExpress('{"rien":1}', 2)).toBeNull();
  });

  it('applique : scènes non citées décochées, titres, mots corrigés (ponctuation et mot fort gardés)', () => {
    const { scenes, mots } = appliquerReponseExpress(SCENES, MOTS, { scenes: [{ n: 2, garder: true, titre: 'Le creeper explose' }], corrections: [{ de: 'Creper', vers: 'creeper' }, { de: 'non', vers: 'NON' }] });
    expect(scenes.map((s) => [s.garde, s.titre])).toEqual([[false, 'Partie 1'], [true, 'Le creeper explose']]);
    expect(mots[6]).toEqual(['creeper', 200.7, 201.1, 1]);
    expect(mots[4]).toEqual(['NON!', 200, 200.4]);
    expect(mots[0]).toBe(MOTS[0]);
  });
});
