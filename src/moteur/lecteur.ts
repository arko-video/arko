// Aperçu (page) : même rendu que l'export, dessiné dans le canevas 9:16 de l'interface.
// Horloge = AudioContext.currentTime (le son ne saute jamais ; ce sont les images qui sautent si on est en retard).
// Image : à chaque requestAnimationFrame, rendu.image(t) ; si l'image précédente n'est pas finie, on saute
// (et on redessine au temps le plus récent dès qu'elle l'est). Plus de 30 % d'images sautées → 360 × 640.
// Son : blocs de 0,25 s mixés par rendu.audio(..., {guide:true}) puis AudioBufferSourceNode.start(quand).

import type { Recette, Sec } from '../recette/types';
import type { Lecteur, SourceOuverte } from './api';
import { CacheDecodage } from './cache-decodage';
import { contexte2D, creerCanevas, type Canevas, type Ctx2D, type Env } from './canevas';
import { CompteurSauts, creerPlanificateur } from './planificateur-dessin';
import { FREQUENCE_SORTIE } from './audio/reechantillonner';
import { rendre, type Rendu } from './rendre';
import { mediasDe } from './sources';
import { pcmSource } from '../sons/import';

const BLOC = 12_000; // 0,25 s
const AVANCE_SON_S = 0.6;
const DEMARRAGE_S = 0.12; // petite marge avant le premier son
const ENV_REDUIT: Env = { l: 360, h: 640, echelle: 360 / 1080 };

