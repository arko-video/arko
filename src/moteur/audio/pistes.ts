// E. Vidéo à plusieurs pistes audio (dev 2) : lister les pistes d'un fichier, et lire le son d'un plan en mixant les
// pistes gardées (`recette.pistesAudio`). Sans réglage pour la source : la piste principale seule, EXACTEMENT comme
// avant (même lecteur, même PCM). Branché dans rendre.ts (un seul chemin de rendu). Contrat : contrat-wankil.md §4.2.

import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { Recette, Sec } from '../../recette/types';
import type { CacheDecodage } from '../cache-decodage';
import { ErreurArko } from '../erreurs';
import { CACHE_LECTURE } from '../media';
import { longueurPcm, reechantillonnerDans, type Pcm } from './reechantillonner';

/** Une piste audio d'un fichier. `n` = rang parmi les pistes AUDIO (0 = la 1re). */
export interface InfoPiste {
  n: number;
  /** Nom écrit dans le fichier (OBS : « Micro », « Discord »…), sinon null. */
  nom: string | null;
  canaux: number;
  /** true si le navigateur sait la décoder. */
  lisible: boolean;
}

/** Les pistes audio d'un fichier (mediabunny `getAudioTracks`). */
export async function pistesDuFichier(fichier: Blob): Promise<InfoPiste[]> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(fichier, { maxCacheSize: CACHE_LECTURE }),
  });
  try {
    const pistes = await input.getAudioTracks();
    const res: InfoPiste[] = [];
    for (const [n, p] of pistes.entries()) {
      const nom = await p.getName().catch(() => null);
      res.push({
        n,
        nom: nom && nom.trim() ? nom.trim().slice(0, 24) : null,
        canaux: await p.getNumberOfChannels().catch(() => 0),
        lisible: await p.canDecode().catch(() => false),
      });
    }
    return res;
  } catch {
    throw new ErreurArko('Impossible de lire les pistes de son de cette vidéo.', 'lecture');
  } finally {
    input.dispose();
  }
}

/**
 * Mixe des PCM avec leurs volumes (pure) ; null si aucun. Le 1er PCM présent donne la fréquence ; les autres y sont
 * rééchantillonnés et alignés sur leur temps de début. Sortie stéréo, du plus tôt début à la plus tardive fin.
 */
export function mixerPistes(pcms: readonly (Pcm | null)[], vols: readonly number[]): Pcm | null {
  const presents = pcms
    .map((p, i) => ({ p, v: vols[i] ?? 1 }))
    .filter((x): x is { p: Pcm; v: number } => !!x.p && longueurPcm(x.p) > 0);
  if (presents.length === 0) return null;
  const f = presents[0]!.p.frequence;
  const debut = Math.min(...presents.map((x) => x.p.debut));
  const fin = Math.max(...presents.map((x) => x.p.debut + longueurPcm(x.p) / x.p.frequence));
  const n = Math.max(1, Math.round((fin - debut) * f));
  const sortie = [new Float32Array(n), new Float32Array(n)];
  const tmp = [new Float32Array(n), new Float32Array(n)];
  for (const { p, v } of presents) {
    if (v === 0) continue;
    tmp[0]!.fill(0);
    tmp[1]!.fill(0);
    reechantillonnerDans(tmp, 0, n, p, debut, 1, f);
    for (let c = 0; c < 2; c++) {
      const s = sortie[c]!;
      const a = tmp[c]!;
      for (let k = 0; k < n; k++) s[k]! += a[k]! * v;
    }
  }
  return { frequence: f, debut, canaux: sortie };
}

/**
 * Son d'un morceau de plan [ts0, ts1] (temps source). Sans `pistesAudio` pour `src` : la piste principale, comme
 * avant. Avec un réglage : les pistes gardées, chacune à son volume, mélangées.
 */
export async function lireSonDuPlan(
  cache: CacheDecodage,
  recette: Recette,
  src: string,
  ts0: Sec,
  ts1: Sec,
): Promise<Pcm | null> {
  const reglage = recette.pistesAudio?.find((p) => p.src === src);
  if (!reglage) return (await cache.lecteurAudio(src)?.lire(ts0, ts1)) ?? null;
  const pcms: (Pcm | null)[] = [];
  for (const p of reglage.pistes) pcms.push((await cache.lecteurPiste(src, p.n)?.lire(ts0, ts1)) ?? null);
  return mixerPistes(
    pcms,
    reglage.pistes.map((p) => p.vol ?? 1),
  );
}
