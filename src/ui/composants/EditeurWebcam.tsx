// Éditeur « Jeu + webcam » : sur une image fixe de la vidéo d'origine, on place le cadre « Ta webcam »
// (déplacer, 4 poignées de 48 px), on fait glisser la zone de jeu (x), on choisit en haut / en bas et la taille.
// L'aperçu suit chaque réglage ; le dernier cadre est mémorisé pour le montage suivant.
// Bords d'écran enlevés (Montage auto D) : l'image montrée est l'image ROGNÉE, comme celle que le moteur dessine,
// donc le cadre de la webcam est placé dans la même image que celle du rendu.

import { useEffect, useRef } from 'preact/hooks';
import { vignette } from '../../moteur/api';
import type { ImageSource } from '../../moteur/canevas';
import { imageRognee } from '../../moteur/rognage';
import { choisirMise, planA } from '../../recette/operations';
import { JEU_CAM } from '../../recette/defauts';
import { T } from '../../textes-fr';
import { modifier, recette, recetteAffichee, recetteTemporaire, sources, teteLecture } from '../etat';
import { auCentieme } from '../format';
import { mettreEnPause } from '../lecture';
import {
  bornerXJeu,
  COINS,
  deplacerCadre,
  memoriserCam,
  partJeuVisible,
  redimensionnerCadre,
  type Coin,
  type MiseJeuCam,
} from '../webcam';
import { Apercu } from './Apercu';

type Geste = { id: number; type: 'cam' | 'jeu' | Coin; x0: number; y0: number; m0: MiseJeuCam; bouge: boolean };

/** Applique une mise en page pendant un geste (aperçu seulement). */
function montrer(m: MiseJeuCam) {
  const r0 = recette.peek();
  if (r0) recetteTemporaire.value = choisirMise(r0, m);
}

/** Écrit la mise en page en cours dans l'historique et la mémorise. */
function valider() {
  const t = recetteTemporaire.peek();
  recetteTemporaire.value = null;
  if (t) modifier(() => t);
  const m = recette.peek()?.mise;
  if (m?.type === 'jeuCam') memoriserCam(m);
}

function regler(partiel: Partial<MiseJeuCam>) {
  const m = recette.peek()?.mise;
  if (m?.type !== 'jeuCam') return;
  montrer({ ...m, ...partiel });
  valider();
}

/** Flèches : déplacer le cadre, ou tirer un coin (1 % par appui, 5 % avec Maj). */
function clavierCadre(e: KeyboardEvent, cible: 'cam' | Coin) {
  const sens: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = sens[e.key];
  const m = recette.peek()?.mise;
  if (!d || m?.type !== 'jeuCam') return;
  e.preventDefault();
  const pas = e.shiftKey ? 0.05 : 0.01;
  const cam = cible === 'cam' ? deplacerCadre(m.cam, d[0] * pas, d[1] * pas) : redimensionnerCadre(m.cam, cible, d[0] * pas, d[1] * pas);
  regler({ cam });
}

