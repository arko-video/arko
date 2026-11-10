// Worker « arko-ecoute » : CLAP (modèle « ecoute », lu sur l'appareil, jamais téléchargé ici) écoute des sons déjà
// décodés en mono 48 kHz par la page (OfflineAudioContext), et rend le genre de chacun. Rien n'est envoyé.

import { ErreurArko } from '../../moteur/erreurs';
import { lireModele } from '../modeles/modeles';
import { ouvrirSessionWeb } from '../modeles/onnx-web';
import { entreeClap, genreDuSon, NB_TRAMES, type GenreSon } from './ecoute';

export interface DemandeEcoute {
  sons: { id: string; pcm: Float32Array }[];
}
export type DepuisWorkerEcoute =
  | { type: 'un'; id: string; genre: GenreSon | null }
  | { type: 'erreur'; message: string; code: string }
  | { type: 'fini' };

function envoyer(m: DepuisWorkerEcoute) {
  (self as unknown as Worker).postMessage(m);
}

async function ecouter(d: DemandeEcoute) {
  const octets = await lireModele('ecoute');
  if (!octets) throw new ErreurArko('L\'écoute des sons n\'est pas sur cet appareil.', 'module');
  let session;
  try {
    session = await ouvrirSessionWeb(octets);
  } catch {
    throw new ErreurArko('L\'écoute des sons est abîmée. Retélécharge-la.', 'module');
  }
  try {
    for (const s of d.sons) {
      const x = entreeClap(s.pcm);
      const r = await session.run({ input_features: { type: 'float32', data: x, dims: [1, 1, NB_TRAMES, 64] } });
      const emb = r['audio_embeds'];
      envoyer({ type: 'un', id: s.id, genre: emb ? genreDuSon(emb.data as Float32Array).genre : null });
    }
    envoyer({ type: 'fini' });
  } finally {
    await session.release?.().catch(() => undefined);
  }
}

self.onmessage = (ev: MessageEvent<DemandeEcoute>) => {
  ecouter(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu écouter tes sons. Réessaie.', code: 'analyse' });
    }
  });
};
