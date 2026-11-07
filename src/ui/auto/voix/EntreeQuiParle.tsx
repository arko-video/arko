// Point d'entrée « Qui parle ? » (C, dev 1). Inséré dans Habiller → Avatars (OutilAvatars, dev 3) ; caché derrière
// le drapeau « quiParle » tant que PRETE est faux.

import { TV } from '../../../textes-v3';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { ouvrirQuiParle } from './etat-voix';

const PRETE = true;

export function EntreeQuiParle() {
  return (
    <BoutonAuto
      drapeau="quiParle"
      prete={PRETE}
      label={TV.voix.bouton}
      testid="v3-qui-parle"
      agir={() => {
        mettreEnPause();
        ouvrirQuiParle();
      }}
    />
  );
}
