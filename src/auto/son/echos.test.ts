import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { expressionsDuSon, motsDuNom, proposerEchos } from './echos';

const phrase = (t: number, texte: string): Mot[] => texte.split(' ').map((w, i) => [w, t + i * 0.4, t + i * 0.4 + 0.3]);

describe('échos : la réplique dont le nom reprend ce qu\'on dit', () => {
  it('nettoie les noms de fichiers', () => {
    expect(motsDuNom('FBI Open Up - Sound Effect (HD) ( 160kbps ).mp3')).toEqual(['fbi', 'open', 'up']);
    expect(expressionsDuSon('FBI Open Up - Sound Effect (HD)')).toContain('fbi');
    expect(expressionsDuSon('What the hell Sound Effect')).not.toContain('what');
  });

  it('« le FBI arrive » → FBI Open Up, après la phrase ; un mot courant seul ne déclenche rien', () => {
    const mots = [...phrase(10, 'attention le fbi arrive'), ...phrase(30, 'what is that')];
    const sons = [
      { id: 'a1', nom: 'FBI Open Up - Sound Effect (HD)', duree: 2 },
      { id: 'a2', nom: 'What the hell Sound Effect', duree: 2 },
    ];
    const e = proposerEchos(mots, 's1', null, sons);
    expect(e.map((x) => x.son)).toEqual(['a1']);
    expect(e[0]!.ts).toBeGreaterThan(10);
  });
});
