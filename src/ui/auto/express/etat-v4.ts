// Best-of v4 (dev-ui, vague 2) — le parcours « presque tout en auto, tout modifiable » : réglages déjà bons à CHAQUE
// ouverture, accord pour le module sous-titres (jamais de mode voix en silence), analyse par la chaîne pure
// (mesurerPourBestOf → analyserChaine), revue modifiable (séquences, durée visée, voix, empreinte), puis le montage en
// UN seul modifier() (un seul Annuler revient à la vidéo brute). Contrat : CONTRAT.md §1.10, §2, §4.9.
//
// Ce fichier ne touche JAMAIS le navigateur : l'état partagé (signals des écrans) et les tâches lentes (modules,
// mesures, musique, projet) lui sont DONNÉS (EtatPartageV4, ServicesV4). Les tests le font tourner dans Node avec de
// faux services ; best-of-v4.ts le branche sur l'appli. La recette ne change que par les fonctions de la chaîne
// (qui passent par src/recette/operations*.ts).

import { computed, effect, signal, untracked, type Signal } from '@preact/signals';
import { plagesGardees, type ReglagesBestOf } from '../../../auto/express/best-of';
import {
  analyserChaine,
  decisionModules,
  dureeEstimee,
  dureeViseeSequences,
  monterChaine,
  monterSansMusique,
  poserMusique,
  recetteDeDepart,
  rechoisirSequences,
  reglagesBestOfV4,
  revueParDefaut,
  type OptionsChaine,
} from '../../../auto/express/chaine-best-of';
import type { AnalyseExpress, ReglagesExpress } from '../../../auto/express/express';
import type { SceneProposee } from '../../../auto/express/scenes';
import { dureeDansMorceaux } from '../../../auto/coupes/coupes-v4';
import { REGLAGES_BLANCS } from '../../../auto/coupes/reglages';
import type { OptionsTache, PlageTemps } from '../../../auto/types';
import type { AnalyseV4, DecisionModules, EmpreintesNeurales, EntreeSequences, MesuresGardees, MesuresSource, ModulesBestOf, MusiquePrete, RevueV4, SequenceV4 } from '../../../auto/types-v4';
import type { SourceOuverte } from '../../../moteur/api';
import { ErreurArko } from '../../../moteur/erreurs';
import { gabarit, type Destination } from '../../../recette/destination';
import type { DefinitionChibi, Recette, Sec } from '../../../recette/types';
import { TAILLE_MODULE } from '../../../sous-titres/config';
import { BRANCHEMENTS } from './branchements-v4';
import type { EtatAnalyseExpress } from './etat-express';
import { TEXTES_VAD } from '../../../auto/vad/textes-vad';
import { TA } from '../../../textes-auto';
import { TEXTES_BEST_OF } from './textes-best-of';
import { TEXTES_V4 as T4 } from './textes-v4';

/* ------------------------------------------------------------------ fonctions pures (testées) */

export type StyleExpress = 'express' | 'bestOf';

/**
 * Réglages posés à l'ouverture du Montage express et à chaque choix du style. Best-of : `reglagesBestOfV4(d)` en
 * ENTIER, à chaque fois (fin du bug de la 2ᵉ ouverture et du « Serré imposé » : coupe Normal = la DA, Transcrire
 * coché, musique automatique). Montage express : les réglages d'avant (`base`), coupe Normal.
 */
export function reglagesPourStyle(style: StyleExpress, d: Destination, base: ReglagesExpress): { express: ReglagesExpress; bestOf: ReglagesBestOf | null } {
  if (style === 'bestOf') return reglagesBestOfV4(d);
  return { express: { ...base, niveauBlancs: 'normal' }, bestOf: null };
}

/**
 * Ce que l'écran propose avant l'analyse. Décision de l'orchestrateur (7/11) : le détecteur de voix (Silero, 2,2 Mo)
 * est RANGÉ DANS L'APPLI : il n'est jamais proposé au téléchargement (ni compté dans la taille). Seul Whisper l'est.
 */
export function propositionModules(m: ModulesBestOf, transcrire: boolean): DecisionModules {
  const d = decisionModules(m, transcrire);
  const aProposer = d.aProposer.filter((x) => x !== 'vad');
  return { ...d, aProposer, octets: aProposer.includes('whisper') ? TAILLE_MODULE : 0 };
}

