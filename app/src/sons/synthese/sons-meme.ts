// Famille « meme » : klaxon (sirène de stade), disque rayé, tape stop, photo.
// Tout est recréé par synthèse : aucun enregistrement n'est copié.

import { adsr, bruit, courbeExpo, expo, melanger, multiplier, nbEchantillons, note, oscillateur, tableau, type Piste } from './briques';
import { filtrer, reverberation, saturer } from './effets';

/** Un coup de corne : 5 scies désaccordées (un accord majeur), qui « montent » dans la note au départ. */
function corne(duree: number): Float32Array {
  const montee = tableau((t) => 1 - 0.06 * Math.exp(-t / 0.03), duree); // la note « monte » un peu au départ
  const freqs = [415 * 0.996, 415, 415 * 1.005, 523 * 0.997, 523 * 1.004];
  const voix: Piste[] = freqs.map((f) => ({ signal: oscillateur('scie', duree, montee, f), gain: 0.25 }));
  const accord = melanger(duree, voix);
  const cuivre = filtrer(filtrer(accord, 'passe-haut', 260, 0.8), 'passe-bas', 3600, 0.9);
  return multiplier(saturer(cuivre, 1.8), adsr(duree, 0.012, 0.05, 0.9, 0.05));
}

/** Klaxon : la corne de stade, trois coups « POUET pouet POUEEET ». */
export function klaxon(): Float32Array {
  const d = 1.7;
  const brut = melanger(d, [
    { signal: corne(0.22), debut: 0 },
    { signal: corne(0.17), debut: 0.3, gain: 0.9 },
    { signal: corne(0.85), debut: 0.55 },
  ]);
  return reverberation(brut, { taille: 0.85, amorti: 0.3, mix: 0.18 });
}

/**
 * Disque rayé : le scratch d'un disque qu'on pousse puis qu'on tire.
 * La vitesse du disque `v` (de 0 à 1) fait monter la hauteur et le volume du bruit filtré et d'un petit ton.
 */
export function disqueRaye(): Float32Array {
  const d = 0.7;
  // Deux gestes : en avant (court), puis en arrière (plus long).
  const vitesse = (t: number) => {
    if (t < 0.17) return Math.sin((Math.PI * t) / 0.17);
    if (t >= 0.2 && t < 0.48) return Math.sin((Math.PI * (t - 0.2)) / 0.28) * 0.85;
    return 0;
  };
  const frottement = filtrer(bruit(d, 101), 'passe-bande', (t) => 180 + 3000 * vitesse(t), 2.5);
  const ton = filtrer(oscillateur('scie', d, (t) => 90 + 1100 * vitesse(t)), 'passe-bas', 2500);
  const aiguille = filtrer(bruit(d, 102), 'passe-haut', 3500);
  return melanger(d, [
    { signal: multiplier(frottement, (t) => vitesse(t) ** 0.7) },
    { signal: multiplier(ton, (t) => vitesse(t) ** 1.2), gain: 0.35 },
    { signal: multiplier(aiguille, (t) => vitesse(t) ** 2), gain: 0.15 },
  ]);
}

/** Tape stop : un accord de musique qui ralentit jusqu'à l'arrêt, comme une bande qu'on freine. */
export function tapeStop(): Float32Array {
  const d = 1.4;
  const frein = 0.25;
  const arret = 1.25;
  // vitesse de la bande : 1 au début, puis chute jusqu'à 0
  const vitesse = (t: number) => (t < frein ? 1 : t >= arret ? 0 : (1 - (t - frein) / (arret - frein)) ** 2);
  const notes = [note(-12), note(-9), note(-5), note(-24)]; // la mineur : la, do, mi, et la grave
  const voix: Piste[] = notes.map((f, k) => ({
    signal: oscillateur(k === 3 ? 'carre' : 'scie', d, (t) => f * vitesse(t)),
    gain: k === 3 ? 0.35 : 0.25,
  }));
  const accord = filtrer(melanger(d, voix), 'passe-bas', (t) => 250 + 4000 * vitesse(t), 0.9);
  return multiplier(accord, (t) => Math.min(1, t / 0.005) * Math.sqrt(vitesse(t)));
}

/** Un déclic métallique (pour l'obturateur). */
function declic(graine: number, bande: number): Float32Array {
  const d = 0.08;
  const sec = multiplier(filtrer(bruit(d, graine), 'passe-haut', 2500), expo(d, 0.004, 0.0003));
  const metal = multiplier(filtrer(bruit(d, graine + 1), 'passe-bande', bande, 3), expo(d, 0.025, 0.0005));
  const corps = multiplier(oscillateur('sinus', d, courbeExpo(420, 260, 0.02)), expo(d, 0.02, 0.0005));
  return melanger(d, [{ signal: sec }, { signal: metal, gain: 1.2 }, { signal: corps, gain: 0.5 }]);
}

/** Photo : le « clic-clac » d'un appareil photo (obturateur qui s'ouvre puis se ferme). */
export function photo(): Float32Array {
  const d = 0.4;
  const n = nbEchantillons(0.09);
  const mecanique = new Float32Array(n);
  const ronron = filtrer(bruit(0.09, 111), 'passe-bande', 1500, 2);
  for (let i = 0; i < n; i++) mecanique[i] = ronron[i] * Math.sin((Math.PI * i) / n);
  const brut = melanger(d, [
    { signal: declic(121, 4500) },
    { signal: mecanique, gain: 0.5 },
    { signal: declic(131, 3200), debut: 0.09, gain: 0.85 },
  ]);
  return reverberation(brut, { taille: 0.3, amorti: 0.6, mix: 0.08 });
}
