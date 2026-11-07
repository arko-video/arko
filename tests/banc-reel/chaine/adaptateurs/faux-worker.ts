// Banc réel — remplace `Worker` (absent de Node) : le code de la PAGE d'Arko (pilote Whisper, mesurerVoix,
// mesurerPistes, analyserFichier) tourne tel quel ; seuls les Workers, qui décodent le fichier avec Mediabunny et
// WebCodecs, sont remplacés par leur équivalent Node, branché sur les caches du banc :
// - sous-titres/worker.ts     → mots bruts de Whisper gardés par tranche (chaine/whisper.ts) ;
// - auto/coupes/worker-voix.ts → énergie de la voix (chaine/signaux.ts, AccumulateurVoix d'Arko) ;
// - auto/voix/worker-voix.ts   → empreintes de voix (chaine/signaux.ts, AccumulateurEmpreintes d'Arko) ;
// - ia/worker-analyse.ts       → enveloppe du son (passeSon + Enveloppe d'Arko), écrite comme point de reprise
//                                (ecrirePoint d'Arko) ; pas de différences d'images (il n'y a pas d'images).
// Le même protocole de messages est respecté (progression, fini, erreur).

import type { DemandeVoix } from '../../../../src/auto/coupes/worker-voix';
import type { DemandeEmpreintes } from '../../../../src/auto/voix/worker-voix';
import type { DemandePasseSonV4, HauteurVoix, ProbasVad, ResultatPasseSonV4 } from '../../../../src/auto/types-v4';
import type { DemandeAnalyse } from '../../../../src/ia/messages-analyse';
import { VERSION_REPRISE } from '../../../../src/ia/messages-analyse';
import { ecrirePoint } from '../../../../src/ia/reprise';
import { PAS_ENVELOPPE } from '../../../../src/ia/signaux';
import type { MotBrut, VersWorker } from '../../../../src/sous-titres/messages';
import type { PlageTemps } from '../../../../src/auto/types';
import type { DemandeEmpreintesNeurales, SessionOnnx } from '../../../../src/auto/types-v4';
import { FREQUENCE_VAD, Vers16k } from '../../../../src/auto/vad/reechantillonnage';
import { calculerEmpreintes, MODELE_EMPREINTE } from '../../../../src/auto/voix/empreinte-neurale';
import type { MesuresSon } from '../signaux';
import { IMAGES_PAR_MORCEAU, SonPcm } from '../son';
import { ouvrirSessionNode } from './onnx-node';

/** Ce que les faux Workers servent (rempli par la chaîne avant l'analyse). */
export interface ContexteBanc {
  duree: number;
  mesures: MesuresSon;
  /** Mots bruts de Whisper par tranche transcrite (temps source). */
  tranches: { tranche: PlageTemps; bruts: MotBrut[]; erreurs?: { de: number; a: number; message: string }[] }[];
  /**
   * Une tranche où transformers.js a levé une erreur : true = comme le navigateur (le Worker renvoie l'erreur et
   * l'analyse échoue) ; false (défaut du banc) = les mots des autres fenêtres sont rendus, et c'est noté.
   */
  whisperStrict: boolean;
  /** v4 : probabilités de la VAD (cache du banc), servies si la passe du son les demande (`vad: true`). */
  vad?: Omit<ProbasVad, 'src'> | null;
  /** v4 : hauteur de la voix (cache « appli » du banc : AccumulateurHauteur de l'appli sur la même passe), ou null. */
  hauteur?: HauteurVoix | null;
  /** Fin du son (s), pour le journal. */
  finDuSon: number;
  /** Y a-t-il du son (au-dessus de −60 dBFS) entre de et a ? Une partie muette pas transcrite est rendue sans mots. */
  aDuSon: (de: number, a: number) => boolean;
  /** --plage : seule cette partie de la session existe pour la chaîne (le reste est muet, sans mots). */
  plage: PlageTemps | null;
  /** Ce que les faux Workers ont servi (pour le rapport). */
  journal: string[];
}

let contexte: ContexteBanc | null = null;

export function brancherContexte(c: ContexteBanc): void {
  contexte = c;
}

