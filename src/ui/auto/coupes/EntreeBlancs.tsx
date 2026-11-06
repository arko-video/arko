// Point d'entrée de « Couper les blancs » (A, dev 1), dans l'étape Couper et dans Habiller → Couper.
// Le bouton ouvre le panneau (aperçu « 2 h 03 → 41 min · 312 coupes », Serré / Normal / Large, plage,
// Appliquer = un seul Annuler).

import { TA } from '../../../textes-auto';
import { IconeCiseaux } from '../../composants/Icones';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { ouvertBlancs, ouvrirBlancs } from './etat-blancs';
import { PanneauBlancs } from './PanneauBlancs';

const PRETE = true;

export function EntreeBlancs({ lieu }: { lieu: 'couper' | 'habiller' }) {
  return (
    <>
      <BoutonAuto
        drapeau="blancs"
        prete={PRETE}
        label={TA.coupes.blancs.bouton}
        testid={`auto-blancs-${lieu}`}
        icone={<IconeCiseaux taille={18} />}
        agir={() => {
          mettreEnPause();
          ouvrirBlancs();
        }}
      />
      {ouvertBlancs.value && <PanneauBlancs />}
    </>
  );
}
