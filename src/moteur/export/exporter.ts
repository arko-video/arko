// Boucle d'export (dans le Worker) : image par image sur un OffscreenCanvas → CanvasSource (await = contre-pression),
// son entrelacé avec ~0,5 s d'avance → AudioSampleSource (f32-planar 48 kHz stéréo, son guide retiré).
// Le MP4 est écrit sur le disque (OPFS) avec fastStart 'reserve' ; repli fastStart:false si la réserve échoue.
// Volume final (Montage auto F, si recette.volumeFinal) : 2 passes. Passe 1 (~10 % de la barre) : le son seul, sans
// images, mesuré (LUFS) puis essayé dans le limiteur ; passe 2 : l'export, chaque bloc de son passe par le gain et le
// limiteur de crête vraie, et un second mesureur donne le bilan affiché à la fin.

import { AudioSample, AudioSampleSource, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny';
import type { Recette, VolumeFinal } from '../../recette/types';
import { gainCompense, gainVersCible, LimiteurCreteVraie, MesureurSonie, type BilanSonie } from '../audio/sonie';
import { FREQUENCE_SORTIE } from '../audio/reechantillonner';
import { contexte2D, envPour } from '../canevas';
import { ErreurArko } from '../erreurs';
import type { MediaOuvert } from '../media';
import { rendre } from '../rendre';
import { configVideo, type EssaiEncodage } from './cascade';
import { creerSortie, type Sortie } from './sortie-opfs';

export const IPS = 30;
const AVANCE_AUDIO_S = 0.5;
const BLOC_AUDIO = 12_000; // 0,25 s à 48 kHz
const DEBIT_AUDIO = 128_000;

export interface OptionsExport {
  recette: Recette;
  medias: ReadonlyMap<string, MediaOuvert>;
  essai: EssaiEncodage;
  /** Débit du son AAC (b/s) : 128 kb/s par défaut ; YouTube 16:9 : le plus haut permis, jusqu'à 384 kb/s. */
  debitAudio?: number;
  /** Nom du fichier de sortie. */
  nom: string;
  fastStart: 'reserve' | false;
  /** Vérifié régulièrement : true = l'utilisateur a annulé. */
  annule: () => boolean;
  surProgression: (p: number, resteS: number | null) => void;
}

export interface ResultatBrut {
  fichier: File;
  largeur: number;
  hauteur: number;
  /** Volume mesuré et corrigé (si la recette demande un volume final). */
  sonie?: BilanSonie;
}

/** Part de la barre de progression prise par la mesure du volume (passe 1). */
export const PART_MESURE = 0.1;

/**
 * Passe 1 du volume final : mixe tout le son (sans images), le mesure, puis l'essaie dans le limiteur pour connaître
 * la sonie perdue sur les crêtes. Renvoie la sonie d'origine et le gain à appliquer.
 */
export async function mesurerVolume(o: OptionsExport, cible: VolumeFinal): Promise<{ lufsAvant: number; gainDb: number }> {
  const rendu = rendre(o.recette, o.medias);
  const nb = Math.round(rendu.duree * FREQUENCE_SORTIE);
  const brut = new MesureurSonie();
  const blocs: Float32Array[][] = [];
  try {
    for (let k = 0; k < nb; k += BLOC_AUDIO) {
      verifier(o);
      const bloc = await rendu.audio(k / FREQUENCE_SORTIE, Math.min(BLOC_AUDIO, nb - k), { guide: false });
      brut.ajouter(bloc);
      // On garde le son en mémoire seulement s'il est court (≤ 1 min) ; sinon on le remixe pour l'essai.
      if (nb <= 60 * FREQUENCE_SORTIE) blocs.push(bloc);
      if ((k / BLOC_AUDIO) % 20 === 0) o.surProgression((PART_MESURE * k) / nb / 2, null);
    }
  } finally {
    await rendu.fermer();
  }
  const lufsAvant = brut.resultat().lufs;
  const essai = gainVersCible({ lufs: lufsAvant, creteDbtp: 0 }, cible);
  // Essai du limiteur à ce gain : la sonie qu'il fait perdre est rajoutée au gain.
  const essaiLimite = new MesureurSonie();
  const lim = new SortieLimitee(new LimiteurCreteVraie(essai, cible.crete), async (c) => essaiLimite.ajouter(c));
  if (blocs.length > 0) for (const b of blocs) await lim.pousser(b.map((c) => c.slice()));
  else {
    const rendu2 = rendre(o.recette, o.medias);
    try {
      for (let k = 0; k < nb; k += BLOC_AUDIO) {
        verifier(o);
        await lim.pousser(await rendu2.audio(k / FREQUENCE_SORTIE, Math.min(BLOC_AUDIO, nb - k), { guide: false }));
        if ((k / BLOC_AUDIO) % 20 === 0) o.surProgression(PART_MESURE * (0.5 + k / nb / 2), null);
      }
    } finally {
      await rendu2.fermer();
    }
  }
  await lim.finir();
  return { lufsAvant, gainDb: gainCompense(essai, essaiLimite.resultat().lufs, cible) };
}

/**
 * Le limiteur retarde le son de `latence` échantillons (il regarde en avance) : on jette ce retard au début et on
 * pousse autant de silence à la fin. Le son sorti a donc exactement la durée et la position du son d'origine.
 */
export class SortieLimitee {
  private aJeter: number;
  position = 0;
  constructor(
    private readonly limiteur: LimiteurCreteVraie,
    private readonly ecrire: (canaux: Float32Array[], position: number) => Promise<void>,
  ) {
    this.aJeter = limiteur.latence;
  }
  async pousser(canaux: Float32Array[]): Promise<void> {
    this.limiteur.traiter(canaux);
    const j = Math.min(this.aJeter, canaux[0]!.length);
    this.aJeter -= j;
    const reste = j > 0 ? canaux.map((c) => c.subarray(j)) : canaux;
    if (reste[0]!.length === 0) return;
    await this.ecrire(reste, this.position);
    this.position += reste[0]!.length;
  }
  /** Fait sortir le son encore retenu (à appeler une fois, à la fin). */
  async finir(): Promise<void> {
    const n = this.limiteur.latence;
    await this.pousser([new Float32Array(n), new Float32Array(n)]);
  }
}

/** Nombre d'images de la vidéo finale (30 i/s). */
export function nombreImages(duree: number): number {
  return Math.max(1, Math.round(duree * IPS));
}

/** Nombres maximaux de paquets réservés en tête de fichier (marge de 33 %). */
export function paquetsMax(duree: number): { video: number; audio: number } {
  return { video: Math.ceil(nombreImages(duree) * 1.33) + 10, audio: Math.ceil(duree * 100 * 1.33) + 10 };
}

/** Lève ErreurArko('annule') si l'utilisateur a annulé. */
function verifier(o: OptionsExport) {
  if (o.annule()) throw new ErreurArko('Export annulé.', 'annule');
}

export async function exporterUneFois(o: OptionsExport): Promise<ResultatBrut> {
  const { essai } = o;
  const cible = o.recette.volumeFinal;
  // Passe 1 (volume final) : mesure et gain, avant d'ouvrir le fichier de sortie.
  const volume = cible ? await mesurerVolume(o, cible) : null;
  const progression = volume ? (p: number, r: number | null) => o.surProgression(PART_MESURE + (1 - PART_MESURE) * p, r) : o.surProgression;
  const rendu = rendre(o.recette, o.medias);
  const duree = rendu.duree;
  if (duree <= 0) throw new ErreurArko('Il n\'y a rien à exporter : garde au moins un passage.', 'vide');
  const nbImages = nombreImages(duree);
  const nbEchantillons = Math.round(duree * FREQUENCE_SORTIE);
  const max = paquetsMax(duree);

  const canevas = new OffscreenCanvas(essai.largeur, essai.hauteur);
  const ctx = contexte2D(canevas);
  const env = envPour(essai.largeur, essai.hauteur);

  let sortieDisque: Sortie | null = null;
  let output: Output | null = null;
  try {
    sortieDisque = await creerSortie(o.nom, duree);
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: o.fastStart }),
      target: sortieDisque.target,
    });
    const video = new CanvasSource(canevas, configVideo(essai));
    output.addVideoTrack(video, { frameRate: IPS, maximumPacketCount: max.video });
    const audio = new AudioSampleSource({ codec: 'aac', quality: new Quality({ bitrate: o.debitAudio ?? DEBIT_AUDIO }) });
    output.addAudioTrack(audio, { maximumPacketCount: max.audio });
    await output.start();

    const debut = performance.now();
    let echantillonsFaits = 0;
    // Passe 2 : gain + limiteur de crête vraie avant l'encodeur, et mesure de ce qui sort.
    const mesureFinale = volume ? new MesureurSonie() : null;
    const sortieLimitee =
      volume && cible
        ? new SortieLimitee(new LimiteurCreteVraie(volume.gainDb, cible.crete), async (c, position) => {
            mesureFinale!.ajouter(c);
            await ajouterAudio(audio, c, position);
          })
        : null;
    const envoyerSon = async (canaux: Float32Array[], position: number) =>
      sortieLimitee ? sortieLimitee.pousser(canaux) : ajouterAudio(audio, canaux, position);
    for (let i = 0; i < nbImages; i++) {
      verifier(o);
      const t = i / IPS;
      // Son entrelacé : on garde ~0,5 s d'avance sur l'image.
      const cible = Math.min(nbEchantillons, Math.round((t + AVANCE_AUDIO_S) * FREQUENCE_SORTIE));
      while (echantillonsFaits < cible) {
        const n = Math.min(BLOC_AUDIO, nbEchantillons - echantillonsFaits);
        await envoyerSon(await rendu.audio(echantillonsFaits / FREQUENCE_SORTIE, n, { guide: false }), echantillonsFaits);
        echantillonsFaits += n;
      }
      await rendu.image(t, ctx, env);
      await video.add(t, 1 / IPS);
      if ((i + 1) % 15 === 0 || i === nbImages - 1) {
        const p = (i + 1) / nbImages;
        const ecoule = (performance.now() - debut) / 1000;
        progression(Math.min(0.99, p), p > 0.03 && ecoule > 1 ? (ecoule / p) * (1 - p) : null);
      }
    }
    while (echantillonsFaits < nbEchantillons) {
      verifier(o);
      const n = Math.min(BLOC_AUDIO, nbEchantillons - echantillonsFaits);
      await envoyerSon(await rendu.audio(echantillonsFaits / FREQUENCE_SORTIE, n, { guide: false }), echantillonsFaits);
      echantillonsFaits += n;
    }
    await sortieLimitee?.finir();
    verifier(o);
    await output.finalize();
    const fichier = await sortieDisque.fichierFinal();
    o.surProgression(1, 0);
    const res: ResultatBrut = { fichier, largeur: essai.largeur, hauteur: essai.hauteur };
    if (volume && mesureFinale) res.sonie = { lufsAvant: volume.lufsAvant, gainDb: volume.gainDb, ...mesureFinale.resultat() };
    return res;
  } catch (e) {
    if (output && output.state !== 'finalized') await output.cancel().catch(() => undefined);
    await sortieDisque?.abandonner().catch(() => undefined);
    throw e;
  } finally {
    await rendu.fermer();
  }
}

async function ajouterAudio(source: AudioSampleSource, canaux: Float32Array[], position: number) {
  const n = canaux[0]!.length;
  const donnees = new Float32Array(n * 2);
  donnees.set(canaux[0]!, 0);
  donnees.set(canaux[1]!, n);
  const echantillon = new AudioSample({
    data: donnees,
    format: 'f32-planar',
    numberOfChannels: 2,
    sampleRate: FREQUENCE_SORTIE,
    timestamp: position / FREQUENCE_SORTIE,
  });
  try {
    await source.add(echantillon);
  } finally {
    echantillon.close();
  }
}

/** Classe une erreur d'export : l'encodeur a-t-il lâché (→ essai suivant de la cascade) ? */
export function erreurEncodeur(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /encod|codec|EncodingError|OperationError|NotSupportedError/i.test(m) && !/annul/i.test(m);
}

/** Erreur liée à la réserve d'en-tête (fastStart 'reserve') : on réessaie sans. */
export function erreurReserve(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /maximumPacketCount|reserve|reserved/i.test(m);
}
