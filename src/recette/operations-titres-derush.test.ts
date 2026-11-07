// A et C (dev 1) : titres retirables / modifiables, passages pas retenus (définir, ajouter d'un toucher).
import { describe, expect, it } from 'vitest';
import { nouvelHistorique, pousser, annuler } from './historique';
import { normaliser } from './normaliser';
import { ajouterPassage, definirPassages } from './operations-derush';
import { changerTitre, indicesTitres, retirerTitres } from './operations-titres';
import type { Mot, PassageNote, Recette, Source } from './types';

const s1: Source = { id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'e1', duree: 3600, type: 'video', l: 1920, h: 1080 };
const s2: Source = { id: 's2', nom: 'autre.mp4', taille: 1e6, emp: 'e2', duree: 600, type: 'video', l: 1920, h: 1080 };
function recette(brut: Partial<Recette> & Record<string, unknown> = {}): Recette {
  return normaliser({ format: 'arko.recette/1', sources: [s1], plans: [{ de: 100, a: 130 }], ...brut }, { sources: (brut.sources as Source[]) ?? [s1] }).recette;
}

describe('A : titres retirables et modifiables', () => {
  const r0 = recette({
    titre: 'Attends la fin',
    textes: [
      { txt: 'ATTENDS LA FIN…', role: 'accroche', t: 0, dur: 2.5 },
      { txt: 'Mon texte', t: 4 },
      { txt: 'La base', role: 'section', t: 10, dur: 2.2, style: 'bandeau' },
    ],
    sons: [{ id: 'whoosh.rapide', t: 10, role: 'section' }, { id: 'impact.boom', ts: 110 }],
    sections: { source: 'main' },
  });

  it('indicesTitres : accroche, section et top3 seulement', () => {
    expect(indicesTitres(r0)).toEqual([0, 2]);
  });

  it('retirer un titre : le texte part, le whoosh d\'une section avec lui', () => {
    const a = retirerTitres(r0, 0);
    expect(a.textes.map((x) => x.txt)).toEqual(['Mon texte', 'La base']);
    const b = retirerTitres(r0, 2);
    expect(b.textes.map((x) => x.txt)).toEqual(['ATTENDS LA FIN…', 'Mon texte']);
    expect(b.sons.map((x) => x.id)).toEqual(['impact.boom']);
    expect(b.sections).toBeUndefined();
    expect(retirerTitres(r0, 1)).toBe(r0); // un texte ordinaire n'est pas un titre
  });

  it('retirerTitres(\'tous\') : tous les titres et les sons de rôle « section »', () => {
    const r = retirerTitres(r0, 'tous');
    expect(r.textes.map((x) => x.txt)).toEqual(['Mon texte']);
    expect(r.sons.map((x) => x.id)).toEqual(['impact.boom']);
    expect(retirerTitres(r, 'tous')).toBe(r);
  });

  it('changerTitre : le nom du projet suit l\'accroche ; vide = retirer ; même texte = sans effet', () => {
    const r = changerTitre(r0, 0, '  LE CLUTCH  DE FOU ');
    expect(r.textes[0]!.txt).toBe('LE CLUTCH DE FOU');
    expect(r.titre).toBe('Le clutch de fou');
    expect(changerTitre(r0, 2, 'Le boss').titre).toBe('Attends la fin');
    expect(changerTitre(r0, 0, '   ').textes).toHaveLength(2);
    expect(changerTitre(r0, 0, 'ATTENDS LA FIN…')).toBe(r0);
  });

  it('un seul Annuler revient au titre d\'avant', () => {
    let h = nouvelHistorique(r0);
    h = pousser(h, retirerTitres(r0, 'tous'));
    expect(annuler(h).present).toBe(r0);
  });
});

describe('C : passages pas retenus', () => {
  const passages: PassageNote[] = [
    { src: 's1', de: 200, a: 230, note: 72, raison: '2 rires', titre: 'On a gagné' },
    { src: 's1', de: 50, a: 70, note: 40, raison: '1 cri' },
  ];

  it('definirPassages : écrit la liste (triée par note), null la retire', () => {
    const r = definirPassages(recette(), passages);
    expect(r.derush?.passages.map((p) => p.note)).toEqual([72, 40]);
    expect(definirPassages(r, null).derush).toBeUndefined();
    const sans = recette();
    expect(definirPassages(sans, null)).toBe(sans);
  });

  it('ajouterPassage : plan à sa place chronologique parmi les plans de la même vidéo, retiré de la liste', () => {
    const r = definirPassages(recette({ sources: [s1, s2], plans: [{ de: 100, a: 130 }, { src: 's2', de: 0, a: 10 }, { de: 300, a: 330 }] }), passages);
    const { recette: apres, i } = ajouterPassage(r, passages[0]!);
    expect(i).toBe(1); // juste après le dernier plan de s1 qui commence avant lui
    expect(apres.plans.map((p) => [p.src ?? 's1', p.de, p.a])).toEqual([['s1', 100, 130], ['s1', 200, 230], ['s2', 0, 10], ['s1', 300, 330]]);
    expect(apres.derush?.passages).toHaveLength(1);
    const { recette: tot, i: j } = ajouterPassage(apres, passages[1]!);
    expect(j).toBe(0);
    expect(tot.plans[0]).toMatchObject({ de: 50, a: 70 });
    expect(tot.derush).toBeUndefined();
  });

  it('avec Couper les blancs : le passage est découpé en morceaux de parole, et ses mots vont aux sous-titres', () => {
    const mots: Mot[] = [['on', 201, 201.3], ['a', 201.4, 201.6], ['gagné', 201.7, 202.2, 1], ['quoi', 220, 220.4]];
    const r = definirPassages(recette({ blancs: { niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 }, sousTitres: { mots: [['salut', 101, 101.4]] } }), passages);
    const { recette: apres, i } = ajouterPassage(r, passages[0]!, { mots });
    expect(i).toBe(1);
    const ajoutes = apres.plans.slice(1);
    expect(ajoutes).toHaveLength(2);
    expect(ajoutes[0]!.de).toBeCloseTo(200.75, 2);
    expect(ajoutes[1]!.a).toBeCloseTo(220.75, 2);
    expect((apres.sousTitres!.mots as Mot[]).map((m) => m[0])).toEqual(['salut', 'on', 'a', 'gagné', 'quoi']);
  });

  it('passage d\'une vidéo inconnue : sans effet', () => {
    const r = definirPassages(recette(), passages);
    expect(ajouterPassage(r, { ...passages[0]!, src: 'zz' })).toEqual({ recette: r, i: -1 });
  });
});
