// Relecture (intégrateur, points 1 et 2) : ce que le Best-of a seulement « fait » (Whisper sur la parole) n'est pas
// « écouté » : transcrireLongue et les sous-titres retranscrivent les trous ; une tranche ratée en Best-of reste « à
// refaire » (non gardée, complete = false) et elle est refaite à la prochaine analyse ; une fenêtre sautée par Whisper
// aussi ; un module cassé lève même en reprise. Faux Worker, IndexedDB en mémoire : aucun modèle.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceOuverte } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import type { MotBrut, VersWorker } from './messages';
import { motsDejaTranscrits, transcriptionGardee, transcrireLongue, type MoteurTranscription } from './transcription-longue';
import { transcrireZones } from './transcription-zones';

const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => memoire.get(k),
  set: async (k: string, v: unknown) => void memoire.set(k, structuredClone(v)),
  del: async (k: string) => void memoire.delete(k),
}));

function source(duree: number): SourceOuverte {
  return { infos: { id: 'v1', nom: 'v.mp4', taille: 1, emp: 'emp1', duree, type: 'video' }, verticale: false, fichier: new File([], 'v.mp4') } as unknown as SourceOuverte;
}

type Demande = Extract<VersWorker, { type: 'transcrire' }>;
/** Faux Worker : un mot au début de chaque plage ; `plante` lève ; `saute` = fenêtres sautées à annoncer. */
function moteur(o: { plante?: (d: Demande) => Error | null; saute?: (d: Demande) => { de: number; a: number }[] } = {}) {
  const demandes: Demande[] = [];
  const m: MoteurTranscription = {
    async executer(d, opts) {
      if (d.type !== 'transcrire') return [];
      demandes.push(d);
      const e = o.plante?.(d);
      if (e) throw e;
      const s = o.saute?.(d) ?? [];
      if (s.length > 0) opts.surSautees?.(s.map((x) => ({ ...x, message: 'plante' })));
      return d.plages.map((p): MotBrut => ({ txt: ' bonjour', ts: p.de + 0.1, fin: p.de + 0.5, niveau: 0.1 }));
    },
    async preparer() {},
  };
  return { m, demandes };
}

beforeEach(() => memoire.clear());

describe('ce que le Best-of a fait n\'est pas ce que Whisper a écouté (point 1)', () => {
  it('transcrireZones puis transcrireLongue : les trous jamais écoutés sont retranscrits, pas le reste', async () => {
    const a = moteur();
    const z = await transcrireZones(source(900), { moteur: a.m, zones: [{ de: 20, a: 25 }] });
    expect(z.plages).toEqual([{ de: 0, a: 900 }]); // fait pour le Best-of
    expect(a.demandes.map((d) => d.plages)).toEqual([[{ de: 20, a: 25 }]]);
    // Pour les autres outils, seul [20, 25] a été écouté.
    expect((await transcriptionGardee(source(900)))?.plages).toEqual([{ de: 20, a: 25 }]);
    expect(await motsDejaTranscrits(source(900), [{ de: 100, a: 110 }])).toBeNull();
    const b = moteur();
    const t = await transcrireLongue(source(900), { moteur: b.m });
    expect(b.demandes.map((d) => d.plages[0])).toEqual([{ de: 0, a: 20 }, { de: 25, a: 325 }, { de: 325, a: 625 }, { de: 625, a: 900 }]);
    expect(t.plages).toEqual([{ de: 0, a: 900 }]);
    expect(t.mots.map((x) => x[1])).toEqual([0.1, 20.1, 25.1, 325.1, 625.1]);
    // Tout est écouté maintenant : rien n'est refait.
    const c = moteur();
    await transcrireLongue(source(900), { moteur: c.m });
    expect(c.demandes).toHaveLength(0);
  });
});

describe('une tranche ratée en Best-of reste à refaire (point 2)', () => {
  it('non gardée, complete = false, refaite à la prochaine analyse', async () => {
    let casse = true;
    const a = moteur({ plante: (d) => (casse && d.plages[0]!.de >= 300 && d.plages[0]!.de < 600 ? new ErreurArko('Le module sous-titres a planté.', 'module') : null) });
    const zones = [{ de: 10, a: 20 }, { de: 310, a: 320 }, { de: 610, a: 620 }];
    const t1 = await transcrireZones(source(900), { moteur: a.m, zones });
    expect(t1.complete).toBe(false);
    expect(t1.plages).toEqual([{ de: 0, a: 300 }, { de: 600, a: 900 }]);
    casse = false;
    const n = a.demandes.length;
    const t2 = await transcrireZones(source(900), { moteur: a.m, zones });
    expect(a.demandes.slice(n).map((d) => d.plages)).toEqual([[{ de: 310, a: 320 }]]);
    expect(t2.complete).toBe(true);
    expect(t2.mots.map((x) => x[1])).toEqual([10.1, 310.1, 610.1]);
  });

  it('module cassé : lève même en REPRISE (rien ne marche), au lieu de tout sauter sans rien dire', async () => {
    await transcrireZones(source(1500), { moteur: moteur().m, zones: [{ de: 10, a: 20 }], plage: { de: 0, a: 300 } });
    const casse = moteur({ plante: () => new ErreurArko('Le module sous-titres a planté.', 'module') });
    await expect(transcrireZones(source(1500), { moteur: casse.m, zones: [{ de: 10, a: 20 }, { de: 310, a: 320 }, { de: 610, a: 620 }, { de: 910, a: 920 }] })).rejects.toThrow(/planté/);
    expect(casse.demandes.length).toBe(4); // 2 tranches × 2 essais, puis on s'arrête
  });

  it('une fenêtre sautée par Whisper : les mots du reste sont gardés, la fenêtre reste à refaire (complete = false)', async () => {
    let saute = true;
    const a = moteur({ saute: (d) => (saute && d.plages[0]!.de === 0 ? [{ de: 100, a: 128 }] : []) });
    const t = await transcrireLongue(source(300), { moteur: a.m });
    expect(t.complete).toBe(false);
    expect(t.plages).toEqual([{ de: 0, a: 100 }, { de: 128, a: 300 }]);
    expect(t.mots.map((x) => x[1])).toEqual([0.1]);
    saute = false;
    const t2 = await transcrireLongue(source(300), { moteur: a.m });
    expect(a.demandes.slice(1).map((d) => d.plages)).toEqual([[{ de: 100, a: 128 }]]);
    expect(t2.complete).toBe(true);
    expect(t2.mots.map((x) => x[1])).toEqual([0.1, 100.1]);
  });
});
