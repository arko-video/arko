// Limiteur doux (pur) : remplace l'ancien écrêtage tanh échantillon par échantillon (QA I-1).
// - Sous −1 dBFS : le son passe tel quel (linéaire).
// - Au-dessus : on baisse le VOLUME en douceur (descente en 5 ms, vue un peu à l'avance ; remontée en 150 ms)
//   au lieu de déformer l'onde : un son à 150 % est plus fort, sans distorsion audible.
// - Une dernière courbe douce garantit qu'aucun échantillon ne dépasse −0,3 dBFS.
// Utilisable pour la sortie du mixeur (bloc par bloc, en reprenant le gain du bloc d'avant) et pour un son entier.

/** Le son reste linéaire jusqu'ici (−1 dBFS). */
export const SEUIL_LIMITEUR = Math.pow(10, -1 / 20);
/** Plafond absolu de la sortie (−0,3 dBFS). */
export const PLAFOND_SORTIE = Math.pow(10, -0.3 / 20);

const ATTAQUE_S = 0.005;
const RELACHE_S = 0.15;

/** Courbe de sécurité : identique sous `seuil`, puis s'approche de `plafond` sans jamais l'atteindre. */
export function courbeSecurite(x: number, seuil = SEUIL_LIMITEUR, plafond = PLAFOND_SORTIE): number {
  const a = Math.abs(x);
  if (a <= seuil) return x;
  const reste = plafond - seuil;
  return Math.sign(x) * (seuil + reste * Math.tanh((a - seuil) / reste));
}

export interface OptionsLimiteur {
  /** Gain à la fin du bloc précédent (1 = pas de réduction en cours). */
  gainDepart?: number;
  seuil?: number;
  plafond?: number;
}

/**
 * Limite les canaux EN PLACE (même gain pour tous les canaux : l'image stéréo ne bouge pas).
 * Renvoie le gain atteint à la fin, à redonner au bloc suivant (`gainDepart`) pour un volume sans à-coup.
 */
export function limiter(canaux: Float32Array[], frequence: number, options: OptionsLimiteur = {}): number {
  const seuil = options.seuil ?? SEUIL_LIMITEUR;
  const plafond = options.plafond ?? PLAFOND_SORTIE;
  const n = canaux[0]?.length ?? 0;
  if (n === 0) return options.gainDepart ?? 1;
  // 1. Gain nécessaire pour que chaque échantillon reste sous le seuil.
  const besoin = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let crete = 0;
    for (const c of canaux) crete = Math.max(crete, Math.abs(c[k]!));
    besoin[k] = crete > seuil ? seuil / crete : 1;
  }
  // 2. Anticipation : en remontant le temps, le gain ne remonte que d'un petit pas par échantillon,
  //    donc en avançant il DESCEND en douceur avant le pic (au lieu de tomber d'un coup).
  const pasAttaque = 1 / Math.max(1, Math.round(ATTAQUE_S * frequence));
  for (let k = n - 2; k >= 0; k--) besoin[k] = Math.min(besoin[k]!, besoin[k + 1]! + pasAttaque);
  // 3. Relâchement : après le pic, le gain remonte lentement vers 1.
  const relache = 1 - Math.exp(-1 / (RELACHE_S * frequence));
  let gain = options.gainDepart ?? 1;
  for (let k = 0; k < n; k++) {
    const cible = besoin[k]!;
    gain = cible < gain ? cible : gain + (cible - gain) * relache;
    for (const c of canaux) c[k] = courbeSecurite(c[k]! * gain, seuil, plafond);
  }
  return gain;
}
