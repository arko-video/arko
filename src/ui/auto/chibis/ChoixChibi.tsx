// Choisir un chibi (D, dev 3), composant PARTAGÉ : utilisé par « Qui parle ? » (dev 1) et « Insérer ici → Un chibi »
// (dev 2). Montre le chibi actuel et ouvre l'atelier (avec Mes chibis) pour en choisir un. Propriétés FIGÉES (contrat §5).

import type { DefinitionChibi } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { BoutonAuto } from '../BoutonAuto';
import { ApercuChibi } from './ApercuChibi';
import { ouvrirAtelier } from './etat-chibis';
import { PRETE_CHIBIS } from './RayonChibis';
import './chibis.css';

export interface ProprietesChoixChibi {
  valeur: DefinitionChibi | null;
  /** Appelé avec le chibi choisi et son id dans Ma bibliothèque. */
  surChoix: (def: DefinitionChibi, bib?: string) => void;
  testid?: string;
  /** Texte du bouton (absent : « Changer de chibi » s'il y en a un, sinon « Choisir ce chibi »). */
  libelle?: string;
}

export function ChoixChibi({ valeur, surChoix, testid = 'v3-choix-chibi', libelle }: ProprietesChoixChibi) {
  return (
    <div class="choix-chibi">
      {valeur ? <ApercuChibi def={valeur} taille={56} label={TV.chibis.actuel} testid={`${testid}-apercu`} /> : <span class="petit doux">{TV.chibis.aucun}</span>}
      <BoutonAuto drapeau="chibis" prete={PRETE_CHIBIS} label={libelle ?? (valeur ? TV.chibis.avatars.changerChibi : TV.chibis.choisir)} testid={testid} agir={() => ouvrirAtelier({ id: null, pour: surChoix, ...(valeur ? { def: valeur } : {}) })} />
    </div>
  );
}
