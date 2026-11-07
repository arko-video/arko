import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceOuverte } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import type { MotBrut, VersWorker } from './messages';
import { transcrireLongue, type MoteurTranscription } from './transcription-longue';
import { preparerZones, transcrireZones, zonesDeLaTranche } from './transcription-zones';

// IndexedDB en mémoire (la reprise des tranches est gardée sous `arko.transcription.<empreinte>`).
const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => memoire.get(k),
  set: async (k: string, v: unknown) => void memoire.set(k, structuredClone(v)),
  del: async (k: string) => void memoire.delete(k),
}));

function source(duree: number): SourceOuverte {
  return { infos: { id: 'v1', nom: 'v.mp4', taille: 1, emp: 'emp1', duree, type: 'video' }, verticale: false, fichier: new File([], 'v.mp4') } as unknown as SourceOuverte;
}

/** Faux Worker : un mot de 0,4 s au début de chaque plage demandée ; `plante(tranche)` lève pour une tranche. */
function moteur(plante: (d: Extract<VersWorker, { type: 'transcrire' }>) => Error | null = () => null) {
  const demandes: Extract<VersWorker, { type: 'transcrire' }>[] = [];
  let preparations = 0;
  const m: MoteurTranscription = {
    async executer(d) {
      if (d.type !== 'transcrire') return [];
      demandes.push(d);
      const e = plante(d);
      if (e) throw e;
      return d.plages.map((p): MotBrut => ({ txt: ' bonjour', ts: p.de + 0.1, fin: p.de + 0.5, niveau: 0.1 }));
    },
    async preparer() {
      preparations++;
    },
  };
  return { m, demandes, preparations: () => preparations };
}

beforeEach(() => memoire.clear());

describe('zones', () => {
  it('fusionne les trous de moins de 30 s (son d’un tenant) et coupe aux bords de la tranche', () => {
    const z = preparerZones([{ de: 10, a: 12 }, { de: 32, a: 34 }, { de: 290, a: 310 }, { de: 3, a: 2 }]);
    expect(z).toEqual([{ de: 10, a: 34 }, { de: 290, a: 310 }]);
    expect(preparerZones([{ de: 10, a: 12 }, { de: 12.5, a: 14 }, { de: 20, a: 21 }], 1)).toEqual([{ de: 10, a: 14 }, { de: 20, a: 21 }]);
    expect(zonesDeLaTranche(z, { de: 300, a: 600 })).toEqual([{ de: 300, a: 310 }]);
    expect(zonesDeLaTranche(z, { de: 600, a: 900 })).toEqual([]);
  });
});

describe('transcrireZones', () => {
  it("ne donne à Whisper que la parole ; une tranche sans parole est faite sans Whisper ; gain seulement si demandé", async () => {
    const { m, demandes } = moteur();
    const t = await transcrireZones(source(900), { moteur: m, zones: [{ de: 20, a: 25 }, { de: 40, a: 45 }, { de: 650, a: 660 }] });
    expect(demandes.map((d) => d.plages)).toEqual([[{ de: 20, a: 45 }], [{ de: 650, a: 660 }]]);
    expect(demandes.every((d) => d.gain === undefined)).toBe(true);
    memoire.clear();
    const g = moteur();
    await transcrireZones(source(900), { moteur: g.m, zones: [{ de: 20, a: 25 }], gain: true });
    expect(g.demandes.map((d) => d.gain)).toEqual([true]);
    expect(t.plages).toEqual([{ de: 0, a: 900 }]);
    expect(t.complete).toBe(true);
    expect(t.mots.map((x) => x[1])).toEqual([20.1, 650.1]);
  });

  it('reprend une transcription gardée (même faite par transcrireLongue) sans relancer Whisper', async () => {
    const a = moteur();
    await transcrireLongue(source(600), { moteur: a.m, plage: { de: 0, a: 300 } });
    expect(a.demandes.length).toBe(1);
    const b = moteur();
    const t = await transcrireZones(source(600), { moteur: b.m, zones: [{ de: 10, a: 20 }, { de: 400, a: 410 }] });
    expect(b.demandes.map((d) => d.plages)).toEqual([[{ de: 400, a: 410 }]]);
    // Les mots de la 1ʳᵉ tranche (toute la tranche, transcrireLongue) sont gardés.
    expect(t.mots.map((x) => x[1])).toEqual([0.1, 400.1]);
  });

  it("une tranche où Whisper plante (2 essais) est laissée de côté : l'analyse continue, complete = false", async () => {
    const { m, demandes } = moteur((d) => (d.plages[0]!.de >= 600 && d.plages[0]!.de < 900 ? new ErreurArko('Le module sous-titres n\'a pas pu démarrer.', 'module') : null));
    const t = await transcrireZones(source(1200), { moteur: m, zones: [{ de: 10, a: 20 }, { de: 310, a: 320 }, { de: 610, a: 620 }, { de: 910, a: 920 }] });
    expect(demandes.length).toBe(5);
    expect(t.complete).toBe(false);
    expect(t.mots.map((x) => x[1])).toEqual([10.1, 310.1, 910.1]);
    expect(t.plages).toEqual([{ de: 0, a: 600 }, { de: 900, a: 1200 }]);
  });

  it('transcrireLongue (chemin d’avant, relecture point 2) : une tranche qui plante LÈVE ; ce qui est fini reste, la reprise ne refait que la ratée', async () => {
    let casse = true;
    const { m, demandes } = moteur((d) => (casse && d.plages[0]!.de === 300 ? new Error('token_ids must be a non-empty array of integers.') : null));
    await expect(transcrireLongue(source(900), { moteur: m })).rejects.toThrow(/token_ids/);
    expect(demandes.map((d) => d.plages[0]!.de)).toEqual([0, 300, 300]);
    casse = false;
    const t = await transcrireLongue(source(900), { moteur: m });
    expect(demandes.slice(3).map((d) => d.plages[0]!.de)).toEqual([300, 600]);
    expect(t.mots.map((x) => x[1])).toEqual([0.1, 300.1, 600.1]);
    expect(t.complete).toBe(true);
  });

  it('lève si rien ne marche (module cassé), et tout de suite si on annule', async () => {
    const casse = moteur(() => new ErreurArko('Le module sous-titres n\'a pas pu démarrer.', 'module'));
    await expect(transcrireZones(source(1200), { moteur: casse.m, zones: [{ de: 10, a: 20 }, { de: 310, a: 320 }, { de: 610, a: 620 }] })).rejects.toThrow(/pas pu démarrer/);
    expect(casse.demandes.length).toBe(4);
    const annule = moteur(() => new ErreurArko('Sous-titres annulés.', 'annule'));
    await expect(transcrireZones(source(900), { moteur: annule.m, zones: [{ de: 10, a: 20 }, { de: 310, a: 320 }] })).rejects.toMatchObject({ code: 'annule' });
    expect(annule.demandes.length).toBe(1);
  });

  it('sans zones : toute la plage, comme transcrireLongue (sans gain) ; aucune parole : pas de module à charger', async () => {
    const { m, demandes } = moteur();
    await transcrireZones(source(400), { moteur: m });
    expect(demandes.map((d) => [d.plages, d.gain])).toEqual([[[{ de: 0, a: 300 }], undefined], [[{ de: 300, a: 400 }], undefined]]);
    memoire.clear();
    const vide = moteur();
    const t = await transcrireZones(source(400), { moteur: vide.m, zones: [{ de: 1000, a: 1010 }] });
    expect(vide.demandes.length).toBe(0);
    expect(vide.preparations()).toBe(0);
    expect(t.plages).toEqual([{ de: 0, a: 400 }]);
  });
});
