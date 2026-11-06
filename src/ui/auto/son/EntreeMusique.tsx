// Point d'entrée de la « Musique » de fond (F, dev 3), dans Habiller → Sons : ouvre le panneau Musique (PanneauMusique) :
// 1 à 6 morceaux (Mes sons ou fichier), baisse quand on parle, volume, rappels de licence.

import { TA } from '../../../textes-auto';
import { IconeNote } from '../../composants/Icones';
import { BoutonAuto } from '../BoutonAuto';
import { panneauSonAuto } from './etat-son';

const PRETE = true;

export function EntreeMusique() {
  return (
    <BoutonAuto
      drapeau="musique"
      prete={PRETE}
      label={TA.son.musique.onglet}
      testid="auto-musique"
      icone={<IconeNote taille={18} />}
      agir={() => (panneauSonAuto.value = 'musique')}
    />
  );
}