export function creerLecteur(canvas: HTMLCanvasElement): Lecteur {
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx2D | null;
  if (!ctx) throw new Error('Canevas 2D indisponible');
  const env = (): Env => ({ l: canvas.width, h: canvas.height, echelle: canvas.width / 1080 });

  let rendu: Rendu | null = null;
  let temps: Sec = 0;
  let enLecture = false;
  let audio: AudioContext | null = null;
  /** Repère de l'horloge : au temps d'horloge `h0`, la vidéo est au temps `t0`. */
  let h0 = 0;
  let t0 = 0;
  let generation = 0;
  let prochainSon = 0;
  let sonsEnCours: AudioBufferSourceNode[] = [];
  let raf = 0;
  let reduit = false;
  let petit: { canevas: Canevas; ctx: Ctx2D } | null = null;
  const sauts = new CompteurSauts();
  /** Décodeurs gardés d'un charger() à l'autre (seuls les plans modifiés sont re-décodés). */
  const cache = new CacheDecodage();
  const abonnes = new Set<() => void>();

  const prevenir = () => abonnes.forEach((cb) => cb());
  const duree = () => rendu?.duree ?? 0;
  const horloge = () => (audio && audio.state === 'running' ? audio.currentTime : performance.now() / 1000);

  /** Dessine l'image du temps courant avec le rendu COURANT (lus au moment du dessin). */
  function dessinerMaintenant(): Promise<void> | null {
    if (!rendu) return null;
    const t = temps;
    const mesurer = enLecture;
    const fin = () => {
      if (mesurer && enLecture && sauts.noter(t, performance.now() / 1000)) passerEnReduit();
    };
    if (!reduit) return rendu.image(t, ctx!, env()).then(fin);
    // Mode réduit (360 × 640) : on dessine petit puis on agrandit dans le canevas de l'interface.
    const p = petit!;
    return rendu.image(t, p.ctx, ENV_REDUIT).then(() => {
      ctx!.imageSmoothingEnabled = true;
      ctx!.drawImage(p.canevas, 0, 0, canvas.width, canvas.height);
      fin();
    });
  }
  const planificateur = creerPlanificateur(dessinerMaintenant);
  const dessiner = () => planificateur.demander();

  /** Repli de l'architecture (§4.3) : trop d'images sautées → aperçu en 360 × 640 jusqu'à la fin de la séance. */
  function passerEnReduit() {
    if (reduit || canvas.width <= ENV_REDUIT.l) return;
    const c = creerCanevas(ENV_REDUIT.l, ENV_REDUIT.h);
    petit = { canevas: c, ctx: contexte2D(c) };
    reduit = true;
  }

  function couperSon() {
    generation++;
    for (const s of sonsEnCours) {
      try {
        s.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    sonsEnCours = [];
  }

  function caler() {
    sauts.reinitialiser();
    h0 = horloge() + (audio?.state === 'running' ? DEMARRAGE_S : 0);
    t0 = temps;
    prochainSon = temps;
  }

  async function programmerSon() {
    if (!audio || audio.state !== 'running' || !rendu) return;
    const gen = generation;
    const r = rendu;
    const tActuel = t0 + Math.max(0, horloge() - h0);
    while (enLecture && gen === generation && prochainSon < Math.min(duree(), tActuel + AVANCE_SON_S)) {
      const debut = prochainSon;
      const n = Math.min(BLOC, Math.ceil((duree() - debut) * FREQUENCE_SORTIE));
      if (n <= 0) break;
      prochainSon = debut + n / FREQUENCE_SORTIE;
      const canaux = await r.audio(debut, n, { guide: true });
      if (gen !== generation || !audio) return;
      const tampon = audio.createBuffer(2, n, FREQUENCE_SORTIE);
      tampon.copyToChannel(canaux[0]! as Float32Array<ArrayBuffer>, 0);
      tampon.copyToChannel(canaux[1]! as Float32Array<ArrayBuffer>, 1);
      const noeud = audio.createBufferSource();
      noeud.buffer = tampon;
      noeud.connect(audio.destination);
      const quand = h0 + (debut - t0);
      const retard = audio.currentTime - quand;
      if (retard > 0) noeud.start(audio.currentTime, Math.min(retard, tampon.duration));
      else noeud.start(quand);
      sonsEnCours.push(noeud);
      noeud.onended = () => (sonsEnCours = sonsEnCours.filter((x) => x !== noeud));
    }
  }

  function boucle() {
    if (!enLecture) return;
    temps = Math.min(duree(), t0 + Math.max(0, horloge() - h0));
    if (temps >= duree()) {
      temps = duree();
      dessiner();
      lecteur.pause();
      return;
    }
    dessiner();
    void programmerSon();
    prevenir();
    raf = requestAnimationFrame(boucle);
  }

  const lecteur: Lecteur = {
    charger(recette: Recette, sources: SourceOuverte[]) {
      const ancien = rendu;
      // Sons importés lus avec pcmSource (sons/import.ts) : mêmes octets, même décodeur que l'export.
      const lireImporte = async (id: string, de: Sec, a: Sec) => {
        const s = sources.find((x) => x.infos.id === id);
        return s ? pcmSource(s, de, a) : null;
      };
      rendu = rendre(recette, mediasDe(sources), cache, { lireImporte });
      if (ancien) void ancien.fermer();
      temps = Math.min(temps, duree());
      if (enLecture) {
        couperSon();
        caler();
        void programmerSon();
      }
      dessiner();
      prevenir();
    },
    lire() {
      if (enLecture || !rendu || duree() <= 0) return;
      if (temps >= duree() - 0.02) temps = 0;
      try {
        audio ??= new AudioContext({ sampleRate: FREQUENCE_SORTIE, latencyHint: 'playback' });
      } catch {
        audio = null; // pas de son : horloge de la page
      }
      void audio?.resume().catch(() => undefined);
      enLecture = true;
      couperSon();
      caler();
      void programmerSon();
      raf = requestAnimationFrame(boucle);
      prevenir();
    },
    pause() {
      if (!enLecture) return;
      temps = Math.min(duree(), t0 + Math.max(0, horloge() - h0));
      enLecture = false;
      cancelAnimationFrame(raf);
      couperSon();
      dessiner();
      prevenir();
    },
    aller(t: Sec) {
      temps = Math.min(Math.max(0, Number.isFinite(t) ? t : 0), duree());
      if (enLecture) {
        couperSon();
        caler();
        void programmerSon();
      }
      dessiner();
      prevenir();
    },
    get temps() {
      return temps;
    },
    get duree() {
      return duree();
    },
    get enLecture() {
      return enLecture;
    },
    surChangement(cb: () => void) {
      abonnes.add(cb);
      return () => abonnes.delete(cb);
    },
    detruire() {
      enLecture = false;
      cancelAnimationFrame(raf);
      couperSon();
      abonnes.clear();
      const r = rendu;
      rendu = null;
      void (r ? r.fermer() : Promise.resolve()).then(() => cache.fermer());
      void audio?.close().catch(() => undefined);
      audio = null;
    },
  };
  return lecteur;
}
