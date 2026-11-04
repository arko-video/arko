// Finition commune à tous les sons : nettoyage, niveau et fondu de fin.

import { limiter } from '../../moteur/audio/limiteur';
import { FREQ } from './briques';
import { creteVraie, rmsActif } from './mesures';

/** Sonie visée : −15 dBFS RMS sur la partie active (tous les sons à peu près aussi forts). */
export const SONIE_CIBLE_DB = -15;
/** Crête vraie maximale : −1 dBTP (mesurée sur-échantillonnée × 4). */
export const CRETE = Math.pow(10, -1 / 20);
/** On accepte au plus 12 dB de limitation sur un son (clics très courts) : au-delà, il reste un peu moins fort que la cible. */
const LIMITATION_MAX_DB = 12;

/** Durée du fondu de fin (2 ms) : évite un « clic » quand le son s'arrête. */
export const FONDU_FIN_S = 0.002;

/**
 * Prépare un son brut pour Arko (modifie le signal et le renvoie) :
 * 1. remplace les valeurs invalides (NaN, infini) par du silence ;
 * 2. retire la composante continue (le « décalage » vers le haut ou le bas que la distorsion peut créer) ;
 * 3. règle le niveau en SONIE (RMS de la partie active à −15 dBFS), puis limite les pics
 *    pour que la crête vraie reste à −1 dBTP au plus ;
 * 4. fait un fondu de 2 ms à la fin.
 */
export function finir(signal: Float32Array): Float32Array {
  // 1 + 2. Nettoyage et filtre « anti-continu » (passe-haut très doux, vers 4 Hz).
  let xAvant = 0;
  let yAvant = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = Number.isFinite(signal[i]) ? signal[i] : 0;
    const y = x - xAvant + 0.9995 * yAvant;
    xAvant = x;
    yAvant = y;
    signal[i] = y;
  }
  // 4. Fondu de fin (fait avant le niveau : la crête finale est bien celle qu'on entend).
  fonduFin(signal);
  // 3. Niveau : sonie visée, mais jamais plus de 12 dB de pics à raboter en tout.
  //    Limiter fait baisser un peu la sonie : on recommence (3 passes au plus) pour s'approcher de la cible.
  const cible = Math.pow(10, SONIE_CIBLE_DB / 20);
  let marge = Math.pow(10, LIMITATION_MAX_DB / 20); // limitation encore permise
  for (let passe = 0; passe < 3; passe++) {
    const rms = rmsActif(signal);
    const crete = creteVraie(signal);
    if (rms === 0 || crete === 0) return signal;
    const g = Math.min(cible / rms, (CRETE / crete) * marge);
    if (g < 1.01 && crete <= CRETE) break;
    for (let i = 0; i < signal.length; i++) signal[i] *= g;
    // Pics trop forts : limiteur doux (volume baissé autour du pic, l'onde n'est pas déformée),
    // un peu sous −1 dB pour la marge entre les échantillons.
    const depassement = (crete * g) / CRETE;
    if (depassement > 1) {
      marge /= depassement;
      limiter([signal], FREQ, { seuil: CRETE * 0.94, plafond: CRETE * 0.97 });
    }
  }
  // Dernier ajustement sur la crête vraie.
  const apres = creteVraie(signal);
  if (apres > CRETE) for (let i = 0; i < signal.length; i++) signal[i] *= CRETE / apres;
  fonduFin(signal);
  return signal;
}

/** Fondu linéaire vers 0 sur les 2 dernières ms (le dernier échantillon vaut exactement 0). */
function fonduFin(signal: Float32Array) {
  const nFondu = Math.min(signal.length, Math.round(FONDU_FIN_S * FREQ));
  for (let k = 0; k < nFondu; k++) {
    const i = signal.length - nFondu + k;
    signal[i] *= 1 - (k + 1) / nFondu;
  }
}
