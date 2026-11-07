// Contrat interface ↔ moteur de la v3 « Best-of » (réexporté par api.ts). Fichier GELÉ (intégrateur) : un dev qui
// veut exposer une nouvelle fonction à l'interface le demande. Contrat : conception/contrat-wankil.md.

/** B (dev 2) : images fixes insérées (gardées sur l'appareil, décodées pour le rendu). */
export { garderImage, lireImage } from '../stockage/images';
export { ouvrirImage, imagesDe, garderImagesDe } from './inserts/images-ouvertes';
/** E (dev 2) : pistes audio d'une vidéo. */
export { pistesDuFichier, type InfoPiste } from './audio/pistes';
/** D (dev 3) : rayon Chibis de Ma bibliothèque, export PNG. */
export { listerChibis, garderChibi, modifierChibi, supprimerChibi, type MonChibi } from '../stockage/chibis';
export { chibiEnPng, chibisEnZip } from '../chibis/png';
