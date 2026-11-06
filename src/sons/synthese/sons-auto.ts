// Sons ajoutés pour les « Bruitages auto » (Montage auto E, novembre 2026), fabriqués par le code (CC0) comme les
// 20 autres : « Dun dun duuun » (révélation dramatique) et « Extinction » (fin de vidéo, 4 notes qui descendent).
// Ce sont des sons de secours, quand « Mes sons » n'a rien de mieux. Mélodies génériques : aucun son connu imité.

import { adsr, expo, melanger, multiplier, note, oscillateur, type Piste } from './briques';
import { filtrer, reverberation, saturer } from './effets';

/** Une note de cuivres grave : scie + carré, filtre qui s'ouvre à l'attaque, un peu de saturation. */
function cuivre(freq: number, duree: number): Float32Array {
  const scie = oscillateur('scie', duree, freq);
  const carre = oscillateur('carre', duree, freq * 0.5);
  const mix = melanger(duree, [{ signal: scie }, { signal: carre, gain: 0.5 }]);
  const ouvert = filtrer(mix, 'passe-bas', (t) => 400 + 2200 * Math.exp(-t / 0.18), 1.2);
  return multiplier(saturer(ouvert, 1.8), adsr(duree, 0.015, 0.12, 0.75, Math.min(0.3, duree * 0.4)));
}

/** Dun dun duuun : deux coups de cuivres courts sur ré, puis un long si grave, avec une grande réverbération. */
export function dunDun(): Float32Array {
  const d = 2.4;
  const pistes: Piste[] = [
    { signal: cuivre(note(-19), 0.26), debut: 0 },
    { signal: cuivre(note(-19), 0.26), debut: 0.36 },
    { signal: cuivre(note(-22), 1.45), debut: 0.72 },
    { signal: cuivre(note(-34), 1.45), debut: 0.72, gain: 0.6 },
  ];
  return reverberation(melanger(d, pistes), { taille: 0.8, amorti: 0.4, mix: 0.25 });
}

/** Une note de carillon doux (sinus + 2 partiels qui s'éteignent). */
function carillon(freq: number, duree: number): Float32Array {
  const partiels = [
    { r: 1, g: 1, tau: duree * 0.45 },
    { r: 2, g: 0.25, tau: duree * 0.2 },
    { r: 3, g: 0.1, tau: duree * 0.12 },
  ];
  return melanger(
    duree,
    partiels.map((p) => ({ signal: multiplier(oscillateur('sinus', duree, freq * p.r), expo(duree, p.tau, 0.006)), gain: p.g })),
  );
}

/** Extinction : do, sol, mi, do qui descendent (arpège majeur), la dernière note plus longue. */
export function extinction(): Float32Array {
  const d = 2.2;
  const notes = [note(3), note(-2), note(-5), note(-9)];
  const pistes: Piste[] = notes.map((f, k) => ({ signal: carillon(f, k === 3 ? 1.2 : 0.7), debut: k * 0.28 }));
  return reverberation(melanger(d, pistes), { taille: 0.6, amorti: 0.5, mix: 0.2 });
}
