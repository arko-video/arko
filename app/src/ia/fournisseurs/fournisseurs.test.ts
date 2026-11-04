// Les 3 fournisseurs avec un FAUX fetch : aucune vraie clé, aucun appel réseau.
// Pour chacun : succès, 401, 429, réponse coupée, JSON dans du markdown, liste des modèles.

import { describe, expect, it } from 'vitest';
import { ErreurArko } from '../../moteur/erreurs';
import { anthropic } from './anthropic';
import { cacherCles } from './commun';
import { gemini } from './gemini';
import { FOURNISSEURS, testerCle } from './index';
import { openai } from './openai';
import type { AppelIA, FonctionFetch, Fournisseur, IdFournisseur } from './types';

/** Fausse clé, visiblement fausse. */
const CLE = 'sk-faux-0000000000-test-a1B2';

interface Appel {
  url: string;
  init: RequestInit;
}

/** Faux fetch : renvoie les réponses dans l'ordre et note chaque appel. */
function fauxFetch(...reponses: { statut?: number; corps: unknown }[]) {
  const appels: Appel[] = [];
  const f: FonctionFetch = async (url, init) => {
    appels.push({ url, init });
    const r = reponses[Math.min(appels.length - 1, reponses.length - 1)]!;
    const corps = typeof r.corps === 'string' ? r.corps : JSON.stringify(r.corps);
    return new Response(corps, { status: r.statut ?? 200 });
  };
  return { f, appels };
}

/** La réponse « succès » telle que chaque fournisseur l'envoie. */
function enveloppe(id: IdFournisseur, texte: string, coupee = false): unknown {
  if (id === 'anthropic') return { content: [{ type: 'text', text: texte }], stop_reason: coupee ? 'max_tokens' : 'end_turn' };
  if (id === 'openai') return { choices: [{ message: { role: 'assistant', content: texte }, finish_reason: coupee ? 'length' : 'stop' }] };
  return { candidates: [{ content: { parts: [{ text: 'je réfléchis', thought: true }, { text: texte }] }, finishReason: coupee ? 'MAX_TOKENS' : 'STOP' }] };
}

/** Erreur telle que chaque fournisseur l'envoie. */
const erreur = (message: string) => ({ error: { message } });

const appel = (f: FonctionFetch, extra: Partial<AppelIA> = {}): AppelIA => ({
  cle: CLE, modele: 'modele-test', systeme: 'CONSIGNES', message: 'MOMENTS', maxTokens: 1000, fetch: f, ...extra,
});

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurArko> {
  try {
    await promesse;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurArko);
    return e as ErreurArko;
  }
  throw new Error('Une erreur était attendue.');
}

describe.each(FOURNISSEURS.map((f) => [f.id, f] as [IdFournisseur, Fournisseur]))('%s', (id, fournisseur) => {
  it('succès : renvoie le texte du modèle', async () => {
    const { f, appels } = fauxFetch({ corps: enveloppe(id, '{"recettes":[]}') });
    const r = await fournisseur.appeler(appel(f));
    expect(r).toEqual({ texte: '{"recettes":[]}', coupee: false });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.init.method).toBe('POST');
    // La clé n'est JAMAIS dans l'adresse (elle finirait dans les journaux des serveurs).
    expect(appels[0]!.url).not.toContain(CLE);
  });

  it('401 → « Clé refusée : vérifie-la », sans montrer la clé', async () => {
    const { f } = fauxFetch({ statut: 401, corps: erreur(`Incorrect API key provided: ${CLE}`) });
    const e = await erreurDe(fournisseur.appeler(appel(f)));
    expect(e.code).toBe('cle_refusee');
    expect(e.message).toBe('Clé refusée : vérifie-la.');
  });

  it('429 → « Trop de demandes ou crédit épuisé »', async () => {
    const { f } = fauxFetch({ statut: 429, corps: erreur('Rate limit exceeded') });
    const e = await erreurDe(fournisseur.appeler(appel(f)));
    expect(e.code).toBe('limite');
    expect(e.message).toContain('Trop de demandes ou crédit épuisé');
  });

  it('réponse coupée (limite de tokens) : signalée', async () => {
    const { f } = fauxFetch({ corps: enveloppe(id, '{"recettes":[{"plans":[', true) });
    expect((await fournisseur.appeler(appel(f))).coupee).toBe(true);
  });

  it('JSON dans du markdown : le texte revient tel quel (lu ensuite par lireReponse)', async () => {
    const texte = 'Voici :\n```json\n{"recettes":[]}\n```';
    const { f } = fauxFetch({ corps: enveloppe(id, texte) });
    expect((await fournisseur.appeler(appel(f))).texte).toBe(texte);
  });

  it('réponse vide → erreur claire', async () => {
    const { f } = fauxFetch({ corps: enveloppe(id, '  ') });
    expect((await erreurDe(fournisseur.appeler(appel(f)))).code).toBe('reponse_vide');
  });

  it('« Tester ma clé » : appelle la liste des modèles (GET), le modèle par défaut en premier', async () => {
    const liste =
      id === 'gemini'
        ? { models: [
            { name: 'models/gemini-zzz', supportedGenerationMethods: ['generateContent'] },
            { name: `models/${fournisseur.modeleParDefaut}`, supportedGenerationMethods: ['generateContent', 'countTokens'] },
            { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
          ] }
        : { data: [{ id: id === 'openai' ? 'gpt-zzz' : 'claude-zzz' }, { id: fournisseur.modeleParDefaut }, { id: id === 'openai' ? 'text-embedding-9' : 'claude-aaa' }] };
    const { f, appels } = fauxFetch({ corps: liste });
    const modeles = await testerCle(id, `  ${CLE}\n`, { fetch: f });
    expect(modeles[0]).toBe(fournisseur.modeleParDefaut);
    expect(modeles).not.toContain('text-embedding-9');
    expect(appels[0]!.init.method).toBe('GET');
    expect(appels[0]!.url).toMatch(/\/v1(beta)?\/models/);
  });
});

