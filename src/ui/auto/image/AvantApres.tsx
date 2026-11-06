// Petit avant / après de « Améliorer l'image » : la même image du montage, dessinée par le vrai chemin de rendu
// (rendre(), comme l'export) à la taille de l'export, sans puis avec l'amélioration ; on montre le centre à 100 %
// et un curseur à glisser au pouce sépare l'avant (à gauche) de l'après (à droite).

import { useEffect, useRef, useState } from 'preact/hooks';
import { avecAmeliorationForcee } from '../../../moteur/amelioration/image-amelioree';
import { imageDuMontage } from '../../../moteur/miniature';
import type { Recette } from '../../../recette/types';
import { sources } from '../../etat';
import { TI } from './textes';

/** Morceau comparé : le centre de l'image d'export, à 100 % (pixels de l'export), en 16:9 dans tous les formats. */
const MORCEAU = { l: 640, h: 360 };

/** Taille de l'image exportée (YouTube 16:9 : 1920 × 1080 ou 2560 × 1440 ; vertical : 1080 × 1920). */
export function tailleExport(r: Recette): { l: number; h: number } {
  if (r.destination === 'youtube') return r.export.qualite === 'haute' ? { l: 2560, h: 1440 } : { l: 1920, h: 1080 };
  return { l: 1080, h: 1920 };
}

/** Milieu du montage (là où il y a de l'image), hors intro. */
function tempsCompare(r: Recette): number {
  const duree = r.plans.reduce((s, p) => s + (p.a - p.de) / (p.vit ?? 1), 0);
  return Math.max(0, duree / 2);
}

export function AvantApres({ recette }: { recette: Recette }) {
  const avant = useRef<HTMLCanvasElement>(null);
  const apres = useRef<HTMLCanvasElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<'prepare' | 'pret' | 'erreur'>('prepare');
  const [pos, setPos] = useState(50);
  const { l, h } = tailleExport(recette);
  const morceau = MORCEAU;
  const cle = JSON.stringify([recette.amelioration, recette.plans, recette.mise, recette.rognages, l, h]);

  useEffect(() => {
    let vivant = true;
    setEtat('prepare');
    const { amelioration: _a, ...sans } = recette;
    const t = tempsCompare(recette);
    const dessiner = async (r: Recette, cible: HTMLCanvasElement | null) => {
      const off = new OffscreenCanvas(l, h);
      const ctx = off.getContext('2d')!;
      await avecAmeliorationForcee(() => imageDuMontage(r, sources.peek(), t, ctx, l, h));
      const c = cible?.getContext('2d');
      if (!c || !vivant) return;
      const x = Math.round((l - morceau.l) / 2);
      const y = Math.round((h - morceau.h) / 2);
      c.drawImage(off, x, y, morceau.l, morceau.h, 0, 0, morceau.l, morceau.h);
    };
    dessiner(sans, avant.current)
      .then(() => dessiner(recette, apres.current))
      .then(() => vivant && setEtat('pret'))
      .catch((e: unknown) => {
        console.error(e);
        if (vivant) setEtat('erreur');
      });
    return () => void (vivant = false);
  }, [cle]);

  function glisser(e: PointerEvent) {
    const el = zone.current;
    if (!el || (e.type === 'pointermove' && e.buttons === 0 && e.pointerType === 'mouse')) return;
    const b = el.getBoundingClientRect();
    setPos(Math.round(Math.min(100, Math.max(0, ((e.clientX - b.left) / (b.width || 1)) * 100))));
  }

  return (
    <div class="ai-comparaison" data-testid="image-avant-apres" data-etat={etat}>
      <div
        ref={zone}
        class="ai-images"
        style={{ aspectRatio: `${morceau.l} / ${morceau.h}` }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          glisser(e);
        }}
        onPointerMove={glisser}
      >
        <canvas ref={avant} width={morceau.l} height={morceau.h} aria-label={TI.avant} role="img" />
        <canvas ref={apres} width={morceau.l} height={morceau.h} aria-label={TI.apres} role="img" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
        <div class="ai-separateur" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span class="ai-etiquette ai-gauche">{TI.avant}</span>
        <span class="ai-etiquette ai-droite">{TI.apres}</span>
        {etat !== 'pret' && <p class="ai-voile">{etat === 'prepare' ? TI.prepare : TI.erreur}</p>}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-label={TI.curseur}
        onInput={(e) => setPos(Number((e.currentTarget as HTMLInputElement).value))}
        data-testid="image-curseur"
      />
    </div>
  );
}
