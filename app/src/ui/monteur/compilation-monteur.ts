// « Faire une compilation 16:9 » (fin de la revue du monteur IA, en YouTube vidéo) : les clips gardés
// deviennent UN nouveau montage, ouvert dans Couper. Les clips restent aussi dans « Mes montages ».

import { nouveauProjet, ouvrirProjet } from '../../moteur/api';
import { fusionnerRecettes } from '../../recette/compilation';
import type { Recette } from '../../recette/types';
import { TY } from '../../textes-youtube';
import { afficherToast, demarrerProjet, derniereEtape } from '../etat';
import { idCourant } from '../montages';
import { reprendreA } from '../navigation';
import { ecranMonteur, revue, sourceMonteur } from './etat-monteur';
import { gardesEcrits } from './revue-monteur';

export async function compilerGardes(): Promise<boolean> {
  await gardesEcrits();
  const source = sourceMonteur.peek();
  const ids = (revue.peek()?.gardes ?? []).map((g) => g.id).filter(Boolean);
  if (!source || ids.length === 0) {
    afficherToast(TY.monteur.rien);
    return false;
  }
  const recettes: Recette[] = [];
  for (const id of ids) {
    const p = await ouvrirProjet(id);
    if (p) recettes.push(p.recette);
  }
  const fusion = fusionnerRecettes(recettes, TY.monteur.compilation);
  if (!fusion) return false;
  await nouveauProjet();
  ecranMonteur.value = null;
  sourceMonteur.value = null;
  demarrerProjet(source, fusion);
  idCourant.value = null;
  derniereEtape.value = 'couper';
  reprendreA('couper');
  afficherToast(TY.monteur.compilationFaite(recettes.length));
  return true;
}
