// Calque de l'aperçu pour l'outil « Avatars » (dev 3) : un cadre par avatar ; le glisser le place, pincer à deux
// doigts ou la molette change sa taille (placerAvatar) ; une seule entrée d'annulation au lâcher.

import { useRef } from 'preact/hooks';
import { placesAuto, ySousTitresDe } from '../../../moteur/couches/avatars';
import { compiler } from '../../../recette/chronologie';
import { PLACE_AVATAR } from '../../../recette/normaliser-chibis';
import { placerAvatar } from '../../../recette/operations-chibis';
import type { PlaceAvatar, Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { gabaritProjet } from '../../destination';
import { modifier, recette, recetteAffichee, recetteTemporaire } from '../../etat';
import { mettreEnPause } from '../../lecture';
import './chibis.css';

const borne = (v: number, min = 0, max = 1) => Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;

interface Geste {
  r0: Recette;
  p: string;
  place0: PlaceAvatar;
  doigts: Map<number, { x: number; y: number }>;
  debutX: number;
  debutY: number;
  ecart0: number | null;
}

/** Place actuelle de chaque personne avec avatar (la sienne ou celle par défaut). */
export function placesAffichees(r: Recette, gab = gabaritProjet.value): { p: string; nom: string; place: PlaceAvatar }[] {
  // Les mêmes places que celles du rendu (placement des persos de qui parle : au-dessus des sous-titres en 9:16).
  const places = placesAuto(r, gab, ySousTitresDe(compiler(r)));
  return (r.personnes ?? []).filter((p) => p.avatar !== false).map((p) => ({ p: p.id, nom: p.nom, place: places.get(p.id)! }));
}

export function CalqueAvatars() {
  const geste = useRef<Geste | null>(null);
  const r = recetteAffichee.value;
  if (!r?.avatars) return null;
  const gab = gabaritProjet.value;
  const places = placesAffichees(r, gab);

  function recaler(g: Geste) {
    const actuelle = placesAffichees(recetteTemporaire.peek() ?? g.r0).find((x) => x.p === g.p);
    const pts = [...g.doigts.values()];
    if (!actuelle || pts.length === 0) return;
    g.place0 = actuelle.place;
    g.debutX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    g.debutY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    g.ecart0 = pts.length >= 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : null;
  }

  function bas(e: PointerEvent, p: string) {
    e.stopPropagation();
    const r0 = recette.peek();
    if (!r0) return;
    mettreEnPause();
    const cible = (e.currentTarget as HTMLElement).parentElement!;
    cible.setPointerCapture(e.pointerId);
    const g: Geste = geste.current ?? { r0, p, place0: { x: 0.5, y: 0.5, taille: 0.3 }, doigts: new Map(), debutX: 0, debutY: 0, ecart0: null };
    g.doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    recaler(g);
    geste.current = g;
  }

  function bouge(e: PointerEvent) {
    const g = geste.current;
    if (!g || !g.doigts.has(e.pointerId)) return;
    e.stopPropagation();
    g.doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cadre = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pts = [...g.doigts.values()];
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    let taille = g.place0.taille;
    if (pts.length >= 2 && g.ecart0) taille = borne(taille * (Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) / g.ecart0), PLACE_AVATAR.tailleMin, PLACE_AVATAR.tailleMax);
    recetteTemporaire.value = placerAvatar(g.r0, g.p, { x: borne(g.place0.x + (cx - g.debutX) / cadre.width), y: borne(g.place0.y + (cy - g.debutY) / cadre.height), taille });
  }

  function haut(e: PointerEvent) {
    const g = geste.current;
    if (!g) return;
    e.stopPropagation();
    g.doigts.delete(e.pointerId);
    if (g.doigts.size > 0) return recaler(g);
    geste.current = null;
    const finale = recetteTemporaire.peek();
    recetteTemporaire.value = null;
    if (e.type === 'pointerup' && finale) modifier(() => finale);
  }

  function molette(e: WheelEvent, p: string, place: PlaceAvatar) {
    e.preventDefault();
    const taille = borne(place.taille * (e.deltaY < 0 ? 1.06 : 1 / 1.06), PLACE_AVATAR.tailleMin, PLACE_AVATAR.tailleMax);
    modifier((x) => placerAvatar(x, p, { ...place, taille }));
  }

  return (
    <div class="calque-avatars" onPointerMove={bouge} onPointerUp={haut} onPointerCancel={haut} data-testid="calque-avatars">
      {places.map(({ p, nom, place }) => {
        const hFrac = place.taille;
        const lFrac = (place.taille * 0.8 * gab.h) / gab.l;
        const style = { left: `${(place.x - lFrac / 2) * 100}%`, top: `${(place.y - hFrac) * 100}%`, width: `${lFrac * 100}%`, height: `${hFrac * 100}%` };
        return (
          <span key={p} class="cadre-avatar" style={style} role="img" aria-label={`${nom} : ${TV.chibis.avatars.deplacer}`} onPointerDown={(e) => bas(e, p)} onWheel={(e) => molette(e, p, place)} data-testid={`cadre-avatar-${p}`}>
            <span>{nom}</span>
          </span>
        );
      })}
    </div>
  );
}
