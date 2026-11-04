// QA M-4 : une source audio que plus rien n'utilise (son ou guide retiré) disparaît de la recette, sans message.
import { describe, expect, it } from 'vitest';
import { normaliser, sourcesUtilisees } from '../normaliser';

const v = { id: 's1', nom: 'v.mp4', taille: 1, emp: 'e1', duree: 30, type: 'video' as const };
const a1 = { id: 'a1', nom: 'son.mp3', taille: 1, emp: 'e2', duree: 5, type: 'audio' as const };
const a2 = { id: 'a2', nom: 'guide.mp3', taille: 1, emp: 'e3', duree: 60, type: 'audio' as const };
const a3 = { id: 'a3', nom: 'oublie.mp3', taille: 1, emp: 'e4', duree: 5, type: 'audio' as const };
const sources = [v, a1, a2, a3];
const brute = { sources, plans: [{ de: 0, a: 10 }], sons: [{ id: 'a1', t: 1 }, { id: 'impact.boom', t: 2 }], guide: { src: 'a2' } };

describe('sources audio inutilisées', () => {
  it('sont retirées sans message avec l\'option, et la vidéo est toujours gardée', () => {
    const r = normaliser(brute, { sources }, { retirerSourcesAudioInutiles: true });
    expect(r.recette.sources.map((s) => s.id)).toEqual(['s1', 'a1', 'a2']);
    expect(r.problemes.filter((p) => p.chemin.startsWith('sources'))).toEqual([]);
  });

  it('retirer le son puis le guide retire aussi leurs sources', () => {
    const sansSon = normaliser({ ...brute, sons: [] }, { sources }, { retirerSourcesAudioInutiles: true }).recette;
    expect(sansSon.sources.map((s) => s.id)).toEqual(['s1', 'a2']);
    const sansRien = normaliser({ ...sansSon, guide: null }, { sources }, { retirerSourcesAudioInutiles: true }).recette;
    expect(sansRien.sources.map((s) => s.id)).toEqual(['s1']);
  });

  it('sans l\'option, rien ne change (ajouterSource pose la source juste avant le son)', () => {
    expect(normaliser(brute, { sources }).recette.sources).toHaveLength(4);
    expect(sourcesUtilisees({ sources, sons: [], plans: [], guide: null }).map((s) => s.id)).toEqual(['s1']);
  });
});

describe('opérations : sources audio inutiles retirées', () => {
  it('supprimerSon et definirGuide(null) retirent la source qui ne sert plus', async () => {
    const { ajouterSource, ajouterSon, supprimerSon, definirGuide } = await import('../operations');
    const { normaliserRecette } = await import('../normaliser');
    const v = { id: 's1', nom: 'v', taille: 1, emp: 'e', duree: 10, type: 'video' as const, l: 1920, h: 1080 };
    const a1 = { id: 'a1', nom: 'son.wav', taille: 1, emp: 'f', duree: 2, type: 'audio' as const };
    const a2 = { id: 'a2', nom: 'guide.wav', taille: 1, emp: 'g', duree: 20, type: 'audio' as const };
    let r = normaliserRecette({ plans: [{ de: 0, a: 10 }] }, { sources: [v] });
    r = ajouterSource(r, a1);
    r = ajouterSon(r, { id: 'a1', t: 1 }).recette;
    r = ajouterSource(r, a2);
    r = definirGuide(r, { src: 'a2' });
    expect(r.sources.map((s) => s.id)).toEqual(['s1', 'a1', 'a2']);
    r = supprimerSon(r, 0);
    expect(r.sources.map((s) => s.id)).toEqual(['s1', 'a2']);
    r = definirGuide(r, null);
    expect(r.sources.map((s) => s.id)).toEqual(['s1']);
  });
});
