// Cache des décodeurs, gardé par l'aperçu d'un rendu à l'autre (chaque modification de la recette crée un rendu).
// - Par source : la VideoSampleSink et le lecteur audio sont gardés tant que le média ouvert ne change pas.
// - Par plan : le curseur d'images est gardé tant que le plan (src, de, a, vit) ne change pas.
// Ainsi, glisser le cadrage du Plein écran (seule la mise en page change) ne re-décode rien,
// et rogner un plan ne recrée que le curseur de ce plan.

import { AudioSampleSink, VideoSampleSink } from 'mediabunny';
import type { PlanPlace } from '../recette/chronologie';
import { LecteurAudio } from './audio/lecteur-audio';
import { CurseurImages, type SinkImages } from './curseur-images';
import type { MediaOuvert } from './media';

interface ParSource {
  media: MediaOuvert;
  sinkVideo: SinkImages | null;
  audio: LecteurAudio | null;
  /** v3 (E) : un lecteur par piste audio, créé à la demande (vidéo à plusieurs pistes). */
  pistes?: Map<number, LecteurAudio | null>;
}

/** Clé d'un plan : (src, de, a, vit), plus son rang parmi les plans identiques (passage réutilisé). */
export function clesDesPlans(plans: readonly Pick<PlanPlace, 'src' | 'de' | 'a' | 'vit'>[]): string[] {
  const vus = new Map<string, number>();
  return plans.map((p) => {
    const base = `${p.src}|${p.de}|${p.a}|${p.vit}`;
    const n = vus.get(base) ?? 0;
    vus.set(base, n + 1);
    return `${base}#${n}`;
  });
}

export class CacheDecodage {
  private readonly sources = new Map<string, ParSource>();
  private readonly curseurs = new Map<string, { src: string; curseur: CurseurImages }>();

  constructor(
    /** Fabrique des sinks (remplaçable dans les tests). */
    private readonly fabrique: {
      video(m: MediaOuvert): SinkImages | null;
      audio(m: MediaOuvert): LecteurAudio | null;
      /** v3 (E) : lecteur de la piste audio n (facultatif ; défaut : celle du fichier). */
      piste?(m: MediaOuvert, n: number): LecteurAudio | null;
    } = {
      video: (m) => (m.video ? new VideoSampleSink(m.video) : null),
      audio: (m) => (m.sinkAudio && m.audio ? new LecteurAudio(new AudioSampleSink(m.audio)) : null),
    },
  ) {}

  /** Met le cache à jour pour ces médias : garde ce qui n'a pas changé, ferme le reste. */
  preparer(medias: ReadonlyMap<string, MediaOuvert>) {
    for (const [id, s] of this.sources) {
      if (medias.get(id) !== s.media) this.oublierSource(id);
    }
    for (const [id, media] of medias) {
      if (!this.sources.has(id)) this.sources.set(id, { media, sinkVideo: this.fabrique.video(media), audio: this.fabrique.audio(media) });
    }
  }

  lecteurAudio(src: string): LecteurAudio | null {
    return this.sources.get(src)?.audio ?? null;
  }

  /**
   * v3 (E) : lecteur de la piste audio n (0 = la 1re) de la source, créé à la demande et fermé avec elle.
   * La piste principale réutilise le lecteur habituel. null si la piste n'existe pas.
   */
  lecteurPiste(src: string, n: number): LecteurAudio | null {
    const s = this.sources.get(src);
    if (!s) return null;
    const piste = s.media.pistesAudio?.[n];
    if ((piste && piste === s.media.audio) || (!s.media.pistesAudio && n === 0 && !this.fabrique.piste)) return s.audio;
    s.pistes ??= new Map();
    if (!s.pistes.has(n)) {
      const fab = this.fabrique.piste ?? ((m: MediaOuvert, k: number) => (m.pistesAudio?.[k] ? new LecteurAudio(new AudioSampleSink(m.pistesAudio[k]!)) : null));
      s.pistes.set(n, fab(s.media, n));
    }
    return s.pistes.get(n) ?? null;
  }

  /** Curseur du plan de clé `cle` (créé au besoin), ou null si la source n'a pas de vidéo. */
  curseur(cle: string, plan: Pick<PlanPlace, 'src' | 'a'>): CurseurImages | null {
    const deja = this.curseurs.get(cle);
    if (deja) return deja.curseur;
    const sink = this.sources.get(plan.src)?.sinkVideo;
    if (!sink) return null;
    const curseur = new CurseurImages(sink, plan.a);
    this.curseurs.set(cle, { src: plan.src, curseur });
    return curseur;
  }

  /** Ferme les curseurs dont la clé n'est pas dans `garder` (au plus 2 décodeurs vidéo ouverts). */
  garderSeulement(garder: ReadonlySet<string>) {
    for (const [cle, c] of this.curseurs) {
      if (!garder.has(cle)) {
        void c.curseur.fermer();
        this.curseurs.delete(cle);
      }
    }
  }

  /** Nombre de curseurs ouverts (pour les tests). */
  get nombreCurseurs(): number {
    return this.curseurs.size;
  }

  private oublierSource(id: string) {
    const s = this.sources.get(id);
    this.sources.delete(id);
    void s?.audio?.fermer();
    for (const l of s?.pistes?.values() ?? []) void l?.fermer();
    for (const [cle, c] of this.curseurs) {
      if (c.src === id) {
        void c.curseur.fermer();
        this.curseurs.delete(cle);
      }
    }
  }

  async fermer() {
    const attentes: Promise<void>[] = [];
    for (const c of this.curseurs.values()) attentes.push(c.curseur.fermer());
    for (const s of this.sources.values()) {
      if (s.audio) attentes.push(s.audio.fermer());
      for (const l of s.pistes?.values() ?? []) if (l) attentes.push(l.fermer());
    }
    this.curseurs.clear();
    this.sources.clear();
    await Promise.all(attentes);
  }
}
