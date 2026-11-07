// SessionOnnx (types-v4) sur onnxruntime-web, WASM, 1 fil (dev-vad) : c'est le « lanceur de modèle » du NAVIGATEUR
// (dans un Worker : Silero VAD dans le Worker « Qui parle », CAM++ dans celui des empreintes). Le banc lance le MÊME
// code de modèle (vad/silero.ts, voix/empreinte-neurale.ts) avec onnxruntime-node à la place.
// Le WASM d'onnxruntime est celui de l'appli (public/ort/, comme Whisper : jamais un CDN), à la même adresse que
// pour Whisper (même « ?v= ») : le service worker et le navigateur ne le gardent qu'une fois.

import type { SessionOnnx, TenseurOnnx } from '../types-v4';
import { adresseDansLAppli } from './adresses';

export interface OptionsSessionWeb {
  /**
   * Où trouver ort-wasm-simd-threaded.{mjs,wasm} : dossier (finit par « / ») ou les 2 adresses. Absent : public/ort/
   * de l'appli (en production, relatif au script : <base>/assets/… → <base>/ort/).
   */
  wasm?: string | { mjs: string; wasm: string };
}

type Ort = typeof import('onnxruntime-web/wasm');

let ortCharge: Promise<Ort> | null = null;

function dossierOrt(): string {
  return adresseDansLAppli('ort/');
}

async function chargerOrt(o: OptionsSessionWeb): Promise<Ort> {
  if (!ortCharge) {
    ortCharge = import('onnxruntime-web/wasm').then((ort) => {
      const version = `?v=${encodeURIComponent(ort.env.versions?.web ?? '0')}`;
      const w = o.wasm ?? dossierOrt();
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = typeof w === 'string' ? { mjs: `${w}ort-wasm-simd-threaded.mjs${version}`, wasm: `${w}ort-wasm-simd-threaded.wasm${version}` } : w;
      return ort;
    });
    ortCharge.catch(() => {
      ortCharge = null;
    });
  }
  return ortCharge;
}

/** Ouvre un modèle ONNX (ses octets) dans onnxruntime-web, WASM 1 fil. Lève si le fichier n'est pas un modèle lisible. */
export async function ouvrirSessionWeb(octets: ArrayBuffer | Uint8Array, o: OptionsSessionWeb = {}): Promise<SessionOnnx> {
  const ort = await chargerOrt(o);
  const donnees = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const s = await ort.InferenceSession.create(donnees, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return {
    async run(entrees: Readonly<Record<string, TenseurOnnx>>): Promise<Record<string, TenseurOnnx>> {
      const feeds: Record<string, InstanceType<Ort['Tensor']>> = {};
      for (const [nom, t] of Object.entries(entrees)) feeds[nom] = new ort.Tensor(t.type, t.data, t.dims);
      const r = await s.run(feeds);
      const res: Record<string, TenseurOnnx> = {};
      for (const [nom, t] of Object.entries(r)) {
        if (t.type !== 'float32' && t.type !== 'int64') continue;
        res[nom] = { type: t.type, data: t.data as Float32Array | BigInt64Array, dims: t.dims };
      }
      return res;
    },
    release: () => s.release(),
  };
}
