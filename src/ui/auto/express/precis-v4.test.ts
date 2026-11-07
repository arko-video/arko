// Best-of v4 — réglage « Sous-titres précis » (dev-mots-2), SANS navigateur : coché d'office si le modèle est là,
// proposé sinon ; réécoute seulement si la case est cochée ; hors ligne sans le modèle, erreur ou « Passer » → les mots
// de base, sans erreur. Faux services, transcription FABRIQUÉE ; aucun modèle, aucune donnée privée.

import { describe, expect, it } from 'vitest';
import type { OptionsTache, PlageTemps } from '../../../auto/types';
import type { AnalyseV4, SequenceV4 } from '../../../auto/types-v4';
import type { SourceOuverte } from '../../../moteur/api';
import { ErreurArko } from '../../../moteur/erreurs';
import type { Mot } from '../../../recette/types';
import { OCTETS_PRECIS, TAILLE_PRECIS } from '../../../sous-titres/config-precis';
import { creerSousTitresPrecis, type ServicesPrecis } from './precis-v4';
import { TEXTES_PRECIS } from './textes-precis';

const SOURCE = { infos: { id: 's1' }, fichier: {} } as unknown as SourceOuverte;
const seq = (de: number, a: number): SequenceV4 => ({ de, a, garde: true, duree: a - de }) as unknown as SequenceV4;

const ANALYSE = {
  parole: 'mots',
  transcription: { src: 's1', mots: [['avant', 10.2, 10.6]] as Mot[], plages: [{ de: 0, a: 100 }], complete: true },
  voix: { src: 's1', methode: 'niveau', voix: [{ id: 'p1', niveauDb: -25, part: 0.5 }, { id: 'p2', niveauDb: -40, part: 0.5 }], tours: [{ ts: 10, fin: 12, p: 'p2' }, { ts: 30, fin: 31, p: 'p1' }], sure: 1, separation: {} },
  morceaux: [],
  paroleDetectee: { src: 's1', methode: 'mots', segments: [], probas: null, part: 0 },
  energie: null,
} as unknown as AnalyseV4;
const REVUE = { scenes: [seq(0, 60)], sousTitresPour: 'p2' };

function monde(o: { present?: boolean; enLigne?: boolean; echec?: ErreurArko | Error; attendre?: boolean } = {}) {
  const appels = { transcrire: [] as PlageTemps[][], signal: null as AbortSignal | null };
  const s: ServicesPrecis = {
    lire: async () => ({ present: o.present ?? false, octets: o.present ? 0 : OCTETS_PRECIS }),
    enLigne: () => o.enLigne ?? true,
    transcrire: async (_s, plages, op: OptionsTache) => {
      appels.transcrire.push([...plages]);
      appels.signal = op.signal ?? null;
      op.surProgression?.(0.5, 'J\'écoute…');
      if (o.attendre) await new Promise<void>((_ok, ko) => op.signal?.addEventListener('abort', () => ko(new ErreurArko('annulé', 'annule'))));
      if (o.echec) throw o.echec;
      return [['précis', 10.3, 10.7]];
    },
  };
  return { st: creerSousTitresPrecis(s), appels };
}

describe('Sous-titres précis : la case', () => {
  it('modèle déjà là : cochée d\'office, rien à télécharger', async () => {
    const { st } = monde({ present: true });
    await st.lire();
    expect(st.present.value).toBe(true);
    expect(st.coche.value).toBe(true);
    expect(st.octets.value).toBe(0);
  });

  it('modèle absent : PROPOSÉE (décochée), avec la taille à télécharger (≤ 250 Mo), « une seule fois »', async () => {
    const { st } = monde({ present: false });
    await st.lire();
    expect(st.coche.value).toBe(false);
    expect(st.octets.value).toBe(OCTETS_PRECIS);
    expect(TAILLE_PRECIS).toBeLessThanOrEqual(250e6);
    expect(TEXTES_PRECIS.aideAbsent(226, 15)).toContain('une seule fois');
  });

  it('lire qui lève : traité comme absent', async () => {
    const st = creerSousTitresPrecis({ lire: () => Promise.reject(new Error('x')), enLigne: () => true, transcrire: async () => [] });
    await st.lire();
    expect(st.present.value).toBe(false);
    expect(st.coche.value).toBe(false);
  });

  it('minutes annoncées : au moins 1', () => {
    expect(monde().st.minutes(ANALYSE, REVUE)).toBe(1);
  });
});

