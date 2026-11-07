// Musique de fond fabriquée par Arko (CC0) : un petit compositeur DÉTERMINISTE (graine) de musique « gaming » légère,
// dans l'esprit des morceaux de fond des vidéos de jeu (pizzicato, basse qui marche, petites percussions), en 4
// ambiances : joyeux-malin, enquête, rigolo-bondissant, fin calme. Une boucle de 16 mesures (forme A A B A, 4 accords
// par phrase) qui se rejoue SANS clic : les queues des notes et de la réverbération sont repliées au début.
// Rendu une fois en PCM (quelques centaines de ms), puis enregistré en WAV et traité comme n'importe quel morceau
// (même voie pour l'aperçu et l'export). JavaScript pur : rien ne dépend du navigateur.

import { filtreK } from '../../moteur/audio/sonie';
import { mulberry32 } from '../synthese/briques';
import {
  basse,
  biquad,
  corde,
  filtrerEnBoucle,
  limiterEnBoucle,
  maillet,
  percu,
  replier,
  reverberer,
  type TypeBasse,
  type TypeMaillet,
  type TypePercu,
} from './instruments';

/** Les 4 ambiances (joyeux-malin, enquête-tension, rigolo-bondissant, fin-calme). */
export type Ambiance = 'joyeux' | 'enquete' | 'rigolo' | 'calme';
export const AMBIANCES: readonly Ambiance[] = ['joyeux', 'enquete', 'rigolo', 'calme'];

/** Fréquence du rendu (les aigus s'arrêtent vers 9 kHz : 32 kHz suffit), sonie visée (comme les morceaux de Kevin MacLeod d'Arko), crête. */
export const MUSIQUE_ARKO = { frequence: 32000, mesures: 16, lufs: -17, plafond: 0.84, queue: 3 } as const;

/** Noms affichés (français simple). */
export const NOMS_AMBIANCES: Record<Ambiance, string> = { joyeux: 'Joyeux malin', enquete: 'Enquête', rigolo: 'Rigolo', calme: 'Fin calme' };

export interface MusiqueFabriquee {
  ambiance: Ambiance;
  graine: number;
  bpm: number;
  frequence: number;
  /** [gauche, droite], une boucle exacte de 16 mesures. */
  canaux: [Float32Array, Float32Array];
  duree: number;
}

/* ------------------------------------------------------------------ théorie */

type Mode = 'majeur' | 'mineur';
const GAMMES: Record<Mode, number[]> = { majeur: [0, 2, 4, 5, 7, 9, 11], mineur: [0, 2, 3, 5, 7, 8, 10] };
const versHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Notes (classes de hauteur 0-11) de l'accord de degré `d` (0 = I) ; en mineur, le V est majeur (sensible). */
function accord(d: number, mode: Mode, tonique: number): { fond: number; notes: number[] } {
  const g = GAMMES[mode];
  const deg = (k: number) => {
    const i = ((d + k) % 7 + 7) % 7;
    let pc = g[i]!;
    if (mode === 'mineur' && d === 4 && i === 6) pc = 11; // sensible
    return (pc + tonique) % 12;
  };
  return { fond: deg(0), notes: [deg(0), deg(2), deg(4)] };
}

/** Hauteurs MIDI de la gamme entre `bas` et `haut`. */
function notesGamme(mode: Mode, tonique: number, bas: number, haut: number): number[] {
  const g = GAMMES[mode].map((x) => (x + tonique) % 12);
  const res: number[] = [];
  for (let m = bas; m <= haut; m++) if (g.includes(m % 12)) res.push(m);
  return res;
}

const dansAccord = (m: number, notes: readonly number[]) => notes.includes(((m % 12) + 12) % 12);

/* ------------------------------------------------------------------ styles */

/** Rythme d'une mesure : [début, longueur] en doubles-croches (16 par mesure). */
type Rythme = [number, number][];

