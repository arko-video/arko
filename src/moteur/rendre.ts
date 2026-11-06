// LE chemin de rendu unique : rendre(recette, médias) → { duree, image(t, ctx, env), audio(t0, n, {guide}), fermer() }.
// Utilisé à l'identique par l'aperçu (lecteur.ts, dans la page) et par l'export (Worker).
// Les décodeurs vivent dans un CacheDecodage (partagé par l'aperçu d'un rendu à l'autre).

import type { VideoSample } from 'mediabunny';
import { compiler, type Scenario } from '../recette/chronologie';
import { GUIDE } from '../recette/defauts';
import type { Recette, Sec } from '../recette/types';
import { effetsDuBloc, importesDuBloc, preparerEffets, type OptionsEffets } from './audio/effets';
import { mixerBloc, morceauxDuBloc, type SonPose } from './audio/mixeur';
import { FREQUENCE_SORTIE, type Pcm } from './audio/reechantillonner';
import type { Ctx2D, Env, ImageSource } from './canevas';
import { dessinerImage } from './compositeur';
import { CacheDecodage, clesDesPlans } from './cache-decodage';
import { TamponImage } from './couches/transitions';
import type { CurseurImages } from './curseur-images';
import { creerFile } from './file';
import { etatImage } from './etat-image';
import type { MediaOuvert } from './media';
import { FondFlou } from './mises-en-page/flou';
import { policesChargees, policesPretes } from './polices';
import { assembler, segmentGenerique } from './rendre-generiques';

/** Avance avec laquelle on prépare le plan suivant (pré-décodage avant une coupe). */
const PRECHAUFFE_S: Sec = 0.5;

export interface Rendu {
  readonly duree: Sec;
  readonly scenario: Scenario;
  /** Dessine l'image du temps de sortie t. */
  image(t: Sec, ctx: Ctx2D, env: Env): Promise<void>;
  /** Mixe n échantillons stéréo 48 kHz à partir du temps de sortie t0. `guide` = inclure le son guide (aperçu seulement). */
  audio(t0: Sec, n: number, options?: { guide?: boolean }): Promise<Float32Array[]>;
  /** Résolue quand les effets sonores sont chargés (lancé dès la création du rendu, une seule fois). */
  readonly effetsPrets: Promise<void>;
  /** Temps où commence le montage (= durée de l'intro ; 0 sans intro). */
  readonly debutCorps?: Sec;
  fermer(): Promise<void>;
}

/** Enveloppe une image décodée Mediabunny (sample.draw gère la rotation). */
export function imageDeSample(s: VideoSample): ImageSource {
  return {
    largeur: s.displayWidth,
    hauteur: s.displayHeight,
    dessiner: (ctx, sx, sy, sl, sh, dx, dy, dl, dh) => s.draw(ctx, sx, sy, sl, sh, dx, dy, dl, dh),
  };
}

export interface OptionsRendu {
  /** false = sans intro ni outro (miniature : une image du montage seul). Défaut : avec, aperçu comme export. */
  generiques?: boolean;
}

/**
 * Prépare le rendu d'une recette. `cache` (facultatif) = décodeurs partagés avec les rendus précédents :
 * l'aperçu en garde un pour ne pas tout re-décoder à chaque modification. Sans cache, le rendu a le sien
 * et le ferme avec lui (cas de l'export). L'intro et l'outro (YouTube) sont ajoutées par le même chemin.
 */
export function rendre(
  recette: Recette,
  medias: ReadonlyMap<string, MediaOuvert>,
  cachePartage?: CacheDecodage,
  optionsEffets?: OptionsEffets,
  options: OptionsRendu = {},
): Rendu {
  const corps = rendreMontage(recette, medias, cachePartage, optionsEffets);
  if (options.generiques === false) return corps;
  // Aperçu : la vidéo d'une intro / outro partage les décodeurs de l'aperçu ; export : elle a les siens.
  const mini = (r: Recette, m: ReadonlyMap<string, MediaOuvert>) => rendreMontage(r, m, cachePartage, optionsEffets);
  const intro = segmentGenerique(recette, 'intro', medias, mini);
  const outro = segmentGenerique(recette, 'outro', medias, mini);
  return intro || outro ? assembler(corps, intro, outro) : corps;
}