function ctx(): ContexteBanc {
  if (!contexte) throw new Error('Banc : contexte des faux Workers absent.');
  return contexte;
}

const dansPlage = (t: number, p: PlageTemps | null) => !p || (t >= p.de && t < p.a);

/** Copie d'un tableau de mesures en dB par trame, mise à `vide` hors de la plage (et hors de [de, a[). */
function masquer(x: Float32Array, pas: number, vide: number, plage: PlageTemps | null, de = 0, a = Infinity, parTrame = 1): Float32Array {
  const res = Float32Array.from(x);
  const n = x.length / parTrame;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * pas;
    if (dansPlage(t, plage) && t >= de - pas && t < a + pas) continue;
    res.fill(vide, k * parTrame, (k + 1) * parTrame);
  }
  return res;
}

function motsBruts(plages: readonly PlageTemps[]): MotBrut[] {
  const c = ctx();
  const res: MotBrut[] = [];
  for (const p0 of plages) {
    // --plage : hors de la partie choisie, rien à entendre (et rien à transcrire).
    const p = c.plage ? { de: Math.max(p0.de, c.plage.de), a: Math.min(p0.a, c.plage.a) } : p0;
    if (p.a - p.de <= 0) continue;
    const couvrantes = c.tranches.filter((t) => t.tranche.de < p.a && t.tranche.a > p.de);
    const couvert = couvrantes.reduce((s, t) => s + Math.max(0, Math.min(t.tranche.a, p.a) - Math.max(t.tranche.de, p.de)), 0);
    const manque = p.a - p.de - couvert;
    if (manque > 0.5 && c.aDuSon(p.de, p.a)) {
      throw Object.assign(new Error(`Transcription absente pour ${p.de}–${p.a} s : lancer « npm run banc-reel -- transcrire ».`), { code: 'banc_transcription' });
    }
    if (manque > 0.5) c.journal.push(`Whisper : ${p.de}–${p.a} s pas transcrit (aucun son au-dessus de −60 dBFS) → aucun mot.`);
    for (const t of couvrantes) {
      for (const err of t.erreurs ?? []) {
        if (c.whisperStrict) {
          // Ce que versErreur (sous-titres/worker.ts) fait d'une erreur inconnue de transformers.js.
          throw Object.assign(new Error('Le module sous-titres n\'a pas pu démarrer. Redémarre Chrome et réessaie.'), { code: 'module' });
        }
        c.journal.push(
          `Whisper : erreur de transformers.js sur ${err.de.toFixed(1)}–${err.a.toFixed(1)} s (« ${err.message} ») : dans le navigateur, le Worker s'arrête et l'analyse ÉCHOUE ; le banc continue sans les mots de cette fenêtre (--whisper-strict pour faire comme le navigateur).`,
        );
      }
      for (const m of t.bruts) {
        const milieu = (m.ts + m.fin) / 2;
        if (milieu >= p.de && milieu < p.a && dansPlage(milieu, c.plage)) res.push({ ...m });
      }
    }
  }
  return res;
}

type Envoyer = (m: unknown) => void;

async function sousTitres(d: VersWorker, envoyer: Envoyer) {
  if (d.type === 'telecharger') return envoyer({ type: 'fini', mots: [] });
  envoyer({ type: 'progression', p: 0.5, etape: 'J\'écoute ta vidéo…' });
  envoyer({ type: 'fini', mots: motsBruts(d.plages) });
}

async function energieVoix(d: DemandeVoix, envoyer: Envoyer) {
  const c = ctx();
  const v = c.mesures.voix;
  c.journal.push(`Voix au son (worker-voix) : ${d.de}–${d.a} s.`);
  envoyer({ type: 'fini', pas: v.pas, db: masquer(v.db, v.pas, -100, c.plage, d.de, d.a) });
}

