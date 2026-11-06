// F. Baisse automatique de la musique quand on parle (dev 3) : compresseur dont l'entrée de commande est la VOIX
// (le son des plans, seulement pendant les mots transcrits quand il y en a). Réglages du brief (qui ont marché sur
// une vraie vidéo) : seuil 0,03, ratio 6, attaque 20 ms, relâche 400 ms. Fonction PURE, état gardé d'un bloc à
// l'autre : l'aperçu et l'export donnent le même son. Utilisé par moteur/audio/mixeur.ts.

export const BAISSE = {
  /** Niveau (RMS, linéaire) de la voix au-delà duquel la musique baisse (−30,5 dBFS). */
  seuil: 0.03,
  ratio: 6,
  attaque: 0.02,
  relache: 0.4,
  /** Lissage de la mesure du niveau de la voix (RMS sur ~10 ms). */
  detection: 0.01,
};

/** État du compresseur entre deux blocs : énergie lissée de la voix et réduction en cours (dB). */
export interface EtatBaisse {
  energie: number;
  reductionDb: number;
}

export const ETAT_BAISSE_REPOS: EtatBaisse = { energie: 0, reductionDb: 0 };

/** Le gain est recalculé tous les 16 échantillons (un tiers de milliseconde) : assez fin, bien moins de calcul. */
const PAS = 16;

/**
 * Gain (linéaire) à appliquer à la musique pour chaque échantillon du bloc, d'après la voix `cle` (mono, même
 * fréquence). `etat` est mis à jour (à redonner au bloc suivant).
 */
export function gainsBaisse(cle: Float32Array, frequence: number, etat: EtatBaisse): Float32Array {
  const n = cle.length;
  const gains = new Float32Array(n);
  const aDet = 1 - Math.exp(-1 / (BAISSE.detection * frequence));
  const aAtt = 1 - Math.exp(-PAS / (BAISSE.attaque * frequence));
  const aRel = 1 - Math.exp(-PAS / (BAISSE.relache * frequence));
  const pente = 1 - 1 / BAISSE.ratio;
  let { energie, reductionDb } = etat;
  let gain = Math.pow(10, -reductionDb / 20);
  for (let k = 0; k < n; k++) {
    const x = cle[k]!;
    energie += (x * x - energie) * aDet;
    if (k % PAS === 0) {
      const niveau = Math.sqrt(energie);
      const depasse = niveau > BAISSE.seuil ? 20 * Math.log10(niveau / BAISSE.seuil) : 0;
      const cible = depasse * pente;
      reductionDb += (cible - reductionDb) * (cible > reductionDb ? aAtt : aRel);
      gain = Math.pow(10, -reductionDb / 20);
    }
    gains[k] = gain;
  }
  etat.energie = energie;
  etat.reductionDb = reductionDb;
  return gains;
}

/**
 * Voix du bloc, en mono : moyenne des 2 canaux des plans, gardée seulement pendant la parole (temps de sortie)
 * si on la connaît. Pure.
 */
export function voixDuBloc(plans: Float32Array[], t0: number, frequence: number, parole?: readonly { t0: number; t1: number }[]): Float32Array {
  const n = plans[0]?.length ?? 0;
  const res = new Float32Array(n);
  const [g, d] = [plans[0]!, plans[1] ?? plans[0]!];
  for (let k = 0; k < n; k++) res[k] = (g[k]! + d[k]!) / 2;
  if (!parole) return res;
  const garde = new Uint8Array(n);
  for (const p of parole) {
    const k0 = Math.max(0, Math.ceil((p.t0 - t0) * frequence));
    const k1 = Math.min(n, Math.ceil((p.t1 - t0) * frequence));
    for (let k = k0; k < k1; k++) garde[k] = 1;
  }
  for (let k = 0; k < n; k++) if (!garde[k]) res[k] = 0;
  return res;
}
