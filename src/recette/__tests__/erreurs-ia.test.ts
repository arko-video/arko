// Corpus de recettes « mal écrites par une IA » : chaque fichier donne l'entrée, la correction attendue
// (comparée partiellement) et des morceaux de messages qui doivent apparaître dans les problèmes.

import { describe, expect, it } from 'vitest';
import { normaliser } from '../normaliser';
import type { Source } from '../types';

interface Cas {
  description: string;
  entree?: unknown;
  texte?: string;
  sources?: Source[];
  sonsConnus?: string[];
  attendu: Record<string, unknown>;
  messages: string[];
  bloquant?: boolean;
}

const corpus = import.meta.glob<Cas>('./erreurs-ia/*.json', { eager: true, import: 'default' });
const fichiers = Object.keys(corpus).sort();

describe('corpus erreurs-ia', () => {
  it('contient au moins 10 cas', () => expect(fichiers.length).toBeGreaterThanOrEqual(10));

  for (const f of fichiers) {
    const cas = corpus[f]!;
    it(`${f.replace('./erreurs-ia/', '')} — ${cas.description}`, () => {
      const r = normaliser(cas.texte ?? cas.entree, cas.sources ? { sources: cas.sources } : undefined, {
        sonsConnus: cas.sonsConnus ?? [],
      });
      expect(r.recette).toMatchObject(cas.attendu);
      const tous = r.problemes.map((p) => p.message);
      for (const m of cas.messages) expect(tous.some((x) => x.includes(m)), `message attendu : ${m}\nreçus : ${tous.join('\n')}`).toBe(true);
      expect(r.bloquant).toBe(cas.bloquant ?? false);
      // Une recette normalisée est stable : la renormaliser ne change rien et ne signale rien de corrigé.
      const deux = normaliser(r.recette, { sources: r.recette.sources }, { sonsConnus: cas.sonsConnus ?? [] });
      expect(deux.recette).toEqual(r.recette);
      expect(deux.problemes.filter((p) => p.niveau === 'corrige')).toEqual([]);
    });
  }
});