async function empreintes(d: DemandeEmpreintes & DemandePasseSonV4, envoyer: Envoyer) {
  const c = ctx();
  const e = c.mesures.empreintes;
  // v4 (contrat §3.3) : la même passe rend aussi la VAD et la hauteur si on les demande.
  const v4: ResultatPasseSonV4 = {};
  if (d.vad) {
    if (c.vad) {
      const p = Uint8Array.from(c.vad.p);
      if (c.plage) for (let k = 0; k < p.length; k++) if (!dansPlage((k + 0.5) * c.vad.pas, c.plage)) p[k] = 0;
      v4.vad = { pas: c.vad.pas, p, plages: c.vad.plages.map((x) => ({ ...x })), modele: c.vad.modele };
      c.journal.push(`VAD (passe du son) : servie depuis le cache du banc (${c.vad.modele}).`);
    } else {
      v4.vad = null;
      v4.avertissement = 'Le détecteur de voix n\'a pas pu démarrer : coupes et voix moins précises.';
    }
  }
  if (d.hauteur) {
    if (c.hauteur) {
      const f0 = Float32Array.from(c.hauteur.f0);
      if (c.plage) for (let k = 0; k < f0.length; k++) if (!dansPlage((k + 0.5) * c.hauteur.pas, c.plage)) f0[k] = 0;
      v4.hauteur = { pas: c.hauteur.pas, f0 };
      c.journal.push('Hauteur de la voix (passe du son) : servie depuis le cache « appli » du banc (AccumulateurHauteur).');
    } else {
      v4.hauteur = null;
      c.journal.push('Hauteur de la voix : absente de ce cache VAD (variante saut / continu) → null.');
    }
  }
  if (d.pistes.some((p) => p !== null && p !== 0)) {
    return envoyer({ type: 'erreur', message: 'Cette piste de son n\'existe pas dans la vidéo.', code: 'piste' });
  }
  c.journal.push(`Empreintes (qui parle) : ${d.de}–${d.a} s, pistes ${JSON.stringify(d.pistes)}.`);
  const resultats = d.pistes.map((piste) => ({
    piste,
    nom: null,
    pas: e.pas,
    duree: e.duree,
    db: masquer(e.db, e.pas, -100, c.plage, d.de, d.a),
    bandes: masquer(e.bandes, e.pas, -100, c.plage, d.de, d.a, 8),
  }));
  envoyer({ type: 'fini', resultats, ...v4 });
}

async function analyse(d: DemandeAnalyse, envoyer: Envoyer) {
  const c = ctx();
  const enveloppe = masquer(c.mesures.enveloppe, PAS_ENVELOPPE, 0, c.plage);
  await ecrirePoint(d.empreinte, {
    version: VERSION_REPRISE,
    duree: c.duree,
    pas: PAS_ENVELOPPE,
    tSon: c.duree,
    enveloppe,
    tImage: c.duree,
    diffs: [],
    derniere: null,
    fini: true,
  });
  c.journal.push('Analyse du son (worker-analyse) : enveloppe servie depuis le cache, sans images.');
  envoyer({ type: 'fini', moments: [], stats: { duree: c.duree, repris: false, reprisA: 0, ms: 0, imagesCles: 0, son: true } });
}

/** Le modèle CAM++ (même fichier que la fiche du catalogue : 28 281 164 octets, SHA-256 aa3cfc16…ceba2). */
export const MODELE_CAMPLUS = process.env.BANC_MODELE_EMPREINTE ?? '/home/claude/modeles/3dspeaker-campplus-zh-en/model.onnx';
const AVANT_MORCEAU = 0.05;
let sessionCampplus: SessionOnnx | null = null;
/** Empreintes déjà calculées (une passe du banc peut en redemander : « Deux personnes », --empreinte forcee). */
const dejaCalculees = new Map<string, Float32Array>();

/** Son mono 16 kHz de [de, a[ comme `lireMorceau` du Worker : 48 kHz par morceaux de 1024, depuis de − 0,05 s, Vers16k. */
function lireMorceau16k(son: SonPcm, p: PlageTemps): Float32Array {
  const n = Math.max(0, Math.round((p.a - p.de) * FREQUENCE_VAD));
  const res = new Float32Array(n);
  const vers = new Vers16k();
  const i0 = Math.round(Math.max(0, p.de - AVANT_MORCEAU) * son.frequence);
  const x = son.lireImages(i0, Math.round(p.a * son.frequence));
  for (let j = 0; j < x.length; j += IMAGES_PAR_MORCEAU) {
    const r = vers.ajouter(x.subarray(j, Math.min(x.length, j + IMAGES_PAR_MORCEAU)), son.frequence, (i0 + j) / son.frequence);
    if (!r) continue;
    const k0 = Math.round((r.t0 - p.de) * FREQUENCE_VAD);
    for (let i = 0; i < r.pcm.length; i++) {
      const k = k0 + i;
      if (k >= 0 && k < n) res[k] = r.pcm[i]!;
    }
  }
  return res;
}

