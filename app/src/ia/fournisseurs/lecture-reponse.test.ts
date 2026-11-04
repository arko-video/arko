// lireReponse sur 6 réponses enregistrées (reponses-ia/), écrites comme le ferait une vraie IA,
// avec ses erreurs typiques : bavardage, markdown, clés anglaises, JSON coupé, recettes fausses, refus.

import { describe, expect, it } from 'vitest';
import type { Source } from '../../recette/types';
import { extraireRecettes, sansVirgulesFinales } from './extraire-json';
import { lireReponse } from './lecture-reponse';

const fichiers = import.meta.glob<string>('./reponses-ia/*.txt', { eager: true, query: '?raw', import: 'default' });
const reponse = (nom: string) => {
  const t = fichiers[`./reponses-ia/${nom}.txt`];
  if (t === undefined) throw new Error(`Réponse enregistrée introuvable : ${nom}`);
  return t;
};
const SOURCES: Source[] = [{ id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'abc', duree: 10835.2, type: 'video', l: 1920, h: 1080 }];
const messages = (r: { problemes: { message: string }[] }) => r.problemes.map((p) => p.message);

describe('lireReponse — réponses enregistrées', () => {
  it('a bien les 6 réponses', () => expect(Object.keys(fichiers)).toHaveLength(6));

  it('01 propre : 3 brouillons, vraies sources, sous-titres « auto », raison gardée', () => {
    const r = lireReponse(reponse('01-propre'), SOURCES);
    expect(r.coupee).toBe(false);
    expect(r.problemes).toEqual([]);
    expect(r.propositions).toHaveLength(3);
    for (const p of r.propositions) {
      expect(p.recette.statut).toBe('brouillon');
      expect(p.recette.sources).toEqual(SOURCES);
      expect(p.recette.sousTitres?.mots).toBe('auto');
      expect(p.raison).not.toBe('');
      expect(p.recette.textes[0]).toMatchObject({ role: 'accroche', t: 0 });
    }
    const [un] = r.propositions;
    expect(un!.recette.titre).toBe('Il m\'a one-shot');
    expect(un!.raison).toBe('Le cri puis le fou rire font une chute parfaite.');
    // Ancien nom de transition corrigé.
    expect(un!.recette.plans[1]).toMatchObject({ trans: 'glisse', m: 'm01' });
    expect(messages(un!)).toContain('La transition "whoosh" s\'appelle maintenant "glisse" : corrigée.');
  });

  it('02 markdown et bavardage autour, virgules en trop : 2 brouillons sans erreur', () => {
    const r = lireReponse(reponse('02-markdown-bavard'), SOURCES);
    expect(r.problemes).toEqual([]);
    expect(r.propositions.map((p) => p.recette.titre)).toEqual(['Le bug du siècle', 'Rage quit évité']);
    expect(r.propositions[1]!.recette.plans).toHaveLength(2);
    expect(r.propositions[1]!.recette.textes[1]).toMatchObject({ txt: 'OU PAS', style: 'citron' });
  });

  it('03 tableau seul, clés anglaises, temps « 1:10:05.5 », son inventé', () => {
    const r = lireReponse(reponse('03-tableau-cles-anglaises'), SOURCES);
    expect(r.propositions).toHaveLength(1);
    const p = r.propositions[0]!;
    expect(p.recette).toMatchObject({ titre: 'Ace en 10 secondes', plans: [{ de: 4205.5, a: 4227 }], sousTitres: { mots: 'auto' } });
    expect(p.raison).toContain('Cinq kills');
    expect(p.recette.textes[0]).toMatchObject({ txt: '5 KILLS EN 10 SECONDES', role: 'accroche' });
    expect(p.recette.sons.map((s) => s.id)).toEqual(['jeu.piece']);
    const m = messages(p).join('\n');
    expect(m).toContain('La clé "title" a été lue comme "titre".');
    expect(m).toContain('Le son "vine_boom" n\'existe pas. Sons proches : impact.boom');
    expect(m).toContain('Le premier plan ne peut pas avoir de transition');
  });

  it('04 JSON coupé : les 2 recettes complètes sont récupérées, la 3e est perdue', () => {
    const r = lireReponse(reponse('04-coupee'), SOURCES);
    expect(r.coupee).toBe(true);
    expect(r.propositions.map((p) => p.recette.titre)).toEqual(['Il m\'a one-shot', 'Silence puis panique']);
    // Les accolades écrites dans un texte ne trompent pas la lecture.
    expect(r.propositions[1]!.recette.textes[0]!.txt).toBe('Le calme avant… {la tempête}');
    expect(messages(r)).toEqual(['La réponse de l\'IA était coupée : 2 recette(s) complète(s) récupérée(s).']);
  });

  it('05 recettes fausses : corrigées par le normaliseur, la recette sans plan est écartée', () => {
    const r = lireReponse(reponse('05-erreurs-dans-les-recettes'), SOURCES);
    expect(r.propositions.map((p) => p.recette.titre)).toEqual(['Fin de live épique', 'Deux fois de suite']);
    expect(messages(r)).toEqual(['La recette n° 2 est inutilisable : la recette ne garde aucun plan : il n\'y a rien à exporter.']);
    const [fin, deux] = r.propositions;
    expect(fin!.recette.plans[0]).toMatchObject({ de: 10820, a: 10835.2 });
    expect(fin!.recette.textes[0]!.y).toBe(0.62);
    const m = messages(fin!).join('\n');
    expect(m).toContain('je les ai inversées');
    expect(m).toContain('dépassait la durée de la vidéo');
    expect(m).toContain('La clé "score" est inconnue');
    expect(m).toContain('a 9 mots : 6 au plus se lisent mieux');
    expect(deux!.recette.plans[1]!.trans).toBe('noir');
    expect(deux!.recette.zooms[0]!.force).toBe(2.5);
  });

  it('06 refus sans JSON : aucun brouillon, un problème bloquant en français', () => {
    const r = lireReponse(reponse('06-refus-sans-json'), SOURCES);
    expect(r.propositions).toEqual([]);
    expect(r.problemes).toEqual([{ chemin: 'reponse', niveau: 'bloquant', message: 'La réponse ne contient aucun JSON.' }]);
  });
});

