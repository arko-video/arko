// Best-of serré v4 — la chaîne PURE, partagée par l'INTERFACE et le BANC (contrat : /home/claude/equipe/CONTRAT.md).
// Écrite par l'architecte (7/11/2026), propriétaire en vague 2 : l'INTÉGRATEUR (les devs n'y touchent pas : ils
// écrivent LEUR étape, déjà branchée ici). Aucune tâche lente, aucun accès au navigateur : tout ce qui est mesuré
// sur l'appareil arrive dans `MesuresSource` (express/mesures-best-of.ts dans l'appli, faux Workers dans le banc).
//
//   réglages (reglagesBestOfV4) → modules (decisionModules) → [mesures : signaux, empreintes + VAD, Whisper sur les
//   zones (besoinsChaine), empreinte CAM++ facultative] → analyserChaine : parole → mots → voix → moments → coupes
//   (toute la source) → séquences → revue (revueParDefaut, rechoisirSequences, dureeEstimee, montagePossible) →
//   monterSansMusique : plans → sous-titres → coupes → bords → habillage → passages → persos → bips →
//   [musique automatique, dev-musique] → poserMusique : musique + volume final. Un seul Annuler (un modifier()).
//
// Chaque étape est injectable (`etapes`) ; une étape qui lève est remplacée par l'étape d'avant (journal).

import { couperV4, dureeDansMorceaux } from '../coupes/coupes-v4';
import { soustrairePlages } from '../coupes/tranches';
import { premiereVideo } from '../coupes/decoupe';
import { REGLAGES_BLANCS } from '../coupes/reglages';
import { choisirSequencesV4 } from '../derush/sequences';
import { habillerV4 } from '../habillage/habillage-v4';
import { signauxAvecMoments, trouverMomentsV4 } from '../moments/moments';
import { finAccroche } from '../son/musique-auto';
import { nettoyerMotsV4 } from '../mots/nettoyage-v4';
import { energieDuMelange } from '../vad/audible';
import { detecterParoleV4 } from '../vad/parole';
import { zonesATranscrire } from '../vad/segments';
import { poserPersosV4 } from '../voix/persos-v4';
import { morceauxAEmpreinter, separerVoixV4 } from '../voix/qui-parle-v4';
import { MODELES } from '../modeles/catalogue';
import { compiler } from '../../recette/chronologie';
import { DUREE_INITIALE, recetteVide, SOUS_TITRES, ySousTitres } from '../../recette/defauts';
import { gabarit, gabaritDe, type Destination } from '../../recette/destination';
import { MEILLEUR } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { LUFS_MONTAGE, VOLUME_FINAL } from '../../recette/normaliser-auto-son';
import { choisirBips, choisirVolumeFinal, couperLesBlancs, definirMusique, definirPassages, definirSousTitres, rognerSource } from '../../recette/operations';
import type { Mot, Recette, Sec, Source } from '../../recette/types';
import { TAILLE_MODULE } from '../../sous-titres/config';
import type { PlageTemps } from '../types';
import type {
  AnalyseV4,
  BesoinsChaine,
  DecisionModules,
  EntreeVoix,
  EtapesChaine,
  MesuresSource,
  ModulesBestOf,
  MotsNettoyes,
  MusiquePrete,
  NomEtape,
  ParoleDetectee,
  RevueV4,
  SequenceV4,
  VoixDetecteesV4,
} from '../types-v4';
import { BEST_OF_DEFAUT, passagesRestants, plagesGardees, voixMalEntendue, type ReglagesBestOf } from './best-of';
import { ETAPES_ANCIENNES } from './etapes-anciennes';
import { placerMorceaux, type ReglagesExpress } from './express';
import { motsDesScenes } from './scenes';

/* ------------------------------------------------------------------ étapes */

/** Les étapes de la v4 (fonctions des devs). */
export const ETAPES_V4: EtapesChaine = {
  parole: detecterParoleV4,
  mots: nettoyerMotsV4,
  voix: separerVoixV4,
  moments: trouverMomentsV4,
  coupes: couperV4,
  sequences: choisirSequencesV4,
  habillage: habillerV4,
  persos: poserPersosV4,
};

