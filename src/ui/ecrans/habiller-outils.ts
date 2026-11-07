// Barre d'outils de Habiller : boutons (ordre, nom, icône) et titres des panneaux. Sortie de Habiller.tsx (< 300 lignes)
// par l'échafaudage de la v3, qui y ajoute l'outil « Avatars » (dev 3), caché tant qu'il n'est pas prêt.

import type { ComponentType } from 'preact';
import { T } from '../../textes-fr';
import { TV } from '../../textes-v3';
import { TY } from '../../textes-youtube';
import { IconeAccroche, IconeCiseaux, IconeSon, IconeSousTitres, IconeTexte, IconeTransition, IconeZoom } from '../composants/Icones';
import { IconeFondVert, IconeMeme } from '../composants/IconesBibliotheque';
import { IconeCombos, IconeModeles } from '../composants/IconesRythme';
import { IconeChapitres, IconeGenerique } from '../composants/IconesYoutube';
import { IconeAvatar } from '../auto/chibis/IconeAvatar';
import { PRETE_AVATARS } from '../auto/chibis/OutilAvatars';
import { visible } from '../auto/drapeaux';
import { OUTILS_YOUTUBE, type Outil } from '../habillage';
import { TB } from '../textes-bibliotheque';

export const BOUTONS: { outil: Outil; label: string; Icone: ComponentType<{ taille?: number }> }[] = [
  { outil: 'couper', label: T.coupe.outil, Icone: IconeCiseaux },
  { outil: 'accroche', label: T.habiller.accroche, Icone: IconeAccroche },
  { outil: 'texte', label: T.habiller.texte, Icone: IconeTexte },
  { outil: 'sousTitres', label: T.habiller.sousTitres, Icone: IconeSousTitres },
  { outil: 'sons', label: T.habiller.sons, Icone: IconeSon },
  { outil: 'transitions', label: T.habiller.transitions, Icone: IconeTransition },
  { outil: 'zoom', label: T.habiller.zoom, Icone: IconeZoom },
  { outil: 'fondVert', label: TB.fondVert.outil, Icone: IconeFondVert },
  { outil: 'memes', label: TB.memes.outil, Icone: IconeMeme },
  { outil: 'avatars', label: TV.chibis.avatars.outil, Icone: IconeAvatar },
  { outil: 'combos', label: T.combos.titre, Icone: IconeCombos },
  { outil: 'modeles', label: T.modeles.titre, Icone: IconeModeles },
  { outil: 'chapitres', label: TY.chapitres.outil, Icone: IconeChapitres },
  { outil: 'generiques', label: TY.generiques.outil, Icone: IconeGenerique },
];

export const TITRES: Record<Outil, string> = {
  couper: T.coupe.titre,
  accroche: T.accroche.titre,
  texte: T.texte.titre,
  sousTitres: T.sousTitres.titre,
  sons: T.sons.titre,
  transitions: T.transitions.titre,
  zoom: T.zoom.titre,
  combos: T.combos.titre,
  modeles: T.modeles.titre,
  chapitres: TY.chapitres.titre,
  generiques: TY.generiques.titre,
  fondVert: TB.fondVert.titre,
  memes: TB.memes.titre,
  avatars: TV.chibis.avatars.titre,
};

/** Boutons montrés : Chapitres et Intro / outro seulement en YouTube 16:9 ; Avatars seulement s'il est prêt (ou forcé). */
export function boutonsVisibles(paysage: boolean) {
  return BOUTONS.filter((b) => (paysage || !OUTILS_YOUTUBE.includes(b.outil)) && (b.outil !== 'avatars' || visible('avatars', PRETE_AVATARS)));
}