describe('lireReponse — autres formes de réponse', () => {
  const recette = { titre: 'Court', plans: [{ de: 10, a: 18 }], textes: [{ txt: 'Regarde bien', t: 4 }] };

  it('accepte une autre clé que « recettes » et une recette seule', () => {
    const r = lireReponse(JSON.stringify({ recipes: [recette] }), SOURCES);
    expect(r.propositions).toHaveLength(1);
    expect(messages(r)).toEqual(['La liste "recipes" a été lue comme "recettes".']);
    expect(lireReponse(JSON.stringify(recette), SOURCES).propositions).toHaveLength(1);
  });

  it('donne les conseils TikTok : clip trop court, pas d\'accroche avant 3 s', () => {
    const p = lireReponse(JSON.stringify({ recettes: [recette] }), SOURCES).propositions[0]!;
    expect(p.raison).toBe('');
    expect(messages(p)).toEqual(['Le clip dure 8 s : sur TikTok, vise 15 à 45 s.', 'Aucun texte avant 3 s : ajoute une accroche.']);
  });

  it('garde sousTitres null si l\'IA les refuse, et les met en « auto » si elle les oublie', () => {
    const sans = lireReponse(JSON.stringify({ recettes: [{ ...recette, sousTitres: null }] }), SOURCES).propositions[0]!;
    expect(sans.recette.sousTitres).toBeNull();
    expect(lireReponse(JSON.stringify({ recettes: [recette] }), SOURCES).propositions[0]!.recette.sousTitres?.mots).toBe('auto');
  });

  it('JSON coupé sans aucune recette complète', () => {
    const r = lireReponse('{"recettes":[{"titre":"A","plans":[{"de":1', SOURCES);
    expect(r).toMatchObject({ propositions: [], coupee: true });
    expect(r.problemes.map((p) => p.niveau)).toEqual(['bloquant']);
  });
});

describe('extraireRecettes', () => {
  it('bloc ```json non refermé (réponse coupée dans le markdown)', () => {
    const e = extraireRecettes('Voici :\n```json\n[{"plans":[{"de":1,"a":20}]},{"plans":[{"de":30,');
    expect(e.recettes).toEqual([{ plans: [{ de: 1, a: 20 }] }]);
    expect(e.coupe).toBe(true);
  });

  it('sansVirgulesFinales ne touche pas aux virgules dans les chaînes', () => {
    expect(sansVirgulesFinales('{"a":[1,2,],"b":"x,]",}')).toBe('{"a":[1,2],"b":"x,]"}');
  });
});
