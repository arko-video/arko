// Point d'entrée des « Bruitages auto » (E, dev 3), dans Habiller → Sons : ouvre l'écran de revue
// (écouter / changer / retirer, « Tout poser ») et la liste éditable des déclencheurs (PanneauBruitages).

import { TA } from '../../../textes-auto';
import { IconeSon } from '../../composants/Icones';
import { BoutonAuto } from '../BoutonAuto';
import { ouvrirBruitages } from './etat-son';

const PRETE = true;

export function EntreeBruitages() {
  return (
    <BoutonAuto
      drapeau="bruitages"
      prete={PRETE}
      label={TA.son.bruitages.bouton}
      testid="auto-bruitages"
      icone={<IconeSon taille={18} />}
      agir={() => ouvrirBruitages()}
    />
  );
}