/** Rendu du montage seul (plans gardés et habillage). */
function rendreMontage(
  recette: Recette,
  medias: ReadonlyMap<string, MediaOuvert>,
  cachePartage?: CacheDecodage,
  optionsEffets?: OptionsEffets,
): Rendu {
  const scenario = compiler(recette);
  const fond = new FondFlou();
  const tampon = new TamponImage();
  // Effets sonores : chargés UNE fois, dès maintenant (avant la lecture ou l'export).
  const effets = preparerEffets(scenario, recette, optionsEffets);
  // Sons importés : lus par morceaux (aperçu : pcmSource du dev sons ; export : le lecteur audio du cache).
  const lireImporte =
    optionsEffets?.lireImporte ?? (async (id: string, de: Sec, a: Sec) => (await cache.lecteurAudio(id)?.lire(de, a)) ?? null);
  void policesPretes(); // on lance le chargement des polices tout de suite
  const cache = cachePartage ?? new CacheDecodage();
  cache.preparer(medias);
  const cles = clesDesPlans(scenario.plans);
  const fileImages = creerFile();
  const fileAudio = creerFile();
  let ferme = false;

  function curseur(i: number): CurseurImages | null {
    const plan = scenario.plans[i];
    return plan ? cache.curseur(cles[i]!, plan) : null;
  }

  async function image(t: Sec, ctx: Ctx2D, env: Env) {
    return fileImages(async () => {
      if (ferme) return;
      const etat = etatImage(scenario, t);
      if (!etat) {
        dessinerImage(ctx, null, null, env, fond, tampon);
        return;
      }
      // Un texte ou un sous-titre ne se dessine qu'avec ses vraies polices (sinon les retours à la ligne changent).
      if ((etat.textes.length > 0 || etat.sousTitres) && !policesChargees()) await policesPretes();
      if (ferme) return;
      const i = etat.plan.i;
      // Ne garder ouverts que les curseurs du plan courant et du suivant.
      cache.garderSeulement(new Set([cles[i]!, cles[i + 1] ?? cles[i]!]));
      const c = curseur(i);
      const dessin = (sample: VideoSample | null) => {
        if (!ferme) dessinerImage(ctx, etat, sample ? imageDeSample(sample) : null, env, fond, tampon);
      };
      // Le dessin se fait SOUS le verrou du curseur : l'image ne peut pas être fermée entre-temps.
      if (c) await c.avecImage(etat.ts, dessin);
      else dessin(null);
      const suivant = scenario.plans[i + 1];
      if (!ferme && suivant && etat.plan.t1 - etat.t < PRECHAUFFE_S) curseur(suivant.i)?.prechauffer(suivant.de);
    });
  }

  async function audio(t0: Sec, n: number, options: { guide?: boolean } = {}) {
    return fileAudio(async () => {
      const morceaux = morceauxDuBloc(scenario, t0, n);
      const pcmMorceaux: (Pcm | null)[] = [];
      for (const m of morceaux) {
        const lecteur = cache.lecteurAudio(m.plan.src);
        pcmMorceaux.push(lecteur && !ferme ? await lecteur.lire(m.ts0, m.ts1) : null);
      }
      const t1 = t0 + n / FREQUENCE_SORTIE;
      const sons = effetsDuBloc(await effets, t0, t1);
      if (!ferme) sons.push(...(await importesDuBloc(scenario, recette, t0, t1, lireImporte)));
      // Son guide : seulement si demandé (aperçu). L'export passe guide: false, il n'est donc jamais exporté.
      const guide = options.guide === true && !ferme ? await morceauGuide(t0, t1) : null;
      return mixerBloc({ scenario, t0, n, pcmMorceaux, sons, guide, avecGuide: guide !== null, frequence: FREQUENCE_SORTIE });
    });
  }

  /** Morceau du son guide qui tombe dans [t0, t1[, lu à la demande dans son fichier (jamais tout en mémoire). */
  async function morceauGuide(t0: Sec, t1: Sec): Promise<SonPose | null> {
    const g = scenario.guide;
    const lecteur = g ? cache.lecteurAudio(g.src) : null;
    if (!g || !lecteur) return null;
    const debutVideo = g.t ?? 0;
    const debutFichier = g.debut ?? 0;
    if (t1 <= debutVideo) return null;
    const ts0 = debutFichier + Math.max(0, t0 - debutVideo);
    const pcm = await lecteur.lire(ts0, debutFichier + (t1 - debutVideo));
    if (!pcm) return null;
    // Le premier échantillon du PCM (temps pcm.debut dans le fichier) se joue au temps de sortie correspondant.
    return { t: debutVideo + (pcm.debut - debutFichier), vol: g.vol ?? GUIDE.vol, pcm };
  }

  /** Arrête ce rendu. Les décodeurs d'un cache partagé restent ouverts (c'est son propriétaire qui le ferme). */
  async function fermer() {
    ferme = true;
    await Promise.all([fileImages(async () => undefined), fileAudio(async () => undefined)]);
    if (!cachePartage) await cache.fermer();
  }

  const effetsPrets = effets.then(() => undefined);
  return { duree: scenario.duree, scenario, image, audio, effetsPrets, fermer };
}
