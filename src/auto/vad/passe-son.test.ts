// Tests de la passe du son v4 (dev-vad) : Worker « Qui parle » SIMULÉ (même protocole que worker-voix.ts) et
// IndexedDB simulée (idb-keyval) : demande v4 / ancienne demande, résultat, mesures gardées, reprise, annulation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import type { DemandeEmpreintes, DepuisWorkerEmpreintes } from '../voix/worker-voix';

const magasin = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => magasin.get(k),
  set: async (k: string, v: unknown) => void magasin.set(k, v),
  del: async (k: string) => void magasin.delete(k),
}));

const { mesurerSonBestOf } = await import('./passe-son');
const { relireMesures } = await import('./gardees');
const { mesurerPistes } = await import('../voix/mesures-voix');
const { TEXTES_VAD } = await import('./textes-vad');

const DUREE = 10;
const source = { infos: { id: 's1', emp: 'emp-1', duree: DUREE, nom: 'v.mp4', taille: 1, type: 'video' }, verticale: false, fichier: new Blob() } as unknown as SourceOuverte;

/** Ce que le faux Worker répond. */
let reponse: 'ok' | 'vadImpossible' | 'jamais' = 'ok';
let demandes: DemandeEmpreintes[] = [];
let termines = 0;

class FauxWorker {
  onmessage: ((ev: { data: DepuisWorkerEmpreintes }) => void) | null = null;
  onerror: ((ev: { preventDefault(): void }) => void) | null = null;
  constructor(
    readonly url: URL,
    readonly o: { name?: string },
  ) {}
  postMessage(d: DemandeEmpreintes) {
    demandes.push(d);
    if (reponse === 'jamais') return;
    setTimeout(() => {
      this.onmessage?.({ data: { type: 'progression', p: 0.5, fait: 5 } });
      const n = DUREE / 0.02;
      const resultats = d.pistes.map((piste) => ({ piste, nom: null, pas: 0.02, duree: DUREE, db: new Float32Array(n).fill(-30), bandes: new Float32Array(n * 8).fill(-40) }));
      const fini: DepuisWorkerEmpreintes = { type: 'fini', resultats };
      if (d.vad) fini.vad = reponse === 'vadImpossible' ? null : { pas: 0.032, p: new Uint8Array(Math.ceil(DUREE / 0.032)).fill(200), plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
      if (d.hauteur) fini.hauteur = { pas: 0.02, f0: new Float32Array(n).fill(150) };
      if (reponse === 'vadImpossible') fini.avertissement = TEXTES_VAD.pasCharge;
      this.onmessage?.({ data: fini });
    }, 1);
  }
  terminate() {
    termines++;
  }
}

beforeEach(() => {
  magasin.clear();
  demandes = [];
  termines = 0;
  reponse = 'ok';
  vi.stubGlobal('Worker', FauxWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('passe du son v4', () => {
  it('une seule lecture : empreintes + VAD + hauteur ; la VAD reçoit l\'id de la source', async () => {
    const messages: string[] = [];
    const r = await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true, surProgression: (_, m) => messages.push(m) });
    expect(demandes.length).toBe(1);
    expect(demandes[0]).toMatchObject({ pistes: [null], vad: true, hauteur: true, de: 0, a: DUREE });
    expect(r.empreintes.length).toBe(1);
    expect(r.vad).toMatchObject({ src: 's1', pas: 0.032, modele: 'silero-vad-v5' });
    expect(r.hauteur?.f0.length).toBe(DUREE / 0.02);
    expect(r.avertissements).toEqual([]);
    expect(messages[0]).toMatch(/J'écoute les voix/);
    expect(termines).toBe(1);
  });

  it('l\'ancienne demande (mesurerPistes) reste l\'ancienne : ni vad ni hauteur', async () => {
    const e = await mesurerPistes(source, [null]);
    expect(e.length).toBe(1);
    expect('vad' in demandes[0]!).toBe(false);
    expect('hauteur' in demandes[0]!).toBe(false);
  });

  it('modèle qui ne charge pas : vad null + avertissement, les empreintes sont là', async () => {
    reponse = 'vadImpossible';
    const r = await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true });
    expect(r.vad).toBeNull();
    expect(r.empreintes.length).toBe(1);
    expect(r.avertissements).toEqual([TEXTES_VAD.pasCharge]);
  });

  it('mesures gardées : la 2ᵉ analyse ne relit pas le son ; Habiller les relit (VAD + énergie + hauteur)', async () => {
    const a = await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true });
    const b = await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true });
    expect(demandes.length).toBe(1);
    expect(Array.from(b.vad!.p)).toEqual(Array.from(a.vad!.p));
    expect(b.vad!.src).toBe('s1');
    expect(b.empreintes[0]!.bandes.length).toBe(a.empreintes[0]!.bandes.length);
    const g = await relireMesures('emp-1');
    expect(g).toMatchObject({ v: 1, energie: { pas: 0.02 }, hauteur: { pas: 0.02 }, vad: { pas: 0.032 } });
    // Autres pistes : refaite.
    await mesurerSonBestOf(source, { pistes: [0, 1], vad: true, hauteur: true });
    expect(demandes.length).toBe(2);
  });

  it('une passe gardée SANS la VAD (modèle pas chargé) est refaite pour l\'avoir', async () => {
    reponse = 'vadImpossible';
    await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true });
    reponse = 'ok';
    const r = await mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true });
    expect(demandes.length).toBe(2);
    expect(r.vad).not.toBeNull();
    // VAD refusée : la passe gardée sert, sans la VAD.
    const s = await mesurerSonBestOf(source, { pistes: [], vad: false, hauteur: true });
    expect(demandes.length).toBe(2);
    expect(s.vad).toBeNull();
  });

  it('annulation : le Worker est arrêté net, erreur « annule »', async () => {
    reponse = 'jamais';
    const ctl = new AbortController();
    const p = mesurerSonBestOf(source, { pistes: [], vad: true, hauteur: true, signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 5));
    ctl.abort();
    await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ErreurArko && e.code === 'annule');
    expect(termines).toBe(1);
  });
});
