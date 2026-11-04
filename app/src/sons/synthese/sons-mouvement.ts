// Familles « whoosh » et « tension » : whoosh rapide, whoosh montant, riser, battement de cœur.

import { bruit, cloche, courbeExpo, expo, FREQ, melanger, multiplier, nbEchantillons, oscillateur, tableau } from './briques';
import { filtrer, saturer } from './effets';

/** Whoosh rapide : un souffle qui passe devant toi (le filtre monte puis redescend avec le volume). */
export function whooshRapide(): Float32Array {
  const d = 0.6;
  const pic = 0.24;
  const forme = (t: number) => cloche(t, pic, 0.56);
  const souffle = filtrer(bruit(d, 51), 'passe-bande', (t) => 450 + 3200 * forme(t), 1.3);
  const air = filtrer(bruit(d, 52), 'passe-haut', 4500, 0.7);
  return melanger(d, [
    { signal: multiplier(souffle, (t) => forme(t) ** 1.4) },
    { signal: multiplier(air, (t) => forme(t) ** 2), gain: 0.25 },
  ]);
}

/** Whoosh montant : un souffle qui grimpe de 250 à 7000 Hz et s'arrête net en haut. */
export function whooshMontant(): Float32Array {
  const d = 1.6;
  const montee = 1.45;
  const volume = (t: number) => (t < montee ? (t / montee) ** 2 : Math.exp(-(t - montee) / 0.03));
  const souffle = filtrer(bruit(d, 61), 'passe-bande', courbeExpo(250, 7000, montee), 2);
  const ton = filtrer(oscillateur('scie', d, courbeExpo(110, 880, montee)), 'passe-bas', 1800);
  return melanger(d, [
    { signal: multiplier(souffle, volume) },
    { signal: multiplier(ton, volume), gain: 0.12 },
  ]);
}

/**
 * Riser : la montée de tension avant un moment fort (3 s).
 * Un accord de scies légèrement désaccordées qui monte de 2 octaves, un souffle qui s'ouvre,
 * et un tremblement de volume qui accélère de 4 à 18 fois par seconde.
 */
export function riser(): Float32Array {
  const d = 3;
  const hauteur = tableau(courbeExpo(110, 440, d), d);
  const voix = [1, 1.008, 1.5].map((r) => oscillateur('scie', d, hauteur, r));
  const accord = filtrer(melanger(d, voix.map((signal) => ({ signal, gain: 0.4 }))), 'passe-bas', courbeExpo(400, 9000, d), 1.2);
  const souffle = filtrer(bruit(d, 71), 'passe-bande', courbeExpo(300, 9000, d), 1);
  // Tremblement : on accumule la phase pour que la vitesse change sans à-coup.
  const n = nbEchantillons(d);
  const tremble = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FREQ;
    const x = t / d; // avancement, de 0 à 1
    phase += (4 + 14 * x * x) / FREQ;
    tremble[i] = (0.65 + 0.35 * Math.cos(2 * Math.PI * phase)) * x * x;
  }
  const brut = melanger(d, [{ signal: accord, gain: 0.8 }, { signal: souffle }]);
  return multiplier(brut, tremble);
}

/** Un battement sourd (« boum ») : sinus grave qui tombe vite, avec un peu de saturation pour les petits haut-parleurs. */
function battement(freq: number, graine: number): Float32Array {
  const d = 0.4;
  const ton = multiplier(oscillateur('sinus', d, courbeExpo(freq * 1.7, freq, 0.04)), expo(d, 0.07, 0.004));
  const peau = multiplier(filtrer(bruit(d, graine), 'passe-bas', 300), expo(d, 0.02, 0.002));
  return saturer(melanger(d, [{ signal: ton }, { signal: peau, gain: 0.4 }]), 2.2);
}

/** Cœur : trois battements « boum-boum » (environ 75 par minute). */
export function coeur(): Float32Array {
  const d = 2.4;
  const pistes = [];
  for (let k = 0; k < 3; k++) {
    pistes.push({ signal: battement(55, 81 + k), debut: k * 0.8 });
    pistes.push({ signal: battement(66, 91 + k), debut: k * 0.8 + 0.2, gain: 0.7 });
  }
  return filtrer(melanger(d, pistes), 'passe-bas', 900);
}
