// Cadre du fond vert / mème choisi, posé sur l'aperçu de Habiller (outils Fond vert et Mèmes) : le faire glisser
// déplace le clip ; deux doigts (pincer) ou la molette changent sa taille ; une seule entrée d'annulation au lâcher.
// Le rectangle est calculé comme dans le rendu (rectIncrustation), en part de l'image finale.

import { useRef } from 'preact/hooks';
import { INCRUSTATION } from '../../recette/normaliser-bibliotheque';
import { modifierIncrustation } from '../../recette/operations-bibliotheque';
import { rectIncrustation } from '../../moteur/incrustation/incruster';
import type { Recette } from '../../recette/types';
import { TB } from '../textes-bibliotheque';
import { incrustationChoisie } from '../clips-montage';
import { gabaritProjet } from '../destination';
import { modifier, recette, recetteAffichee, recetteTemporaire } from '../etat';
import { auCentieme } from '../format';
import { mettreEnPause } from '../lecture';

const borne = (v: number, min = 0, max = 1) => auCentieme(Math.min(max, Math.max(min, v)));

interface Geste {
  r0: Recette;
  i: number;
  /** Doigts posés : position de départ (px). */
  doigts: Map<number, { x: number; y: number }>;
  x0: number;
  y0: number;
  taille0: number;
  ecart0: number | null;
  debutX: number;
  debutY: number;
}

/** (Re)part de l'état actuel et des doigts posés : poser ou lever un doigt continue le geste sans saut. */
function recaler(g: Geste) {
  const actuelle = (recetteTemporaire.peek() ?? g.r0).incrustations?.[g.i];
  const pts = [...g.doigts.values()];
  if (!actuelle || pts.length === 0) return;
  g.x0 = actuelle.x ?? 0.5;
  g.y0 = actuelle.y ?? 0.5;
  g.taille0 = actuelle.taille ?? INCRUSTATION.taille.defaut;
  g.debutX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  g.debutY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  g.ecart0 = pts.length >= 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : null;
}

export function CalqueIncrustation() {
  const geste = useRef<Geste | null>(null);
  const r = recetteAffichee.value;
  const i = incrustationChoisie.value;
  const x = r && i !== null ? r.incrustations?.[i] : undefined;
  if (!r || !x || i === null || x.plein) return null;
  const src = r.sources.find((s) => s.id === x.src);
  const gab = gabaritProjet.value;
  const rect = rectIncrustation(x, src?.l ?? 16, src?.h ?? 9, { l: gab.l, h: gab.h });
  const style = { left: `${(rect.x / gab.l) * 100}%`, top: `${(rect.y / gab.h) * 100}%`, width: `${(rect.l / gab.l) * 100}%`, height: `${(rect.h / gab.h) * 100}%` };

  function appliquer(g: Geste, cadre: DOMRect) {
    const pts = [...g.doigts.values()];
    if (pts.length === 0) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const partiel: { x: number; y: number; taille?: number } = { x: borne(g.x0 + (cx - g.debutX) / cadre.width), y: borne(g.y0 + (cy - g.debutY) / cadre.height) };
    if (pts.length >= 2 && g.ecart0) {
      const ecart = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      partiel.taille = borne(g.taille0 * (ecart / g.ecart0), INCRUSTATION.taille.min, INCRUSTATION.taille.max);
    }
    recetteTemporaire.value = modifierIncrustation(g.r0, g.i, partiel);
  }

  function bas(e: PointerEvent) {
    e.stopPropagation();
    const r0 = recette.peek();
    if (!r0?.incrustations?.[i!]) return;
    mettreEnPause();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const g: Geste = geste.current ?? { r0, i: i!, doigts: new Map(), x0: 0.5, y0: 0.5, taille0: 1, ecart0: null, debutX: 0, debutY: 0 };
    g.doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    recaler(g);
    geste.current = g;
  }

  function bouge(e: PointerEvent) {
    e.stopPropagation();
    const g = geste.current;
    if (!g || !g.doigts.has(e.pointerId)) return;
    g.doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    appliquer(g, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }

  function haut(e: PointerEvent) {
    e.stopPropagation();
    const g = geste.current;
    if (!g) return;
    g.doigts.delete(e.pointerId);
    if (g.doigts.size > 0) return recaler(g);
    geste.current = null;
    const finale = recetteTemporaire.peek();
    recetteTemporaire.value = null;
    if (e.type === 'pointerup' && finale) modifier(() => finale);
  }

  function molette(e: WheelEvent) {
    e.preventDefault();
    const taille = borne((x!.taille ?? INCRUSTATION.taille.defaut) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), INCRUSTATION.taille.min, INCRUSTATION.taille.max);
    modifier((rr) => modifierIncrustation(rr, i!, { taille }));
  }

  return (
    <div class="calque-clip" onPointerDown={bas} onPointerMove={bouge} onPointerUp={haut} onPointerCancel={haut} onWheel={molette} data-testid="calque-clip">
      <span class="cadre-clip" style={style} role="img" aria-label={TB.reglages.deplacer} data-testid="cadre-clip" />
    </div>
  );
}
