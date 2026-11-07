// C. Derush (dev 1) : indices, note, protection, resserrer, choix du Best-of, passages pas retenus, session fabriquée.
import { describe, expect, it } from 'vitest';
import type { Mot, TourDeParole } from '../../recette/types';
import { choisirScenes, decouperScenes } from '../express/scenes';
import type { PlageSignal, SignauxSource } from '../types';
import type { IndicesScene, SceneNotee } from '../types-v3';
import { choisirBestOf, DERUSH_REGLES, noterScenes, resserrer } from './derush';
import { BONUS_PROTEGEE, echangesRapides, estProtegee, indicesScene, noterIndices, raisonIndices } from './notation';
import { sessionFabriquee } from './session-test';

const vide: IndicesScene = { duree: 60, rires: 0, fousRires: 0, cris: 0, pics: 0, picsApresCalme: 0, jurons: 0, motsForts: 0, echanges: 0, reactions: 0, mots: 0 };
const plage = (de: number, a: number, t: number, force = 0.5): PlageSignal => ({ de, a, t, force });
/** Signaux minimaux : enveloppe plate à −40 dB, et les événements donnés. */
function signaux(o: Partial<SignauxSource> = {}, duree = 600): SignauxSource {
  return { src: 's1', duree, pas: 0.02, rms: new Float32Array(duree * 50).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}
function bla(de: number, a: number): Mot[] {
  const res: Mot[] = [];
  for (let t = de; t + 0.3 <= a; t += 0.4) res.push(['bla', Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
  return res;
}

describe('notation : chaque indice', () => {
  it('rires, fous rires (force ≥ 0,7 ou ≥ 3 s), cris, pics, réactions (rire / cri ≤ 3 s après un pic)', () => {
    const s = signaux({
      rires: [plage(10, 11, 10.5, 0.4), plage(20, 23.5, 21, 0.4), plage(30, 31, 30.5, 0.9), plage(100, 101, 100.5)],
      cris: [plage(41, 42, 41.5)],
      pics: [{ ts: 40, db: -10, z: 8 }, { ts: 50, db: -10, z: 8 }],
    });
    const ind = indicesScene({ de: 0, a: 60 }, bla(0, 60), s);
    expect(ind).toMatchObject({ rires: 3, fousRires: 2, cris: 1, pics: 2, reactions: 1 });
    expect(ind.picsApresCalme).toBe(2); // l'enveloppe est plate à −40 dB et le pic monte à −10 dB
    expect(ind.duree).toBeGreaterThan(50);
  });

  it('jurons, mots forts, mots ; durée = la plage quand il n\'y a pas de mots', () => {
    const mots: Mot[] = [['putain', 1, 1.4], ['NON', 2, 2.3, 1], ['gg', 3, 3.2], ['bla', 4, 4.3]];
    const ind = indicesScene({ de: 0, a: 10 }, mots, null);
    expect(ind).toMatchObject({ jurons: 1, mots: 4 });
    expect(ind.motsForts).toBeGreaterThanOrEqual(2);
    expect(indicesScene({ de: 0, a: 30 }, [], null).duree).toBe(30);
  });

  it('échanges rapides : deux personnes à moins de 1,5 s (0 sans tours de parole)', () => {
    const tours: TourDeParole[] = [
      { ts: 0, fin: 2, p: 'p1' }, { ts: 2.5, fin: 4, p: 'p2' }, { ts: 4.2, fin: 6, p: 'p1' }, { ts: 9, fin: 10, p: 'p2' }, { ts: 10.5, fin: 12, p: 'p2' },
    ];
    expect(echangesRapides(tours, { de: 0, a: 20 })).toBe(2);
    expect(echangesRapides(tours, { de: 3, a: 20 })).toBe(1);
    expect(indicesScene({ de: 0, a: 20 }, [], null).echanges).toBe(0);
  });
});

describe('notation : note, protection, raison', () => {
  it('100 × (1 − e^(−x / 25)) par minute gardée, + 15 si protégée (borné à 100)', () => {
    expect(noterIndices(vide)).toBe(0);
    expect(noterIndices({ ...vide, rires: 3 })).toBe(Math.round(100 * (1 - Math.exp(-24 / 25))));
    expect(noterIndices({ ...vide, rires: 3, duree: 120 })).toBe(Math.round(100 * (1 - Math.exp(-12 / 25))));
    expect(noterIndices({ ...vide, pics: 50 })).toBe(noterIndices({ ...vide, pics: 20 }));
    const fou = { ...vide, rires: 1, fousRires: 1 };
    expect(estProtegee(fou)).toBe(true);
    expect(noterIndices(fou)).toBe(Math.round(100 * (1 - Math.exp(-20 / 25))) + BONUS_PROTEGEE);
    expect(noterIndices({ ...vide, rires: 40, fousRires: 10 })).toBe(100);
  });

  it('protégée : un fou rire, ou ≥ 6 échanges rapides par minute', () => {
    expect(estProtegee({ ...vide, echanges: 5 })).toBe(false);
    expect(estProtegee({ ...vide, echanges: 6 })).toBe(true);
    expect(estProtegee({ ...vide, duree: 180, echanges: 12 })).toBe(false);
  });

  it('raison : 3 éléments au plus, en français', () => {
    expect(raisonIndices({ ...vide, rires: 3, fousRires: 2, echanges: 7, pics: 3 })).toBe('2 fous rires · 1 rire · échanges rapides');
    expect(raisonIndices({ ...vide, pics: 3, picsApresCalme: 1 })).toBe('calme puis gros pic · 2 pics de son');
    expect(raisonIndices(vide)).toBe('De la parole');
  });
});

describe('resserrer une scène drôle mais longue', () => {
  // Scène de 300 s de parole continue, fous rires à 100 et 220 s, un cri à 160 s.
  const s = signaux({ rires: [plage(100, 103.5, 101, 0.9), plage(220, 223, 221, 0.9)], cris: [plage(160, 161.5, 160.5)] });
  const mots = [...bla(10, 99), ...bla(104, 219), ...bla(224, 310)];
  const e = { mots, signaux: s };
  const [scene] = noterScenes([{ de: 10, a: 310 }], e) as [SceneNotee];

  it('la scène est protégée (fou rire) et longue', () => {
    expect(scene.protegee).toBe(true);
    expect(scene.indices.duree).toBeGreaterThan(DERUSH_REGLES.resserrerAuDela);
  });

  it('chaque sous-moment avec sa mise en place (5 à 15 s) et sa chute (+2 s), fusionnés sous 3 s, ~ la cible', () => {
    const m = resserrer(scene, e, 75);
    expect(m.length).toBeGreaterThanOrEqual(1);
    const total = m.reduce((t, x) => t + (x.a - x.de), 0);
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(75 * 1.15 + 1);
    for (let i = 1; i < m.length; i++) expect(m[i]!.de - m[i - 1]!.a).toBeGreaterThanOrEqual(DERUSH_REGLES.fusion);
    // Le 1er fou rire (100 s) est gardé avec 5 à 15 s avant et 2 s après sa fin (103,5 s).
    const autour = m.find((x) => x.de <= 100 && x.a >= 103.5)!;
    expect(100 - autour.de).toBeGreaterThanOrEqual(5);
    expect(100 - autour.de).toBeLessThanOrEqual(15);
    expect(autour.a).toBeGreaterThanOrEqual(105.5);
  });

  it('choisirBestOf la garde resserrée ; ses morceaux enlevés deviennent des passages notés à part', () => {
    const { gardees, passages } = choisirBestOf([scene], e, 120);
    expect(gardees).toHaveLength(1);
    expect(gardees[0]!.morceaux!.length).toBeGreaterThanOrEqual(1);
    for (const p of passages) {
      expect(p.note).toBeGreaterThanOrEqual(DERUSH_REGLES.noteMinPassage);
      expect(gardees[0]!.morceaux!.some((x) => p.de < x.a && p.a > x.de)).toBe(false);
    }
  });
});

describe('choisirBestOf : durée visée, ordre, passages', () => {
  const s = signaux({ rires: [plage(30, 31, 30.5), plage(130, 131, 130.5), plage(131.5, 132.5, 132), plage(230, 231, 230.5)] }, 400);
  const mots = [...bla(0, 60), ...bla(100, 160), ...bla(200, 260), ...bla(300, 360)];
  const e = { mots, signaux: s };
  const notees = noterScenes([{ de: 0, a: 60 }, { de: 100, a: 160 }, { de: 200, a: 260 }, { de: 300, a: 360 }], e);

  it('les mieux notées jusqu\'à la durée visée, dans l\'ordre chronologique', () => {
    const { gardees } = choisirBestOf(notees, e, 120);
    expect(gardees.map((g) => g.de)).toEqual([0, 100]);
  });

  it('passages : les autres, note ≥ 20, triés par note décroissante, avec titre et source', () => {
    const { passages } = choisirBestOf(notees, e, 60);
    // La scène sans rire (300) vient en dernier : la parole seule vaut ~26 (150 mots par minute × 0,05).
    expect(passages.map((p) => p.de)).toEqual([0, 200, 300]);
    expect(passages[2]!.note).toBeLessThan(30);
    expect(passages[0]!.note).toBeGreaterThanOrEqual(passages[1]!.note);
    expect(passages[0]).toMatchObject({ src: 's1', titre: 'Passage à 0:00' });
  });
});

describe('session fabriquée de 30 min (mesure de la passation)', () => {
  const ses = sessionFabriquee();
  const e = { mots: ses.mots, signaux: ses.signaux, paroles: ses.paroles };
  const scenes = decouperScenes(ses.mots, ses.signaux);
  const dureeVisee = 180;
  const dedans = (t: number, p: { de: number; a: number }) => t >= p.de && t <= p.a;

  it('≥ 90 % des passages drôles plantés retrouvés (gardés, ou passages pas retenus notés ≥ 20)', () => {
    const { gardees, passages } = choisirBestOf(noterScenes(scenes, e), e, dureeVisee);
    const trouves = ses.plantes.filter((x) => gardees.some((g) => (g.morceaux ?? [g]).some((m) => dedans(x.t, m))) || passages.some((p) => p.note >= 20 && dedans(x.t, p)));
    // Avant (scenes.ts) : seulement les scènes gardées, rien d'autre n'était proposé.
    const avant = choisirScenes(scenes, ses.mots, ses.signaux, dureeVisee).filter((x) => x.garde);
    const trouvesAvant = ses.plantes.filter((x) => avant.some((g) => dedans(x.t, g)));
    console.info(`derush : ${trouves.length}/${ses.plantes.length} retrouvés (avant : ${trouvesAvant.length}/${ses.plantes.length}) ; ${passages.length} passages`);
    expect(trouves.length / ses.plantes.length).toBeGreaterThanOrEqual(0.9);
    // Plus exigeant : dans les gardées ou les 10 PREMIERS passages de la liste (triée par note).
    const enHaut = ses.plantes.filter((x) => gardees.some((g) => (g.morceaux ?? [g]).some((m) => dedans(x.t, m))) || passages.slice(0, 10).some((p) => dedans(x.t, p)));
    expect(enHaut.length / ses.plantes.length).toBeGreaterThanOrEqual(0.9);
  });
});
