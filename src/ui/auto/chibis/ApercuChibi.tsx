// Petit canevas qui montre un chibi (D, dev 3) : vignettes, grille des émotions, grand aperçu. Les deux images
// (bouche fermée / ouverte) sont dessinées une fois et gardées : l'animation ne coûte qu'une copie.

import { useEffect, useRef } from 'preact/hooks';
import { dessinerChibi } from '../../../chibis/dessin';
import { cadrePng } from '../../../chibis/png';
import type { DefinitionChibi, Emotion, Situation } from '../../../recette/types';
import { battement } from './atelier';

interface Props {
  def: DefinitionChibi;
  emo?: Emotion;
  /** Situation de jeu (persos en papier découpé). */
  sit?: Situation;
  /** Hauteur affichée (px CSS). */
  taille: number;
  /** Bouche qui bat (6 fois par seconde). */
  anime?: boolean;
  /** Signes animés (larmes, « zzz »…) : redessiné à chaque battement (grand aperçu seulement). */
  signes?: boolean;
  label?: string;
  testid?: string;
}

export function ApercuChibi({ def, emo = 'parle', sit, taille, anime = false, signes = false, label, testid }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const images = useRef<{ cle: string; c: (HTMLCanvasElement | null)[] } | null>(null);
  const tic = anime ? battement.value : 0;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const { l, ht, cadre } = cadrePng(Math.round(taille * dpr), def.style);
    if (c.width !== l || c.height !== ht) {
      c.width = l;
      c.height = ht;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const ouverte = anime && tic % 2 === 0;
    ctx.clearRect(0, 0, l, ht);
    if (signes) return dessinerChibi(ctx, def, { emo, bouche: ouverte, t: tic / 12, ...(sit ? { sit } : {}) }, cadre);
    const cle = `${JSON.stringify(def)}|${emo}|${sit ?? ''}|${l}`;
    if (images.current?.cle !== cle) images.current = { cle, c: [null, null] };
    const i = ouverte ? 1 : 0;
    let img = images.current.c[i] ?? null;
    if (!img) {
      img = document.createElement('canvas');
      img.width = l;
      img.height = ht;
      const ic = img.getContext('2d');
      if (ic) dessinerChibi(ic, def, { emo, bouche: ouverte, ...(sit ? { sit } : {}) }, cadre);
      images.current.c[i] = img;
    }
    ctx.drawImage(img, 0, 0);
  }, [def, emo, sit, taille, tic, signes]);
  return <canvas ref={ref} class="chibi-apercu" style={{ width: `${Math.round(taille * 0.8)}px`, height: `${taille}px` }} role="img" aria-label={label} data-testid={testid} />;
}
