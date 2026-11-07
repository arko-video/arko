// Petit aperçu d'un carton ou d'un chibi plein écran AVANT de l'insérer (B, dev 2) : dessiné par le MÊME code que la
// vidéo (moteur/inserts/carton.ts), au format du montage (9:16 ou 16:9).

import { useEffect, useRef } from 'preact/hooks';
import { envPour, policesPretes } from '../../../moteur/api';
import { dessinerElement } from '../../../moteur/inserts/inserts';
import type { Ctx2D } from '../../../moteur/canevas';
import { gabaritDe } from '../../../recette/destination';
import type { ElementInsere } from '../../../recette/types';
import { recette } from '../../etat';

export function ApercuElement({ el }: { el: ElementInsere }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const r = recette.value;
  const paysage = gabaritDe(r).paysage;
  const [l, h] = paysage ? [320, 180] : [180, 320];
  const cle = JSON.stringify(el);
  useEffect(() => {
    let vivant = true;
    const dessiner = () => {
      const c = toile.current;
      const ctx = c?.getContext('2d') as Ctx2D | null | undefined;
      if (!c || !ctx || !r || !vivant) return;
      ctx.clearRect(0, 0, c.width, c.height);
      dessinerElement(ctx, r, { ins: el }, envPour(c.width, c.height));
    };
    dessiner();
    void policesPretes().then(dessiner);
    return () => void (vivant = false);
  }, [cle, r, l]);
  return (
    <canvas
      ref={toile}
      width={l * 2}
      height={h * 2}
      class="ins-apercu"
      style={{ width: `${l}px`, height: `${h}px` }}
      data-testid="ins-apercu"
      aria-hidden="true"
    />
  );
}
