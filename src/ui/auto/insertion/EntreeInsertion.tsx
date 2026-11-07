// Point d'entrée « Insérer ici » (B, dev 2), dans Couper et Habiller → Couper (caché derrière le drapeau
// « insertion » tant que PRETE est faux).

import { TV } from '../../../textes-v3';
import { teteLecture } from '../../etat';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { ouvrirInsertion } from './etat-insertion';

const PRETE = true;

export function EntreeInsertion({ lieu }: { lieu: 'couper' | 'habiller' }) {
  return (
    <BoutonAuto
      drapeau="insertion"
      prete={PRETE}
      label={TV.insertion.bouton}
      testid={`v3-inserer-${lieu}`}
      agir={() => {
        mettreEnPause();
        ouvrirInsertion(lieu, teteLecture.peek());
      }}
    />
  );
}
