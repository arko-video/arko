// Outils pour les tests du derush (dev 1) : une session de jeu FABRIQUÉE de 30 min dont on connaît les passages drôles.
// Voix synthétiques (au niveau de l'enveloppe), bruit de jeu, rires en rafales à 5 Hz, cris, échanges rapides entre
// deux personnes, mots transcrits. (Le nom ne finit pas par .test.ts : Vitest ne le lance pas seul.)

import { hasard } from '../../ia/synthese-test';
import type { Mot, TourDeParole } from '../../recette/types';
import { signauxDepuisEnveloppe } from '../signaux-source';
import type { SignauxSource } from '../types';

export const PAS = 0.02;
export const DUREE_SESSION = 1800;

/** Un passage drôle planté : son instant clé (temps source) et ce que c'est. */
export interface PassagePlante {
  t: number;
  quoi: string;
}

export interface Session {
  signaux: SignauxSource;
  mots: Mot[];
  paroles: TourDeParole[];
  plantes: PassagePlante[];
  /** Scènes de parole (débuts / fins) telles que fabriquées. */
  scenes: { de: number; a: number }[];
}

/** Scènes de parole : [de, a] ; entre deux, plus de 20 s de jeu sans parole. */
const SCENES: [number, number][] = [
  [20, 80], [110, 175], [210, 290], [320, 380], [390, 440], [470, 540], [590, 665], [700, 760],
  [790, 1110], [1140, 1200], [1230, 1290], [1320, 1370], [1385, 1430], [1460, 1530], [1580, 1640], [1680, 1720], [1750, 1790],
];

export const PLANTES: PassagePlante[] = [
  { t: 150, quoi: 'fou rire' },
  { t: 400, quoi: 'cri puis rire' },
  { t: 630, quoi: 'échanges rapides' },
  { t: 900, quoi: 'fou rire dans une scène de 5 min' },
  { t: 1250, quoi: 'calme puis gros pic' },
  { t: 1400, quoi: 'juron crié' },
  { t: 1600, quoi: 'rire et mots forts' },
  { t: 1700, quoi: 'fou rire court' },
  { t: 1000, quoi: 'cri et réaction dans la scène de 5 min' },
  { t: 1500, quoi: 'échanges rapides et rire' },
];

/** Fabrique la session (toujours la même : hasard reproductible). */
export function sessionFabriquee(): Session {
  const r = hasard(7);
  const n = Math.round(DUREE_SESSION / PAS);
  const env = new Float32Array(n);
  const k = (t: number) => Math.round(t / PAS);
  for (let i = 0; i < n; i++) env[i] = 0.01 * (1 + 0.4 * (r() - 0.5)); // jeu ≈ −40 dB
  const mots: Mot[] = [];
  const paroles: TourDeParole[] = [];
  const rapides = (t: number) => (t >= 600 && t < 660) || (t >= 1490 && t < 1520);
  for (const [de, a] of SCENES) {
    let t = de;
    let p = 0;
    while (t < a - 1) {
      const vite = rapides(t);
      const tour = vite ? 1 + r() : 3 + 4 * r();
      const fin = Math.min(a, t + tour);
      for (let x = t; x + 0.3 <= fin; x += 0.4) {
        mots.push(['bla', Math.round(x * 100) / 100, Math.round((x + 0.3) * 100) / 100]);
        for (let j = k(x); j < k(x + 0.3); j++) env[j] = Math.max(env[j]!, 0.03 * (1 + 0.3 * (r() - 0.5)));
      }
      paroles.push({ ts: Math.round(t * 100) / 100, fin: Math.round(fin * 100) / 100, p: p === 0 ? 'p1' : 'p2' });
      p = 1 - p;
      t = fin + (vite ? 0.3 : 1.8 + 1.5 * r());
    }
  }
  const rire = (t0: number, dur: number, fort: number) => {
    for (let j = k(t0); j < k(t0 + dur); j++) env[j] = fort * (0.55 + 0.45 * Math.sin(2 * Math.PI * 5 * (j * PAS - t0)));
  };
  const cri = (t0: number, dur: number) => {
    for (let j = k(t0); j < k(t0 + dur); j++) env[j] = 0.4 * (1 + 0.05 * (r() - 0.5));
  };
  const motFort = (t: number, txt: string) => mots.push([txt, t, t + 0.4, 1]);
  rire(150, 3.5, 0.2);
  cri(400, 1.5);
  rire(402, 2, 0.15);
  rire(900, 3.5, 0.2);
  cri(1000, 1.2);
  rire(1001.6, 2, 0.15);
  for (let j = k(1244); j < k(1249.9); j++) env[j] = 0.005; // calme…
  for (let j = k(1250); j < k(1250.3); j++) env[j] = 0.6; // …puis gros pic
  cri(1400, 1.5);
  motFort(1400.2, 'putain');
  rire(1600, 2, 0.15);
  motFort(1599, 'NON');
  motFort(1602.5, 'incroyable');
  rire(1700, 3.2, 0.2);
  rire(1505, 2, 0.15);
  mots.sort((x, y) => x[1] - y[1]);
  return { signaux: signauxDepuisEnveloppe('s1', DUREE_SESSION, PAS, env), mots, paroles, plantes: PLANTES, scenes: SCENES.map(([de, a]) => ({ de, a })) };
}
