// Point d'entrée du « Montage express » (H, intégrateur), à côté de « Monteur IA » quand on importe une longue vidéo.
// (Autre entrée : le menu ⋮ d'un montage dans Mes montages.)

import { TA } from '../../../textes-auto';
import { sourceMonteur } from '../../monteur/etat-monteur';
import { BoutonAuto } from '../BoutonAuto';
import { ouvrirExpress } from './etat-express';

const PRETE = true;

export function EntreeExpress() {
  return (
    <BoutonAuto
      drapeau="express"
      prete={PRETE}
      label={TA.express.bouton}
      testid="auto-express"
      principal
      icone={<span class="monteur-etoile" aria-hidden="true" />}
      agir={() => {
        const s = sourceMonteur.peek();
        if (s) return ouvrirExpress(s);
      }}
    />
  );
}
