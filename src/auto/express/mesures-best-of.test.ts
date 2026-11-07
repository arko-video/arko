// Tests de mesurerPourBestOf (dev-vad) : la lecture du son, la passe du son, Whisper et l'empreinte sont SIMULÉS
// (aucun Worker, aucun modèle, aucune donnée privée). Ce qu'on vérifie : un module absent ou refusé n'est JAMAIS
// téléchargé ni lancé ; le détecteur de voix (livré avec l'appli) passe sans accord sauf refus ; s'il ne charge pas :
// avertissement + modules.vad = 'erreur' ; Whisper n'écoute que les zones de parole ; annulation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import type { PlageTemps, SignauxSource, Transcription } from '../types';
import type { ModulesBestOf, ProbasVad } from '../types-v4';
import type { OptionsPasseSon, SonMesure } from '../vad/passe-son';

const DUREE = 600;
const SIGNAUX: SignauxSource = { src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE / 0.02).fill(0.01), pics: [], cris: [], rires: [], muets: [] };
/** Parole de 10 à 40 s et de 100 à 130 s. */
const PAROLE: PlageTemps[] = [{ de: 10, a: 40 }, { de: 100, a: 130 }];

function vad(): ProbasVad {
  const p = new Uint8Array(Math.ceil(DUREE / 0.032)).fill(5);
  for (const z of PAROLE) p.fill(230, Math.ceil(z.de / 0.032), Math.floor(z.a / 0.032));
  return { src: 's1', pas: 0.032, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
}

function empreintes() {
  const n = DUREE / 0.02;
  const db = new Float32Array(n).fill(-80);
  for (const z of PAROLE) db.fill(-30, z.de / 0.02, z.a / 0.02);
  return { pas: 0.02, duree: DUREE, db, bandes: new Float32Array(n * 8).fill(-40) };
}

let passe: 'ok' | 'sansVad' | 'annule' = 'ok';
const appelsPasse: OptionsPasseSon[] = [];
const transcrire = vi.fn(async (_s: SourceOuverte, o: { zones?: readonly PlageTemps[] }): Promise<Transcription> => ({
  src: 's1',
  mots: (o.zones ?? []).map((z) => ['salut', z.de + 0.3, z.de + 0.7] as [string, number, number]),
  plages: [{ de: 0, a: DUREE }],
  complete: true,
}));
const empreinteNeurale = vi.fn(async () => ({ modele: 'campplus-zh-en', morceaux: [] }));

vi.mock('../signaux-source', () => ({ lireSignauxSource: async () => SIGNAUX }));
vi.mock('../vad/passe-son', () => ({
  mesurerSonBestOf: async (_s: SourceOuverte, o: OptionsPasseSon): Promise<SonMesure> => {
    appelsPasse.push(o);
    if (passe === 'annule') throw new ErreurArko('Analyse annulée.', 'annule');
    const ok = o.vad && passe === 'ok';
    return { empreintes: [empreintes()], vad: ok ? vad() : null, hauteur: null, avertissements: o.vad && !ok ? ['Le détecteur de voix ne s\'est pas chargé.'] : [] };
  },
}));
vi.mock('../../sous-titres/transcription-zones', () => ({ transcrireZones: (s: SourceOuverte, o: { zones?: readonly PlageTemps[] }) => transcrire(s, o) }));
vi.mock('../voix/client-empreintes', () => ({ calculerEmpreintesNeurales: () => empreinteNeurale() }));

const { mesurerPourBestOf, vadUtilisable } = await import('./mesures-best-of');
const { reglagesBestOfV4 } = await import('./chaine-best-of');

const source = { infos: { id: 's1', emp: 'e1', duree: DUREE, nom: 'v.mp4', taille: 1, type: 'video' }, verticale: false, fichier: new Blob() } as unknown as SourceOuverte;
const { express, bestOf } = reglagesBestOfV4('youtube');
const reg = { ...express, bords: false };
const mesurer = (modules: ModulesBestOf, o: { signal?: AbortSignal } = {}) => mesurerPourBestOf(source, reg, bestOf, { modules, ...o });

beforeEach(() => {
  passe = 'ok';
  appelsPasse.length = 0;
  transcrire.mockClear();
  empreinteNeurale.mockClear();
});

describe('mesurerPourBestOf', () => {
  it('tout est là : VAD, Whisper sur les zones de parole SEULEMENT, pas d\'empreinte (absente)', async () => {
    const m = await mesurer({ whisper: 'present', vad: 'present', empreinte: 'absent' });
    expect(appelsPasse[0]).toMatchObject({ vad: true, hauteur: true });
    expect(m.vad).not.toBeNull();
    expect(m.modules).toEqual({ whisper: 'present', vad: 'present', empreinte: 'absent' });
    expect(transcrire).toHaveBeenCalledTimes(1);
    const zones = transcrire.mock.calls[0]![1].zones!;
    expect(zones.length).toBe(2);
    expect(zones.reduce((t, z) => t + z.a - z.de, 0)).toBeLessThan(80);
    expect(zones.every((z) => PAROLE.some((p) => z.de >= p.de - 1 && z.a <= p.a + 1))).toBe(true);
    expect(m.transcription?.mots.length).toBe(2);
    expect(empreinteNeurale).not.toHaveBeenCalled();
  });

  it('Whisper absent ou refusé : jamais lancé (donc jamais téléchargé), et le manque est dit', async () => {
    for (const whisper of ['absent', 'refuse'] as const) {
      const m = await mesurer({ whisper, vad: 'present', empreinte: 'absent' });
      expect(m.transcription).toBeNull();
      expect(m.modules.whisper).toBe(whisper);
      expect(m.avertissements.length).toBeGreaterThan(0);
    }
    expect(transcrire).not.toHaveBeenCalled();
  });

  it('le détecteur de voix est livré avec l\'appli : il passe même « absent » ; jamais s\'il est refusé', async () => {
    expect(vadUtilisable('absent')).toBe(true);
    expect(vadUtilisable('horsLigne')).toBe(true);
    expect(vadUtilisable('erreur')).toBe(true);
    expect(vadUtilisable('refuse')).toBe(false);
    const m = await mesurer({ whisper: 'absent', vad: 'absent', empreinte: 'absent' });
    expect(appelsPasse[0]!.vad).toBe(true);
    expect(m.modules.vad).toBe('present');
    const r = await mesurer({ whisper: 'absent', vad: 'refuse', empreinte: 'absent' });
    expect(appelsPasse[1]!.vad).toBe(false);
    expect(r.vad).toBeNull();
    expect(r.modules.vad).toBe('refuse');
  });

  it('le détecteur de voix ne charge pas : avertissement, modules.vad = « erreur », l\'analyse continue', async () => {
    passe = 'sansVad';
    const m = await mesurer({ whisper: 'present', vad: 'present', empreinte: 'absent' });
    expect(m.vad).toBeNull();
    expect(m.modules.vad).toBe('erreur');
    expect(m.avertissements.some((a) => a.includes('détecteur de voix'))).toBe(true);
    expect(m.empreintes.length).toBe(1);
    // Relecture point 6 : sans détecteur de voix, Whisper écoute TOUTE la source (le repli rate la voix faible).
    expect(transcrire).toHaveBeenCalledTimes(1);
    expect(transcrire.mock.calls[0]![1].zones).toBeUndefined();
  });

  it('une partie que Whisper n\'a pas pu écrire : l\'avertissement le dit, avec les temps (relecture point 2)', async () => {
    transcrire.mockResolvedValueOnce({ src: 's1', mots: [['salut', 10, 10.4]], plages: [{ de: 0, a: 30 }, { de: 60, a: DUREE }], complete: false });
    const m = await mesurer({ whisper: 'present', vad: 'present', empreinte: 'absent' });
    expect(m.avertissements.some((a) => a.includes('0:30–1:00') && a.includes('refais l\'analyse'))).toBe(true);
  });

  it('annulation : ErreurArko « annule », rien d\'autre n\'est lancé', async () => {
    passe = 'annule';
    await expect(mesurer({ whisper: 'present', vad: 'present', empreinte: 'absent' })).rejects.toSatisfy((e: unknown) => e instanceof ErreurArko && e.code === 'annule');
    expect(transcrire).not.toHaveBeenCalled();
    passe = 'ok';
    const ctl = new AbortController();
    ctl.abort();
    await expect(mesurer({ whisper: 'present', vad: 'present', empreinte: 'absent' }, { signal: ctl.signal })).rejects.toSatisfy((e: unknown) => e instanceof ErreurArko && e.code === 'annule');
    expect(transcrire).not.toHaveBeenCalled();
  });
});
