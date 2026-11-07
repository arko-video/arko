// Banc réel — une SessionOnnx (src/auto/types-v4.ts) sur onnxruntime-node (CPU, 1 fil) : le code des modèles d'Arko
// (vad/silero.ts, voix/empreinte-neurale.ts) tourne tel quel dans Node, avec ses propres tenseurs.

import * as ort from 'onnxruntime-node';
import type { SessionOnnx, TenseurOnnx } from '../../../../src/auto/types-v4';

export async function ouvrirSessionNode(chemin: string): Promise<SessionOnnx> {
  const s = await ort.InferenceSession.create(chemin, { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: 'sequential' });
  return {
    async run(entrees: Readonly<Record<string, TenseurOnnx>>): Promise<Record<string, TenseurOnnx>> {
      const feeds: Record<string, ort.Tensor> = {};
      for (const [k, t] of Object.entries(entrees)) feeds[k] = new ort.Tensor(t.type, t.data, [...t.dims]);
      const r = await s.run(feeds);
      const res: Record<string, TenseurOnnx> = {};
      for (const [k, v] of Object.entries(r)) res[k] = { type: v.type === 'int64' ? 'int64' : 'float32', data: v.data as Float32Array | BigInt64Array, dims: [...v.dims] };
      return res;
    },
    async release() {
      await s.release();
    },
  };
}
