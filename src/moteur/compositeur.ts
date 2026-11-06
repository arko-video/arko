// Compositeur : dessine UNE image de la vidéo finale à partir de son état et de l'image source décodée.
// Ordre : mouvement de transition (zoom, secousse) → zoom → mise en page → glisse (décalage + flou de mouvement)
//         → calque de transition (flash, noir, glitch) → textes → sous-titres.
// Tailles pensées pour 1080 px (le petit côté du gabarit) × env.echelle. Utilisé tel quel par l'aperçu et par l'export (un seul chemin de rendu).

import type { Ctx2D, Env, ImageSource } from './canevas';
import { dessinerSousTitres } from './couches/sous-titres';
import { dessinerTextes } from './couches/textes';
import { appliquerMouvement, dessinerTransition, glisserImage, mouvementsTransition, type TamponImage } from './couches/transitions';
import { appliquerZoom, zoneDuZoom } from './couches/zooms';
import type { EtatImage } from './etat-image';
import { dessinerFlou, type FondFlou } from './mises-en-page/flou';
import { dessinerJeuCam } from './mises-en-page/jeu-cam';
import { dessinerRecadre } from './mises-en-page/recadre';

/**
 * Dessine l'image. `image` null (pas encore décodée, ou absente) → écran noir.
 * `tampon` = canevas de travail des transitions (flou de mouvement, glitch) ; sans lui, ces effets sont sautés.
 */
export function dessinerImage(ctx: Ctx2D, etat: EtatImage | null, image: ImageSource | null, env: Env, fond: FondFlou, tampon?: TamponImage) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, env.l, env.h);
  if (etat && image && image.largeur > 0 && image.hauteur > 0) {
    for (const mouvement of mouvementsTransition(etat.transition, env, etat.t)) {
      ctx.save();
      appliquerMouvement(ctx, mouvement, env);
      dessinerMise(ctx, etat, image, env, fond);
      ctx.restore();
    }
    glisserImage(ctx, etat.transition, env, tampon);
  }
  ctx.restore();
  if (!etat) return;
  dessinerTransition(ctx, etat.transition, env, etat.t, tampon);
  dessinerTextes(ctx, etat.textes, env, etat.gab);
  dessinerSousTitres(ctx, etat.sousTitres, env, etat.gab);
}

/** Mise en page, avec le zoom sur toute l'image ou (Jeu + webcam) sur une seule bande. */
function dessinerMise(ctx: Ctx2D, etat: EtatImage, image: ImageSource, env: Env, fond: FondFlou) {
  const m = etat.mise;
  const zone = zoneDuZoom(etat.zoom, m);
  if (zone === 'tout') appliquerZoom(ctx, etat.zoom, env);
  if (m.type === 'recadre') dessinerRecadre(ctx, image, m.x, env);
  else if (m.type === 'jeuCam') {
    const bande = zone === 'tout' ? undefined : { zone, appliquer: (c: Ctx2D, r: Parameters<typeof appliquerZoom>[3]) => appliquerZoom(c, etat.zoom, env, r) };
    dessinerJeuCam(ctx, image, m, env, bande);
  } else dessinerFlou(ctx, image, m.y, env, fond);
}
