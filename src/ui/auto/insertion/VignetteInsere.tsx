// Tuile d'un élément inséré sans vidéo sur la frise de Couper (B, dev 2) : une petite image FABRIQUÉE par le même
// dessin que la vidéo (carton, chibi) ou l'image fixe elle-même, et son étiquette (« Carton », « Image »…).

import { useEffect, useRef } from 'preact/hooks';
import { envPour, imagesDe, policesPretes } from '../../../moteur/api';
import type { Ctx2D } from '../../../moteur/canevas';
import { dessinerElement } from '../../../moteur/inserts/inserts';
import { gabaritDe } from '../../../recette/destination';
import type { ElementInsere } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { recette } from '../../etat';

export function VignetteInsere({
  el,
  hauteur,
  testid,
}: {
  el: Exclude<ElementInsere, { type: 'clip' }>;
  hauteur: number;
  testid: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const r = recette.value;
  const g = gabaritDe(r);
  const h = Math.max(8, Math.round(hauteur));
  const l = Math.round((h * g.l) / g.h);
  const cle = JSON.stringify(el);
  useEffect(() => {
    let vivant = true;
    const dessiner = () => {
      const c = toile.current;
      const ctx = c?.getContext('2d') as Ctx2D | null | undefined;
      if (!c || !ctx || !r || !vivant) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      if (el.type !== 'image') return dessinerElement(ctx, r, { ins: el }, envPour(c.width, c.height));
      const img = imagesDe(r).get(el.img);
      if (!img) return;
      const e = Math.min(c.width / img.largeur, c.height / img.hauteur);
      const [dl, dh] = [img.largeur * e, img.hauteur * e];
      img.dessiner(ctx, 0, 0, img.largeur, img.hauteur, (c.width - dl) / 2, (c.height - dh) / 2, dl, dh);
    };
    dessiner();
    void policesPretes().then(dessiner);
    return () => void (vivant = false);
  }, [cle, r, l, h]);
  return (
    <span class="plan-insere" data-testid={testid}>
      <canvas
        ref={toile}
        width={l * 2}
        height={h * 2}
        style={{ width: `${l}px`, height: `${h}px` }}
        aria-hidden="true"
      />
      <span>{TV.insertion.etiquettes[el.type]}</span>
    </span>
  );
}
