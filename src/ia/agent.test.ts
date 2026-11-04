// Monteur IA : consignes, requête exacte, estimation des tokens, et proposerClips avec un FAUX fetch.

import { describe, expect, it } from 'vitest';
import { ErreurArko } from '../moteur/erreurs';
import { STYLES_TEXTE, TYPES_TRANSITION } from '../recette/defauts';
import type { Source } from '../recette/types';
import { catalogueIds } from '../sons/catalogue';
import {
  consignesAgent,
  construireRequete,
  decouperLots,
  decrireTokens,
  estimerDemande,
  estimerTokens,
  proposerClips,
  type DemandeAgent,
} from './agent';
import type { FonctionFetch } from './fournisseurs/types';
import { formaterMoments } from './moments';

const SOURCES: Source[] = [{ id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'abc', duree: 10835.2, type: 'video' }];
const MOMENTS = formaterMoments({ src: 's1', duree: 10835.2 }, [
  { debut: 842.3, fin: 859.8, score: 87, etiquettes: ['rire', 'cri'], extrait: 'attends attends… NON il m\'a one-shot' },
  { debut: 1203, fin: 1215.4, score: 74, etiquettes: ['silence>pic'], extrait: 'bon… j\'ai rien vu venir' },
]);
const demande = (extra: Partial<DemandeAgent> = {}): DemandeAgent => ({ moments: MOMENTS, nombre: 10, sources: SOURCES, ...extra });

