// Famille « impact » : boom, boom mème, claque, bass drop.
// Chaque fonction est pure : elle fabrique toujours exactement le même son brut (mono, 48 kHz).
// La finition (niveau, fondu) est faite ensuite par finir().

import { adsr, bruit, courbeExpo, expo, melanger, multiplier, oscillateur, tableau } from './briques';
import { filtrer, reverberation, saturer } from './effets';

/** Petit coup grave (le « toc » de départ d'un impact) : bruit sourd, très court. */
function choc(duree: number, graine: number, deFreq: number, aFreq: number, tau: number): Float32Array {
  const b = filtrer(bruit(duree, graine), 'passe-bas', courbeExpo(deFreq, aFreq, duree * 0.6));
  return multiplier(b, expo(duree, tau, 0.0005));
}

/** Boom : grosse note grave qui tombe de 110 à 38 Hz, un choc au départ et un peu de salle. */
export function boom(): Float32Array {
  const d = 1.5;
  const corps = multiplier(oscillateur('sinus', d, courbeExpo(110, 38, 0.45)), expo(d, 0.38, 0.003));
  const brut = melanger(d, [
    { signal: corps },
    { signal: choc(0.3, 11, 1500, 150, 0.035), gain: 0.7 },
  ]);
  // Une légère saturation ajoute des harmoniques : le boom s'entend aussi sur un haut-parleur de téléphone.
  return reverberation(saturer(brut, 2.5), { taille: 0.8, amorti: 0.55, mix: 0.18 });
}

/**
 * Boom mème : la grosse frappe grave et saturée des mèmes, recréée par synthèse.
 * Une note qui plonge très vite de 160 à 52 Hz, beaucoup de saturation (le grain « écrasé »),
 * des aigus coupés (son sourd) et une longue queue de réverbération.
 */
export function boomMeme(): Float32Array {
  const d = 2.2;
  const plongee = courbeExpo(160, 52, 0.07);
  const hauteur = tableau((t) => (t < 0.07 ? plongee(t) : 52 - 4 * Math.min(1, (t - 0.07) / 1.2)), d);
  const fond = multiplier(oscillateur('sinus', d, hauteur), expo(d, 0.5, 0.003));
  const octave = multiplier(oscillateur('sinus', d, hauteur, 2), expo(d, 0.12, 0.002));
  const brut = melanger(d, [
    { signal: fond },
    { signal: octave, gain: 0.5 },
    { signal: choc(0.15, 21, 3000, 200, 0.02), gain: 0.5 },
  ]);
  const ecrase = filtrer(saturer(brut, 6), 'passe-bas', 2600, 0.6);
  return reverberation(ecrase, { taille: 0.92, amorti: 0.6, mix: 0.32 });
}

/** Claque : un « clac » sec dans les médiums-aigus, un petit corps et une pièce très courte. */
export function claque(): Float32Array {
  const d = 0.45;
  const clac = multiplier(filtrer(bruit(d, 31), 'passe-bande', 2600, 0.8), expo(d, 0.012, 0.0004));
  const peau = multiplier(filtrer(bruit(d, 32), 'passe-bande', 950, 1.2), expo(d, 0.045, 0.001));
  const corps = multiplier(oscillateur('sinus', d, courbeExpo(220, 150, 0.03)), expo(d, 0.03, 0.001));
  const brut = melanger(d, [
    { signal: clac },
    { signal: peau, gain: 0.8 },
    { signal: corps, gain: 0.5 },
  ]);
  return reverberation(brut, { taille: 0.35, amorti: 0.7, mix: 0.12 });
}

/** Bass drop : une basse qui plonge lentement de 160 à 32 Hz, saturée pour s'entendre partout. */
export function bassDrop(): Float32Array {
  const d = 2.5;
  const basse = multiplier(oscillateur('sinus', d, courbeExpo(160, 32, 2.2)), adsr(d, 0.01, 0.4, 0.8, 0.8));
  const coup = multiplier(oscillateur('sinus', 0.4, courbeExpo(140, 45, 0.08)), expo(0.4, 0.09, 0.002));
  const brut = melanger(d, [
    { signal: basse },
    { signal: coup, gain: 0.8 },
    { signal: choc(0.1, 41, 2500, 300, 0.01), gain: 0.4 },
  ]);
  return filtrer(saturer(brut, 3), 'passe-bas', 3500, 0.7);
}