export const NOMS_ETAPES: readonly NomEtape[] = ['parole', 'mots', 'voix', 'moments', 'coupes', 'sequences', 'habillage', 'persos'];

/** Les étapes v4, sauf `anciennes` qui reprennent le comportement d'avant (banc : « --ancien voix,coupes »). */
export function etapesAvec(anciennes: readonly NomEtape[], base: EtapesChaine = ETAPES_V4): EtapesChaine {
  const res: EtapesChaine = { ...base };
  for (const n of anciennes) (res as unknown as Record<NomEtape, unknown>)[n] = ETAPES_ANCIENNES[n];
  return res;
}

export interface OptionsChaine {
  etapes?: EtapesChaine;
  /** Reçoit une ligne par étape qui a levé (et a été remplacée par l'étape d'avant). Banc : écrit dans banc.json. */
  journal?: string[];
  /** Revue : l'utilisateur a dit « une seule personne » (1) ou « deux personnes » (2) ; on refait l'analyse avec. */
  forcerVoix?: 1 | 2;
  /**
   * Le modèle CAM++ est déjà sur l'appareil (mesures-best-of) : besoinsChaine demande alors aussi les empreintes des
   * morceaux AMBIGUS (et de quelques sûrs pour apprendre chaque voix), même sans proposition (« s'il est là, il sert
   * tout seul aux ambigus », contrat §1.2 ; dev-voix : phrases 94,9 → 96,1 % sur la vraie session).
   */
  empreinteSurAppareil?: boolean;
}

type Fn = (...a: unknown[]) => unknown;

/** Appelle l'étape `nom` ; si elle lève, l'étape d'avant (et une ligne au journal). */
function appeler<K extends NomEtape>(o: OptionsChaine, nom: K, ...args: Parameters<EtapesChaine[K]>): ReturnType<EtapesChaine[K]> {
  const etapes = o.etapes ?? ETAPES_V4;
  try {
    return (etapes[nom] as unknown as Fn)(...(args as unknown[])) as ReturnType<EtapesChaine[K]>;
  } catch (e) {
    if (etapes[nom] === ETAPES_ANCIENNES[nom]) throw e;
    const msg = `Étape « ${nom} » : ${e instanceof Error ? e.message : String(e)} → étape d'avant.`;
    o.journal?.push(msg);
    console.warn('[Arko] Best-of v4 :', msg);
    return (ETAPES_ANCIENNES[nom] as unknown as Fn)(...(args as unknown[])) as ReturnType<EtapesChaine[K]>;
  }
}

/* ------------------------------------------------------------------ réglages et modules */

/** Durées visées proposées (la 2ᵉ d'office) — les mêmes que l'écran Réglages (etat-express.ts les reprend d'ici). */
export const DUREES_BEST_OF: Readonly<Record<Destination, readonly { min: Sec; max: Sec }[]>> = {
  youtube: [{ min: 480, max: 720 }, { min: 900, max: 1200 }, { min: 1500, max: 1800 }],
  tiktok: [{ min: 45, max: 60 }, { min: 60, max: 120 }, { min: 120, max: 180 }],
  short: [{ min: 30, max: 45 }, { min: 45, max: 60 }, { min: 120, max: 180 }],
};

/**
 * Réglages d'office du Best-of v4 (à CHAQUE ouverture : corrige le bug de la 2ᵉ ouverture). Coupe « normal » = la DA
 * (0,25 / 0,35 / 0,5), musique automatique, Transcrire coché (si Whisper manque, l'écran PROPOSE de le télécharger).
 */
export function reglagesBestOfV4(d: Destination): { express: ReglagesExpress; bestOf: ReglagesBestOf } {
  return {
    express: {
      dureeVisee: { ...DUREES_BEST_OF[d][1]! },
      garder: 'parole+forts',
      niveauBlancs: 'normal',
      transcrire: true,
      punchlines: true,
      bruitages: false,
      musique: [],
      musiqueAuto: true,
      bords: true,
      zooms: 'normal',
      sections: false,
      accroche: true,
      avecIA: false,
      persos: true,
    },
    bestOf: { ...BEST_OF_DEFAUT },
  };
}

