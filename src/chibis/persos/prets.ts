// D. Les 6 persos tout prêts (7/11/2026, style « Papier découpé ») : proposés d'office aux voix (Voix 1 → perso 1,
// Voix 2 → perso 2…) et dans l'atelier (« Persos tout prêts »). Bien différents : peau, coiffure, cheveux, tenue,
// accessoire, couleur, yeux. Ce sont NOS personnages (CC0).

import type { DefinitionChibi } from '../../recette/types';
import { hacher } from '../courbes';

export const PERSOS_PRETS: readonly DefinitionChibi[] = [
  // 1. Casque audio + sweat rouge.
  { style: 'papier', graine: 101, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'sweat', accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'ronds' },
  // 2. Casquette à l'envers + t-shirt.
  { style: 'papier', graine: 202, peau: '#A0663D', coiffure: 'courts', cheveux: '#1E1A18', tenue: 'tshirt', accessoire: 'casquetteEnvers', couleur: '#3498DB', yeux: 'grands' },
  // 3. Lunettes + chemise.
  { style: 'papier', graine: 303, peau: '#FFE0C7', coiffure: 'meche', cheveux: '#D9A441', tenue: 'chemise', accessoire: 'lunettes', couleur: '#2ECC71', yeux: 'points' },
  // 4. Cheveux longs + bonnet.
  { style: 'papier', graine: 404, peau: '#E8B07E', coiffure: 'longs', cheveux: '#8E44AD', tenue: 'tshirt', accessoire: 'bonnet', couleur: '#FF6FB5', yeux: 'ronds' },
  // 5. Chauve + barbe.
  { style: 'papier', graine: 505, peau: '#7A4A2A', coiffure: 'rase', cheveux: '#2B211C', tenue: 'costume', accessoire: 'barbe', couleur: '#F1C40F', yeux: 'fatigues' },
  // 6. Capuche relevée (sweat à capuche).
  { style: 'papier', graine: 606, peau: '#C98A5A', coiffure: 'bol', cheveux: '#4A2C1A', tenue: 'sweat', accessoire: 'capuche', couleur: '#1ABC9C', yeux: 'grands' },
];

/** Perso tout prêt d'une voix : « p3 » (ou tout id qui finit par 3) → perso 3 ; sinon tiré de l'id. */
export function persoPretPour(id: string): DefinitionChibi {
  const m = /(\d+)$/.exec(id);
  const n = m ? Number(m[1]) - 1 : hacher(7, id);
  return PERSOS_PRETS[((n % PERSOS_PRETS.length) + PERSOS_PRETS.length) % PERSOS_PRETS.length]!;
}
