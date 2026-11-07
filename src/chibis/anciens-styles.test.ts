// Garde-fou : les 3 anciens styles (feutre, crayon, paint au trait) dessinent EXACTEMENT les mêmes traits qu'avant
// l'arrivée des 6 styles « Persos » (7/11/2026). Empreintes figées dans anciens-styles.json (variable
// ARKO_ECRIRE_EMPREINTES=1 pour les réécrire, seulement si le changement est voulu).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FauxContexte } from '../moteur/couches/faux-contexte';
import type { DefinitionChibi, StyleChibi } from '../recette/types';
import { dessinerChibi } from './dessin';
import { variantes } from './variantes';

const PERSOS: DefinitionChibi[] = [
  { style: 'feutre', graine: 42, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'sweat', accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'ronds' },
  { style: 'feutre', graine: 777, peau: '#A0663D', coiffure: 'longs', cheveux: '#D9A441', tenue: 'cowboy', accessoire: 'lunettes', couleur: '#3498DB', yeux: 'grands' },
  { style: 'feutre', graine: 9, peau: '#FFE0C7', coiffure: 'afro', cheveux: '#8E44AD', tenue: 'sorcier', accessoire: 'lunettesSoleil', couleur: '#2ECC71', yeux: 'points' },
  { style: 'feutre', graine: 31337, peau: '#5A3420', coiffure: 'crete', cheveux: '#C0392B', tenue: 'astronaute', accessoire: 'echarpe', couleur: '#F1C40F' },
];

function empreinte(txt: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

function empreintes(): Record<string, string> {
  const res: Record<string, string> = {};
  for (const style of ['feutre', 'crayon', 'paint'] as StyleChibi[]) {
    PERSOS.forEach((p, i) => {
      const f = new FauxContexte();
      for (const v of variantes()) {
        dessinerChibi(f.ctx, { ...p, style }, { ...v, t: 0.4 }, { x: 200, y: 400, h: 300 });
        dessinerChibi(f.ctx, { ...p, style }, { ...v, retourne: true }, { x: 600, y: 400, h: 120 });
      }
      res[`${style}-${i}`] = empreinte(JSON.stringify(f.traces));
    });
  }
  return res;
}

const FICHIER = new URL('./anciens-styles.json', import.meta.url);

describe('anciens styles (feutre, crayon, paint) inchangés', () => {
  it('mêmes traits qu\'avant, pour 4 persos × 48 variantes (droit et retourné)', () => {
    const e = empreintes();
    if (process.env.ARKO_ECRIRE_EMPREINTES) writeFileSync(FICHIER, JSON.stringify(e, null, 2) + '\n');
    expect(e).toEqual(JSON.parse(readFileSync(FICHIER, 'utf8')));
  });
});
