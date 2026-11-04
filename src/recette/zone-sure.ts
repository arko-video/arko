// Avertissements « zone sûre » (fonction pure) : ce que TikTok risque de cacher (onglets en haut,
// description et boutons en bas). On utilise EXACTEMENT la mise en page du moteur (mêmes mesures que le dessin).
// L'interface affiche ces messages dans Habiller.

import { placerSousTitre } from '../moteur/couches/sous-titres';
import { centreTexte, mettreEnPageTexte } from '../moteur/couches/textes';
import { REF_H } from '../moteur/couches/mesure';
import { compiler } from './chronologie';
import { BAS_SOUS_TITRES_MAX } from './defauts';
import type { Recette } from './types';

export const MESSAGE_SOUS_TITRES_BAS = 'Tes sous-titres risquent d\'être cachés par la description TikTok.';

/** Début du texte pour le message (30 caractères au plus). */
function extrait(txt: string): string {
  const t = txt.replace(/\s+/g, ' ').trim();
  return t.length > 30 ? `${t.slice(0, 29).trimEnd()}…` : t;
}

/** Messages en français sur les textes déplacés et les sous-titres trop bas (liste vide si tout va bien). */
export function avertissementsZone(recette: Recette): string[] {
  const res: string[] = [];
  for (const texte of recette.textes) {
    const mp = mettreEnPageTexte(texte.txt, texte.style);
    if (!mp) continue;
    const { deplace } = centreTexte(mp, texte.x, texte.y);
    if (deplace === 'remonte') res.push(`Le texte « ${extrait(texte.txt)} » descendait sous la description TikTok : il est remonté pour rester visible.`);
    if (deplace === 'descendu') res.push(`Le texte « ${extrait(texte.txt)} » montait sous les onglets de TikTok : il est descendu pour rester visible.`);
  }
  const st = compiler(recette).sousTitres;
  const tropBas = st?.lignes.some((ligne) => {
    const place = placerSousTitre({ ligne, style: st.style, y: st.y, actif: 0, ageMot: 1 });
    return place !== null && (place.cy + place.dl.h / 2) / REF_H > BAS_SOUS_TITRES_MAX;
  });
  if (tropBas) res.push(MESSAGE_SOUS_TITRES_BAS);
  return res;
}
