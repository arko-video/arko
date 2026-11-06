// Compositeur : dessine UNE image de la vidéo finale à partir de son état et de l'image source décodée.
// Ordre : mouvement de transition (zoom, secousse) → zoom fixe du plan (Montage auto) → zoom → mise en page → glisse (décalage + flou de mouvement)
//         → fonds verts et mèmes posés par-dessus (Ma bibliothèque) → calque de transition (flash, noir, glitch) → textes → sous-titres.
// Tailles pensées pour 1080 px (le petit côté du gabarit) × env.echelle. Utilisé tel quel par l'aperçu et par l'export (un seul chemin de rendu).

import type { Ctx2D, Env, ImageSource } from './canevas';
import { dessinerSousTitres } from './couches/sous-titres';
import { dessinerTextes } from './couches/textes';
import { appliquerMouvement, dessinerTransition, glisserImage, mouvementsTransition, type TamponImage } from './couches/transitions';
import { appliquerZoom, zoneDuZoom } from './couches/zooms';
import { appliquerZoomFixe } from './couches/zoom-fixe';
import type { EtatImage } from './etat-image';
import { poserCalques, type CalqueClip } from './incrustation/incruster';
import { dessinerFlou, type FondFlou, type Rect } from './mises-en-page/flou';
import { dessinerJeuCam, placementJeuCam, type ZoomBande } from './mises-en-page/jeu-cam';
import { dessinerRecadre } from './mises-en-page/recadre';

/**
 * Dessine l'image. `image` null (pas encore décodée, ou absente) → écran noir.
 * `tampon` = canevas de travail des transitions (flou de mouvement, glitch) ; sans lui, ces effets sont sautés.
 */
export function dessinerImage(
  ctx: Ctx2D,
  etat: EtatImage | null,
  image: ImageSource | null,
  env: Env,
  fond: FondFlou,
  tampon?: TamponImage,
  /** Ma bibliothèque : clips détourés (fonds verts, mèmes) déjà prêts, posés au-dessus de la vidéo. */
  calques?: readonly CalqueClip[],
) {
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
  if (calques && calques.length > 0) poserCalques(ctx, calques);
  dessinerTransition(ctx, etat.transition, env, etat.t, tampon);
  dessinerTextes(ctx, etat.textes, env, etat.gab);
  dessinerSousTitres(ctx, etat.sousTitres, env, etat.gab);
}

/**
 * Mise en page, avec le zoom sur toute l'image ou (Jeu + webcam) sur une seule bande.
 * Le zoom fixe du plan (Montage auto, C) se combine avec le zoom posé ; en Jeu + webcam il ne zoome que le jeu.
 */
function dessinerMise(ctx: Ctx2D, etat: EtatImage, image: ImageSource, env: Env, fond: FondFlou) {
  const m = etat.mise;
  const zone = zoneDuZoom(etat.zoom, m);
  const fixe = etat.plan.zoomFixe;
  if (m.type === 'jeuCam') return dessinerJeuCamZooms(ctx, etat, image, m, env, zone);
  appliquerZoomFixe(ctx, fixe, env);
  if (zone === 'tout') appliquerZoom(ctx, etat.zoom, env);
  if (m.type === 'recadre') dessinerRecadre(ctx, image, m.x, env);
  else dessinerFlou(ctx, image, m.y, env, fond);
}

type MiseJeuCam = Extract<EtatImage['mise'], { type: 'jeuCam' }>;

/** Jeu + webcam : zoom posé sur sa bande (cam par défaut), zoom fixe sur la bande du jeu. */
function dessinerJeuCamZooms(ctx: Ctx2D, etat: EtatImage, image: ImageSource, m: MiseJeuCam, env: Env, zone: 'tout' | 'cam' | 'jeu') {
  const fixe = etat.plan.zoomFixe;
  const zoomPose = (c: Ctx2D, r: Rect) => appliquerZoom(c, etat.zoom, env, r);
  if (!fixe || zone === 'cam') {
    const bande: ZoomBande | undefined = zone === 'tout' ? undefined : { zone, appliquer: zoomPose };
    dessinerJeuCam(ctx, image, m, env, bande);
    if (!fixe) return;
    // Zoom posé sur la webcam ET zoom fixe : on redessine la bande du jeu, agrandie (cas rare).
    const { jeu } = placementJeuCam(image.largeur, image.hauteur, m, env.l, env.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(jeu.dst.x, jeu.dst.y, jeu.dst.l, jeu.dst.h);
    ctx.clip();
    appliquerZoomFixe(ctx, fixe, env, jeu.dst);
    image.dessiner(ctx, jeu.src.x, jeu.src.y, jeu.src.l, jeu.src.h, jeu.dst.x, jeu.dst.y, jeu.dst.l, jeu.dst.h);
    ctx.restore();
    return;
  }
  dessinerJeuCam(ctx, image, m, env, {
    zone: 'jeu',
    appliquer: (c, r) => {
      appliquerZoomFixe(c, fixe, env, r);
      if (zone === 'jeu') zoomPose(c, r);
    },
  });
}
