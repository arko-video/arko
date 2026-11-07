// Montage FABRIQUÉ pour les tests de l'habillage v4 (dev-habillage) : des séquences de répliques inventées (aucun mot
// d'une vraie session), coupées en morceaux comme le Best-of (trou > 1,1 s entre deux répliques = coupe, marges de la
// DA), des signaux plats. Rien ici ne lit un fichier, un modèle ou ffmpeg.

import { definirSousTitres } from '../../recette/operations';
import { normaliserRecette } from '../../recette/normaliser';
import { SOUS_TITRES } from '../../recette/defauts';
import type { Mot, Recette, Sec, Source, TourDeParole } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';
import type { EntreeHabillage, MomentV4, SequenceV4 } from '../types-v4';
import { motFictif } from '../derush/session-test';


export const SOURCE_TEST: Source = { id: 's1', nom: 'partie.mp4', taille: 1, emp: 'e', duree: 1200, type: 'video', l: 1920, h: 1080 };

export function signauxTest(duree: Sec = SOURCE_TEST.duree, o: Partial<SignauxSource> = {}): SignauxSource {
  const n = Math.round(duree / 0.02);
  return { src: SOURCE_TEST.id, duree, pas: 0.02, rms: new Float32Array(n).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}

/**
 * Une réplique : `n` mots de 0,3 s séparés de 0,1 s, à partir de `t`. Rend les mots et la fin. Mots inventés, tous
 * différents dans une même liste (motFictif : une suite répétée serait une boucle de Whisper, « douteuse »).
 */
export function replique(t: Sec, n: number, k0 = 0, mots: Mot[] = []): Sec {
  let x = t;
  for (let i = 0; i < n; i++) {
    mots.push([motFictif(mots.length + 1000 * k0), Math.round(x * 100) / 100, Math.round((x + 0.3) * 100) / 100]);
    x += 0.4;
  }
  return Math.round((x - 0.1) * 100) / 100;
}

export interface MontageTest {
  recette: Recette;
  mots: Mot[];
  sequences: SequenceV4[];
  tours: TourDeParole[];
  morceaux: PlageTemps[];
}

/**
 * `nSeq` séquences de 60 s (une toutes les 100 s). Dans chacune : des répliques de 3 à 9 mots, deux personnes qui
 * alternent (p1, p2), 0,8 s entre deux répliques (gardé dans le morceau) et 1,6 s toutes les 3 répliques (coupé).
 */
export function montageTest(nSeq = 5, o: { mots?: boolean } = {}): MontageTest {
  const mots: Mot[] = [];
  const tours: TourDeParole[] = [];
  const morceaux: PlageTemps[] = [];
  const sequences: SequenceV4[] = [];
  for (let s = 0; s < nSeq; s++) {
    const de = 10 + s * 100;
    const a = de + 60;
    let t = de + 1;
    let r = 0;
    let debutMorceau = t - 0.25;
    while (t < a - 5) {
      const n = 3 + ((s * 7 + r * 5) % 7);
      const avant = mots.length;
      const fin = replique(t, n, s + r, mots);
      tours.push({ ts: mots[avant]![1], fin, p: r % 2 === 0 ? 'p1' : 'p2' });
      r++;
      const trou = r % 3 === 0 ? 1.6 : 0.8;
      if (trou > 1.1 || fin + trou >= a - 5) {
        morceaux.push({ de: Math.round(debutMorceau * 100) / 100, a: Math.round((fin + 0.35) * 100) / 100 });
        debutMorceau = fin + trou - 0.25;
      }
      t = fin + trou;
    }
    sequences.push({ de, a, titre: `Séquence ${s + 1}`, raison: 'test', score: 50, garde: true, duree: 40, protegee: false, coeur: { de: de + 20, a: de + 22 }, noteBrute: 1 + s, centile: 20 * s, bloc: 0, moments: [] });
  }
  let recette = normaliserRecette({ plans: morceaux.map((m) => ({ de: m.de, a: m.a })), destination: 'youtube' }, { sources: [SOURCE_TEST] });
  if (o.mots !== false) recette = definirSousTitres(recette, { style: SOUS_TITRES.style, parLigne: SOUS_TITRES.parLigne, mots, src: SOURCE_TEST.id });
  return { recette, mots, sequences, tours, morceaux };
}

/** L'entrée de habillerV4 pour ce montage (mode mots, tout coché sauf les titres, comme le Best-of d'office). */
export function entreeTest(m: MontageTest, o: Partial<EntreeHabillage> & { momentsV4?: MomentV4[] } = {}): EntreeHabillage {
  const { momentsV4, ...reste } = o;
  return {
    src: SOURCE_TEST.id,
    mots: m.mots,
    moments: momentsV4 ?? [],
    signaux: signauxTest(),
    sequences: m.sequences,
    voix: {
      src: SOURCE_TEST.id,
      methode: 'niveau+timbre',
      voix: [
        { id: 'p1', nom: 'Voix 1', niveauDb: -25, part: 0.5 },
        { id: 'p2', nom: 'Voix 2', niveauDb: -40, part: 0.5 },
      ],
      tours: m.tours,
      sure: 1,
      separation: { par: 'niveau', seuilDb: -32, ecartDb: 15, cosinusCentres: null, ambigu: 0, morceaux: m.tours.length, proposerEmpreinte: null },
    } as unknown as EntreeHabillage['voix'],
    punchlines: true,
    zooms: 'normal',
    accroche: true,
    titres: false,
    ...reste,
  };
}

/** Un moment v4 fabriqué. */
export const moment = (genre: MomentV4['genre'], de: Sec, a: Sec, force: number): MomentV4 => ({ genre, de, a, t: (de + a) / 2, force, indices: ['test'] });