interface Style {
  bpm: [number, number];
  /** 0 = droit, 1 = ternaire complet (sur les croches du contretemps). */
  swing: number;
  mode: Mode;
  toniques: number[];
  /** Progressions de 4 accords (degrés 0 = I). Le 1er accord de A est toujours I ; la boucle finit sur V. */
  phrasesA: number[][];
  phrasesB: number[][];
  melodie: { instrument: 'corde' | TypeMaillet; bas: number; haut: number; rythmes: Rythme[]; cadence: Rythme; relance: Rythme; tenue: number; sauts: number; repetitions: number; brillance: number };
  basse: TypeBasse;
}

const STYLES: Record<Ambiance, Style> = {
  joyeux: {
    bpm: [108, 116],
    swing: 0.28,
    mode: 'majeur',
    toniques: [0, 2, 5, 7],
    phrasesA: [[0, 5, 3, 4], [0, 3, 1, 4], [0, 2, 3, 4]],
    phrasesB: [[3, 4, 2, 5], [3, 3, 0, 0], [5, 1, 4, 4]],
    melodie: {
      instrument: 'corde',
      bas: 67,
      haut: 84,
      rythmes: [
        [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]],
        [[0, 3], [6, 2], [8, 4], [14, 2]],
        [[2, 2], [4, 2], [6, 2], [8, 6]],
        [[0, 3], [4, 1], [6, 2], [8, 6]],
        [[0, 4], [6, 2], [8, 2], [12, 4]],
      ],
      cadence: [[0, 4], [4, 4], [8, 8]],
      relance: [[0, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
      tenue: 0.55,
      sauts: 0.25,
      repetitions: 0.15,
      brillance: 0.38,
    },
    basse: 'pizz',
  },
  enquete: {
    bpm: [96, 104],
    swing: 0.5,
    mode: 'mineur',
    toniques: [9, 2, 4, 7],
    phrasesA: [[0, 3, 4, 4], [0, 5, 3, 4], [0, 6, 5, 4], [0, 0, 3, 4]],
    phrasesB: [[5, 5, 0, 0], [3, 3, 0, 4], [5, 6, 0, 4]],
    melodie: {
      instrument: 'marimba',
      bas: 64,
      haut: 81,
      rythmes: [
        [[0, 1], [3, 1], [6, 2], [12, 2]],
        [[2, 1], [4, 1], [6, 1], [8, 4]],
        [[0, 2], [8, 1], [10, 1], [12, 4]],
        [[0, 6], [10, 2], [14, 2]],
      ],
      cadence: [[0, 2], [4, 2], [8, 8]],
      relance: [[0, 2], [6, 2], [10, 2], [12, 2], [14, 2]],
      tenue: 0.5,
      sauts: 0.15,
      repetitions: 0.25,
      brillance: 0.4,
    },
    basse: 'pizz',
  },
  rigolo: {
    bpm: [118, 125],
    swing: 0,
    mode: 'majeur',
    toniques: [0, 5, 7, 10],
    phrasesA: [[0, 0, 4, 4], [0, 3, 4, 4], [0, 3, 0, 4]],
    phrasesB: [[3, 3, 0, 0], [3, 0, 4, 4], [5, 1, 4, 4]],
    melodie: {
      instrument: 'xylophone',
      bas: 69,
      haut: 86,
      rythmes: [
        [[0, 2], [2, 2], [4, 2], [8, 2], [12, 2]],
        [[0, 1], [2, 1], [4, 2], [8, 1], [10, 1], [12, 4]],
        [[0, 2], [4, 2], [6, 1], [7, 1], [8, 4]],
        [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
      ],
      cadence: [[0, 2], [2, 2], [4, 2], [8, 8]],
      relance: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [12, 1], [13, 1], [14, 2]],
      tenue: 0.35,
      sauts: 0.45,
      repetitions: 0.3,
      brillance: 0.5,
    },
    basse: 'tuba',
  },
  calme: {
    bpm: [95, 100],
    swing: 0,
    mode: 'majeur',
    toniques: [0, 2, 5, 7],
    phrasesA: [[0, 5, 3, 4], [0, 2, 3, 4], [0, 3, 0, 4]],
    phrasesB: [[3, 4, 2, 5], [5, 3, 0, 4], [3, 0, 1, 4]],
    melodie: {
      instrument: 'celesta',
      bas: 69,
      haut: 86,
      rythmes: [
        [[0, 8], [8, 4], [12, 4]],
        [[0, 4], [4, 4], [8, 8]],
        [[0, 6], [6, 2], [8, 8]],
        [[4, 4], [8, 4], [12, 4]],
      ],
      cadence: [[0, 16]],
      relance: [[4, 4], [8, 4], [12, 4]],
      tenue: 0.9,
      sauts: 0.2,
      repetitions: 0.1,
      brillance: 0.3,
    },
    basse: 'douce',
  },
};

/* ------------------------------------------------------------------ événements */

type Voix = 'melodie' | 'accords' | 'arpege' | 'basse' | TypePercu;

interface Note {
  voix: Voix;
  /** Position en doubles-croches depuis le début de la boucle (peut être fractionnaire : swing). */
  pas: number;
  /** Longueur en doubles-croches. */
  longueur: number;
  midi: number;
  vel: number;
}

/** Niveau, panoramique (−1 gauche, +1 droite) et envoi vers la réverbération de chaque voix. */
const MIXAGE: Record<Voix, { gain: number; pan: number; reverb: number }> = {
  melodie: { gain: 0.46, pan: 0.18, reverb: 0.3 },
  accords: { gain: 0.28, pan: -0.25, reverb: 0.25 },
  arpege: { gain: 0.34, pan: -0.3, reverb: 0.3 },
  basse: { gain: 0.42, pan: 0, reverb: 0.05 },
  'grosse-caisse': { gain: 0.15, pan: 0, reverb: 0.02 },
  shaker: { gain: 0.18, pan: 0.35, reverb: 0.1 },
  claquement: { gain: 0.45, pan: 0.12, reverb: 0.18 },
  balai: { gain: 0.12, pan: -0.12, reverb: 0.1 },
  bois: { gain: 0.22, pan: 0.32, reverb: 0.12 },
};
/**
 * Réglages du mixage par ambiance (mesurés voix par voix : mélodie et basse au même niveau, accords ~5 dB dessous,
 * percussions 15 à 25 dB dessous). La basse douce est presque un sinus : moins forte, sinon elle couvre l'arpège.
 */
const NIVEAUX: Record<Ambiance, Partial<Record<Voix, number>>> = {
  joyeux: { basse: 0.6 },
  enquete: { melodie: 0.7, accords: 1.5, basse: 0.75 },
  rigolo: { accords: 1.1, basse: 0.85 },
  calme: { melodie: 0.6, basse: 0.5 },
};

const VOIX_INDICE: Record<Voix, number> = { melodie: 1, accords: 2, arpege: 3, basse: 4, 'grosse-caisse': 5, shaker: 6, claquement: 7, balai: 8, bois: 9 };

/** Choix pondéré déterministe. */
function tirer<T>(hasard: () => number, choix: readonly T[], poids?: readonly number[]): T {
  if (!poids) return choix[Math.floor(hasard() * choix.length) % choix.length]!;
  const total = poids.reduce((a, b) => a + b, 0);
  let x = hasard() * total;
  for (let i = 0; i < choix.length; i++) {
    x -= poids[i]!;
    if (x <= 0) return choix[i]!;
  }
  return choix[choix.length - 1]!;
}

/** Les 16 accords de la boucle (A A B A) ; la dernière mesure est le V (elle ramène au I du début). */
function grille(style: Style, hasard: () => number): number[] {
  const a = tirer(hasard, style.phrasesA);
  const b = tirer(hasard, style.phrasesB);
  const g = [...a, ...a, ...b, ...a];
  g[15] = 4;
  return g;
}

/** Mélodie d'une phrase de 4 mesures, collée aux accords (notes de l'accord sur les temps forts). */
function phraseMelodie(style: Style, rythmes: Rythme[], accords: { notes: number[] }[], gamme: number[], depart: number, hasard: () => number): { notes: Note[]; derniere: number } {
  const m = style.melodie;
  const notes: Note[] = [];
  let prec = depart;
  rythmes.forEach((rythme, mesure) => {
    const acc = accords[mesure]!.notes;
    rythme.forEach(([debut, longueur], k) => {
      const fort = debut % 8 === 0 || longueur >= 4 || k === rythme.length - 1;
      // Temps fort : une note de l'accord. Ailleurs : une note de la gamme, mais jamais à un demi-ton d'une note de
      // l'accord (c'est ce frottement qui sonne « faux » dans une musique de fond).
      const frotte = (x: number) => acc.some((c) => ((x - c) % 12 + 12) % 12 === 1 || ((x - c) % 12 + 12) % 12 === 11);
      const candidats = gamme.filter((x) => (fort ? dansAccord(x, acc) : !frotte(x)) && Math.abs(x - prec) <= 9);
      const liste = candidats.length > 0 ? candidats : gamme.filter((x) => dansAccord(x, acc));
      const poids = liste.map((x) => {
        const ecart = Math.abs(x - prec);
        if (ecart === 0) return m.repetitions;
        if (ecart <= 2) return 1;
        if (ecart <= 4) return 0.55 + m.sauts;
        return m.sauts * (ecart <= 7 ? 0.8 : 0.3);
      });
      const h = tirer(hasard, liste, poids);
      notes.push({ voix: 'melodie', pas: mesure * 16 + debut, longueur, midi: h, vel: (fort ? 0.85 : 0.7) + 0.1 * hasard() });
      prec = h;
    });
  });
  return { notes, derniere: prec };
}

/** Accord placé près du précédent (le moins de mouvement possible entre deux accords). */
function voicing(notes: number[], prec: number[] | null, bas: number, haut: number): number[] {
  const options: number[][] = [];
  for (let base = bas; base <= haut - 7; base++) {
    if (!notes.includes(base % 12)) continue;
    const v = [base];
    for (let m = base + 1; m <= haut && v.length < 3; m++) if (notes.includes(m % 12) && !v.some((x) => x % 12 === m % 12)) v.push(m);
    if (v.length === 3) options.push(v);
  }
  if (!prec || options.length === 0) return options[Math.floor(options.length / 2)] ?? notes.map((n) => 60 + n);
  const ecart = (v: number[]) => v.reduce((t, x, i) => t + Math.abs(x - (prec[i] ?? x)), 0);
  return options.reduce((a, b) => (ecart(b) < ecart(a) ? b : a));
}

/** Toutes les notes de la boucle pour une ambiance et une graine. */
export function composer(ambiance: Ambiance, graine: number): { notes: Note[]; bpm: number; swing: number } {
  const style = STYLES[ambiance];
  const hasard = mulberry32((graine * 7919 + AMBIANCES.indexOf(ambiance) * 104729 + 17) >>> 0);
  const bpm = Math.round(style.bpm[0] + hasard() * (style.bpm[1] - style.bpm[0]));
  const tonique = tirer(hasard, style.toniques);
  const degres = grille(style, hasard);
  const accords = degres.map((d) => accord(d, style.mode, tonique));
  const m = style.melodie;
  const gamme = notesGamme(style.mode, tonique, m.bas, m.haut);
  const notes: Note[] = [];

  // Mélodie : A (rythmes 1-3 + cadence), A (pareil), B (autres rythmes), A (avec une relance qui ramène au début).
  const rA = [tirer(hasard, m.rythmes), tirer(hasard, m.rythmes), tirer(hasard, m.rythmes)];
  const rB = [tirer(hasard, m.rythmes), tirer(hasard, m.rythmes), tirer(hasard, m.rythmes)];
  const departA = gamme.filter((x) => dansAccord(x, accords[0]!.notes))[Math.floor(gamme.length / 3)] ?? gamme[0]!;
  const pa = phraseMelodie(style, [...rA, m.cadence], accords.slice(0, 4), gamme, departA, hasard);
  const pb = phraseMelodie(style, [...rB, m.cadence], accords.slice(8, 12), gamme, pa.derniere, hasard);
  // La fin de la boucle : la phrase A, mais sa dernière mesure relance vers le début (sur le V).
  const finA = phraseMelodie(style, [m.relance], [accords[15]!], gamme, pa.notes[pa.notes.length - 1]?.midi ?? departA, hasard);
  const decaler = (l: Note[], mesures: number) => l.map((n) => ({ ...n, pas: n.pas + mesures * 16 }));
  notes.push(...pa.notes, ...decaler(pa.notes, 4), ...decaler(pb.notes, 8));
  notes.push(...decaler(pa.notes.filter((n) => n.pas < 48), 12), ...decaler(finA.notes, 15));
  // Respirations : dans la 2ᵉ phrase A, une note sur cinq (hors temps forts) se tait (moins chargé sous une voix).
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    if (n.pas >= 64 && n.pas < 128 && n.pas % 8 !== 0 && hasard() < 0.2) notes.splice(i, 1);
  }

  // Accompagnement, mesure par mesure.
  const gammeBasse = notesGamme(style.mode, tonique, 36, 60);
  let prec: number[] | null = null;
  for (let mes = 0; mes < 16; mes++) {
    const acc = accords[mes]!;
    const suivant = accords[(mes + 1) % 16]!;
    const p0 = mes * 16;
    const enB = mes >= 8 && mes < 12;
    const v = voicing(acc.notes, prec, 55, 74);
    prec = v;
    const grave = (pc: number) => 36 + ((pc - 36 + 120) % 12) + (pc < 4 ? 12 : 0); // 40 à 51 environ
    const fond = grave(acc.fond);
    const quinte = grave((acc.fond + 7) % 12);
    const approche = grave(suivant.fond) + (hasard() < 0.5 ? -1 : 1) * (style.mode === 'mineur' ? 1 : 2);
    const B = (pas: number, longueur: number, midi: number, vel = 0.85) => notes.push({ voix: 'basse', pas: p0 + pas, longueur, midi, vel: vel + 0.08 * hasard() });
    const A = (pas: number, longueur: number, vel: number, voix: Voix = 'accords', liste = v) =>
      liste.forEach((midi, k) => notes.push({ voix, pas: p0 + pas + k * 0.12, longueur, midi, vel: vel * (k === 0 ? 1 : 0.85) + 0.06 * hasard() }));
    const P = (voix: TypePercu, pas: number, vel: number, midi = 0) => notes.push({ voix, pas: p0 + pas, longueur: 1, midi, vel: vel + 0.1 * hasard() });

    switch (ambiance) {
      case 'joyeux': {
        B(0, 3, fond);
        B(6, 2, quinte, 0.7);
        B(8, 3, hasard() < 0.4 ? fond + 12 : fond, 0.8);
        B(14, 2, approche, 0.7);
        for (const pas of enB ? [4, 12] : [2, 6, 10, 14]) A(pas, 1.5, enB ? 0.5 : 0.42);
        for (let pas = 0; pas < 16; pas += 2) P('shaker', pas, pas % 4 === 2 ? 0.6 : 0.35);
        P('balai', 4, 0.6);
        P('balai', 12, 0.6);
        if (!(mes === 8 || mes === 9)) {
          P('grosse-caisse', 0, 0.7);
          P('grosse-caisse', 8, 0.55);
        }
        break;
      }
      case 'enquete': {
        // Basse qui marche, à pas de loup.
        const pas2 = grave(acc.notes[1]!);
        B(0, 2.5, fond);
        B(4, 2.5, hasard() < 0.5 ? pas2 : quinte, 0.75);
        B(8, 2.5, quinte, 0.8);
        B(12, 2.5, approche, 0.75);
        P('claquement', 4, 0.75);
        P('claquement', 12, 0.75);
        if (mes % 2 === 1) A(6, 1.5, 0.4, 'accords', v.slice(1));
        if (enB) A(14, 1.5, 0.35, 'accords', v.slice(1));
        P('grosse-caisse', 0, 0.5);
        if (enB) for (const pas of [2, 6, 10, 14]) P('shaker', pas, 0.4);
        break;
      }
      case 'rigolo': {
        // « Oum-pa » : le tuba sur 1 et 3, l'accord sur 2 et 4.
        if (mes % 4 === 3) {
          // Fin de phrase : la basse monte en marchant vers l'accord suivant.
          const i = gammeBasse.indexOf(fond);
          [fond, gammeBasse[i + 1] ?? fond + 2, gammeBasse[i + 2] ?? fond + 4, approche].forEach((midi, k) => B(k * 4, 3, midi, 0.8));
        } else {
          B(0, 3.5, fond);
          B(8, 3.5, quinte, 0.8);
        }
        A(4, 1.5, 0.5);
        A(12, 1.5, 0.5);
        if (mes % 2 === 1) P('bois', 14, 0.7, 1);
        if (enB) P('bois', 6, 0.6, 1.33);
        P('grosse-caisse', 0, 0.6);
        P('grosse-caisse', 8, 0.5);
        break;
      }
      case 'calme': {
        B(0, 7.5, fond, 0.75);
        B(8, 7.5, mes % 2 === 0 ? quinte : fond, 0.6);
        // Arpège doux sur les notes de l'accord (monte puis redescend).
        const arp = [v[0]!, v[1]!, v[2]!, v[0]! + 12, v[2]!, v[1]!, v[0]! + 12, v[2]!];
        arp.forEach((midi, k) => notes.push({ voix: 'arpege', pas: p0 + k * 2, longueur: 3, midi, vel: (k % 4 === 0 ? 0.6 : 0.45) + 0.08 * hasard() }));
        if (mes >= 4) for (const pas of [2, 6, 10, 14]) P('shaker', pas, 0.3);
        break;
      }
    }
  }
  return { notes, bpm, swing: style.swing };
}

