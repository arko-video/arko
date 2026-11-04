// Côté Worker : lit le son d'un fichier avec Mediabunny et remplit des fenêtres mono 16 kHz
// de 28 s au plus, avec la table des décalages (pièces) pour retrouver le temps source des mots.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { BLANC_S, FENETRE_MAX_S, FREQUENCE } from './config';
import type { Piece } from './fenetres';
import type { Plage } from './messages';
import { ajouterMono, moyenner, pointDeCoupe, versMono } from './pcm';

/** Une longue plage est coupée dans le silence le plus calme de ses 8 dernières secondes. */
const ZONE_COUPE_S = 8;

export interface SonOuvert {
  sink: AudioSampleSink;
  duree: number;
  fermer(): void;
}

/** Ouvre la piste son d'un fichier. null s'il n'y a pas de son (ou s'il est illisible ici). */
export async function ouvrirSon(fichier: Blob): Promise<SonOuvert | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(fichier, { maxCacheSize: 16 * 1024 * 1024 }) });
  try {
    const piste = await input.getPrimaryAudioTrack();
    if (!piste || !(await piste.canDecode())) {
      input.dispose();
      return null;
    }
    return { sink: new AudioSampleSink(piste), duree: await input.computeDuration(), fermer: () => input.dispose() };
  } catch {
    input.dispose();
    return null;
  }
}

/** Lit [de, a] (temps source) et l'ajoute dans la fenêtre à partir de `decalage` secondes. */
async function lireDans(son: SonOuvert, de: number, a: number, somme: Float32Array, compte: Uint16Array, decalage: number) {
  const k0 = Math.floor(decalage * FREQUENCE);
  const k1 = Math.floor((decalage + a - de) * FREQUENCE);
  for await (const s of son.sink.samples(de, a)) {
    // try/finally : le morceau décodé est toujours libéré, même si la copie échoue.
    try {
      const canaux: Float32Array[] = [];
      for (let c = 0; c < s.numberOfChannels; c++) {
        const dest = new Float32Array(s.numberOfFrames);
        s.copyTo(dest, { planeIndex: c, format: 'f32-planar' });
        canaux.push(dest);
      }
      ajouterMono(somme, compte, de - decalage, versMono(canaux), s.timestamp, s.sampleRate, k0, k1);
    } finally {
      s.close();
    }
  }
}

export interface Fenetre {
  /** Son mono 16 kHz à donner à Whisper. */
  pcm: Float32Array;
  pieces: Piece[];
  /** Où reprendre pour la fenêtre suivante. */
  i: number;
  curseur: number;
}

/**
 * Remplit une fenêtre en collant les plages à la suite (avec un petit blanc entre elles),
 * à partir de la plage `i` et du temps source `curseur`.
 */
export async function remplirFenetre(son: SonOuvert, plages: Plage[], i: number, curseur: number): Promise<Fenetre> {
  const somme = new Float32Array(FENETRE_MAX_S * FREQUENCE);
  const compte = new Uint16Array(somme.length);
  const pieces: Piece[] = [];
  let pos = 0;
  let longueur = 0;
  while (i < plages.length) {
    const p = plages[i]!;
    const place = FENETRE_MAX_S - pos;
    const dispo = p.a - curseur;
    if (place < 1) break;
    if (dispo <= place) {
      await lireDans(son, curseur, p.a, somme, compte, pos);
      pieces.push({ decalage: pos, de: curseur, a: p.a });
      longueur = pos + dispo;
      pos = longueur + BLANC_S;
      i++;
      curseur = plages[i]?.de ?? 0;
      continue;
    }
    // Plage trop longue : on lit ce qui tient, puis on coupe dans un silence pour ne pas couper un mot.
    await lireDans(son, curseur, curseur + place, somme, compte, pos);
    const pcm = moyenner(somme, compte);
    const coupe = pointDeCoupe(pcm, Math.max(pos + 1, FENETRE_MAX_S - ZONE_COUPE_S), FENETRE_MAX_S);
    const a = curseur + (coupe - pos);
    pieces.push({ decalage: pos, de: curseur, a });
    const n = Math.floor(coupe * FREQUENCE);
    return { pcm: pcm.slice(0, n), pieces, i, curseur: a };
  }
  const pcm = moyenner(somme, compte);
  return { pcm: pcm.slice(0, Math.ceil(longueur * FREQUENCE)), pieces, i, curseur };
}
