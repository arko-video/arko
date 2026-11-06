// Banc « Fond vert » dans Chrome : le shader WebGL2 (gpu-chroma.ts) doit donner le MÊME détourage que la référence
// processeur (chroma.ts, aussi le repli sans WebGL2) sur des images FABRIQUÉES (banc-chroma.ts) ; mesures du
// détourage (fond restant, sujet effacé, liseré vert) et temps par image, carte graphique et processeur.
// Lancé par tests/e2e-chroma/chroma.spec.ts ; résultat dans window.resultatBanc.

import { imageFondVert, mesurerDetourage, type ImageBanc } from '../../src/moteur/incrustation/banc-chroma';
import { CHROMA_DEFAUT, chromaCpu, detecterFond, type ReglagesChroma } from '../../src/moteur/incrustation/chroma';
import { MoteurChroma } from '../../src/moteur/incrustation/gpu-chroma';

function canevasDe(b: ImageBanc): OffscreenCanvas {
  const c = new OffscreenCanvas(b.l, b.h);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(b.px), b.l, b.h), 0, 0);
  return c;
}

/** Prémultiplié (lecture de la carte graphique) → non prémultiplié, comme la sortie du processeur. */
function deprem(px: Uint8Array): Uint8ClampedArray {
  const res = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    for (let k = 0; k < 3; k++) res[i + k] = a > 0 ? Math.round((px[i + k]! * 255) / a) : 0;
    res[i + 3] = a;
  }
  return res;
}

/** Écart entre deux détourages, posés sur un gris (ce que l'on voit) : max et moyenne, sur 255. */
function ecart(a: Uint8ClampedArray, b: Uint8ClampedArray): { max: number; moyen: number } {
  let max = 0;
  let somme = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const va = (a[i + k]! * a[i + 3]! + 128 * (255 - a[i + 3]!)) / 255;
      const vb = (b[i + k]! * b[i + 3]! + 128 * (255 - b[i + 3]!)) / 255;
      const d = Math.abs(va - vb);
      max = Math.max(max, d);
      somme += d;
    }
    max = Math.max(max, Math.abs(a[i + 3]! - b[i + 3]!));
  }
  return { max: Math.round(max * 10) / 10, moyen: Math.round((somme / (a.length * 0.75)) * 1000) / 1000 };
}

async function enPng(px: Uint8ClampedArray, l: number, h: number): Promise<string> {
  // Posé sur un damier magenta / noir : tout reste de vert se voit.
  const c = new OffscreenCanvas(l, h);
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y += 16) for (let x = 0; x < l; x += 16) {
    ctx.fillStyle = ((x + y) / 16) % 2 ? '#ff00ff' : '#202020';
    ctx.fillRect(x, y, 16, 16);
  }
  const tmp = new OffscreenCanvas(l, h);
  tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), l, h), 0, 0);
  ctx.drawImage(tmp, 0, 0);
  const b = await c.convertToBlob({ type: 'image/png' });
  const o = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(s);
}

function temps(fn: () => void, n: number): number {
  fn(); // la 1re fois compile le shader
  const t0 = performance.now();
  for (let k = 0; k < n; k++) fn();
  return Math.round(((performance.now() - t0) / n) * 10) / 10;
}

async function lancer() {
  const m = MoteurChroma.creer();
  if (!m) return { webgl2: false };
  const res: Record<string, unknown> = { webgl2: true };
  const images: Record<string, string> = {};
  const cas: [string, ImageBanc][] = [
    ['vert-youtube', imageFondVert(480, 360)],
    ['vert-terne-bruite', imageFondVert(480, 360, { fond: [90, 170, 100], bruit: 40 })],
    ['bleu', imageFondVert(480, 360, { fond: [30, 90, 200], habit: [150, 30, 30] })],
  ];
  for (const [nom, b] of cas) {
    const f = detecterFond(b.px, b.l, b.h)!;
    const reg: ReglagesChroma = { couleur: f.couleur, ...CHROMA_DEFAUT };
    const cpu = chromaCpu(b.px, b.l, b.h, reg);
    m.detourer(canevasDe(b), b.l, b.h, reg);
    const gpu = deprem(m.lirePixels(b.l, b.h));
    res[nom] = { fond: f, ecart: ecart(cpu, gpu), gpu: mesurerDetourage(gpu, b), cpu: mesurerDetourage(cpu, b) };
    images[`${nom}-source`] = await enPng(b.px, b.l, b.h);
    images[`${nom}-gpu`] = await enPng(gpu, b.l, b.h);
  }
  // Temps par image : clip 1920 × 1080 (plein écran) et 1080 × 608 (largeur d'un TikTok).
  const vitesse: Record<string, { gpu: number; cpu: number }> = {};
  for (const [l, h] of [[1920, 1080], [1080, 608]] as const) {
    const b = imageFondVert(l, h);
    const c = canevasDe(b);
    const reg: ReglagesChroma = { couleur: detecterFond(b.px, l, h)!.couleur, ...CHROMA_DEFAUT };
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    vitesse[`${l}x${h}`] = {
      gpu: temps(() => {
        m.detourer(c, l, h, reg);
        m.finir();
      }, 20),
      // Repli processeur : lecture des pixels + détourage (comme incruster.ts).
      cpu: temps(() => void chromaCpu(ctx.getImageData(0, 0, l, h).data, l, h, reg), 3),
    };
  }
  res.vitesse = vitesse;
  res.images = images;
  return res;
}

lancer()
  .then((r) => ((window as unknown as { resultatBanc: unknown }).resultatBanc = r))
  .catch((e: unknown) => ((window as unknown as { resultatBanc: unknown }).resultatBanc = { erreur: String(e) }))
  .finally(() => (document.getElementById('etat')!.textContent = 'fini'));
