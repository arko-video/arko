// Écrans de la v3 « Best-of » posés PAR-DESSUS l'écran en cours (comme Ma bibliothèque), montés une fois dans App.tsx.
// Chacun ne s'affiche que si son signal est ouvert. Fichier GELÉ (intégrateur) : chaque dev ne modifie que son écran.

import { AtelierChibi } from './chibis/AtelierChibi';
import { PassagesNonRetenus } from './derush/PassagesNonRetenus';
import { ChoixPistes } from './insertion/ChoixPistes';
import { SurcoucheInsertion } from './insertion/SurcoucheInsertion';
import { QuiParle } from './voix/QuiParle';

export function SurcouchesV3() {
  return (
    <>
      <PassagesNonRetenus />
      <QuiParle />
      <SurcoucheInsertion />
      <ChoixPistes />
      {/* L'atelier en dernier : il s'ouvre aussi PAR-DESSUS « Qui parle ? » et « Insérer ici ». */}
      <AtelierChibi />
    </>
  );
}
