// Familles « jeu » (8-bit) et « interface » : pièce, dégât, bonus, ding, erreur.

import { adsr, bruit, courbeExpo, expo, melanger, multiplier, note, oscillateur, type Piste } from './briques';
import { filtrer, reverberation } from './effets';

/** Pièce : le « ting-ting » 8-bit, une note courte (si) puis une note plus haute (mi) qui s'éteint. */
export function piece(): Float32Array {
  const d = 0.55;
  const saut = 0.07;
  const hauteur = (t: number) => (t < saut ? note(14) : note(19)); // si 5, puis mi 6
  // Volume plein, puis la 2e note tient 50 ms et s'éteint doucement.
  const volume = (t: number) => (t < saut + 0.05 ? 1 : Math.exp(-(t - saut - 0.05) / 0.13));
  const son = oscillateur('carre', d, hauteur);
  return filtrer(multiplier(son, volume), 'passe-bas', 9000);
}

/** Dégât : une note carrée qui chute avec un tremblement rapide, et un grésillement 8-bit. */
export function degat(): Float32Array {
  const d = 0.4;
  const chute = courbeExpo(700, 90, 0.3);
  const ton = oscillateur('carre', d, (t) => chute(t) * (1 + 0.15 * Math.sign(Math.sin(2 * Math.PI * 30 * t))));
  const grain = filtrer(bruit(d, 171, 6000), 'passe-bas', 4000);
  return melanger(d, [
    { signal: multiplier(ton, expo(d, 0.12, 0.002)), gain: 0.7 },
    { signal: multiplier(grain, expo(d, 0.05, 0.001)), gain: 0.6 },
  ]);
}

/** Bonus : arpège 8-bit qui grimpe (do mi sol do mi sol do), la dernière note tenue avec vibrato. */
export function bonus(): Float32Array {
  const d = 0.75;
  const pas = 0.055;
  const notes = [3, 7, 10, 15, 19, 22, 27].map(note); // do 5 → do 7
  const pistes: Piste[] = notes.map((f, k) => {
    const derniere = k === notes.length - 1;
    const longueur = derniere ? d - k * pas : pas;
    const hauteur = (t: number) => f * (derniere ? 1 + 0.012 * Math.sin(2 * Math.PI * 9 * t) : 1);
    const carre = oscillateur('carre', longueur, hauteur);
    const corps = oscillateur('triangle', longueur, (t) => hauteur(t) / 2);
    const env = derniere ? expo(longueur, 0.12, 0.002) : adsr(longueur, 0.002, 0.02, 0.8, 0.005);
    return { signal: multiplier(melanger(longueur, [{ signal: carre, gain: 0.5 }, { signal: corps, gain: 0.5 }]), env), debut: k * pas };
  });
  return filtrer(melanger(d, pistes), 'passe-bas', 10000);
}

/** Ding : une petite cloche claire (partiels qui ne sont pas des multiples exacts : son de métal). */
export function ding(): Float32Array {
  const d = 1.3;
  const base = note(15); // do 6, 1046 Hz
  const partiels = [
    { r: 1, g: 1, tau: 0.5 },
    { r: 2.01, g: 0.35, tau: 0.25 },
    { r: 3.03, g: 0.2, tau: 0.16 },
    { r: 4.2, g: 0.12, tau: 0.1 },
    { r: 5.43, g: 0.08, tau: 0.07 },
  ];
  const pistes: Piste[] = partiels.map((p) => ({
    signal: multiplier(oscillateur('sinus', d, base * p.r), expo(d, p.tau, 0.002)),
    gain: p.g,
  }));
  const frappe = multiplier(filtrer(bruit(0.02, 181), 'passe-haut', 5000), expo(0.02, 0.003, 0.0003));
  pistes.push({ signal: frappe, gain: 0.15 });
  return reverberation(melanger(d, pistes), { taille: 0.6, amorti: 0.4, mix: 0.15 });
}

/** Un « bzz » : deux carrés presque à la même hauteur (ils battent l'un contre l'autre). */
function bzz(freq: number, duree: number): Float32Array {
  const son = melanger(duree, [
    { signal: oscillateur('carre', duree, freq), gain: 0.5 },
    { signal: oscillateur('carre', duree, freq * 1.02), gain: 0.5 },
  ]);
  return multiplier(filtrer(son, 'passe-bas', 2500), adsr(duree, 0.004, 0.02, 0.9, 0.02));
}

/** Erreur : deux « bzz » graves qui descendent. */
export function erreur(): Float32Array {
  return melanger(0.48, [
    { signal: bzz(200, 0.14), debut: 0 },
    { signal: bzz(150, 0.24), debut: 0.2 },
  ]);
}