/* ------------------------------------------------------------------ rendu */

/**
 * Sonie intégrée (LUFS, BS.1770 : filtre K, blocs de 400 ms tous les 100 ms, portes −70 LUFS et −10 LU), sans la
 * crête vraie (inutile ici, et c'est elle qui coûte) : même calcul que le volume final d'Arko (moteur/audio/sonie.ts).
 */
export function sonieIntegree(canaux: readonly Float32Array[], fs: number): number {
  const [e1, e2] = filtreK(fs);
  const n = canaux[0]?.length ?? 0;
  const parTranche = Math.round(fs / 10);
  const tranches = new Float64Array(Math.floor(n / parTranche));
  for (const x of canaux) {
    let z1 = 0;
    let z2 = 0;
    let z3 = 0;
    let z4 = 0;
    for (let t = 0; t < tranches.length; t++) {
      let somme = 0;
      for (let j = t * parTranche; j < (t + 1) * parTranche; j++) {
        const v = x[j]!;
        const y1 = e1.b0 * v + z1;
        z1 = e1.b1 * v - e1.a1 * y1 + z2;
        z2 = e1.b2 * v - e1.a2 * y1;
        const y2 = e2.b0 * y1 + z3;
        z3 = e2.b1 * y1 - e2.a1 * y2 + z4;
        z4 = e2.b2 * y1 - e2.a2 * y2;
        somme += y2 * y2;
      }
      tranches[t] = tranches[t]! + somme / parTranche;
    }
  }
  const blocs: number[] = [];
  for (let j = 0; j + 4 <= tranches.length; j++) blocs.push((tranches[j]! + tranches[j + 1]! + tranches[j + 2]! + tranches[j + 3]!) / 4);
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
  const moyenne = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
  const absolus = blocs.filter((z) => z > 0 && lufs(z) > -70);
  if (absolus.length === 0) return -Infinity;
  const gardes = absolus.filter((z) => lufs(z) > lufs(moyenne(absolus)) - 10);
  return gardes.length > 0 ? lufs(moyenne(gardes)) : -Infinity;
}

