// Clavier virtuel (Chrome Android) : la zone visible (visualViewport) rétrécit quand il s'ouvre.
// On publie sa hauteur dans --hauteur-visible pour que l'écran Habiller tienne au-dessus du clavier.

import { clavierOuvert } from './habillage';

/** Le clavier est considéré ouvert si la zone visible perd plus de 150 px. */
const SEUIL_PX = 150;

/** À appeler au montage de l'écran Habiller. Renvoie la fonction de nettoyage. */
export function suivreClavier(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  const racine = document.documentElement;
  const majour = () => {
    const ouvert = window.innerHeight - vv.height > SEUIL_PX;
    clavierOuvert.value = ouvert;
    if (ouvert) {
      racine.style.setProperty('--hauteur-visible', `${Math.round(vv.height)}px`);
      racine.style.setProperty('--haut-visible', `${Math.round(vv.offsetTop)}px`);
    } else {
      racine.style.removeProperty('--hauteur-visible');
      racine.style.removeProperty('--haut-visible');
    }
  };
  vv.addEventListener('resize', majour);
  vv.addEventListener('scroll', majour);
  majour();
  return () => {
    vv.removeEventListener('resize', majour);
    vv.removeEventListener('scroll', majour);
    racine.style.removeProperty('--hauteur-visible');
    racine.style.removeProperty('--haut-visible');
    clavierOuvert.value = false;
  };
}
