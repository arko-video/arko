// Tests du repli SANS modèle et de l'étape « parole » (dev-vad) : voix FABRIQUÉES (voix-test.ts) + bruit de jeu.
import { describe, expect, it } from 'vitest';
import { hasard } from '../../ia/synthese-test';
import type { Mot } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';
import type { ProbasVad } from '../types-v4';
import { AccumulateurEmpreintes } from '../voix/empreintes';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, VOIX_B } from '../voix/voix-test';
import { analyserChaine, etapesAvec, NOMS_ETAPES, reglagesBestOfV4 } from '../express/chaine-best-of';
import { detecterParoleV4 } from './parole';
import { paroleSansModele } from './sans-modele';

const DUREE = 90;
/** La parole occupe 0–60 s ; 60–90 s : le jeu seul (explosions, coups, pas). */
const FIN_PAROLE = 60;

/** Sons forts du jeu : bouffées de bruit de 0,3 à 0,8 s qui s'éteignent, ≈ −22 dBFS, toutes les 2 à 3 s. */
function sonsDuJeu(de: number, a: number, graine = 5): { x: Float32Array; plages: PlageTemps[] } {
  const r = hasard(graine);
  const x = new Float32Array(DUREE * FREQ_TEST);
  const plages: PlageTemps[] = [];
  for (let t = de; t < a - 1; t += 2 + r()) {
    const fin = t + 0.3 + 0.5 * r();
    plages.push({ de: t, a: fin });
    for (let i = Math.round(t * FREQ_TEST); i < Math.round(fin * FREQ_TEST); i++) {
      const u = (i / FREQ_TEST - t) / (fin - t);
      x[i] = 0.08 * (r() * 2 - 1) * Math.exp(-3 * u);
    }
  }
  return { x, plages };
}

function energieDe(x: Float32Array) {
  const acc = new AccumulateurEmpreintes(DUREE);
  for (let i = 0; i < x.length; i += 4096) acc.ajouter(x.subarray(i, i + 4096), FREQ_TEST, i / FREQ_TEST);
  return acc.resultat();
}

const duree = (z: readonly PlageTemps[]) => z.reduce((t, x) => t + x.a - x.de, 0);
function inter(a: readonly PlageTemps[], b: readonly PlageTemps[]): number {
  let t = 0;
  for (const x of a) for (const y of b) t += Math.max(0, Math.min(x.a, y.a) - Math.max(x.de, y.de));
  return t;
}

/** La session de Romain en petit : voix faible (−40 dB) et forte (−25 dB) qui alternent, jeu calme, puis sons forts. */
function session() {
  const tours = toursAlternes(FIN_PAROLE, 3);
  const a = fabriquerVoix(VOIX_A, tours.filter((t) => t.v === 0), DUREE, -40, 1);
  const b = fabriquerVoix(VOIX_B, tours.filter((t) => t.v === 1), DUREE, -25, 2);
  const jeu = sonsDuJeu(FIN_PAROLE + 1, DUREE);
  const x = mixer(a, b, bruitDeJeu(DUREE, -55), jeu.x);
  return { tours, energie: energieDe(x), jeu: jeu.plages };
}

const SIGNAUX: SignauxSource = { src: 's', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE / 0.02), pics: [], cris: [], rires: [], muets: [] };

describe('repli sans modèle : énergie de la bande voix + rythme des syllabes', () => {
  const s = session();
  const zones = paroleSansModele(s.energie, DUREE);

  it('trouve la voix faible ET la voix forte (≥ 85 % de leurs tours)', () => {
    const faibles = s.tours.filter((t) => t.v === 0);
    const fortes = s.tours.filter((t) => t.v === 1);
    expect(inter(zones, faibles) / duree(faibles)).toBeGreaterThan(0.85);
    expect(inter(zones, fortes) / duree(fortes)).toBeGreaterThan(0.85);
  });

  it('presque rien hors de la parole ; les sons forts du jeu ne sont pas pris pour de la voix', () => {
    const autour = s.tours.map((t) => ({ de: t.de - 0.2, a: t.a + 0.2 }));
    expect(1 - inter(zones, autour) / duree(zones)).toBeLessThan(0.1);
    expect(s.jeu.length).toBeGreaterThan(8);
    expect(inter(zones, s.jeu) / duree(s.jeu)).toBeLessThan(0.1);
  });

  it('une explosion collée à la fin d\'une phrase de la voix faible : la phrase est trouvée quand même', () => {
    const tours = [{ v: 0 as const, de: 2, a: 5 }];
    const voix = fabriquerVoix(VOIX_A, tours, DUREE, -40, 1);
    const boum = new Float32Array(DUREE * FREQ_TEST);
    for (let i = Math.round(5.05 * FREQ_TEST); i < Math.round(5.6 * FREQ_TEST); i++) boum[i] = 0.1 * Math.sin(i * 1.7) * Math.exp(-4 * (i / FREQ_TEST - 5.05));
    const z = paroleSansModele(energieDe(mixer(voix, boum, bruitDeJeu(DUREE, -55))), DUREE);
    expect(inter(z, tours) / 3).toBeGreaterThan(0.8);
  });

  it('zones triées, ≥ 0,25 s, dans la source', () => {
    for (const [i, z] of zones.entries()) {
      expect(z.a - z.de).toBeGreaterThanOrEqual(0.25);
      expect(z.de).toBeGreaterThanOrEqual(0);
      expect(z.a).toBeLessThanOrEqual(DUREE);
      if (i > 0) expect(z.de).toBeGreaterThanOrEqual(zones[i - 1]!.a);
    }
  });

  it('du bruit de jeu seul (même fort, continu) : aucune parole', () => {
    const x = mixer(bruitDeJeu(DUREE, -30, 4), bruitDeJeu(DUREE, -45, 7));
    expect(duree(paroleSansModele(energieDe(x), DUREE))).toBeLessThan(1);
  });
});

