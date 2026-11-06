// Point d'entrée de « Enlever les bords de l'écran » (D, dev 1), dans Couper (l'étape Cadrage est sautée pour une
// capture déjà en 16:9) et dans Vertical / Cadrage. Le panneau détecte les bords fixes sur 20 images, les propose,
// et laisse les ajuster avec des poignées.

import { useState } from 'preact/hooks';
import { TA } from '../../../textes-auto';
import { sourceVerticale } from '../../etat';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { PanneauRognage } from './PanneauRognage';

const PRETE = true;

export function EntreeRognage({ lieu }: { lieu: 'couper' | 'vertical' }) {
  const [ouvert, setOuvert] = useState(false);
  // Une vidéo verticale (téléphone) n'est pas une capture d'écran : pas de bouton.
  if (sourceVerticale.value) return null;
  return (
    <>
      <BoutonAuto
        drapeau="rognage"
        prete={PRETE}
        label={TA.coupes.rognage.bouton}
        testid={`auto-rognage-${lieu}`}
        agir={() => {
          mettreEnPause();
          setOuvert(true);
        }}
      />
      {ouvert && <PanneauRognage fermer={() => setOuvert(false)} />}
    </>
  );
}
