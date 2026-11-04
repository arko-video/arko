// Chargeur des effets sonores (phase 3) : fabrique un son du catalogue en PCM 48 kHz stéréo.
// Le son est calculé une seule fois (synthèse, quelques millisecondes), puis gardé en mémoire.
// Utilisable dans la page ET dans le Worker d'export : aperçu et export entendent exactement le même son.

import { ErreurArko } from '../moteur/erreurs';
import { trouverSon } from './catalogue';
import { FREQ, synthetiser } from './synthese';

/** Son décodé, prêt pour le mixeur (canaux f32, 48 kHz). */
export interface SonDecode {
  id: string;
  frequence: number;
  /**
   * [gauche, droite]. Les sons d'Arko sont mono : les deux canaux sont LE MÊME tableau,
   * partagé avec le cache. Il ne faut donc jamais le modifier (seulement le lire).
   */
  canaux: Float32Array[];
}

/** Cache des sons déjà calculés, en mono. Clé « id@version » : retoucher un son (version + 1) le recalcule. */
const cache = new Map<string, Float32Array>();

/** Charge un son du catalogue. Lève ErreurArko "son_inconnu" si l'id n'existe pas. */
export async function chargerSon(id: string): Promise<SonDecode> {
  const son = trouverSon(id);
  const inconnu = () => new ErreurArko(`Le son "${id}" n'existe pas.`, 'son_inconnu');
  if (!son) throw inconnu();
  const cle = `${son.id}@${son.version}`;
  let mono = cache.get(cle);
  if (!mono) {
    const fabrique = synthetiser(son.id);
    if (!fabrique) throw inconnu();
    mono = fabrique;
    cache.set(cle, mono);
  }
  return { id: son.id, frequence: FREQ, canaux: [mono, mono] };
}

/** Vide le cache (pour les tests, ou pour libérer la mémoire). */
export function viderCacheSons(): void {
  cache.clear();
}
