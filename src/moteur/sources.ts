// Sources côté page : ouverture d'une vidéo choisie (analyse, codec, empreinte), recette initiale, vignettes.

import { DUREE_INITIALE, recetteVide } from '../recette/defauts';
import type { Destination } from '../recette/destination';
import { normaliser } from '../recette/normaliser';
import { arrondir } from '../recette/temps';
import type { Recette, Sec, Source } from '../recette/types';
import { calculerEmpreinte } from '../stockage/fichiers';
import type { SourceOuverte } from './api';
import { ErreurArko } from './erreurs';
import { fermerMedia, ouvrirMedia, type MediaOuvert } from './media';
import { imageDeSample } from './rendre';

/** Contenu interne d'une source ouverte (privé au moteur). */
const internes = new WeakMap<SourceOuverte, MediaOuvert>();
let compteur = 0;

export function mediaDe(source: SourceOuverte): MediaOuvert {
  const m = internes.get(source);
  if (!m) throw new ErreurArko('Cette vidéo a été fermée. Choisis-la à nouveau.', 'lecture');
  return m;
}

/** Médias indexés par id de source (pour le rendu). */
export function mediasDe(sources: SourceOuverte[]): Map<string, MediaOuvert> {
  const res = new Map<string, MediaOuvert>();
  for (const s of sources) {
    const m = internes.get(s);
    if (m) res.set(s.infos.id, m);
  }
  return res;
}

export async function ouvrirSource(fichier: File, onEtape?: (message: string) => void): Promise<SourceOuverte> {
  onEtape?.('J\'ouvre ta vidéo…');
  const media = await ouvrirMedia(fichier, 'video');
  try {
    onEtape?.('Je prépare ta vidéo…');
    const emp = await calculerEmpreinte(fichier);
    compteur++;
    const infos: Source = {
      id: 's1',
      nom: fichier.name || `video-${compteur}.mp4`,
      taille: fichier.size,
      emp,
      duree: arrondir(media.duree),
      type: 'video',
      l: media.largeur,
      h: media.hauteur,
    };
    // v3 (E) : nombre de pistes audio, seulement s'il y en a au moins 2 (OBS : micro + Discord).
    const n = media.pistesAudio?.length ?? 0;
    if (n >= 2) infos.pistes = Math.min(16, n);
    const source: SourceOuverte = { infos, verticale: media.hauteur > media.largeur, fichier };
    internes.set(source, media);
    onEtape?.('C\'est prêt !');
    return source;
  } catch (e) {
    fermerMedia(media);
    if (e instanceof ErreurArko) throw e;
    throw new ErreurArko('Impossible de lire ce fichier. Il est peut-être abîmé.', 'lecture');
  }
}

/**
 * Ouvre un SON (fichier audio, ou le son d'une vidéo) comme source `type: 'audio'` d'identifiant `id`
 * (ex. « a1 »), connue du moteur : l'aperçu et l'export pourront le mixer. Pour le dev sons (import, micro).
 * Lève ErreurArko ("format", "lecture", "pas_de_son").
 */
export async function ouvrirSourceAudio(fichier: File, id: string): Promise<SourceOuverte> {
  const media = await ouvrirMedia(fichier, 'audio');
  try {
    if (!media.sinkAudio) throw new ErreurArko('Ce fichier ne contient pas de son lisible.', 'pas_de_son');
    const infos: Source = {
      id,
      nom: fichier.name || `son-${id}`,
      taille: fichier.size,
      emp: await calculerEmpreinte(fichier),
      duree: arrondir(media.duree),
      type: 'audio',
    };
    const source: SourceOuverte = { infos, verticale: false, fichier };
    internes.set(source, media);
    return source;
  } catch (e) {
    fermerMedia(media);
    if (e instanceof ErreurArko) throw e;
    throw new ErreurArko('Impossible de lire ce son. Il est peut-être abîmé.', 'lecture');
  }
}

export function fermerSource(source: SourceOuverte): void {
  const m = internes.get(source);
  if (!m) return;
  internes.delete(source);
  fermerMedia(m);
}

/** Un plan [0, durée] (ou [0, 60] si la vidéo dépasse 180 s), mise en page fond flou. */
export function recetteInitiale(source: SourceOuverte, destination?: Destination): Recette {
  const d = source.infos.duree;
  // YouTube 16:9 : une vidéo plus longue est normale ; on garde tout jusqu'à 20 min (sinon les 10 premières).
  const limite = destination === 'youtube' ? { seuil: 1200, garde: 600 } : DUREE_INITIALE;
  const fin = d > limite.seuil ? limite.garde : d;
  const brute: Recette = { ...recetteVide(), sources: [{ ...source.infos }], plans: [{ de: 0, a: fin }] };
  if (destination) brute.destination = destination;
  return normaliser(brute, { sources: [source.infos] }).recette;
}

/** Vignette (contain sur fond noir) de la source au temps ts, ou null si l'image est introuvable. */
export async function vignette(source: SourceOuverte, ts: Sec, l: number, h: number): Promise<ImageBitmap | null> {
  const m = internes.get(source);
  if (!m?.sinkVideo) return null;
  const t = Math.min(Math.max(0, ts), Math.max(0, m.duree - 0.01));
  const sample = await m.sinkVideo.getSample(t);
  if (!sample) return null;
  try {
    const lw = Math.max(1, Math.round(l));
    const hw = Math.max(1, Math.round(h));
    const c = new OffscreenCanvas(lw, hw);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, lw, hw);
    const img = imageDeSample(sample);
    const e = Math.min(lw / img.largeur, hw / img.hauteur);
    const dl = img.largeur * e;
    const dh = img.hauteur * e;
    img.dessiner(ctx, 0, 0, img.largeur, img.hauteur, (lw - dl) / 2, (hw - dh) / 2, dl, dh);
    return c.transferToImageBitmap();
  } finally {
    sample.close();
  }
}
