// Curseur d'images d'un plan : parcourt les images décodées VERS L'AVANT (VideoSampleSink.samples),
// ferme chaque image remplacée (mémoire stable) et garde la dernière image (utile au ralenti).
// Un retour en arrière ou un grand saut vers l'avant relance le parcours depuis l'image clé.
// Toutes les opérations passent par un verrou (file) : le pré-décodage, le dessin et la fermeture
// ne peuvent jamais se croiser (sinon deux relances simultanées laisseraient des images jamais fermées).

import type { VideoSample, VideoSampleSink } from 'mediabunny';
import type { Sec } from '../recette/types';
import { creerFile } from './file';

/** Au-delà de ce saut vers l'avant, on relance le décodage plutôt que de décoder toutes les images. */
const SAUT_MAX: Sec = 1.5;
const EPS = 1e-4;

/** Ce dont le curseur a besoin d'une VideoSampleSink (permet de le tester sans décodeur). */
export type SinkImages = Pick<VideoSampleSink, 'samples'>;

export class CurseurImages {
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private courante: VideoSample | null = null;
  private prochaine: VideoSample | null = null;
  private fini = false;
  private ferme = false;
  private readonly verrou = creerFile();

  constructor(
    private readonly sink: SinkImages,
    /** Temps source de fin du plan (exclu). */
    private readonly fin: Sec,
  ) {}

  /**
   * Appelle `utiliser` avec l'image du temps source ts (la dernière dont le début est ≤ ts), SOUS le verrou :
   * l'image ne peut pas être fermée par un autre appel pendant qu'on la dessine.
   */
  async avecImage<T>(ts: Sec, utiliser: (image: VideoSample | null) => T): Promise<T> {
    return this.verrou(async () => utiliser(await this.positionner(ts)));
  }

  /** Démarre le décodage à ts sans attendre (pré-décodage avant une coupe). Passe par le verrou. */
  prechauffer(ts: Sec) {
    void this.verrou(async () => {
      if (!this.iter && !this.ferme) await this.positionner(ts);
    }).catch(() => undefined);
  }

  /** Libère les images et le décodeur (après les opérations en cours). */
  async fermer() {
    this.ferme = true;
    await this.verrou(() => this.arreter());
  }

  /** À appeler uniquement sous le verrou. */
  private async positionner(ts: Sec): Promise<VideoSample | null> {
    if (this.ferme) return null;
    const c = this.courante;
    const doitRelancer =
      !this.iter || !c || ts < c.timestamp - EPS || (this.prochaine !== null && ts > this.prochaine.timestamp + SAUT_MAX);
    if (doitRelancer) await this.relancer(ts);
    while (!this.ferme && this.prochaine && this.prochaine.timestamp <= ts + EPS) {
      this.courante?.close();
      this.courante = this.prochaine;
      this.prochaine = await this.suivante();
    }
    if (this.ferme) {
      await this.arreter();
      return null;
    }
    return this.courante;
  }

  private async relancer(ts: Sec) {
    await this.arreter();
    this.fini = false;
    const fin = Math.max(this.fin, ts + 0.05);
    this.iter = this.sink.samples(Math.max(0, ts), fin);
    this.courante = await this.suivante();
    this.prochaine = this.courante ? await this.suivante() : null;
  }

  private async suivante(): Promise<VideoSample | null> {
    if (!this.iter || this.fini) return null;
    const r = await this.iter.next();
    if (r.done) {
      this.fini = true;
      return null;
    }
    if (this.ferme) {
      r.value.close();
      return null;
    }
    return r.value;
  }

  private async arreter() {
    this.courante?.close();
    this.prochaine?.close();
    this.courante = null;
    this.prochaine = null;
    const it = this.iter;
    this.iter = null;
    if (it) await it.return(undefined).catch(() => undefined);
  }
}