export function EditeurWebcam() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const geste = useRef<Geste | null>(null);
  const source = sources.value[0];
  const r = recetteAffichee.value;
  const mise = r?.mise.type === 'jeuCam' ? r.mise : null;
  const rognage = r?.rognages?.find((x) => x.src === source?.infos.id);
  const aspectSource = source?.infos.l && source.infos.h ? source.infos.l / source.infos.h : 16 / 9;
  // Proportions de la partie gardée (toute l'image sans rognage).
  const aspect = rognage ? (aspectSource * rognage.l) / rognage.h : aspectSource;
  const cleRognage = rognage ? `${rognage.x},${rognage.y},${rognage.l},${rognage.h}` : '';

  // Image fixe de la source, au moment de la tête de lecture.
  useEffect(() => {
    const c = canvas.current;
    const rv = recette.peek();
    if (!c || !source || !rv) return;
    let vivant = true;
    const ts = planA(rv, teteLecture.peek())?.ts ?? rv.plans[0]?.de ?? 0;
    const r0 = rv.rognages?.find((x) => x.src === source.infos.id);
    // Image entière de la source (proportions d'origine), puis seulement sa partie gardée sur tout le canevas.
    const ls = 960;
    const hs = Math.round(ls / aspectSource);
    vignette(source, ts, ls, hs)
      .then((img) => {
        const ctx = c.getContext('2d');
        if (!vivant || !img || !ctx) return;
        const entiere: ImageSource = {
          largeur: img.width,
          hauteur: img.height,
          dessiner: (cx, sx, sy, sl, sh, dx, dy, dl, dh) => cx.drawImage(img, sx, sy, sl, sh, dx, dy, dl, dh),
        };
        const vue = imageRognee(entiere, r0);
        vue.dessiner(ctx, 0, 0, vue.largeur, vue.hauteur, 0, 0, c.width, c.height);
      })
      .catch((e) => console.error(e));
    return () => {
      vivant = false;
    };
  }, [source, cleRognage]);

  if (!mise || !source) return null;
  const part = partJeuVisible(aspect, mise.partCam ?? JEU_CAM.partCam);
  const xJeu = bornerXJeu(mise.x ?? 0.5, part);
  const cam = mise.cam;
  const enHaut = mise.camEnHaut !== false;

  function bas(e: PointerEvent) {
    if (!e.isPrimary || geste.current || !mise) return;
    const cible = (e.target as Element).closest<HTMLElement>('[data-cible]');
    const type = (cible?.dataset.cible ?? 'jeu') as Geste['type'];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    mettreEnPause();
    geste.current = { id: e.pointerId, type, x0: e.clientX, y0: e.clientY, m0: mise, bouge: false };
  }
  function bouge(e: PointerEvent) {
    const g = geste.current;
    const el = zone.current;
    if (!g || g.id !== e.pointerId || !el) return;
    const dx = (e.clientX - g.x0) / (el.clientWidth || 1);
    const dy = (e.clientY - g.y0) / (el.clientHeight || 1);
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 4) return;
    g.bouge = true;
    const m = g.m0;
    if (g.type === 'jeu') {
      // La zone de jeu suit le doigt.
      montrer({ ...m, x: bornerXJeu((m.x ?? 0.5) + dx, part) });
    } else if (g.type === 'cam') montrer({ ...m, cam: deplacerCadre(m.cam, dx, dy) });
    else montrer({ ...m, cam: redimensionnerCadre(m.cam, g.type, dx, dy) });
  }
  function haut(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    if (g.bouge && e.type === 'pointerup') valider();
    else recetteTemporaire.value = null;
  }

  const pc = (v: number) => `${v * 100}%`;
  return (
    <div class="editeur-cam" data-testid="editeur-webcam">
      <p class="petit doux">{T.webcam.aide}</p>
      <div
        ref={zone}
        class="cam-source"
        style={{ aspectRatio: `${aspect}` }}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        data-testid="cam-source"
      >
        <div class="cam-source-image">
          <canvas ref={canvas} width={480} height={Math.round(480 / aspect)} role="img" aria-label={T.webcam.image} />
          <div class="cam-zone-jeu" style={{ left: pc(xJeu - part / 2), width: pc(part) }} data-testid="zone-jeu" />
        </div>
        <button
          type="button"
          class="cam-cadre"
          data-cible="cam"
          aria-label={T.webcam.cadreAide}
          style={{ left: pc(cam.x), top: pc(cam.y), width: pc(cam.l), height: pc(cam.h) }}
          onKeyDown={(e) => clavierCadre(e, 'cam')}
          data-testid="cadre-webcam"
        >
          <span class="cam-cadre-label">{T.webcam.cadre}</span>
        </button>
        {COINS.map((c) => (
          <button
            type="button"
            key={c}
            class="cam-poignee"
            data-cible={c}
            aria-label={T.webcam.poignee(T.webcam.coins[c])}
            style={{ left: pc(cam.x + (c[1] === 'd' ? cam.l : 0)), top: pc(cam.y + (c[0] === 'b' ? cam.h : 0)) }}
            onKeyDown={(e) => clavierCadre(e, c)}
            data-testid={`poignee-cam-${c}`}
          >
            <span class="cam-poignee-visuel" />
          </button>
        ))}
      </div>
      <p class="petit doux">{T.webcam.aideJeu}</p>

      <div class="cam-reglages">
        <Apercu />
        <div class="cam-controles">
          <div class="segment" role="radiogroup" aria-label={T.webcam.position}>
            <button type="button" role="radio" aria-checked={enHaut} data-actif={enHaut ? '1' : '0'} onClick={() => regler({ camEnHaut: true })} data-testid="cam-en-haut">
              {T.webcam.enHaut}
            </button>
            <button type="button" role="radio" aria-checked={!enHaut} data-actif={!enHaut ? '1' : '0'} onClick={() => regler({ camEnHaut: false })} data-testid="cam-en-bas">
              {T.webcam.enBas}
            </button>
          </div>
          <label class="cam-taille">
            <span class="petit">{T.webcam.taille}</span>
            <input
              type="range"
              class="curseur"
              min={JEU_CAM.partCamMin}
              max={JEU_CAM.partCamMax}
              step={0.01}
              value={mise.partCam ?? JEU_CAM.partCam}
              onInput={(e) => {
                const m = recette.peek()?.mise;
                if (m?.type === 'jeuCam') montrer({ ...m, partCam: auCentieme(Number((e.currentTarget as HTMLInputElement).value)) });
              }}
              onChange={valider}
              data-testid="taille-webcam"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
