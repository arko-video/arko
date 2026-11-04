// Vignettes d'un plan sur la frise : seules les vignettes visibles sont demandées au moteur.

import { useEffect, useRef } from 'preact/hooks';
import type { SourceOuverte } from '../../moteur/api';
import { demanderVignette } from '../vignettes';

interface Props {
  source: SourceOuverte;
  /** Temps source du début du plan, vitesse. */
  de: number;
  a: number;
  vit: number;
  /** Position (px, relative à la vue) et largeur du plan. */
  x: number;
  largeur: number;
  /** Largeur de la vue (pour ne dessiner que le visible). */
  largeurVue: number;
  hauteur: number;
  pps: number;
}

export function VignettesPlan({ source, de, a, vit, x, largeur, largeurVue, hauteur, pps }: Props) {
  const ratio = (source.infos.l ?? 16) / (source.infos.h ?? 9);
  const lt = Math.max(24, Math.round(hauteur * ratio));
  const premier = Math.max(0, Math.floor(-x / lt));
  const dernier = Math.min(Math.ceil(largeur / lt), Math.ceil((largeurVue - x) / lt));
  const tuiles = [];
  for (let k = premier; k < dernier; k++) {
    const milieu = Math.min(largeur, k * lt + lt / 2);
    const ts = Math.min(a - 0.05, de + (milieu / pps) * vit);
    tuiles.push(<Tuile key={k} source={source} ts={ts} gauche={k * lt} largeur={lt} hauteur={hauteur} />);
  }
  return <>{tuiles}</>;
}

function Tuile({
  source,
  ts,
  gauche,
  largeur,
  hauteur,
}: {
  source: SourceOuverte;
  ts: number;
  gauche: number;
  largeur: number;
  hauteur: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hPx = Math.round(hauteur * Math.min(2, window.devicePixelRatio || 1));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return demanderVignette(source, ts, hPx, (img) => {
      if (!img) return;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
    });
  }, [source, Math.round(ts * 10), hPx]);
  return (
    <canvas
      ref={ref}
      class="tuile"
      aria-hidden="true"
      style={{ left: `${gauche}px`, width: `${largeur}px`, height: `${hauteur}px` }}
    />
  );
}
