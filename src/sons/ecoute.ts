// Écoute d'un son seul (panneau Sons, son guide) : un son du catalogue, ou un son importé.
// Un seul son à la fois : en écouter un nouveau arrête le précédent.

import type { SourceOuverte } from '../moteur/api';
import { reechantillonner } from '../moteur/audio/reechantillonner';
import { chargerSon } from './chargeur';
import { pcmSource } from './import';

const FREQ = 48000;
/** Son importé : on le décode par blocs de 1 s, avec 1,5 s d'avance au plus (jamais tout le fichier en mémoire). */
const BLOC_S = 1;
const AVANCE_S = 1.5;

let contexte: AudioContext | null = null;
let arreterPrecedent: (() => void) | null = null;

function contexteAudio(): AudioContext {
  contexte ??= new AudioContext({ latencyHint: 'interactive' });
  return contexte;
}

export async function ecouterSon(son: string | SourceOuverte): Promise<() => void> {
  arreterPrecedent?.();
  const ctx = contexteAudio();
  void ctx.resume().catch(() => undefined);
  const noeuds = new Set<AudioBufferSourceNode>();
  let arrete = false;
  const arreter = () => {
    if (arrete) return;
    arrete = true;
    for (const n of noeuds) {
      try {
        n.stop();
      } catch {
        // déjà arrêté
      }
    }
    noeuds.clear();
    if (arreterPrecedent === arreter) arreterPrecedent = null;
  };
  arreterPrecedent = arreter;

  if (typeof son === 'string') {
    const d = await chargerSon(son);
    if (!arrete) jouer(ctx, d.canaux, ctx.currentTime + 0.01, noeuds);
  } else {
    void diffuser(ctx, son, () => arrete, noeuds).catch(arreter);
  }
  return arreter;
}

/** Joue des canaux 48 kHz à l'instant `quand` (horloge du contexte audio). */
function jouer(ctx: AudioContext, canaux: Float32Array[], quand: number, noeuds: Set<AudioBufferSourceNode>) {
  const longueur = canaux[0]?.length ?? 0;
  if (longueur === 0) return;
  const tampon = ctx.createBuffer(2, longueur, FREQ);
  tampon.getChannelData(0).set(canaux[0]);
  tampon.getChannelData(1).set(canaux[1] ?? canaux[0]);
  const noeud = ctx.createBufferSource();
  noeud.buffer = tampon;
  noeud.connect(ctx.destination);
  noeud.onended = () => noeuds.delete(noeud);
  noeuds.add(noeud);
  noeud.start(Math.max(quand, ctx.currentTime));
}

/** Joue un son importé bloc par bloc, en décodant juste un peu en avance. */
async function diffuser(ctx: AudioContext, source: SourceOuverte, estArrete: () => boolean, noeuds: Set<AudioBufferSourceNode>) {
  let ts = 0;
  let quand = ctx.currentTime + 0.1;
  const fin = source.infos.duree;
  while (!estArrete() && ts < fin) {
    const n = Math.round(Math.min(BLOC_S, fin - ts) * FREQ);
    if (n <= 0) break;
    const pcm = await pcmSource(source, ts, ts + n / FREQ);
    if (!pcm || estArrete()) break;
    quand = Math.max(quand, ctx.currentTime + 0.02); // si le décodage a pris du retard, on repart de maintenant
    jouer(ctx, reechantillonner(pcm, ts, 1, n), quand, noeuds);
    ts += n / FREQ;
    quand += n / FREQ;
    while (!estArrete() && quand - ctx.currentTime > AVANCE_S) await new Promise((r) => setTimeout(r, 100));
  }
}