/**
 * Empreinte de voix CAM++ (auto/voix/worker-empreintes.ts, dev-voix) : le MÊME calcul que le Worker (lecture des
 * morceaux, `calculerEmpreintes` + `fbank80` de dev-voix), sur onnxruntime-node 1 fil au lieu de -web. Le modèle n'est
 * lu que si la page le demande (module « empreinte » présent : --empreinte forcee ou --modules empreinte=present).
 */
async function empreintesNeurales(d: DemandeEmpreintesNeurales, envoyer: Envoyer) {
  const c = ctx();
  const t0 = performance.now();
  sessionCampplus ??= await ouvrirSessionNode(MODELE_CAMPLUS);
  const son = new SonPcm();
  const cle = (p: PlageTemps) => `${p.de.toFixed(3)}-${p.a.toFixed(3)}`;
  const aFaire = d.morceaux.filter((p) => !dejaCalculees.has(cle(p)));
  try {
    const r = await calculerEmpreintes(sessionCampplus, async (p) => lireMorceau16k(son, p), aFaire);
    aFaire.forEach((p, i) => dejaCalculees.set(cle(p), r.v.slice(i * r.dim, (i + 1) * r.dim)));
  } finally {
    son.fermer();
  }
  const dim = dejaCalculees.get(cle(d.morceaux[0]!))?.length ?? 192;
  const v = new Float32Array(d.morceaux.length * dim);
  d.morceaux.forEach((p, i) => v.set(dejaCalculees.get(cle(p))!, i * dim));
  c.journal.push(`Empreinte de voix (CAM++, onnxruntime-node) : ${d.morceaux.length} morceaux (${aFaire.length} calculés) en ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
  envoyer({ type: 'fini', modele: MODELE_EMPREINTE, dim, v });
}

const ROUTES: [suffixe: string, traiter: (d: never, envoyer: Envoyer) => Promise<void>][] = [
  ['/auto/voix/worker-empreintes.ts', empreintesNeurales],
  ['/sous-titres/worker.ts', sousTitres],
  ['/auto/coupes/worker-voix.ts', energieVoix],
  ['/auto/voix/worker-voix.ts', empreintes],
  ['/ia/worker-analyse.ts', analyse],
];

/** Faux `Worker` : même interface que celle utilisée par la page d'Arko (onmessage, onerror, postMessage, terminate). */
export class FauxWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { preventDefault(): void; message: string }) => void) | null = null;
  private termine = false;
  private readonly chemin: string;

  constructor(url: URL | string, _options?: unknown) {
    this.chemin = typeof url === 'string' ? url : url.pathname;
  }

  postMessage(d: unknown): void {
    const route = ROUTES.find(([s]) => this.chemin.split('?')[0]!.endsWith(s));
    const envoyer: Envoyer = (m) => {
      if (!this.termine) this.onmessage?.({ data: m });
    };
    setImmediate(() => {
      if (!route) {
        this.onerror?.({ preventDefault() {}, message: `Banc : pas de faux Worker pour ${this.chemin}` });
        return;
      }
      route[1](d as never, envoyer).catch((e: unknown) => {
        const code = (e as { code?: string }).code ?? 'banc';
        console.error('[banc] faux Worker', this.chemin, e);
        envoyer({ type: 'erreur', message: e instanceof Error ? e.message : String(e), code });
      });
    });
  }

  terminate(): void {
    this.termine = true;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Installe le faux Worker comme `Worker` global. */
export function installerFauxWorker(): void {
  (globalThis as { Worker?: unknown }).Worker = FauxWorker;
}