/**
 * Ce que l'écran Réglages propose (un seul accord) et ce qui manquera sans eux. Le détecteur de voix (Silero, 2,2 Mo)
 * est RANGÉ DANS L'APPLI (décision de l'orchestrateur, 7/11) : il n'est jamais proposé ; seul Whisper l'est.
 */
export function decisionModules(m: ModulesBestOf, transcrire: boolean): DecisionModules {
  const aProposer: DecisionModules['aProposer'] = [];
  if (transcrire && m.whisper === 'absent') aProposer.push('whisper');
  if (m.vad === 'absent' && !MODELES.vad.dansLAppli) aProposer.push('vad');
  const octets = (aProposer.includes('whisper') ? TAILLE_MODULE : 0) + (aProposer.includes('vad') ? MODELES.vad.octets : 0);
  const parole: DecisionModules['parole'] = transcrire && m.whisper === 'present' ? 'mots' : 'voix';
  const manques: DecisionModules['manques'] = [];
  if (parole === 'voix') manques.push('textes');
  if (m.vad !== 'present') manques.push('precision');
  return { aProposer, octets, parole, manques };
}

/** Durée visée des séquences après coupe : le milieu de la fourchette, moins l'accroche (comme analyse-express). */
export function dureeViseeSequences(r: Pick<ReglagesExpress, 'dureeVisee' | 'accroche'>): Sec {
  return Math.max(10, (r.dureeVisee.min + r.dureeVisee.max) / 2 - (r.accroche ? MEILLEUR.dureeExpress : 0));
}

/* ------------------------------------------------------------------ analyse */

/** Zones de parole vues comme des « mots » vides (mode voix : les règles des coupes et des scènes marchent pareil). */
export function motsDeParole(parole: Pick<ParoleDetectee, 'segments'>): Mot[] {
  return parole.segments.map((s) => ['', Math.round(s.de * 100) / 100, Math.round(s.a * 100) / 100]);
}

/** Ce qu'il faut pour les premières étapes (avant Whisper et l'empreinte). */
export type MesuresPartielles = Pick<MesuresSource, 'src' | 'duree' | 'signaux' | 'empreintes' | 'pistesSeparees' | 'vad'> & Partial<Pick<MesuresSource, 'transcription' | 'neurales'>>;

/** Les 3 premières étapes (parole, mots, voix), communes à besoinsChaine et analyserChaine. */
function debutChaine(m: MesuresPartielles, bestOf: Pick<ReglagesBestOf, 'quiParle' | 'avatars'>, o: OptionsChaine) {
  const energie = m.empreintes[0] ?? null;
  // Le niveau de TOUTES les voix (pistes séparées : leur mélange) : la parole « audible » des mots et des séquences.
  const melange = energieDuMelange(m.empreintes);
  const t = m.transcription ?? null;
  const avecTexte = t !== null && t.mots.some((x) => x[0].trim());
  const parole = appeler(o, 'parole', { src: m.src, duree: m.duree, vad: m.vad, energie, signaux: m.signaux, mots: avecTexte ? t.mots : null });
  const nettoyes: MotsNettoyes | null = avecTexte ? appeler(o, 'mots', { mots: t.mots, plages: t.plages, parole, energie: melange }) : null;
  const entreeVoix: EntreeVoix = { src: m.src, empreintes: m.empreintes, pistesSeparees: m.pistesSeparees, parole, neurales: m.neurales ?? null, ...(o.forcerVoix ? { forcer: o.forcerVoix } : {}) };
  const voix: VoixDetecteesV4 | null = bestOf.quiParle || bestOf.avatars ? appeler(o, 'voix', entreeVoix) : null;
  return { energie, melange, parole, nettoyes, voix, entreeVoix };
}

/**
 * Ce qu'il faut encore mesurer : les zones à faire écouter à Whisper (dès que la parole est connue) et les morceaux
 * dont l'empreinte CAM++ aiderait (après une 1ʳᵉ séparation par le niveau). Pure, rapide (< 1 s pour 2 h).
 */
