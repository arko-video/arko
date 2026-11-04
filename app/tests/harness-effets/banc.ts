// Banc d'essai des effets (phase 3) dans Chrome : export d'une démo, cohérence aperçu / export, coût d'une image.
// N'importe que le moteur (pas l'interface). Construit et servi par tests/e2e-moteur/effets.spec.ts.
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import { compiler } from '../../src/recette/chronologie';
import { normaliser } from '../../src/recette/normaliser';
import type { Recette } from '../../src/recette/types';
import type { SourceOuverte } from '../../src/moteur/api';
import { dessinerImage } from '../../src/moteur/compositeur';
import { TamponImage } from '../../src/moteur/couches/transitions';
import { etatImage } from '../../src/moteur/etat-image';
import { lancerExport } from '../../src/moteur/export/client';
import { creerLecteur } from '../../src/moteur/lecteur';
import { FondFlou } from '../../src/moteur/mises-en-page/flou';
import { imageDeSample } from '../../src/moteur/rendre';
import { mediaDe, ouvrirSource } from '../../src/moteur/sources';

const L = 540;
const H = 960;

async function source(): Promise<SourceOuverte> {
  const octets = await (await fetch('fixture.mp4')).blob();
  return ouvrirSource(new File([octets], 'demo.mp4', { type: 'video/mp4' }));
}

/** Démo : 4 plans (3 coupes : flash, glisse, glitch), un zoom punch, 2 sons posés. */
function recetteDemo(s: SourceOuverte, mise: Recette['mise'] = { type: 'flou', y: 0.5 }): Recette {
  return normaliser(
    {
      plans: [
        { de: 0, a: 2 },
        { de: 3, a: 5, trans: 'flash' },
        { de: 6, a: 8, trans: { type: 'glisse', dur: 0.4 } },
        { de: 9, a: 11.5, trans: 'glitch' },
      ],
      mise,
      zooms: [{ ts: 3.8, force: 1.6, x: 0.5, y: 0.45, style: 'punch', dur: 0.7 }],
      sons: [{ id: 'impact.meme', ts: 3.8 }, { id: 'meme.klaxon', ts: 10, vol: 0.6 }],
      textes: [{ txt: 'Démo Arko phase 3', t: 0, dur: 2 }],
    },
    { sources: [s.infos] },
  ).recette;
}

async function versBase64(b: Blob): Promise<string> {
  const url = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.readAsDataURL(b);
  });
  return url.slice(url.indexOf(',') + 1);
}

function luminance(d: Uint8ClampedArray): Float32Array {
  const res = new Float32Array(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) res[j] = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  return res;
}

function psnr(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  const eqm = s / a.length;
  return eqm === 0 ? Infinity : 10 * Math.log10((255 * 255) / eqm);
}

/** Exporte la démo ; compare des images en pleine transition (aperçu 540 × 960 / MP4 exporté) ; renvoie le MP4. */
async function demo(temps: number[]) {
  const s = await source();
  const recette = recetteDemo(s);
  const sc = compiler(recette);
  const canvas = document.getElementById('apercu') as HTMLCanvasElement;
  const lecteur = creerLecteur(canvas);
  lecteur.charger(recette, [s]);
  const apercus: { t: number; lum: Float32Array; transition: string }[] = [];
  for (const t of temps) {
    lecteur.aller(t);
    await new Promise((ok) => setTimeout(ok, 1200)); // le temps du décodage et du dessin
    const d = canvas.getContext('2d')!.getImageData(0, 0, L, H).data;
    const e = etatImage(sc, t);
    apercus.push({ t, lum: luminance(d), transition: e?.transition ? `${e.transition.type} ${e.transition.cote} ${e.transition.avancement.toFixed(2)}` : 'aucune' });
  }
  lecteur.detruire();

  const ex = lancerExport(recette, [s]);
  const res = await ex.resultat;
  // Décodage des mêmes images dans le MP4 exporté.
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(res.fichier) });
  const sink = new VideoSampleSink((await input.getPrimaryVideoTrack())!);
  const c = new OffscreenCanvas(L, H);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const mesures: { t: number; transition: string; psnr: number }[] = [];
  for (const a of apercus) {
    const sample = await sink.getSample(a.t + 0.5 / 30);
    ctx.imageSmoothingQuality = 'high';
    sample!.draw(ctx, 0, 0, L, H);
    sample!.close();
    mesures.push({ t: a.t, transition: a.transition, psnr: psnr(a.lum, luminance(ctx.getImageData(0, 0, L, H).data)) });
  }
  input.dispose();
  return { mesures, duree: sc.duree, coupes: sc.plans.slice(1).map((p) => p.t0), base64: await versBase64(res.fichier), taille: res.fichier.size };
}

/**
 * Coût du dessin d'une image à 540 × 960, en ms : total (mise en page + effet) et SURCOÛT de l'effet
 * (même image dessinée sans transition ni zoom), mesurés en alternance. getImageData(1 pixel) force la fin du dessin.
 */
async function cout() {
  const s = await source();
  const media = mediaDe(s);
  const sample = (await media.sinkVideo!.getSample(4))!;
  const img = imageDeSample(sample);
  const c = new OffscreenCanvas(L, H);
  const ctx = c.getContext('2d', { alpha: false })!;
  const env = { l: L, h: H, echelle: L / 1080 };
  const fond = new FondFlou();
  const tampon = new TamponImage();
  const mesurer = (e: Parameters<typeof dessinerImage>[1]) => {
    const t0 = performance.now();
    dessinerImage(ctx, e, img, env, fond, tampon);
    ctx.getImageData(0, 0, 1, 1);
    return performance.now() - t0;
  };
  const moyenne = (l: number[]) => +(l.slice(3).reduce((x, y) => x + y, 0) / (l.length - 3)).toFixed(2);
  const res: Record<string, { total: number; sansEffet: number; surcout: number }> = {};
  for (const mise of [{ type: 'flou', y: 0.5 }, { type: 'jeuCam', cam: { x: 0.02, y: 0.62, l: 0.26, h: 0.34 } }] as Recette['mise'][]) {
    const sc = compiler(recetteDemo(s, mise));
    const cas: [string, number[]][] = [
      ['flash', [1.9, 2.0, 2.1]],
      ['glisse', [3.85, 3.95, 4.0, 4.1]],
      ['glitch', [5.9, 6.0, 6.1]],
      ['zoom punch', [2.85, 3.0, 3.3]],
    ];
    for (const [nom, ts] of cas) {
      const avec: number[] = [];
      const sans: number[] = [];
      for (let k = 0; k < 20; k++) {
        for (const t of ts) {
          const e = etatImage(sc, t)!;
          avec.push(mesurer(e));
          sans.push(mesurer({ ...e, transition: null, zoom: null }));
        }
      }
      const a = moyenne(avec);
      const b = moyenne(sans);
      res[`${mise.type} · ${nom}`] = { total: a, sansEffet: b, surcout: +(a - b).toFixed(2) };
    }
  }
  sample.close();
  return res;
}

(window as unknown as { banc: object }).banc = { demo, cout };
document.title = 'pret';