describe('consignesAgent', () => {
  const c = consignesAgent();

  it('liste tous les sons et toutes les transitions valides, et rien d\'inventé', () => {
    for (const id of catalogueIds()) expect(c).toContain(id);
    for (const t of TYPES_TRANSITION.filter((t) => t !== 'coupe')) expect(c).toContain(t);
    for (const s of STYLES_TEXTE) expect(c).toContain(s);
    // Les sons cités dans l'exemple existent aussi.
    const cites = [...c.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    for (const id of cites) expect(catalogueIds()).toContain(id);
  });

  it('demande le format compact, les règles TikTok et une réponse {"recettes":[…]} seulement', () => {
    expect(c).toContain('{"recettes":[…]}');
    expect(c).toContain('"role":"accroche"');
    expect(c).toContain('"sousTitres":{"mots":"auto"}');
    expect(c).toContain('15 à 45 s');
    expect(c).toContain('avant 3 s');
    expect(c).toContain('6 mots au plus');
    expect(c).toContain('raison');
  });

  it('reste compact : 800 tokens au plus', () => {
    expect(estimerTokens(c)).toBeLessThanOrEqual(800);
  });
});

describe('construireRequete', () => {
  it('donne le texte exact : consignes, moments, nombre, consigne libre (fonction pure)', () => {
    const d = demande({ consigne: '  que des\nclutchs  ' });
    const t = construireRequete(d);
    expect(t).toBe(construireRequete(d));
    expect(t.startsWith(consignesAgent())).toBe(true);
    expect(t).toContain(MOMENTS);
    expect(t).toContain('Propose 10 clips différents.');
    expect(t).toContain('Consigne de l\'utilisateur : « que des clutchs »');
  });

  it('2e requête : liste les moments déjà pris', () => {
    expect(construireRequete(demande(), 5, ['m01', 'm04'])).toContain('Moments déjà utilisés, à ne pas reprendre : m01, m04.');
    expect(construireRequete(demande({ nombre: 1 }))).toContain('Propose 1 clip.');
  });

  it('découpe en 2 requêtes de 15 au plus au-delà de 15 clips', () => {
    expect(decouperLots(10)).toEqual([10]);
    expect(decouperLots(15)).toEqual([15]);
    expect(decouperLots(16)).toEqual([8, 8]);
    expect(decouperLots(25)).toEqual([13, 12]);
    expect(decouperLots(99)).toEqual([15, 15]);
    expect(decouperLots(0)).toEqual([1]);
  });
});

describe('estimation des tokens', () => {
  it('environ caractères / 3,5', () => {
    expect(estimerTokens('a'.repeat(35))).toBe(10);
  });

  it('en mots simples, sans prix exact', () => {
    expect(decrireTokens(14_873)).toBe('environ 15 000 tokens, soit quelques centimes avec un petit modèle');
    expect(decrireTokens(1_234)).toBe('environ 1 200 tokens, soit quelques centimes avec un petit modèle');
    expect(decrireTokens(180_000)).toContain('quelques dizaines de centimes au plus');
  });

  it('compte les 2 requêtes et la réponse', () => {
    const une = estimerDemande(demande({ nombre: 10 }));
    const deux = estimerDemande(demande({ nombre: 30 }));
    expect(une.requetes).toBe(1);
    expect(deux.requetes).toBe(2);
    expect(deux.tokens).toBeGreaterThan(une.tokens * 1.5);
    expect(une.phrase).toMatch(/^environ [\d ]+ tokens/);
  });
});

/** Une recette au format compact, comme l'écrirait l'IA. */
const recetteIA = (n: number, m: string) => ({
  titre: `Clip ${n}`, raison: 'Ça marche.', plans: [{ de: 100 * n, a: 100 * n + 20, m }],
  textes: [{ txt: 'REGARDE ÇA', role: 'accroche', t: 0 }], sousTitres: { mots: 'auto' },
});
/** Réponse Anthropic contenant `texte`. */
const anthropicOk = (texte: string, coupee = false) => ({ content: [{ type: 'text', text: texte }], stop_reason: coupee ? 'max_tokens' : 'end_turn' });

function fauxFetch(...corps: { statut?: number; json: unknown }[]) {
  const messages: string[] = [];
  const f: FonctionFetch = async (_url, init) => {
    const envoye = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    messages.push(envoye.messages[0]!.content);
    const r = corps[messages.length - 1]!;
    return new Response(JSON.stringify(r.json), { status: r.statut ?? 200 });
  };
  return { f, messages };
}

describe('proposerClips (faux fournisseur)', () => {
  const reglages = { fournisseur: 'anthropic' as const, cle: 'sk-faux-test-0000' };

  it('JSON dans du markdown : brouillons normalisés, raison, sous-titres « auto »', async () => {
    const texte = 'Voici !\n```json\n' + JSON.stringify({ recettes: [recetteIA(1, 'm01'), recetteIA(2, 'm02')] }) + '\n```';
    const { f } = fauxFetch({ json: anthropicOk(texte) });
    const r = await proposerClips(demande({ nombre: 2 }), { ...reglages, fetch: f });
    expect(r.propositions).toHaveLength(2);
    expect(r.propositions[0]!.recette).toMatchObject({ statut: 'brouillon', sousTitres: { mots: 'auto' }, sources: SOURCES });
    expect(r.propositions[0]!.raison).toBe('Ça marche.');
  });

  it('20 clips → 2 requêtes de 10 ; la 2e exclut les moments déjà pris', async () => {
    const lot1 = { recettes: [recetteIA(1, 'm01'), recetteIA(2, 'm02')] };
    const lot2 = { recettes: [recetteIA(3, 'm03')] };
    const { f, messages } = fauxFetch({ json: anthropicOk(JSON.stringify(lot1)) }, { json: anthropicOk(JSON.stringify(lot2)) });
    const etapes: string[] = [];
    const r = await proposerClips(demande({ nombre: 20 }), { ...reglages, fetch: f, surProgression: (a, b) => etapes.push(`${a}/${b}`) });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('Propose 10 clips différents.');
    expect(messages[1]).toContain('Moments déjà utilisés, à ne pas reprendre : m01, m02.');
    expect(r.propositions.map((p) => p.recette.titre)).toEqual(['Clip 1', 'Clip 2', 'Clip 3']);
    expect(etapes).toEqual(['0/2', '1/2', '2/2']);
  });

  it('la 2e requête échoue (429) : on garde les clips de la 1re, avec un message', async () => {
    const { f } = fauxFetch({ json: anthropicOk(JSON.stringify({ recettes: [recetteIA(1, 'm01')] })) }, { statut: 429, json: { error: { message: 'rate' } } });
    const r = await proposerClips(demande({ nombre: 20 }), { ...reglages, fetch: f });
    expect(r.propositions).toHaveLength(1);
    expect(r.problemes[0]!.message).toContain('La 2e demande a échoué : Trop de demandes ou crédit épuisé');
  });

  it('réponse coupée sans recette complète → erreur « reponse_coupee »', async () => {
    const { f } = fauxFetch({ json: anthropicOk('{"recettes":[{"titre":"A","plans":[{"de":1', true) });
    await expect(proposerClips(demande(), { ...reglages, fetch: f })).rejects.toMatchObject({ code: 'reponse_coupee' });
  });

  it('401 dès la 1re requête → erreur levée, clé jamais dans le message', async () => {
    const { f } = fauxFetch({ statut: 401, json: { error: { message: 'invalid x-api-key sk-faux-test-0000' } } });
    const e = await proposerClips(demande(), { ...reglages, fetch: f }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurArko);
    expect((e as ErreurArko).message).toBe('Clé refusée : vérifie-la.');
  });

  it('clé vide ou aucun moment : rien n\'est envoyé', async () => {
    const { f, messages } = fauxFetch({ json: {} });
    await expect(proposerClips(demande(), { ...reglages, cle: ' ', fetch: f })).rejects.toMatchObject({ code: 'cle_vide' });
    await expect(proposerClips(demande({ moments: '' }), { ...reglages, fetch: f })).rejects.toMatchObject({ code: 'moments_vides' });
    expect(messages).toHaveLength(0);
  });
});
