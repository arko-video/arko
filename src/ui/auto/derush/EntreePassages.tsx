// Point d'entrée « Passages pas retenus » (C, dev 1), dans Couper et Habiller → Couper. Visible seulement quand la
// recette a des passages de côté (`recette.derush`, posé par le Best-of).

import { TV } from '../../../textes-v3';
import { recette } from '../../etat';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { ouvrirPassages } from './etat-derush';

const PRETE = true;

export function EntreePassages({ lieu }: { lieu: 'couper' | 'habiller' }) {
  const n = recette.value?.derush?.passages.length ?? 0;
  if (n === 0) return null;
  return (
    <BoutonAuto
      drapeau="derush"
      prete={PRETE}
      label={`${TV.derush.passages.bouton} (${n})`}
      testid={`v3-passages-${lieu}`}
      agir={() => {
        mettreEnPause();
        ouvrirPassages();
      }}
    />
  );
}
