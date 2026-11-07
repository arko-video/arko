// Empreinte de voix CAM++ (dev-voix) sur une SessionOnnx QUELCONQUE : onnxruntime-web dans le Worker des empreintes
// (worker-empreintes.ts, via modeles/onnx-web.ts), onnxruntime-node dans le banc. Aucun accès au navigateur : le son
// arrive par `lire` (mono 16 kHz), le modèle par `session`. Testable avec une fausse session.
// Modèle (modeles/catalogue.ts, CAMPLUS) : entrée `x` float32 [1, T, 80] = fbank 80 « Kaldi » (povey, son non
// multiplié, CMN) ; sortie `embedding` [1, 192], normée ici (L2).

import { ErreurArko } from '../../moteur/erreurs';
import type { Sec } from '../../recette/types';
import type { OptionsTache, PlageTemps } from '../types';
import type { SessionOnnx } from '../types-v4';
import { CAMPLUS } from '../modeles/catalogue';
import { fbank80 } from './fbank';
import { normer } from './groupes';

/** Id de l'empreinte dans EmpreintesNeurales.modele. */
export const MODELE_EMPREINTE = 'campplus-zh-en';

export const REGLAGES_EMPREINTE = {
  entree: 'x',
  sortie: 'embedding',
  /** Un son plus court est répété jusqu'à cette durée (le modèle veut au moins quelques dizaines de trames). */
  dureeMin: 0.5,
} as const;

export interface OptionsEmpreinte {
  /** Noms de l'entrée et de la sortie du modèle (CAM++ : « x » et « embedding » ; sinon la 1ʳᵉ sortie). */
  entree?: string;
  sortie?: string;
}

/** Le son répété jusqu'à `min` échantillons (morceau trop court). */
function allonger(pcm: Float32Array, min: number): Float32Array {
  if (pcm.length >= min || pcm.length === 0) return pcm;
  const res = new Float32Array(min);
  for (let i = 0; i < min; i++) res[i] = pcm[i % pcm.length]!;
  return res;
}

/** Empreinte normée (L2) d'un son mono 16 kHz. Un son vide (ou muet) donne un vecteur nul. */
export async function empreinteDuSon(session: SessionOnnx, pcm16k: Float32Array, o: OptionsEmpreinte = {}): Promise<Float32Array> {
  const x = allonger(pcm16k, Math.round(REGLAGES_EMPREINTE.dureeMin * CAMPLUS.frequence));
  const f = fbank80(x, { fenetre: 'povey', echelle: 1, cmn: true });
  if (f.trames === 0) return new Float32Array(CAMPLUS.taille);
  const r = await session.run({ [o.entree ?? REGLAGES_EMPREINTE.entree]: { type: 'float32', data: f.donnees, dims: [1, f.trames, CAMPLUS.bandes] } });
  const t = r[o.sortie ?? REGLAGES_EMPREINTE.sortie] ?? Object.values(r)[0];
  if (!t || !(t.data instanceof Float32Array)) throw new ErreurArko('L\'empreinte de voix n\'a rien rendu.', 'module');
  return normer(t.data);
}

export interface EmpreintesCalculees {
  /** Taille d'une empreinte (192 pour CAM++). */
  dim: number;
  /** n × dim valeurs, dans l'ordre des plages, chaque empreinte normée. */
  v: Float32Array;
}

/**
 * Empreintes de plusieurs plages (temps source) : `lire` rend le son mono 16 kHz de la plage. Un modèle, une plage à
 * la fois (mémoire bornée). Progression 0…1 ; annulation par `signal` (ErreurArko 'annule').
 */
export async function calculerEmpreintes(
  session: SessionOnnx,
  lire: (p: PlageTemps) => Promise<Float32Array>,
  plages: readonly PlageTemps[],
  o: OptionsTache & OptionsEmpreinte = {},
): Promise<EmpreintesCalculees> {
  const vecteurs: Float32Array[] = [];
  let dim: number = CAMPLUS.taille;
  let dernier = -1;
  for (let i = 0; i < plages.length; i++) {
    if (o.signal?.aborted) throw new ErreurArko('Analyse annulée.', 'annule');
    const v = await empreinteDuSon(session, await lire(plages[i]!), o);
    if (i === 0) dim = v.length;
    if (v.length !== dim) throw new ErreurArko('L\'empreinte de voix a changé de taille.', 'module');
    vecteurs.push(v);
    const p = Math.floor(((i + 1) / plages.length) * 100);
    if (p !== dernier) {
      dernier = p;
      o.surProgression?.((i + 1) / plages.length, `J'écoute les voix de plus près… ${i + 1} / ${plages.length}`);
    }
  }
  const v = new Float32Array(vecteurs.length * dim);
  vecteurs.forEach((x, i) => v.set(x, i * dim));
  return { dim, v };
}

/** Temps de calcul estimé (s) pour n morceaux (WASM 1 fil sur la VM : ≈ 135 ms par morceau ; téléphone ≈ × 2,5). */
export function dureeEstimeeEmpreintes(n: number, telephone = false): Sec {
  return Math.round(n * 0.135 * (telephone ? 2.5 : 1));
}
