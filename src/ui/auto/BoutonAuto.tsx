// Bouton d'entrée d'une fonction du Montage auto, caché derrière son drapeau (drapeaux.ts).
// Pas encore prête : badge « Bientôt » et message « Bientôt disponible » au toucher.
// Une erreur « pas encore fait » levée par `agir` donne le même message. Fichier GELÉ (intégrateur).
// v3 : accepte aussi les drapeaux DrapeauV3.

import type { ComponentChildren } from 'preact';
import { ErreurArko } from '../../moteur/api';
import { estPasEncoreFait } from '../../auto/pas-encore-fait';
import { TA } from '../../textes-auto';
import { afficherToast } from '../etat';
import { visible, type DrapeauAuto, type DrapeauV3 } from './drapeaux';

export interface ProprietesBoutonAuto {
  drapeau: DrapeauAuto | DrapeauV3;
  prete: boolean;
  label: string;
  testid: string;
  agir: () => unknown;
  icone?: ComponentChildren;
  principal?: boolean;
}

export function BoutonAuto({ drapeau, prete, label, testid, agir, icone, principal }: ProprietesBoutonAuto) {
  if (!visible(drapeau, prete)) return null;
  async function surToucher() {
    if (!prete) return afficherToast(TA.commun.bientot);
    try {
      await agir();
    } catch (e) {
      if (estPasEncoreFait(e)) afficherToast(TA.commun.bientot);
      else afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 5000);
    }
  }
  return (
    <button type="button" class={`btn ${principal ? 'btn-principal' : ''} btn-auto`} onClick={() => void surToucher()} data-testid={testid}>
      {icone}
      {label}
      {!prete && <span class="badge">{TA.commun.badge}</span>}
    </button>
  );
}