/** Les modules lus sur l'appareil, avec les refus de CETTE ouverture et l'état de la connexion. */
export function modulesAvecRefus(lus: ModulesBestOf, refuses: ReadonlySet<'whisper' | 'empreinte'>, enLigne: boolean): ModulesBestOf {
  const un = (id: 'whisper' | 'empreinte', e: ModulesBestOf['whisper']) => (e !== 'absent' ? e : refuses.has(id) ? 'refuse' : enLigne ? 'absent' : 'horsLigne');
  return { whisper: un('whisper', lus.whisper), vad: lus.vad, empreinte: un('empreinte', lus.empreinte) };
}

export function estV4(a: AnalyseExpress | null | undefined): a is AnalyseV4 {
  return !!a && (a as { v?: number }).v === 4;
}

/** Ce que l'étape « séquences » reçoit (comme rechoisirSequences) : pour « Plus de contexte / Moins ». */
export function entreeSequencesDe(a: AnalyseV4, reg: Pick<ReglagesExpress, 'niveauBlancs' | 'dureeVisee' | 'accroche'>): EntreeSequences {
  const min = (REGLAGES_BLANCS[reg.niveauBlancs] ?? REGLAGES_BLANCS.normal).morceauMin;
  return {
    src: a.signaux.src,
    duree: a.signaux.duree,
    mots: a.transcription.mots,
    parole: a.paroleDetectee,
    moments: a.moments,
    voix: a.voix,
    signaux: a.signaux,
    dureeVisee: dureeViseeSequences(reg),
    dureeDe: (plages: readonly PlageTemps[]) => dureeDansMorceaux(a.morceaux, plages, min),
  };
}

/** Durée APRÈS coupes d'une séquence (même découpe que le montage), au dixième. */
export function dureeSequence(a: Pick<AnalyseV4, 'morceaux'>, s: SequenceV4, reg: Pick<ReglagesExpress, 'niveauBlancs'>): Sec {
  const min = (REGLAGES_BLANCS[reg.niveauBlancs] ?? REGLAGES_BLANCS.normal).morceauMin;
  return Math.round(dureeDansMorceaux(a.morceaux, plagesGardees([{ ...s, garde: true }]), min) * 10) / 10;
}

/** Ce qu'il faut garder des mesures pour recouper après coup (même forme que MesuresGardees de dev-vad). */
export function mesuresGardeesDe(m: Pick<MesuresSource, 'vad' | 'empreintes' | 'hauteur'> | null): MesuresGardees | null {
  if (!m) return null;
  const vad = m.vad ? { pas: m.vad.pas, p: m.vad.p, plages: m.vad.plages, modele: m.vad.modele } : null;
  // Seulement l'énergie (`db`), pas le timbre (`bandes`, 8 fois plus gros : ≈ 19 Mo pour 3 h ; relecture point 8).
  const e = m.empreintes[0];
  const energie = e ? { pas: e.pas, db: e.db } : null;
  return vad || energie ? { v: 1, vad, energie, hauteur: m.hauteur } : null;
}

/**
 * « Combien de personnes parlent ? » (relecture point 12) : avec 3 voix ou plus trouvées, « Trois ou plus » est le
 * choix actif (et « Deux » se touche : il garde le 1er partage) ; sinon Une / Deux. `forcer` = le choix de
 * l'utilisateur (null = celui d'Arko). Toucher le choix actif ne fait rien ; « 3 » remet le choix d'Arko.
 */
export function choixCombien(trouvees: number, forcer: 1 | 2 | null): { actif: 1 | 2 | 3; choix: (1 | 2 | 3)[] } {
  const auto: 1 | 2 | 3 = trouvees >= 3 ? 3 : trouvees >= 2 ? 2 : 1;
  return { actif: forcer ?? auto, choix: trouvees >= 3 ? [1, 2, 3] : [1, 2] };
}

/**
 * Les avertissements de la revue, sans doublon avec ses bandeaux (relecture point 16) : « sans sous-titres » quand le
 * bandeau du module est là ; « le détecteur de voix ne s'est pas chargé / n'a pas pu démarrer » quand le bandeau
 * « moins précis » (avec son bouton « Refaire l'analyse ») est là.
 */