/** Temps (s) d'une position en doubles-croches, avec le swing sur les contretemps. */
function tempsDuPas(pas: number, bpm: number, swing: number): number {
  const temps = 60 / bpm;
  const t = Math.floor(pas / 4);
  const dans = pas - t * 4;
  // 0 → 0 ; 1 → 0,25 + s/12 ; 2 → 0,5 + s/6 ; 3 → 0,75 + s/12 (temps en fraction de temps).
  const points = [0, 0.25 + swing / 12, 0.5 + swing / 6, 0.75 + swing / 12, 1];
  const i = Math.floor(dans);
  const f = dans - i;
  return (t + points[i]! + (points[i + 1]! - points[i]!) * f) * temps;
}

/** Son mono d'une note. */
function sonDeNote(n: Note, style: Style, fs: number, dureePas: number, graine: number): Float32Array {
  const tenue = Math.max(0.03, n.longueur * dureePas);
  const f = versHz(n.midi);
  switch (n.voix) {
    case 'melodie':
      return style.melodie.instrument === 'corde'
        ? corde(f, fs, { t60: 0.7, brillance: style.melodie.brillance, graine, tenue: tenue * style.melodie.tenue + 0.04, relache: 0.07, pincement: 0.12 })
        : maillet(f, fs, style.melodie.instrument, tenue * style.melodie.tenue + 0.25, 0.12);
    case 'accords':
      return corde(f, fs, { t60: 0.45, brillance: 0.35, graine, tenue: tenue * 0.7, relache: 0.05, pincement: 0.2 });
    case 'arpege':
      return corde(f, fs, { t60: 1.4, brillance: 0.4, graine, tenue: tenue + 0.25, relache: 0.15, pincement: 0.15 });
    case 'basse':
      return basse(f, fs, style.basse, tenue, graine);
    default:
      return percu(n.voix, fs, graine, n.midi || 1);
  }
}

