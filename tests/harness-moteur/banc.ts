// Banc d'essai du moteur dans Chrome : utilise UNIQUEMENT l'API publique (moteur/api + recette/operations).
import { capacites, creerLecteur, estimerExport, lancerExport, ouvrirSource, recetteInitiale, vignette } from '../../src/moteur/api';
import { choisirMise, dureeFinale, scinder, supprimer } from '../../src/recette/operations';
import type { MiseEnPage } from '../../src/recette/types';

async function versBase64(b: Blob): Promise<string> {
  const url = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.readAsDataURL(b);
  });
  return url.slice(url.indexOf(',') + 1);
}

async function scenario(mise: MiseEnPage, garder: 'debut' | 'fin') {
  const octets = await (await fetch('/tests/fixtures/test-1920x1080.mp4')).blob();
  const fichier = new File([octets], 'test-1920x1080.mp4', { type: 'video/mp4' });
  const etapes: string[] = [];
  const source = await ouvrirSource(fichier, (m) => etapes.push(m));
  let r = recetteInitiale(source);
  r = scinder(r, 2);
  r = supprimer(r, garder === 'debut' ? 1 : 0);
  r = choisirMise(r, mise);
  const estimation = await estimerExport(r);
  const progres: number[] = [];
  const restes: (number | null)[] = [];
  const debut = performance.now();
  const ex = lancerExport(r, [source]);
  ex.surProgression((p, reste) => {
    progres.push(p);
    restes.push(reste);
  });
  const res = await ex.resultat;
  return {
    infos: source.infos,
    verticale: source.verticale,
    etapes,
    recette: r,
    dureeAttendue: dureeFinale(r),
    estimation,
    progres,
    restes,
    ms: Math.round(performance.now() - debut),
    largeur: res.largeur,
    hauteur: res.hauteur,
    qualite: res.qualite,
    nom: res.fichier.name,
    taille: res.fichier.size,
    base64: await versBase64(res.fichier),
  };
}

async function annulation() {
  const octets = await (await fetch('/tests/fixtures/test-1920x1080.mp4')).blob();
  const source = await ouvrirSource(new File([octets], 'a.mp4'));
  const ex = lancerExport(recetteInitiale(source), [source]);
  setTimeout(() => ex.annuler(), 300);
  try {
    await ex.resultat;
    return 'pas annulé';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function erreurFormat() {
  try {
    await ouvrirSource(new File([new Uint8Array(5000).fill(7)], 'faux.mp4'));
    return 'aucune erreur';
  } catch (e) {
    return (e as { code?: string; message: string }).code + ' | ' + (e as Error).message;
  }
}

async function apercu() {
  const octets = await (await fetch('/tests/fixtures/test-1920x1080.mp4')).blob();
  const source = await ouvrirSource(new File([octets], 'a.mp4'));
  const canvas = document.getElementById('apercu') as HTMLCanvasElement;
  const l = creerLecteur(canvas);
  l.charger(recetteInitiale(source), [source]);
  l.aller(1.5);
  await new Promise((ok) => setTimeout(ok, 800));
  const ctx = canvas.getContext('2d')!;
  const centre = ctx.getImageData(270, 480, 1, 1).data;
  const haut = ctx.getImageData(270, 20, 1, 1).data;
  l.lire();
  await new Promise((ok) => setTimeout(ok, 1500));
  const tempsApresLecture = l.temps;
  l.pause();
  const vig = await vignette(source, 1, 160, 90);
  const res = { centre: [...centre], haut: [...haut], tempsApresLecture, duree: l.duree, vignette: vig ? [vig.width, vig.height] : null };
  l.detruire();
  return res;
}

/** B-1 : deux charger() de suite (comme au montage de l'écran) → image visible sans rien toucher. */
async function doubleCharger() {
  const octets = await (await fetch('/tests/fixtures/test-1920x1080.mp4')).blob();
  const source = await ouvrirSource(new File([octets], 'a.mp4'));
  const canvas = document.getElementById('apercu') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const l = creerLecteur(canvas);
  const r = recetteInitiale(source);
  l.charger(r, [source]);
  l.aller(1);
  l.charger(choisirMise(r, { type: 'flou', y: 0.5 }), [source]);
  await new Promise((ok) => setTimeout(ok, 1000));
  const centre = [...ctx.getImageData(270, 480, 1, 1).data];
  l.detruire();
  return centre;
}

/** I-5 : annuler puis relancer tout de suite → le 2e export réussit (un seul encodeur à la fois). */
async function annulerPuisRelancer() {
  const octets = await (await fetch('/tests/fixtures/test-1920x1080.mp4')).blob();
  const source = await ouvrirSource(new File([octets], 'a.mp4'));
  const r = supprimer(scinder(recetteInitiale(source), 2), 1);
  const premier = lancerExport(recetteInitiale(source), [source]);
  await new Promise((ok) => setTimeout(ok, 400));
  premier.annuler();
  const code = await premier.resultat.then(() => 'fini', (e: { code?: string }) => e.code);
  const second = await lancerExport(r, [source]).resultat;
  const dossier = await (await navigator.storage.getDirectory()).getDirectoryHandle('exports');
  const noms: string[] = [];
  for await (const n of (dossier as unknown as { keys(): AsyncIterable<string> }).keys()) noms.push(n);
  return { code, taille: second.fichier.size, avertissement: second.avertissement ?? null, nbFichiers: noms.length };
}

(window as unknown as Record<string, unknown>).banc = { scenario, annulation, erreurFormat, apercu, capacites, doubleCharger, annulerPuisRelancer };
(window as unknown as Record<string, unknown>).bancPret = true;
