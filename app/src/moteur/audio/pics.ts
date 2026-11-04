// Pics sonores de la vidéo finale (phase 4) : pour aimanter les combos et pour l'alerte de rythme.
// Le son de chaque plan gardé est décodé une fois (AudioSampleSink, à la volée), réduit en enveloppe RMS
// de 20 ms, puis mis en cache par (source, de, a). Le calcul des pics est dans pics-calcul.ts (pur).

import { AudioSampleSink } from 'mediabunny';
import { compiler } from '../../recette/chronologie';
import type { PicSonore } from '../../recette/rythme';
import type { Recette, Sec } from '../../recette/types';
import type { SourceOuverte } from '../api';
import { mediasDe } from '../sources';
import type { MediaOuvert } from '../media';
import { Enveloppe, PAS_ENVELOPPE, trouverPicsForts, type EnveloppePlacee } from './pics-calcul';

/** Cache des enveloppes : clé = empreinte de la source | de | a. On garde les 200 dernières. */
const cache = new Map<string, Promise<Float32Array | null>>();
const CACHE_MAX = 200;

/** Temps (sortie) des pics sonores de la vidéo finale, triés. */
export async function picsSonores(recette: Recette, sources: SourceOuverte[]): Promise<Sec[]> {
  return (await picsSonoresForts(recette, sources)).map((p) => p.t);
}

/**
 * Pics sonores AVEC leur force (volume du sommet, de 0 à 1), triés par temps.
 * Pour « Trouver le moment fort » : choisir avec picLePlusFort (recette/rythme.ts).
 */
export async function picsSonoresForts(recette: Recette, sources: SourceOuverte[]): Promise<PicSonore[]> {
  const sc = compiler(recette);
  const medias = mediasDe(sources);
  // Les plans sont décodés en parallèle (le décodeur audio travaille hors du fil principal).
  const placees = await Promise.all(
    sc.plans.map(async (p): Promise<EnveloppePlacee | null> => {
      const media = medias.get(p.src);
      const source = sources.find((s) => s.infos.id === p.src);
      if (!media?.audio || !source) return null;
      const cle = `${source.infos.emp || source.infos.id}:${source.infos.taille}|${p.de}|${p.a}`;
      let env = cache.get(cle);
      if (!env) {
        env = enveloppeDuPlan(media, p.de, p.a).catch(() => null);
        cache.set(cle, env);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      }
      const valeurs = await env;
      // Pendant un arrêt sur image il n'y a pas de son : l'enveloppe s'arrête à tFige.
      return valeurs ? { t0: p.t0, pas: PAS_ENVELOPPE / p.vit, valeurs } : null;
    }),
  );
  return trouverPicsForts(placees.filter((e): e is EnveloppePlacee => e !== null));
}

/** Enveloppe RMS du son de [de, a] (temps source), décodé morceau par morceau. */
async function enveloppeDuPlan(media: MediaOuvert, de: Sec, a: Sec): Promise<Float32Array | null> {
  if (!media.audio || !(await media.audio.canDecode())) return null;
  const sink = new AudioSampleSink(media.audio);
  const env = new Enveloppe(de, a - de);
  let tampons: Float32Array[] = [];
  for await (const s of sink.samples(de, a)) {
    try {
      const n = s.numberOfFrames;
      const nb = Math.min(2, s.numberOfChannels);
      // Tampons réutilisés d'un morceau à l'autre (pas de nouvelle mémoire à chaque morceau).
      if (tampons.length !== nb || tampons[0]!.length < n) tampons = Array.from({ length: nb }, () => new Float32Array(n));
      for (let c = 0; c < nb; c++) s.copyTo(tampons[c]!.subarray(0, n), { planeIndex: c, format: 'f32-planar' });
      env.ajouter(tampons, s.sampleRate, s.timestamp, n);
    } finally {
      s.close();
    }
  }
  return env.valeurs();
}