export function besoinsChaine(m: MesuresPartielles, bestOf: Pick<ReglagesBestOf, 'quiParle' | 'avatars'> = BEST_OF_DEFAUT, o: OptionsChaine = {}): BesoinsChaine {
  const { parole, voix, entreeVoix } = debutChaine(m, bestOf, o);
  const raison = voix?.separation.proposerEmpreinte ?? null;
  let empreintes: PlageTemps[] = [];
  if (raison || o.empreinteSurAppareil) {
    try {
      empreintes = morceauxAEmpreinter(entreeVoix, voix);
    } catch (e) {
      o.journal?.push(`morceauxAEmpreinter : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { transcrire: zonesATranscrire(parole, m.duree), empreintes, raisonEmpreinte: empreintes.length > 0 ? raison : null };
}

/** L'analyse complète, pure : ce que la revue montre et ce dont le montage a besoin. */
export function analyserChaine(m: MesuresSource, reg: ReglagesExpress, bestOf: ReglagesBestOf, o: OptionsChaine = {}): AnalyseV4 {
  const { energie, melange, parole, nettoyes, voix, entreeVoix } = debutChaine(m, bestOf, o);
  const modeMots = nettoyes !== null && nettoyes.mots.length > 0;
  const mots = modeMots ? nettoyes.mots : motsDeParole(parole);
  const moments = appeler(o, 'moments', { signaux: m.signaux, parole, mots: modeMots ? mots : [], voix, energie, hauteur: m.hauteur });
  const signaux = signauxAvecMoments(m.signaux, moments);
  // Coupes sur TOUTE la source, une fois : la revue estime les durées avec, le montage les applique.
  const morceaux = appeler(o, 'coupes', { mots, parole, energie, moments, signaux, niveau: reg.niveauBlancs, garder: reg.garder });
  const min = (REGLAGES_BLANCS[reg.niveauBlancs] ?? REGLAGES_BLANCS.normal).morceauMin;
  const dureeDe = (plages: readonly PlageTemps[]) => dureeDansMorceaux(morceaux, plages, min);
  const choix = appeler(o, 'sequences', { src: m.src, duree: m.duree, mots, parole, moments, voix, signaux, energie: melange, dureeVisee: dureeViseeSequences(reg), dureeDe });
  let besoinsEmpreinte: PlageTemps[] = [];
  const raison = voix?.separation.proposerEmpreinte ?? null;
  if (raison && !m.neurales) {
    try {
      besoinsEmpreinte = morceauxAEmpreinter(entreeVoix, voix);
    } catch {
      besoinsEmpreinte = [];
    }
  }
  const transcription = m.transcription;
  return {
    v: 4,
    transcription: { src: m.src, mots, plages: transcription?.plages ?? [{ de: 0, a: m.duree }], complete: transcription?.complete ?? true },
    parole: modeMots ? 'mots' : 'voix',
    signaux,
    scenes: choix.scenes,
    cadreBords: m.cadreBords,
    avertissements: [...m.avertissements],
    voix,
    empreintes: [...m.empreintes],
    passages: choix.passages,
    paroleDetectee: parole,
    bilanMots: nettoyes?.bilan ?? null,
    moments,
    modules: { ...m.modules },
    morceaux,
    energie,
    besoins: { transcrire: zonesATranscrire(parole, m.duree), empreintes: besoinsEmpreinte, raisonEmpreinte: besoinsEmpreinte.length > 0 ? raison : null },
  };
}

/** Durée visée changée sur la revue : nouveau choix des séquences, SANS réanalyse (pur, < 1 s). */
export function rechoisirSequences(a: AnalyseV4, reg: ReglagesExpress, o: OptionsChaine = {}): AnalyseV4 {
  const min = (REGLAGES_BLANCS[reg.niveauBlancs] ?? REGLAGES_BLANCS.normal).morceauMin;
  const dureeDe = (plages: readonly PlageTemps[]) => dureeDansMorceaux(a.morceaux, plages, min);
  const choix = appeler(o, 'sequences', {
    src: a.signaux.src,
    duree: a.signaux.duree,
    mots: a.transcription.mots,
    parole: a.paroleDetectee,
    moments: a.moments,
    voix: a.voix,
    signaux: a.signaux,
    energie: energieDuMelange(a.empreintes),
    dureeVisee: dureeViseeSequences(reg),
    dureeDe,
  });
  return { ...a, scenes: choix.scenes, passages: choix.passages };
}

/* ------------------------------------------------------------------ revue */

/** La revue d'office : les séquences choisies, aucun nom ni perso choisi, « Sous-titres pour » = la voix qu'on entend mal. */
export function revueParDefaut(a: AnalyseV4): RevueV4 {
  return { scenes: a.scenes.map((s) => ({ ...s })), noms: {}, chibis: {}, sousTitresPour: voixMalEntendue(a.voix) };
}

/**
 * Les plages gardées (ordre de la revue) SANS DOUBLON : ce qu'une séquence plus haut dans la liste joue déjà est
 * retiré des suivantes (deux séquences cochées qui se recouvrent après « + 1 phrase » : relecture point 3). La même
 * fonction sert à la durée annoncée et au montage.
 */
export function plagesSansDoublon(gardees: readonly SequenceV4[]): PlageTemps[] {
  const vues: PlageTemps[] = [];
  const res: PlageTemps[] = [];
  for (const p of plagesGardees(gardees)) {
    for (const q of soustrairePlages([p], vues)) if (q.a - q.de > 0.05) res.push(q);
    vues.push(p);
  }
  return res;
}

/** Ce qu'il faut pour monter (et donc pour calculer l'accroche exacte) : l'analyse COMPLÈTE de la chaîne. */
function analyseComplete(a: Pick<AnalyseV4, 'morceaux'> & Partial<AnalyseV4>): a is AnalyseV4 {
  return a.v === 4 && !!a.signaux && !!a.transcription && !!a.moments && !!a.paroleDetectee;
}

/** Durée de l'accroche, par séquences cochées (l'accroche ne dépend que d'elles et de ces réglages). */
const accrochesConnues = new WeakMap<object, Map<string, Sec>>();

/**
 * Durée (s) de l'accroche que posera le montage pour ces séquences : les MÊMES étapes que monterSansMusique (plans,
 * sous-titres, coupes, habillage), sans zooms ni titres ni persos (ils ne changent pas la durée). L'accroche v4 dure
 * 5,5 à 6,5 s (bords de mots) et pas 6 s pile : c'est ce qui faisait mentir la durée annoncée. Mémorisée.
 */
function dureeAccroche(a: AnalyseV4, gardees: readonly SequenceV4[], reg: Pick<ReglagesExpress, 'niveauBlancs' | 'punchlines'>, o: OptionsChaine): Sec {
  const habillage = (o.etapes ?? ETAPES_V4).habillage;
  const cle = [reg.niveauBlancs, reg.punchlines ? 'p' : '', habillage === ETAPES_ANCIENNES.habillage ? 'ancien' : habillage === ETAPES_V4.habillage ? 'v4' : 'autre', ...gardees.map((x) => `${x.de}|${x.a}`)].join(';');
  let connues = accrochesConnues.get(a);
  if (!connues) accrochesConnues.set(a, (connues = new Map()));
  const deja = connues.get(cle);
  if (deja !== undefined) return deja;
  const source: Source = { id: a.signaux.src, nom: 'source', taille: 0, emp: '', duree: a.signaux.duree, type: 'video', l: 1920, h: 1080 };
  const depart = finir({ ...recetteVide(), sources: [source], plans: [{ de: 0, a: Math.min(1, source.duree) }], destination: 'youtube' });
  const coupee = monterAvantHabillage(depart, a, gardees, reg);
  const avec = habiller(coupee, a, gardees, { ...reg, zooms: null, accroche: true }, { titres: false }, o);
  const d = Math.max(0, compiler(avec).duree - compiler(coupee).duree);
  connues.set(cle, d);
  return d;
}

/**
 * Durée du montage (s) que donneront ces séquences cochées : la même découpe que le montage, accroche comprise —
 * avec l'analyse complète, l'accroche est calculée comme au montage (durée annoncée = durée montée) ; avec les seuls
 * morceaux, elle compte pour 6 s.
 */
export function dureeEstimee(
  a: Pick<AnalyseV4, 'morceaux'> & Partial<AnalyseV4>,
  scenes: readonly SequenceV4[],
  reg: Pick<ReglagesExpress, 'niveauBlancs' | 'accroche'> & Partial<Pick<ReglagesExpress, 'punchlines'>>,
  o: OptionsChaine = {},
): Sec {
  const min = (REGLAGES_BLANCS[reg.niveauBlancs] ?? REGLAGES_BLANCS.normal).morceauMin;
  const gardees = scenes.filter((s) => s.garde && s.a > s.de);
  const d = dureeDansMorceaux(a.morceaux, plagesSansDoublon(gardees), min);
  let accroche = reg.accroche && gardees.length > 0 ? MEILLEUR.dureeExpress : 0;
  if (accroche > 0 && analyseComplete(a)) accroche = dureeAccroche(a, gardees, { niveauBlancs: reg.niveauBlancs, punchlines: reg.punchlines ?? true }, o);
  return Math.round((d + accroche) * 10) / 10;
}

/** « Monter la vidéo » est grisé si rien n'est coché ou si c'est plus long que la limite de la destination. */
export function montagePossible(
  a: Pick<AnalyseV4, 'morceaux'> & Partial<AnalyseV4>,
  scenes: readonly SequenceV4[],
  reg: Pick<ReglagesExpress, 'niveauBlancs' | 'accroche'> & Partial<Pick<ReglagesExpress, 'punchlines'>>,
  d: Destination,
  o: OptionsChaine = {},
): { possible: boolean; total: Sec; max: Sec } {
  const g = gabarit(d);
  const max = g.dureeLimite ?? g.dureeMax;
  const total = dureeEstimee(a, scenes, reg, o);
  return { possible: scenes.some((s) => s.garde) && total <= max, total, max };
}

/* ------------------------------------------------------------------ montage */

/** Le nouveau montage « Best-of — <nom> » avant la chaîne (comme recetteInitiale, sans le navigateur). */
export function recetteDeDepart(source: Source, d: Destination, titre: string): Recette {
  const duree = source.duree;
  const limite = d === 'youtube' ? { seuil: 1200, garde: 600 } : DUREE_INITIALE;
  const fin = duree > limite.seuil ? limite.garde : duree;
  return normaliser({ ...recetteVide(), titre, sources: [{ ...source }], plans: [{ de: 0, a: fin }], destination: d }, { sources: [source] }).recette;
}

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

/**
 * Revue → montage SANS la musique (pur) : plans = séquences cochées (ordre de la revue) → sous-titres → coupes (les
 * morceaux de l'analyse) → bords → habillage → passages pas retenus → persos → bips. La page y choisit ensuite la
 * musique automatique (dev-musique) puis appelle poserMusique ; le tout part dans UN modifier() (un seul Annuler).
 */
export function monterSansMusique(recette: Recette, a: AnalyseV4, revue: RevueV4, reg: ReglagesExpress, bestOf: ReglagesBestOf, o: OptionsChaine = {}): Recette {
  const src = premiereVideo(recette);
  const gardees = revue.scenes.filter((s) => s.garde && s.a > s.de);
  if (!src || gardees.length === 0) return recette;
  const modeMots = a.parole === 'mots';
  // 1 à 3. Plans, sous-titres, coupes, bords ; 4. habillage (punchlines, zooms, accroche, chapitres, titres).
  let r = monterAvantHabillage(recette, a, gardees, reg);
  if (reg.bords && a.cadreBords) r = rognerSource(r, src, a.cadreBords);
  r = habiller(r, a, gardees, reg, bestOf, o);
  // 5. Passages pas retenus, 6. qui parle + persos + sous-titres de la voix faible, 7. bips.
  r = definirPassages(r, passagesRestants(a.passages, revue.scenes, src));
  r = appeler(o, 'persos', r, {
    voix: a.voix,
    empreintes: a.empreintes,
    parole: a.paroleDetectee,
    ...(modeMots ? { mots: a.transcription.mots } : {}),
    moments: a.moments,
    signaux: a.signaux,
    noms: revue.noms,
    chibis: revue.chibis,
    quiParle: bestOf.quiParle,
    avatars: bestOf.avatars,
    sousTitresPour: revue.sousTitresPour,
  });
  if (bestOf.bips) r = choisirBips(r, { son: 'bip' });
  return r;
}

/** Montage, étapes 1 et 2 : plans = plages gardées (ordre de la revue), sous-titres = leurs mots, coupes (morceaux de l'analyse). */
function monterAvantHabillage(recette: Recette, a: AnalyseV4, gardees: readonly SequenceV4[], reg: Pick<ReglagesExpress, 'niveauBlancs'>): Recette {
  const src = premiereVideo(recette)!;
  const plages = plagesSansDoublon(gardees);
  const mots = a.parole === 'mots' ? motsDesScenes(a.transcription.mots, plages) : [];
  let r = finir({ ...recette, plans: plages.map((p) => ({ de: p.de, a: p.a })) });
  if (mots.length > 0) r = definirSousTitres(r, { style: SOUS_TITRES.style, y: ySousTitres(r.mise, gabaritDe(r)), parLigne: SOUS_TITRES.parLigne, mots, src });
  return couperLesBlancs(r, a.morceaux, reg.niveauBlancs);
}

/** Montage, étape 4 : l'habillage (étape injectable) sur le montage coupé. */
function habiller(
  r: Recette,
  a: AnalyseV4,
  gardees: readonly SequenceV4[],
  reg: Pick<ReglagesExpress, 'punchlines' | 'zooms' | 'accroche'>,
  bestOf: Pick<ReglagesBestOf, 'titres'>,
  o: OptionsChaine,
): Recette {
  const src = premiereVideo(r)!;
  const modeMots = a.parole === 'mots';
  return appeler(o, 'habillage', r, {
    src,
    mots: modeMots ? motsDesScenes(a.transcription.mots, plagesSansDoublon(gardees)) : [],
    moments: a.moments,
    signaux: a.signaux,
    sequences: gardees,
    voix: a.voix,
    punchlines: reg.punchlines && modeMots,
    zooms: reg.zooms,
    accroche: reg.accroche,
    titres: bestOf.titres,
  }).recette;
}

/**
 * Musique (prête : automatique de dev-musique, ou morceaux choisis à la main, tous à t = 0, placés ici au début des
 * chapitres) puis volume final −14 LUFS / −1,5 dBTP. Pure. Best-of v4 : la musique baisse sur la PAROLE (tours de la
 * VAD, même la voix faible : `baisseSur: 'parole'`), qu'elle soit automatique ou choisie à la main (dev-musique).
 */
export function poserMusique(r0: Recette, musique: MusiquePrete | null): Recette {
  let r = r0;
  if (musique && musique.piste.morceaux.length > 0) {
    const places = musique.piste.morceaux.some((m) => m.t > 0 || m.fin !== undefined);
    const sc = compiler(r);
    // Choisis à la main (tous à 0) : placés au début des chapitres, le 1er APRÈS l'accroche (sans musique, la DA).
    const debut = finAccroche(sc);
    const morceaux = places
      ? musique.piste.morceaux.map((m) => ({ ...m }))
      : placerMorceaux(musique.piste.morceaux.map((m) => m.src), (r.chapitres ?? []).map((c) => c.t), sc.duree)
          .map((m, i) => (i === 0 ? { ...m, t: debut } : m))
          .filter((m, i) => i === 0 || m.t > debut + 0.01);
    r = definirMusique(r, { ...musique.piste, baisseSur: 'parole', morceaux }, musique.sources);
  }
  return choisirVolumeFinal(r, { lufs: LUFS_MONTAGE, crete: VOLUME_FINAL.crete });
}

/** Tout le montage d'un coup (banc, tests) : monterSansMusique puis poserMusique. */
export function monterChaine(recette: Recette, a: AnalyseV4, revue: RevueV4, reg: ReglagesExpress, bestOf: ReglagesBestOf, musique: MusiquePrete | null, o: OptionsChaine = {}): Recette {
  const sans = monterSansMusique(recette, a, revue, reg, bestOf, o);
  return sans === recette ? recette : poserMusique(sans, musique);
}
