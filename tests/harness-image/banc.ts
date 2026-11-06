// Banc « Améliorer l'image » dans Chrome : la carte graphique (gpu.ts) doit donner la même image que la référence
// processeur (plan-cpu.ts), et faire mieux que le bilinéaire ; puis temps par image en 1280 × 720 → 2560 × 1440.
// Lancé par tests/e2e/amelioration-image.spec.ts ; résultat dans window.resultatBanc.

import { compresser, imageJeu, psnr, reduireMoitie } from '../../src/moteur/amelioration/banc-essai';
import { mesurerVitesse } from '../../src/moteur/amelioration/banc-vitesse';
import { MoteurGpu } from '../../src/moteur/amelioration/gpu';
import { executerPlanCpu, quantifier } from '../../src/moteur/amelioration/plan-cpu';
import { choisirPlan, type ModeMoteur, type ReglagesAmelioration } from '../../src/moteur/amelioration/reglages';
import { agrandirBilineaire, type ImageF } from '../../src/moteur/amelioration/reseau';

function versCanevas(img: ImageF): OffscreenCanvas {
  const c = new OffscreenCanvas(img.l, img.h);
  const data = new ImageData(img.l, img.h);
  for (let i = 0; i < img.d.length; i++) data.data[i] = Math.round(Math.min(1, Math.max(0, img.d[i]!)) * 255);
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c;
}

function depuisPixels(px: Uint8Array, l: number, h: number): ImageF {
  const d = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) d[i] = px[i]! / 255;
  return { l, h, d };
}

async function enPng(img: ImageF): Promise<string> {
  const b = await versCanevas(img).convertToBlob({ type: 'image/png' });
  const octets = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s);
}

async function lancer() {
  const m = MoteurGpu.creer();
  if (!m) return { webgl2: false };
  const orig = imageJeu(512, 288);
  const petit = quantifier(compresser(reduireMoitie(orig), 18));
  const source = versCanevas(petit);
  const res: Record<string, unknown> = { webgl2: true, mode: m.mode, bilineaire: psnr(agrandirBilineaire(petit), orig) };
  const images: Record<string, string> = { original: await enPng(orig), bilineaire: await enPng(agrandirBilineaire(petit)) };
  const essais: { nom: string; reglages: ReglagesAmelioration; mode: ModeMoteur }[] = [
    { nom: 'fort', reglages: { niveau: 'fort', nettoyer: true, agrandir: true }, mode: 'ia' },
    { nom: 'leger', reglages: { niveau: 'leger', nettoyer: true, agrandir: true }, mode: 'ia' },
    { nom: 'classique', reglages: { niveau: 'fort', nettoyer: true, agrandir: true }, mode: 'classique' },
  ];
  for (const e of essais) {
    if (e.mode === 'ia' && m.mode !== 'ia') continue;
    const plan = choisirPlan(e.reglages, e.mode, petit.l, petit.h, 2)!;
    const t = m.traiter(source, petit.l, petit.h, plan, true);
    const gpu = depuisPixels(m.lirePixels(t.l, t.h), t.l, t.h);
    const cpu = executerPlanCpu(petit, plan);
    res[e.nom] = { plan, l: t.l, h: t.h, gpuContreCpu: psnr(gpu, cpu, 1), gpuContreOriginal: psnr(gpu, orig), cpuContreOriginal: psnr(cpu, orig) };
    images[e.nom] = await enPng(gpu);
  }
  // Temps par image, taille réelle d'une capture OBS : 1280 × 720 dessinée en 2560 × 1440.
  const vitesse: Record<string, unknown> = {};
  for (const niveau of ['leger', 'fort'] as const) {
    vitesse[niveau] = await mesurerVitesse({ niveau, nettoyer: true, agrandir: true }, 1280, 720, 2, 5);
  }
  res.vitesse = vitesse;
  res.images = images;
  return res;
}

const etat = document.getElementById('etat')!;
lancer()
  .then((r) => {
    (window as unknown as { resultatBanc: unknown }).resultatBanc = r;
    etat.textContent = 'fini';
  })
  .catch((e: unknown) => {
    (window as unknown as { resultatBanc: unknown }).resultatBanc = { erreur: String(e) };
    etat.textContent = 'erreur';
  });