export function avertissementsRevue(a: Pick<AnalyseV4, 'avertissements' | 'modules'>, autres: readonly string[] = []): string[] {
  const vad = new Set<string>([TEXTES_VAD.pasCharge, TEXTES_VAD.pasDemarre]);
  return [...a.avertissements, ...autres].filter((m) => !(m === TA.express.sansMots && a.modules.whisper !== 'present') && !(vad.has(m) && a.modules.vad !== 'present'));
}

/** Le bandeau « moins précis » propose-t-il de refaire l'analyse ? (pas si l'utilisateur a refusé le détecteur.) */
export function refaireSansPrecision(a: Pick<AnalyseV4, 'modules'>): boolean {
  return a.modules.vad !== 'present' && a.modules.vad !== 'refuse';
}

/** ★ de 1 à 5 à partir du centile (0–100). */
export function etoiles(centile: number): number {
  return Math.max(1, Math.min(5, Math.ceil((Number.isFinite(centile) ? centile : 0) / 20)));
}

/** Seuils de la barre d'avancement de mesurerPourBestOf (signaux, passe du son, Whisper) : 4 étapes à l'écran. */
export const SEUILS_ETAPES = [0.1, 0.25, 0.93] as const;
export type EtatEtape = 'fait' | 'encours' | 'avenir' | 'saute';

/** L'état des 4 étapes de l'analyse (son, qui parle, mots, moments) pour un avancement `p` (0 à 1). */
export function etapesAnalyse(p: number, avecMots: boolean): EtatEtape[] {
  const bornes = [0, ...SEUILS_ETAPES, 1];
  return [0, 1, 2, 3].map((i) => {
    if (i === 2 && !avecMots) return 'saute';
    if (p >= bornes[i + 1]!) return 'fait';
    return p >= bornes[i]! ? 'encours' : 'avenir';
  });
}

/* ------------------------------------------------------------------ état partagé et services (injectés) */

/** Les signals des écrans (etat-express.ts, etat-best-of.ts) que le parcours lit et écrit. */
export interface EtatPartageV4 {
  source: Signal<SourceOuverte | null>;
  destination: Signal<Destination>;
  reglages: Signal<ReglagesExpress>;
  bestOf: Signal<ReglagesBestOf>;
  etat: Signal<EtatAnalyseExpress>;
  analyse: Signal<AnalyseExpress | null>;
  scenes: Signal<SceneProposee[]>;
  noms: Signal<Record<string, string>>;
  chibis: Signal<Record<string, { def: DefinitionChibi; bib?: string }>>;
  pour: Signal<string | null>;
  montageEnCours: Signal<boolean>;
}

export interface OptionsMesuresV4 extends OptionsTache {
  modules: ModulesBestOf;
  pistes?: readonly number[];
}

/** Tout ce qui est lent ou touche le navigateur (best-of-v4.ts ; de faux services dans les tests). */
export interface ServicesV4 {
  /** Whisper, VAD, empreinte : 'present' ou 'absent' (jamais 'refuse' : c'est le parcours qui le sait). Ne lève pas. */
  lireModules(): Promise<ModulesBestOf>;
  enLigne(): boolean;
  /** À appeler SEULEMENT après l'accord (« Télécharger »). */
  telechargerWhisper(o: OptionsTache): Promise<void>;
  telechargerEmpreinte(o: OptionsTache): Promise<void>;
  mesurer(source: SourceOuverte, reg: ReglagesExpress, bestOf: ReglagesBestOf, o: OptionsMesuresV4): Promise<MesuresSource>;
  empreintesNeurales(source: SourceOuverte, morceaux: readonly PlageTemps[], o: OptionsTache): Promise<EmpreintesNeurales>;
  /** Pistes gardées de la vidéo (montage d'où l'on vient), [] sinon. */
  pistes(source: SourceOuverte): readonly number[];
  allerA(e: 'reglages' | 'analyse' | 'revue', remplacer?: boolean): void;
  retour(): void;
  toast(message: string, ms?: number, action?: { label: string; agir: () => void }): void;
  garderEcranAllume?(): Promise<() => void>;
  /**
   * Attente (ms) après le dernier toucher de la revue avant le calcul EXACT de la durée (l'accroche se calcule comme
   * au montage, ≈ 0,4 s sur téléphone) ; en attendant, l'accroche compte pour 6 s. Défaut 300 ; 0 = tout de suite.
   */
  attenteDuree?: number;
  /** Nouveau projet ouvert sur `depart` ; rend la recette ouverte (null : impossible). */
  ouvrirProjet(source: SourceOuverte, depart: Recette): Promise<Recette | null>;
  /** Musique automatique sur le montage sans musique (dev-musique) ; null : aucune. */
  musiqueAuto(sans: Recette, gardees: readonly SceneProposee[], a: AnalyseV4): Promise<MusiquePrete | null>;
  /** Morceaux de Mes sons cochés à la main, copiés dans le projet (à t = 0 : la chaîne les place). */
  musiqueChoisie(ids: readonly string[]): Promise<MusiquePrete | null>;
  /** UNE opération de l'historique (un seul Annuler). */
  modifier(op: (r: Recette) => Recette): boolean;
  /**
   * Après le montage : quitter le Montage express, aller dans Habiller, message « Best-of prêt » (avec Annuler).
   * `a` et `gardees` (VAD + énergie de la voix, en mémoire) servent à recouper après coup sans réécouter.
   */
  apresMontage(source: SourceOuverte, a: AnalyseV4, gardees: MesuresGardees | null): void;
  /**
   * « Sous-titres précis » (dev-mots-2, precis-v4.ts) : AVANT d'ouvrir le montage, l'analyse avec les mots de la
   * 2ᵉ passe de Whisper sur la voix sous-titrée des séquences gardées, ou `a` telle quelle. Ne lève pas. Absent : rien.
   */
  precis?(source: SourceOuverte, a: AnalyseV4, revue: RevueV4): Promise<AnalyseV4>;
  /** Tests : étapes stables (ETAPES_ANCIENNES) ; l'appli : rien (étapes v4). */
  optionsChaine?: OptionsChaine;
}

