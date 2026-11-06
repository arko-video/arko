// Avertissements « zone sûre » (fonction pure) : ce que TikTok ou YouTube risque de cacher (onglets en haut,
// description et boutons en bas). On utilise EXACTEMENT la mise en page du moteur (mêmes mesures que le dessin).
// L'interface affiche ces messages dans Habiller.

import { placerSousTitre } from '../moteur/couches/sous-titres';
import { centreTexte, mettreEnPageTexte } from '../moteur/couches/textes';
import { compiler } from './chronologie';
import { gabaritDe } from './destination';
import type { Recette } from './types';

export const MESSAGE_SOUS_TITRES_BAS = 'Tes sous-titres risquent d\'être cachés par la description TikTok.';
const MESSAGE_ST_SHORT = 'Tes sous-titres risquent d\'être cachés par le titre du Short.';
const MESSAGE_ST_YOUTUBE = 'Tes sous-titres risquent d\'être cachés par la barre de lecture de YouTube.';

/** Début du texte pour le message (30 caractères au plus). */
function extrait(txt: string): string {
  const t = txt.replace(/\s+/g, ' ').trim();
  return t.length > 30 ? `${t.slice(0, 29).trimEnd()}…` : t;
}

/** Messages en français sur les textes déplacés et les sous-titres trop bas (liste vide si tout va bien). */
export function avertissementsZone(recette: Recette): string[] {
  const res: string[] = [];
  const gab = gabaritDe(recette);
  const tiktok = gab.id === 'tiktok';
  for (const texte of recette.textes) {
    const mp = mettreEnPageTexte(texte.txt, texte.style, gab);
    if (!mp) continue;
    const { deplace } = centreTexte(mp, texte.x, texte.y, gab);
    const nom = `Le texte « ${extrait(texte.txt)} »`;
    if (deplace === 'remonte') res.push(tiktok ? `${nom} descendait sous la description TikTok : il est remonté pour rester visible.` : `${nom} descendait sous l'interface de YouTube : il est remonté pour rester visible.`);
    if (deplace === 'descendu') res.push(tiktok ? `${nom} montait sous les onglets de TikTok : il est descendu pour rester visible.` : `${nom} montait sous l'interface de YouTube : il est descendu pour rester visible.`);
  }
  const st = compiler(recette).sousTitres;
  const tropBas = st?.lignes.some((ligne) => {
    const place = placerSousTitre({ ligne, style: st.style, y: st.y, actif: 0, ageMot: 1 }, gab);
    return place !== null && (place.cy + place.dl.h / 2) / gab.h > gab.basSousTitresMax;
  });
  if (tropBas) res.push(tiktok ? MESSAGE_SOUS_TITRES_BAS : gab.paysage ? MESSAGE_ST_YOUTUBE : MESSAGE_ST_SHORT);
  return res;
}