describe('étape « parole » (detecterParoleV4)', () => {
  const s = session();

  it('avec la VAD : segments de Silero (méthode « vad », probabilités gardées)', () => {
    const p = new Uint8Array(Math.ceil(DUREE / 0.032)).fill(5);
    for (const t of s.tours) for (let k = Math.ceil(t.de / 0.032); k < Math.floor(t.a / 0.032); k++) p[k] = 230;
    const vad: ProbasVad = { src: 's', pas: 0.032, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
    const r = detecterParoleV4({ src: 's', duree: DUREE, vad, energie: s.energie, signaux: SIGNAUX, mots: null });
    expect(r.methode).toBe('vad');
    expect(r.probas).toBe(vad);
    expect(r.segments.length).toBeGreaterThan(5);
    expect(inter(r.segments, s.tours) / duree(s.tours)).toBeGreaterThan(0.95);
  });

  it('sans VAD : le repli (méthode « sans-modele »), jamais les mots seuls quand l\'énergie existe', () => {
    const mots: Mot[] = [['salut', 59, 59.5]];
    const r = detecterParoleV4({ src: 's', duree: DUREE, vad: null, energie: s.energie, signaux: SIGNAUX, mots });
    expect(r.methode).toBe('sans-modele');
    expect(r.probas).toBeNull();
    expect(inter(r.segments, s.tours) / duree(s.tours)).toBeGreaterThan(0.85);
  });

  it('ni VAD ni énergie : les mots ± 0,05 s ; rien : aucune parole', () => {
    const mots: Mot[] = [['salut', 1, 1.5], ['', 2, 3], ['toi', 1.4, 2]];
    const r = detecterParoleV4({ src: 's', duree: DUREE, vad: null, energie: null, signaux: SIGNAUX, mots });
    expect(r.methode).toBe('mots');
    expect(r.segments).toEqual([{ de: 0.95, a: 2.05, p: 1 }]);
    const vide = detecterParoleV4({ src: 's', duree: DUREE, vad: null, energie: null, signaux: SIGNAUX, mots: null });
    expect(vide.segments).toEqual([]);
  });

  it('les passages muets (fin AFK) ne contiennent jamais de parole', () => {
    const p = new Uint8Array(Math.ceil(DUREE / 0.032)).fill(230);
    const vad: ProbasVad = { src: 's', pas: 0.032, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
    const r = detecterParoleV4({ src: 's', duree: DUREE, vad, energie: null, signaux: { ...SIGNAUX, muets: [{ de: 30, a: 50 }] }, mots: null });
    expect(r.segments).toEqual([{ de: 0, a: 30, p: expect.any(Number) }, { de: 50, a: DUREE, p: expect.any(Number) }]);
    expect(r.part).toBeCloseTo((DUREE - 20) / DUREE, 3);
  });
});

describe('étape « parole » dans la chaîne (les autres étapes : celles d\'avant)', () => {
  it('sans VAD ni Whisper (mode voix) : le repli donne des séquences sur la parole, méthode dite', () => {
    const s = session();
    const etapes = etapesAvec(NOMS_ETAPES.filter((n) => n !== 'parole'));
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const a = analyserChaine(
      {
        src: 's',
        duree: DUREE,
        signaux: SIGNAUX,
        empreintes: [s.energie],
        pistesSeparees: false,
        vad: null,
        hauteur: null,
        transcription: null,
        neurales: null,
        cadreBords: null,
        modules: { whisper: 'refuse', vad: 'erreur', empreinte: 'absent' },
        avertissements: [],
      },
      { ...express, dureeVisee: { min: 20, max: 40 } },
      bestOf,
      { etapes },
    );
    expect(a.paroleDetectee.methode).toBe('sans-modele');
    expect(a.parole).toBe('voix');
    expect(inter(a.morceaux, s.tours) / duree(s.tours)).toBeGreaterThan(0.85);
    // Les morceaux gardés sont la parole (pas les explosions de la fin).
    expect(inter(a.morceaux, s.jeu) / duree(s.jeu)).toBeLessThan(0.15);
    expect(a.scenes.some((x) => x.garde)).toBe(true);
  });
});