describe('détails de chaque API', () => {
  const lireCorps = (a: Appel) => JSON.parse(String(a.init.body)) as Record<string, unknown>;
  const entetes = (a: Appel) => a.init.headers as Record<string, string>;

  it('Anthropic : en-têtes obligatoires et corps {model, max_tokens, system, messages}', async () => {
    const { f, appels } = fauxFetch({ corps: enveloppe('anthropic', '{}') });
    await anthropic.appeler(appel(f));
    expect(appels[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(entetes(appels[0]!)).toMatchObject({ 'x-api-key': CLE, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(lireCorps(appels[0]!)).toEqual({ model: 'modele-test', max_tokens: 1000, system: 'CONSIGNES', messages: [{ role: 'user', content: 'MOMENTS' }] });
  });

  it('OpenAI : Bearer et mode JSON', async () => {
    const { f, appels } = fauxFetch({ corps: enveloppe('openai', '{}') });
    await openai.appeler(appel(f));
    expect(appels[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(entetes(appels[0]!).authorization).toBe(`Bearer ${CLE}`);
    expect(lireCorps(appels[0]!)).toMatchObject({ model: 'modele-test', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'CONSIGNES' }, { role: 'user', content: 'MOMENTS' }] });
  });

  it('Gemini : x-goog-api-key, JSON demandé, « models/ » retiré, pensées ignorées', async () => {
    const { f, appels } = fauxFetch({ corps: enveloppe('gemini', '{"recettes":[]}') });
    const r = await gemini.appeler(appel(f, { modele: 'models/gemini-test' }));
    expect(r.texte).toBe('{"recettes":[]}');
    expect(appels[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(entetes(appels[0]!)['x-goog-api-key']).toBe(CLE);
    expect(lireCorps(appels[0]!)).toMatchObject({ generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 }, systemInstruction: { parts: [{ text: 'CONSIGNES' }] } });
  });

  it('Gemini répond 400 « API key not valid » : traduit en clé refusée', async () => {
    const { f } = fauxFetch({ statut: 400, corps: erreur('API key not valid. Please pass a valid API key.') });
    expect((await erreurDe(gemini.appeler(appel(f)))).code).toBe('cle_refusee');
  });

  it('Anthropic répond 400 « credit balance is too low » : crédit épuisé', async () => {
    const { f } = fauxFetch({ statut: 400, corps: erreur('Your credit balance is too low to access the Anthropic API.') });
    expect((await erreurDe(anthropic.appeler(appel(f)))).code).toBe('limite');
  });
});

describe('erreurs réseau, délai, annulation', () => {
  it('404 → modèle introuvable ; 500 → service en panne ; 400 → message du fournisseur sans clé', async () => {
    expect((await erreurDe(openai.appeler(appel(fauxFetch({ statut: 404, corps: erreur('model not found') }).f)))).code).toBe('modele');
    expect((await erreurDe(openai.appeler(appel(fauxFetch({ statut: 529, corps: 'Overloaded' }).f)))).code).toBe('service');
    const e = await erreurDe(openai.appeler(appel(fauxFetch({ statut: 400, corps: erreur(`Bad thing with ${CLE}`) }).f)));
    expect(e.code).toBe('refuse');
    expect(e.message).toContain('erreur 400');
    expect(e.message).not.toContain(CLE);
  });

  it('pas d\'internet → « Connexion impossible »', async () => {
    const f: FonctionFetch = () => Promise.reject(new TypeError('Failed to fetch'));
    const e = await erreurDe(anthropic.appeler(appel(f)));
    expect(e.code).toBe('reseau');
    expect(e.message).toContain('Connexion impossible');
  });

  it('corps coupé par le réseau → réponse illisible', async () => {
    const { f } = fauxFetch({ corps: '{"content":[{"type":"te' });
    expect((await erreurDe(anthropic.appeler(appel(f)))).code).toBe('reponse_illisible');
  });

  /** Faux fetch qui ne répond jamais, sauf si on l'interrompt. */
  const silencieux: FonctionFetch = (_url, init) =>
    new Promise((_ok, non) => init.signal?.addEventListener('abort', () => non(new DOMException('Interrompu', 'AbortError'))));

  it('délai maximum dépassé → « Pas de réponse après 2 minutes »', async () => {
    const e = await erreurDe(gemini.appeler(appel(silencieux, { delai: 20 })));
    expect(e.code).toBe('delai');
  });

  it('bouton Annuler (AbortSignal) → « annule », avant ou pendant l\'envoi', async () => {
    const c = new AbortController();
    const promesse = openai.appeler(appel(silencieux, { signal: c.signal }));
    c.abort();
    expect((await erreurDe(promesse)).code).toBe('annule');
    expect((await erreurDe(openai.appeler(appel(silencieux, { signal: c.signal })))).code).toBe('annule');
  });

  it('testerCle refuse une clé vide sans rien envoyer', async () => {
    const { f, appels } = fauxFetch({ corps: {} });
    expect((await erreurDe(testerCle('openai', '   ', { fetch: f }))).code).toBe('cle_vide');
    expect(appels).toHaveLength(0);
  });

  it('cacherCles masque tout ce qui ressemble à une clé', () => {
    expect(cacherCles('clé sk-proj-abcdef123456 et AIzaSyA1234567890abc et sk-pr***********xyz')).toBe('clé [clé cachée] et [clé cachée] et [clé cachée]');
  });
});