/**
 * Fabrique la boucle d'une ambiance (déterministe : même ambiance + même graine → mêmes échantillons).
 * Sonie ≈ −17 LUFS, crête ≤ −1,5 dBFS, aucun NaN, et la fin s'enchaîne avec le début sans clic.
 */
export function fabriquerMusique(ambiance: Ambiance, graine = 1, fs: number = MUSIQUE_ARKO.frequence, o: { seules?: readonly string[]; brut?: boolean } = {}): MusiqueFabriquee {
  const style = STYLES[ambiance];
  const composee = composer(ambiance, graine);
  const { bpm, swing } = composee;
  // `seules` et `brut` (analyse du mixage seulement) : n'entendre que ces voix, sans régler le niveau.
  const notes = o.seules ? composee.notes.filter((n) => o.seules!.includes(n.voix)) : composee.notes;
  const dureePas = 60 / bpm / 4;
  const L = Math.round(MUSIQUE_ARKO.mesures * 16 * dureePas * fs);
  const long = L + Math.round(MUSIQUE_ARKO.queue * fs);
  const g = new Float32Array(long);
  const d = new Float32Array(long);
  const envoi = new Float32Array(long);
  const hasard = mulberry32((graine * 31 + 7) >>> 0);
  // Une même note (voix, hauteur, longueur) n'est calculée qu'une fois par variante : 2 variantes en alternance,
  // comme les instruments échantillonnés (« round robin »). Beaucoup plus rapide, et on n'entend pas la différence.
  const deja = new Map<string, Float32Array>();
  const vues = new Map<string, number>();
  notes.forEach((n) => {
    const mix = MIXAGE[n.voix];
    // Petit « jeu humain » : ±3 ms et un peu de nuance (toujours les mêmes pour une graine).
    const t = tempsDuPas(n.pas, bpm, swing) + (hasard() - 0.5) * 0.006;
    const k0 = Math.max(0, Math.round(t * fs));
    const base = `${n.voix}|${n.midi}|${n.longueur}`;
    const variante = (vues.get(base) ?? 0) % 2;
    vues.set(base, (vues.get(base) ?? 0) + 1);
    const cle = `${base}|${variante}`;
    let son = deja.get(cle);
    if (!son) {
      son = sonDeNote(n, style, fs, dureePas, (graine * 1000003 + n.midi * 7919 + variante * 104723 + VOIX_INDICE[n.voix] * 31) >>> 0);
      deja.set(cle, son);
    }
    const a = mix.gain * n.vel * (NIVEAUX[ambiance][n.voix] ?? 1);
    const angle = ((mix.pan + 1) * Math.PI) / 4;
    const gl = a * Math.cos(angle) * Math.SQRT2;
    const gr = a * Math.sin(angle) * Math.SQRT2;
    for (let k = 0; k < son.length && k0 + k < long; k++) {
      const v = son[k]!;
      g[k0 + k] = g[k0 + k]! + v * gl;
      d[k0 + k] = d[k0 + k]! + v * gr;
      envoi[k0 + k] = envoi[k0 + k]! + v * a * mix.reverb;
    }
  });
  // Boucle : ce qui dépasse la fin repart au début ; la réverbération est calculée sur l'envoi déjà replié, et sa
  // queue (après la fin) est repliée elle aussi : le résultat est exactement périodique.
  const gauche = replier(g, L);
  const droite = replier(d, L);
  const [rg, rd] = reverberer(replier(envoi, L), fs, { piece: ambiance === 'calme' ? 0.75 : 0.55, amorti: 0.6 }, MUSIQUE_ARKO.queue);
  const humide = 0.11;
  const wg = replier(rg, L);
  const wd = replier(rd, L);
  for (let i = 0; i < L; i++) {
    gauche[i] = gauche[i]! + humide * wg[i]!;
    droite[i] = droite[i]! + humide * wd[i]!;
  }
  // Finition : passe-haut 40 Hz (pas de continu), un creux de 3 dB vers 3 kHz (la place de la voix : on comprend
  // mieux ce qui est dit), aigus adoucis au-dessus de 6,5 kHz (rien d'agressif sous la voix).
  for (const c of [gauche, droite]) {
    filtrerEnBoucle(c, [biquad('passe-haut', 40, 0.7, fs), biquad('cloche', 3000, 0.8, fs, -3), biquad('plateau-aigu', 6500, 0.7, fs, -3)], fs);
    for (let i = 0; i < L; i++) if (!Number.isFinite(c[i]!)) c[i] = 0;
  }
  // Sonie : comme les morceaux de Kevin MacLeod d'Arko (−17 LUFS), puis limiteur de sécurité.
  if (o.brut) return { ambiance, graine, bpm, frequence: fs, canaux: [gauche, droite], duree: L / fs };
  const lufs = sonieIntegree([gauche, droite], fs);
  const gain = Number.isFinite(lufs) ? Math.pow(10, (MUSIQUE_ARKO.lufs - lufs) / 20) : 1;
  for (let i = 0; i < L; i++) {
    gauche[i] = gauche[i]! * gain;
    droite[i] = droite[i]! * gain;
  }
  limiterEnBoucle([gauche, droite], fs, MUSIQUE_ARKO.plafond);
  return { ambiance, graine, bpm, frequence: fs, canaux: [gauche, droite], duree: L / fs };
}