export type CarteModules =
  | { phase: 'proposer'; octets: number }
  | { phase: 'telechargement'; p: number; octets: number }
  | { phase: 'horsLigne' }
  | { phase: 'erreur'; message: string; octets: number };

export type EtatEmpreinte =
  | { phase: 'rien' }
  | { phase: 'refusee' }
  | { phase: 'telechargement'; p: number }
  | { phase: 'calcul'; p: number }
  | { phase: 'faite' }
  | { phase: 'erreur'; message: string };

export type EtapeMontage = null | 'montage' | 'musique';

/* ------------------------------------------------------------------ le parcours */

export function creerParcoursBestOf(e: EtatPartageV4, s: ServicesV4) {
  /** Carte d'accord du module sous-titres (null : cachée). */
  const carte = signal<CarteModules | null>(null);
  /** État des modules pour CETTE ouverture (après lecture, refus, connexion). */
  const modules = signal<ModulesBestOf | null>(null);
  /** « Une seule personne » (1) / « Deux personnes » (2) choisi sur la revue ; null = ce qu'Arko a trouvé. */
  const forcer = signal<1 | 2 | null>(null);
  const empreinte = signal<EtatEmpreinte>({ phase: 'rien' });
  const etapeMontage = signal<EtapeMontage>(null);
  /** Les mesures de la dernière analyse, gardées en mémoire : refaire la chaîne (voix, durée) sans réécouter. */
  let mesures: MesuresSource | null = null;
  let empMesures: string | null = null;
  const refuses = new Set<'whisper' | 'empreinte'>();
  let controleur: AbortController | null = null;
  let telechargement: AbortController | null = null;

  const opts = (): OptionsChaine => {
    const f = forcer.peek();
    return { ...(s.optionsChaine ?? {}), ...(f ? { forcerVoix: f } : {}) };
  };

  /*
   * Durée annoncée (même fonction que le montage, accroche comprise) ; null hors Best-of v4. Relecture point 14 : le
   * calcul exact de l'accroche refait l'habillage (≈ 0,4 s sur téléphone) ; il attend donc la fin des touchers
   * (`attenteDuree`) ; en attendant, la durée s'affiche tout de suite avec une accroche de 6 s.
   */
  const entreesDuree = computed(() => ({ a: e.analyse.value, scenes: e.scenes.value as SequenceV4[], reg: e.reglages.value }));
  const dureeRapide = computed<Sec | null>(() => {
    const { a, scenes, reg } = entreesDuree.value;
    return estV4(a) ? dureeEstimee({ morceaux: a.morceaux }, scenes, reg) : null;
  });
  const dureeExacte = signal<{ pour: object; t: Sec } | null>(null);
  let minuteurDuree: ReturnType<typeof setTimeout> | null = null;
  effect(() => {
    const x = entreesDuree.value;
    if (minuteurDuree) clearTimeout(minuteurDuree);
    minuteurDuree = null;
    if (!estV4(x.a)) return;
    const calculer = () => {
      if (entreesDuree.peek() === x && estV4(x.a)) dureeExacte.value = { pour: x, t: dureeEstimee(x.a, x.scenes, x.reg) };
    };
    const attente = s.attenteDuree ?? 300;
    if (attente <= 0) untracked(calculer);
    else minuteurDuree = setTimeout(calculer, attente);
  });
  const total = computed<Sec | null>(() => {
    const x = dureeExacte.value;
    return x && x.pour === entreesDuree.value ? x.t : dureeRapide.value;
  });
  /** « Monter la vidéo » possible ? (rien de coché, ou trop long pour la destination → non). Même total que l'écran. */
  const possible = computed(() => {
    const t = total.value;
    const { scenes } = entreesDuree.value;
    if (t === null) return null;
    const g = gabarit(e.destination.value);
    const max = g.dureeLimite ?? g.dureeMax;
    return { possible: scenes.some((x) => x.garde) && t <= max, total: t, max };
  });

  /** À chaque ouverture du Montage express : les refus et les choix de la revue d'avant sont oubliés. */
  function ouvrir() {
    telechargement?.abort();
    refuses.clear();
    carte.value = null;
    modules.value = null;
    empreinte.value = { phase: 'rien' };
    etapeMontage.value = null;
    if (empMesures !== (e.source.peek()?.infos.emp ?? null)) {
      mesures = null;
      empMesures = null;
      forcer.value = null;
    }
  }

  /** L'analyse finie (ou refaite) : la revue d'office ; `garder` = noms et persos déjà choisis gardés. */
  function publier(a: AnalyseV4, garder: boolean) {
    const revue = revueParDefaut(a);
    const ids = new Set((a.voix?.voix ?? []).map((v) => v.id));
    const filtre = <V>(x: Record<string, V>) => Object.fromEntries(Object.entries(x).filter(([k]) => ids.has(k)));
    e.analyse.value = a;
    e.scenes.value = revue.scenes;
    e.noms.value = garder ? filtre(e.noms.peek()) : {};
    e.chibis.value = garder ? filtre(e.chibis.peek()) : {};
    const pour = e.pour.peek();
    e.pour.value = garder && pour !== null && ids.has(pour) ? pour : revue.sousTitresPour;
  }

  /** « Analyser ma vidéo » : la carte d'accord si le module sous-titres manque, sinon l'analyse tout de suite. */
  async function demanderAnalyse(): Promise<void> {
    if (!e.source.peek() || e.etat.peek().phase === 'encours') return;
    const lus = await s.lireModules().catch((): ModulesBestOf => ({ whisper: 'absent', vad: 'absent', empreinte: 'absent' }));
    const m = modulesAvecRefus(lus, refuses, s.enLigne());
    modules.value = m;
    const transcrire = e.reglages.peek().transcrire;
    const d = propositionModules(m, transcrire);
    if (d.aProposer.length > 0) {
      carte.value = { phase: 'proposer', octets: d.octets };
      return;
    }
    if (transcrire && m.whisper === 'horsLigne') {
      carte.value = { phase: 'horsLigne' };
      return;
    }
    await analyser(m);
  }

  /** « Télécharger » sur la carte : le module, puis l'analyse (ou la refaire, depuis la revue). */
  async function accepterModules(): Promise<void> {
    const c = carte.peek();
    const m = modules.peek();
    if (!c || !m || c.phase === 'telechargement' || c.phase === 'horsLigne') return;
    const octets = c.octets;
    const t = new AbortController();
    telechargement = t;
    carte.value = { phase: 'telechargement', p: 0, octets };
    try {
      await s.telechargerWhisper({ signal: t.signal, surProgression: (p) => telechargement === t && (carte.value = { phase: 'telechargement', p, octets }) });
      if (telechargement !== t) return;
      refuses.delete('whisper');
      const prets: ModulesBestOf = { ...m, whisper: 'present' };
      modules.value = prets;
      carte.value = null;
      await analyser(prets);
    } catch (err) {
      if (telechargement !== t) return;
      if (t.signal.aborted || (err instanceof ErreurArko && err.code === 'annule')) carte.value = { phase: 'proposer', octets };
      else carte.value = { phase: 'erreur', message: err instanceof ErreurArko ? err.message : T4.carte.erreur, octets };
    } finally {
      if (telechargement === t) telechargement = null;
    }
  }

  /** « Pas maintenant » / « Continuer sans » : refus pour cette ouverture, analyse sans le module (et c'est dit). */
  async function refuserModules(): Promise<void> {
    const m = modules.peek();
    telechargement?.abort();
    telechargement = null;
    carte.value = null;
    if (!m) return;
    refuses.add('whisper');
    const sans: ModulesBestOf = { ...m, whisper: m.whisper === 'present' ? 'present' : m.whisper === 'horsLigne' ? 'horsLigne' : 'refuse' };
    modules.value = sans;
    await analyser(sans);
  }

  /** Ferme la carte sans rien lancer (Retour d'Android, Échap) ; arrête un téléchargement en cours. */
  function fermerCarte() {
    telechargement?.abort();
    telechargement = null;
    carte.value = null;
  }

  /** Bandeau de la revue « Le télécharger et refaire l'analyse ». */
  async function telechargerEtRefaire(): Promise<void> {
    refuses.delete('whisper');
    const lus = await s.lireModules().catch((): ModulesBestOf => ({ whisper: 'absent', vad: 'absent', empreinte: 'absent' }));
    const m = modulesAvecRefus(lus, refuses, s.enLigne());
    modules.value = m;
    if (m.whisper === 'present') return analyser(m);
    if (m.whisper === 'horsLigne') {
      s.toast(T4.carte.horsLigne, 6000);
      return;
    }
    carte.value = { phase: 'proposer', octets: propositionModules(m, true).octets };
  }

  /** L'analyse : mesures sur l'appareil, puis la chaîne pure, puis la revue d'office. */
  async function analyser(m: ModulesBestOf): Promise<void> {
    const source = e.source.peek();
    if (!source) return;
    controleur?.abort();
    const c = new AbortController();
    controleur = c;
    e.etat.value = { phase: 'encours', p: 0, message: '' };
    s.allerA('analyse');
    const relacher = s.garderEcranAllume ? await s.garderEcranAllume().catch(() => () => {}) : () => {};
    try {
      const reg = e.reglages.peek();
      const bo = e.bestOf.peek();
      const me = await s.mesurer(source, reg, bo, {
        signal: c.signal,
        surProgression: (p, message) => controleur === c && (e.etat.value = { phase: 'encours', p, message }),
        pistes: s.pistes(source),
        modules: m,
      });
      if (controleur !== c) return;
      analyserDepuis(me);
      s.allerA('revue', true);
    } catch (err) {
      if (controleur !== c) return;
      if (c.signal.aborted || (err instanceof ErreurArko && err.code === 'annule')) {
        e.etat.value = { phase: 'avant' };
        s.toast(T4.analyse.annulee, 5000);
        s.retour();
        return;
      }
      console.error(err);
      e.etat.value = { phase: 'erreur', message: err instanceof ErreurArko ? err.message : T4.analyse.erreur };
    } finally {
      relacher();
      if (controleur === c) controleur = null;
    }
  }

  /**
   * La partie PURE de l'analyse, sur des mesures déjà faites : la chaîne, puis la revue d'office (mesures gardées en
   * mémoire pour refaire la chaîne sans réécouter). Sert à analyser() et à la page de démonstration.
   */
  function analyserDepuis(me: MesuresSource) {
    mesures = me;
    empMesures = e.source.peek()?.infos.emp ?? null;
    modules.value = { ...me.modules };
    forcer.value = null;
    empreinte.value = { phase: 'rien' };
    publier(analyserChaine(me, e.reglages.peek(), e.bestOf.peek(), opts()), false);
    e.etat.value = { phase: 'fini' };
  }

  /** « Réessayer » après une erreur : relit les modules (rien n'est re-proposé s'il a été refusé). */
  async function reessayer(): Promise<void> {
    const lus = await s.lireModules().catch((): ModulesBestOf => ({ whisper: 'absent', vad: 'absent', empreinte: 'absent' }));
    const m = modulesAvecRefus(lus, refuses, s.enLigne());
    modules.value = m;
    await analyser(m);
  }

  function annuler() {
    controleur?.abort();
    telechargement?.abort();
  }

  /* -------------------------------------------------------------- revue */

  /** Refait la chaîne pure à partir des mesures gardées (< 2 s pour 2 h), noms et persos gardés. */
  function refaire(): boolean {
    if (!mesures) return false;
    publier(analyserChaine(mesures, e.reglages.peek(), e.bestOf.peek(), opts()), true);
    return true;
  }

  /** « Une seule personne / Deux personnes » (null = ce qu'Arko a trouvé). */
  function forcerVoix(n: 1 | 2 | null) {
    if (!mesures) return s.toast(T4.revue.pasDeMesures);
    forcer.value = n;
    refaire();
    const a = e.analyse.peek();
    s.toast(T4.revue.voixRefaites(estV4(a) && (a.voix?.voix.length ?? 0) >= 2 ? 2 : 1), 4000);
  }

  /** Durée visée changée sur la revue : nouveau choix des séquences, sans réanalyse (noms et persos gardés). */
  function changerDuree(d: { min: Sec; max: Sec }, libelle?: string) {
    const a = e.analyse.peek();
    if (!estV4(a)) return;
    const reg = { ...e.reglages.peek(), dureeVisee: { ...d } };
    e.reglages.value = reg;
    const b = rechoisirSequences(a, reg, opts());
    e.analyse.value = b;
    e.scenes.value = b.scenes.map((x) => ({ ...x }));
    if (libelle) s.toast(T4.revue.rechoisies(libelle), 3000);
  }

  /** « Une phrase de plus / de moins » au début ou à la fin d'une séquence (dev-scenes, ajusterSequence). */
  function ajuster(i: number, cote: 'debut' | 'fin', sens: 1 | -1): boolean {
    const a = e.analyse.peek();
    const f = BRANCHEMENTS.ajusterSequence;
    const liste = e.scenes.peek() as SequenceV4[];
    const x = liste[i];
    if (!estV4(a) || !f || !x) return false;
    let y: SequenceV4;
    try {
      y = f(x, entreeSequencesDe(a, e.reglages.peek()), cote, sens);
    } catch (err) {
      console.warn('[Arko] ajusterSequence', err);
      y = x;
    }
    // Jamais sur une séquence voisine COCHÉE : le même passage serait joué deux fois (relecture point 3).
    const chevauche = liste.some((z, k) => k !== i && z.garde && z.de < y.a - 0.01 && z.a > y.de + 0.01);
    if (y === x || (y.de === x.de && y.a === x.a) || chevauche) {
      s.toast(T4.revue.reglageImpossible, 2500);
      return false;
    }
    e.scenes.value = liste.map((z, k) => (k === i ? { ...y, garde: x.garde } : z));
    return true;
  }

  /** Empreinte de voix (28 Mo) acceptée : téléchargement, calcul sur les morceaux demandés, puis la chaîne refaite. */
  async function accepterEmpreinte(): Promise<void> {
    const a = e.analyse.peek();
    const source = e.source.peek();
    const m = modules.peek() ?? mesures?.modules ?? null;
    if (!estV4(a) || !source || !mesures || !m) return;
    const morceaux = a.besoins.empreintes;
    if (morceaux.length === 0) return;
    if (m.empreinte !== 'present' && !s.enLigne()) {
      empreinte.value = { phase: 'erreur', message: T4.revue.empreinte.horsLigne };
      return;
    }
    const t = new AbortController();
    telechargement = t;
    try {
      if (m.empreinte !== 'present') {
        empreinte.value = { phase: 'telechargement', p: 0 };
        await s.telechargerEmpreinte({ signal: t.signal, surProgression: (p) => (empreinte.value = { phase: 'telechargement', p }) });
        modules.value = { ...m, empreinte: 'present' };
      }
      empreinte.value = { phase: 'calcul', p: 0 };
      const neurales = await s.empreintesNeurales(source, morceaux, { signal: t.signal, surProgression: (p) => (empreinte.value = { phase: 'calcul', p }) });
      mesures = { ...mesures, neurales, modules: { ...mesures.modules, empreinte: 'present' } };
      refaire();
      empreinte.value = { phase: 'faite' };
      // Ne pas dire « Voix séparées » si l'empreinte n'en trouve toujours qu'une (QA, 7/11).
      const apres = e.analyse.peek();
      const deux = estV4(apres) && (apres.voix?.voix.length ?? 0) >= 2;
      s.toast(deux ? T4.revue.empreinte.faite : T4.revue.empreinte.uneSeule, deux ? 4000 : 6000);
    } catch (err) {
      if (t.signal.aborted || (err instanceof ErreurArko && err.code === 'annule')) empreinte.value = { phase: 'rien' };
      else {
        console.warn('[Arko] empreinte de voix', err);
        empreinte.value = { phase: 'erreur', message: T4.revue.empreinte.erreur };
      }
    } finally {
      if (telechargement === t) telechargement = null;
    }
  }

  function refuserEmpreinte() {
    refuses.add('empreinte');
    empreinte.value = { phase: 'refusee' };
  }

  /** La revue telle que l'écran la montre (ordre, cochées, noms, persos, « Sous-titres pour »). */
  function revueCourante(): RevueV4 {
    return { scenes: e.scenes.peek() as SequenceV4[], noms: e.noms.peek(), chibis: e.chibis.peek(), sousTitresPour: e.pour.peek() };
  }

  /* -------------------------------------------------------------- montage */

  /**
   * « Monter la vidéo » : nouveau projet, montage SANS musique (pur), musique (automatique ou choisie), musique posée
   * + volume final, le tout en UN seul modifier() : un seul Annuler revient à la vidéo brute.
   */
  async function monter(): Promise<boolean> {
    const source = e.source.peek();
    const a0 = e.analyse.peek();
    if (!source || !estV4(a0) || e.montageEnCours.peek()) return false;
    const revue = revueCourante();
    const gardees = revue.scenes.filter((x) => x.garde && x.a > x.de);
    if (gardees.length === 0) {
      s.toast(T4.montage.rien);
      return false;
    }
    const reg = e.reglages.peek();
    const bo = e.bestOf.peek();
    const o = opts();
    e.montageEnCours.value = true;
    etapeMontage.value = 'montage';
    try {
      // Sous-titres précis (s'ils sont cochés) : réécoute AVANT d'ouvrir le projet ; sinon les mots de l'analyse.
      const a = s.precis ? await s.precis(source, a0, revue).catch(() => a0) : a0;
      const nom = source.infos.nom.replace(/\.[^.]+$/, '');
      const r0 = await s.ouvrirProjet(source, recetteDeDepart(source.infos, e.destination.peek(), TEXTES_BEST_OF.titreProjet(nom)));
      if (!r0) return false;
      const sans = monterSansMusique(r0, a, revue, reg, bo, o);
      let musique: MusiquePrete | null = null;
      if (sans !== r0) {
        if (reg.musiqueAuto === true) {
          etapeMontage.value = 'musique';
          musique = await s.musiqueAuto(sans, gardees, a).catch((err: unknown) => (console.error(err), null));
        } else if (reg.musique.length > 0) musique = await s.musiqueChoisie(reg.musique).catch((err: unknown) => (console.error(err), null));
      }
      const avec = sans === r0 ? r0 : poserMusique(sans, musique);
      // UNE opération : si la recette ouverte a changé entre-temps, on refait tout dessus (même résultat).
      const fait = s.modifier((r) => (r === r0 ? avec : monterChaine(r, a, revue, reg, bo, musique, o)));
      if (!fait) {
        s.toast(T4.montage.erreur, 6000);
        return false;
      }
      const gardeesMemoire = mesuresGardeesDe(mesures);
      e.analyse.value = null;
      e.scenes.value = [];
      e.etat.value = { phase: 'avant' };
      e.source.value = null;
      mesures = null;
      empMesures = null;
      s.apresMontage(source, a, gardeesMemoire);
      return true;
    } catch (err) {
      console.error(err);
      s.toast(err instanceof ErreurArko ? err.message : T4.montage.erreur, 6000);
      return false;
    } finally {
      e.montageEnCours.value = false;
      etapeMontage.value = null;
    }
  }

  return {
    carte,
    modules,
    forcer,
    empreinte,
    etapeMontage,
    total,
    possible,
    ouvrir,
    demanderAnalyse,
    accepterModules,
    refuserModules,
    fermerCarte,
    telechargerEtRefaire,
    analyser,
    analyserDepuis,
    reessayer,
    annuler,
    forcerVoix,
    changerDuree,
    ajuster,
    accepterEmpreinte,
    refuserEmpreinte,
    revueCourante,
    monter,
    /** Les mesures gardées en mémoire (tests, et « refaire » sans réécouter). */
    aDesMesures: () => mesures !== null,
  };
}

export type ParcoursBestOf = ReturnType<typeof creerParcoursBestOf>;
