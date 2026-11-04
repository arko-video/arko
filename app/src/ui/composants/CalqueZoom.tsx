// Cible du zoom choisi, posée sur l'aperçu de Habiller (outil Zoom ouvert).
// Glisser la cible déplace le centre du zoom (x, y en part de l'image 9:16) ; une seule entrée d'annulation
// au lâcher. Les flèches du clavier la déplacent aussi (1 %, 5 % avec Maj) ; une série d'appuis = une entrée.

import { useRef } from 'preact/hooks';
import { modifierZoom, pousser, type Historique } from '../../recette/operations';
import { ZOOM } from '../../recette/defauts';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { historique, modifier, recette, recetteAffichee, recetteTemporaire } from '../etat';
import { zoomChoisi } from '../effets';
import { auCentieme } from '../format';
import { mettreEnPause } from '../lecture';

const borne = (v: number) => auCentieme(Math.min(1, Math.max(0, v)));
/** Deux appuis de flèche plus rapprochés que ça font partie de la même série. */
const SERIE_MS = 600;

export function CalqueZoom() {
  const geste = useRef<{ id: number; r0: Recette; i: number } | null>(null);
  /** Série d'appuis de flèches : l'historique d'avant la série, le dernier produit, l'heure du dernier appui. */
  const serie = useRef<{ avant: Historique; derniere: Historique; t: number } | null>(null);
  const r = recetteAffichee.value;
  const i = zoomChoisi.value;
  const z = r && i !== null ? r.zooms[i] : undefined;
  if (!z || i === null) return null;
  const x = z.x ?? ZOOM.x;
  const y = z.y ?? ZOOM.y;

  function viser(e: PointerEvent) {
    const g = geste.current;
    const cadre = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!g || g.id !== e.pointerId || cadre.width === 0) return;
    const nx = borne((e.clientX - cadre.left) / cadre.width);
    const ny = borne((e.clientY - cadre.top) / cadre.height);
    recetteTemporaire.value = modifierZoom(g.r0, g.i, { x: nx, y: ny });
  }

  function bas(e: PointerEvent) {
    e.stopPropagation();
    const r0 = recette.peek();
    if (!e.isPrimary || !r0 || i === null) return;
    mettreEnPause();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    geste.current = { id: e.pointerId, r0, i };
    viser(e);
  }

  function haut(e: PointerEvent) {
    e.stopPropagation();
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    const finale = recetteTemporaire.peek();
    recetteTemporaire.value = null;
    if (e.type === 'pointerup' && finale) modifier(() => finale);
  }

  // Appuis de flèches rapprochés (moins de 600 ms) : une seule entrée d'annulation pour toute la série (M-3).
  function clavier(e: KeyboardEvent) {
    const sens: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = sens[e.key];
    const h = historique.peek();
    const zz = h && i !== null ? h.present.zooms[i] : undefined;
    if (!d || !h || !zz || i === null) return;
    e.preventDefault();
    const pas = e.shiftKey ? 0.05 : 0.01;
    const nx = borne((zz.x ?? ZOOM.x) + d[0] * pas);
    const ny = borne((zz.y ?? ZOOM.y) + d[1] * pas);
    if (nx === (zz.x ?? ZOOM.x) && ny === (zz.y ?? ZOOM.y)) return;
    const s = serie.current;
    const maintenant = performance.now();
    const base = s && s.derniere === h && maintenant - s.t < SERIE_MS ? s.avant : h;
    const suivant = pousser(base, modifierZoom(h.present, i, { x: nx, y: ny }));
    historique.value = suivant;
    serie.current = { avant: base, derniere: suivant, t: maintenant };
  }

  return (
    <div
      class="calque-zoom"
      onPointerDown={bas}
      onPointerMove={(e) => {
        e.stopPropagation();
        viser(e);
      }}
      onPointerUp={haut}
      onPointerCancel={haut}
      data-testid="calque-zoom"
    >
      <span
        class="cible-zoom"
        role="slider"
        tabIndex={0}
        aria-label={T.zoom.cible}
        aria-valuetext={`${Math.round(x * 100)} %, ${Math.round(y * 100)} %`}
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        onKeyDown={clavier}
        data-testid="cible-zoom"
      />
    </div>
  );
}
