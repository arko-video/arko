// Banc d'essai de la phase 4 dans Chrome : export des 3 combos et des 2 modèles, pics sonores (temps de calcul).
// N'importe que le moteur et la recette. Construit et servi par tests/e2e-moteur/rythme.spec.ts.
import { compiler } from '../../src/recette/chronologie';
import { normaliser } from '../../src/recette/normaliser';
import { appliquerCombo, modeleMeilleurDAbord, modeleTop3 } from '../../src/recette/operations';
import type { Recette } from '../../src/recette/types';
import type { SourceOuverte } from '../../src/moteur/api';
import { picsSonores } from '../../src/moteur/audio/pics';
import { lancerExport } from '../../src/moteur/export/client';
import { ouvrirSource } from '../../src/moteur/sources';

async function ouvrir(url: string, nom: string): Promise<SourceOuverte> {
  const octets = await (await fetch(url)).blob();
  return ouvrirSource(new File([octets], nom, { type: 'video/mp4' }));
}

async function versBase64(b: Blob): Promise<string> {
  const url = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.readAsDataURL(b);
  });
  return url.slice(url.indexOf(',') + 1);
}

function base(s: SourceOuverte, plans: unknown[]): Recette {
  return normaliser({ plans, export: { h: 1280 } }, { sources: [s.infos] }).recette;
}

async function exporter(r: Recette, s: SourceOuverte) {
  const res = await lancerExport(r, [s]).resultat;
  const sc = compiler(r);
  return {
    base64: await versBase64(res.fichier),
    duree: sc.duree,
    plans: sc.plans.map((p) => ({ t0: +p.t0.toFixed(2), tFige: +p.tFige.toFixed(2), t1: +p.t1.toFixed(2), vit: p.vit, trans: p.trans?.type ?? null })),
    sons: sc.sons.map((x) => `${x.element.id}@${x.t}`),
    zooms: sc.zooms.map((z) => z.t),
    textes: r.textes.map((x) => `${x.txt}@${x.t}`),
  };
}

async function demo() {
  const s = await ouvrir('fixture.mp4', 'demo.mp4');
  // Combos : boom à 2 s, fige à 5 s, raté à 10 s (toujours en temps de sortie de la recette du moment).
  let combos = base(s, [{ de: 0, a: 12 }]);
  combos = appliquerCombo(combos, 'boom', 2);
  combos = appliquerCombo(combos, 'fige', 5);
  combos = appliquerCombo(combos, 'rate', 10);
  const top = modeleTop3(base(s, [{ de: 0, a: 2 }, { de: 3, a: 5 }, { de: 6, a: 8 }, { de: 9, a: 11 }]))!;
  const meilleur = modeleMeilleurDAbord(base(s, [{ de: 0, a: 4 }, { de: 6, a: 12 }]), 7);
  return { combos: await exporter(combos, s), top: await exporter(top, s), meilleur: await exporter(meilleur, s) };
}

/** Pics sonores sur 60 s de son (1er appel = décodage ; 2e appel = cache). */
async function pics() {
  const s = await ouvrir('son60.mp4', 'son60.mp4');
  const r = base(s, [{ de: 0, a: 30 }, { de: 30, a: 60 }]);
  let t = performance.now();
  const p1 = await picsSonores(r, [s]);
  const premier = performance.now() - t;
  t = performance.now();
  await picsSonores(r, [s]);
  const second = performance.now() - t;
  const s12 = await ouvrir('fixture.mp4', 'demo.mp4');
  const p12 = await picsSonores(base(s12, [{ de: 0, a: 12 }]), [s12]);
  return { premier, second, nombre: p1.length, pics12: p12 };
}

(window as never as { banc: unknown }).banc = { demo, pics };
document.title = 'pret';