describe('Sous-titres précis : avant le montage', () => {
  it('cochée : réécoute SEULEMENT les tours de la voix sous-titrée, et ses mots remplacent ceux de base', async () => {
    const { st, appels } = monde({ present: true });
    await st.lire();
    const r = await st.appliquer(SOURCE, ANALYSE, REVUE);
    expect(appels.transcrire).toEqual([[{ de: 9.7, a: 12.3 }]]);
    expect(r.message).toBeNull();
    expect(r.analyse.transcription.mots.map((m) => m[0])).toEqual(['précis']);
    expect(st.etat.value.phase).toBe('rien');
  });

  it('décochée (refus) : rien n\'est réécouté ni téléchargé, l\'analyse telle quelle', async () => {
    const { st, appels } = monde({ present: false });
    await st.lire();
    const r = await st.appliquer(SOURCE, ANALYSE, REVUE);
    expect(appels.transcrire).toEqual([]);
    expect(r).toEqual({ analyse: ANALYSE, message: null });
  });

  it('cochée à la main sans le modèle, hors ligne : les mots de base, un message court (pas une erreur)', async () => {
    const { st, appels } = monde({ present: false, enLigne: false });
    await st.lire();
    st.coche.value = true;
    const r = await st.appliquer(SOURCE, ANALYSE, REVUE);
    expect(appels.transcrire).toEqual([]);
    expect(r).toEqual({ analyse: ANALYSE, message: TEXTES_PRECIS.horsLigne });
  });

  it('cochée à la main sans le modèle, en ligne (accord) : téléchargé puis réécoute ; la fois d\'après, il est là', async () => {
    const { st, appels } = monde({ present: false });
    await st.lire();
    st.coche.value = true;
    const r = await st.appliquer(SOURCE, ANALYSE, REVUE);
    expect(appels.transcrire.length).toBe(1);
    expect(r.analyse.transcription.mots[0]![0]).toBe('précis');
    expect(st.present.value).toBe(true);
  });

  it('erreur (téléchargement, Whisper) : les mots de base, message court ; place : le message dit combien', async () => {
    const a = monde({ present: true, echec: new ErreurArko('réseau', 'reseau') });
    await a.st.lire();
    expect(await a.st.appliquer(SOURCE, ANALYSE, REVUE)).toEqual({ analyse: ANALYSE, message: TEXTES_PRECIS.echec });
    expect(a.st.etat.value.phase).toBe('rien');
    const b = monde({ present: true, echec: new ErreurArko('Il faut environ 271 Mo de libre.', 'place') });
    await b.st.lire();
    expect((await b.st.appliquer(SOURCE, ANALYSE, REVUE)).message).toContain('271 Mo');
  });

  it('« Passer » pendant la réécoute : arrête le Worker, les mots de base', async () => {
    const { st, appels } = monde({ present: true, attendre: true });
    await st.lire();
    const p = st.appliquer(SOURCE, ANALYSE, REVUE);
    await Promise.resolve();
    expect(st.etat.value).toMatchObject({ phase: 'ecoute', p: 0.5 });
    st.passer();
    const r = await p;
    expect(appels.signal?.aborted).toBe(true);
    expect(r).toEqual({ analyse: ANALYSE, message: TEXTES_PRECIS.passe });
    expect(st.etat.value.phase).toBe('rien');
  });

  it('personne de sous-titré ou mode voix : rien à faire', async () => {
    const { st, appels } = monde({ present: true });
    await st.lire();
    expect((await st.appliquer(SOURCE, ANALYSE, { ...REVUE, sousTitresPour: null })).analyse).toBe(ANALYSE);
    const voix = { ...ANALYSE, parole: 'voix' } as AnalyseV4;
    expect((await st.appliquer(SOURCE, voix, REVUE)).analyse).toBe(voix);
    expect(appels.transcrire).toEqual([]);
  });
});
