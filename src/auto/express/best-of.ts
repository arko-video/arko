// Mode « Best-of serré » du Montage express (INTÉGRATEUR) : on garde les rires et les moments forts AVEC leur contexte
// (mise en place + chute), les scènes drôles mais longues sont RESSERRÉES au lieu d'être jetées, cuts serrés, voix
// reconnues, un chibi par personne qui apparaît quand elle parle, sous-titres pour la voix qu'on entend mal,
// titres FACULTATIFS (décochés d'office), musique qui baisse quand on parle, bruitages désactivés, bips au choix.
// Réutilise TOUT le Montage express (etapesMontage d'express.ts) ; ordre exact : conception/contrat-wankil.md §6.

import { premiereVideo } from '../coupes/decoupe';
import { choisirBestOf, DERUSH_REGLES, noterScenes, resserrer } from '../derush/derush';
import { chibiParDefaut, poserPersos } from '../voix/persos-montage';
import { ecouterVoix } from '../voix/voix-montage';
import type { SourceOuverte } from '../../moteur/api';
import { choisirBips, choisirModeSousTitres, definirPassages, sousTitresPour } from '../../recette/operations';
import type { DefinitionChibi, PassageNote, Recette, Sec } from '../../recette/types';
import type { OptionsTache, PlageTemps } from '../types';
import type { EmpreintesVoix, EntreeDerush, SceneNotee, VoixDetectees } from '../types-v3';
import { analyserPourExpress, dureeVisee } from './analyse-express';
import { etapesMontage, type AnalyseExpress, type ReglagesExpress, type RessourcesExpress } from './express';
import { decouperScenes, dureeApresCoupe, motsDans, type SceneProposee } from './scenes';

/** Réglages en plus du Montage express, montrés quand le style « Best-of serré » est choisi. */
export interface ReglagesBestOf {
  /** Titres de séquence (titres de section) et texte de l'accroche (« ATTENDS… ») : facultatifs. */
  titres: boolean;
  /** Reconnaître qui parle (pistes séparées si la vidéo en a, sinon niveau + timbre). */
  quiParle: boolean;
  /** Avatars (chibi de la personne qui parle) : demande quiParle. */
  avatars: boolean;
  /** Bip sur les gros mots. */
  bips: boolean;
}

/** Titres décochés d'office (demande de Romain : « on peut pas retirer le titre »). */
export const BEST_OF_DEFAUT: ReglagesBestOf = { titres: false, quiParle: true, avatars: true, bips: false };

/** La voix la plus faible est sous-titrée d'office si elle est au moins 6 dB sous la plus forte ; cible d'une scène resserrée. */
export const BEST_OF = { ecartSousTitres: 6, cibleResserree: (DERUSH_REGLES.cibleResserree.min + DERUSH_REGLES.cibleResserree.max) / 2 };

/** Une séquence du Best-of : une scène (cochée ou non) et, si elle a été resserrée, ses morceaux gardés. */
export interface SceneBestOf extends SceneProposee {
  morceaux?: PlageTemps[];
  protegee: boolean;
}

/** L'analyse du Montage express + qui parle + les passages pas retenus. */
export interface AnalyseBestOf extends AnalyseExpress {
  voix: VoixDetectees | null;
  empreintes: EmpreintesVoix[];
  passages: PassageNote[];
}

/** Ce que la page prépare en plus : noms des voix et leurs chibis (choisis sur la revue, cartes des voix). */
export interface RessourcesBestOf extends RessourcesExpress {
  noms: Readonly<Record<string, string>>;
  chibis: Readonly<Record<string, { def: DefinitionChibi; bib?: string }>>;
  /** « Sous-titres pour : » : id d'une voix, null = personne ; absent = la voix qu'on entend mal (voixMalEntendue). */
  sousTitresPour?: string | null;
}

/** La voix qu'on entend mal : la plus faible, si elle est au moins 6 dB sous la plus forte (sinon null). */
export function voixMalEntendue(voix: VoixDetectees | null): string | null {
  if (!voix || voix.voix.length < 2) return null;
  const triees = [...voix.voix].sort((a, b) => a.niveauDb - b.niveauDb);
  return triees[triees.length - 1]!.niveauDb - triees[0]!.niveauDb >= BEST_OF.ecartSousTitres ? triees[0]!.id : null;
}

/** Perso par défaut d'une voix : déplacé dans l'étape partagée (voix/persos-montage.ts). */
export { chibiParDefaut };

const arrondi1 = (x: number) => Math.round(x * 10) / 10;

/** Durée gardée par Couper les blancs dans les plages (sans mots : leur durée). */
function dureeDe(e: EntreeDerush, plages: readonly PlageTemps[]): Sec {
  return plages.reduce((t, p) => {
    const d = dureeApresCoupe(motsDans(e.mots, p), e.signaux, p);
    return t + (d > 0 ? d : p.a - p.de);
  }, 0);
}

/** Scènes notées (noterScenes) et choisies (choisirBestOf) du dev 1, vues comme des séquences de la revue (pure). */
export function scenesBestOf(analyse: AnalyseExpress, voix: VoixDetectees | null, dureeCible: Sec): { scenes: SceneBestOf[]; passages: PassageNote[] } {
  const e: EntreeDerush = { mots: analyse.transcription.mots, signaux: analyse.signaux, ...(voix ? { paroles: voix.tours } : {}) };
  const notees = noterScenes(decouperScenes(e.mots, e.signaux), e);
  const { gardees, passages } = choisirBestOf(notees, e, dureeCible);
  const choisies = new Map(gardees.map((g) => [`${g.de}|${g.a}`, g]));
  const scenes = notees.map((n: SceneNotee): SceneBestOf => {
    const g = choisies.get(`${n.de}|${n.a}`);
    // Une scène protégée longue est resserrée même si elle n'est pas cochée (on peut la cocher sur la revue).
    const morceaux = g?.morceaux ?? (n.protegee && n.indices.duree > DERUSH_REGLES.resserrerAuDela ? resserrer(n, e, BEST_OF.cibleResserree) : undefined);
    const s: SceneBestOf = { de: n.de, a: n.a, titre: n.titre, raison: n.raison, score: n.note, garde: g !== undefined, duree: arrondi1(morceaux ? dureeDe(e, morceaux) : n.indices.duree), protegee: n.protegee };
    if (morceaux) s.morceaux = morceaux;
    return s;
  });
  return { scenes, passages };
}

/** Analyse (navigateur) : analyserPourExpress, puis analyserQuiParle (dev 1), puis le derush du Best-of (dev 1). */
export async function analyserPourBestOf(
  source: SourceOuverte,
  reglages: ReglagesExpress,
  bestOf: ReglagesBestOf,
  o: OptionsTache & { pistes?: readonly number[] } = {},
): Promise<AnalyseBestOf> {
  const { signal, surProgression } = o;
  const base = await analyserPourExpress(source, reglages, { signal, surProgression: (x, m) => surProgression?.(x * 0.8, m) });
  let voix: VoixDetectees | null = null;
  let empreintes: EmpreintesVoix[] = [];
  const avertissements = [...base.avertissements];
  if (bestOf.quiParle || bestOf.avatars) {
    // L'écoute des voix partagée par tous les montages sans IA (voix/voix-montage.ts).
    const e = await ecouterVoix(source, { signal, surProgression: (x, m) => surProgression?.(0.8 + x * 0.18, m), mots: base.transcription.mots, ...(o.pistes ? { pistes: o.pistes } : {}) });
    voix = e.voix;
    empreintes = [...e.empreintes];
    if (e.avertissement) avertissements.push(e.avertissement);
  }
  const { scenes, passages } = scenesBestOf(base, voix, dureeVisee(reglages));
  surProgression?.(1, '');
  return { ...base, scenes, avertissements, voix, empreintes, passages };
}

/** Plages des séquences gardées : les morceaux d'une scène resserrée, sinon toute la scène. */
export function plagesGardees(scenes: readonly SceneBestOf[]): PlageTemps[] {
  return scenes.filter((s) => s.garde && s.a > s.de).flatMap((s) => (s.morceaux && s.morceaux.length > 0 ? s.morceaux : [{ de: s.de, a: s.a }]));
}

const recouvrement = (x: PlageTemps, y: PlageTemps) => Math.max(0, Math.min(x.a, y.a) - Math.max(x.de, y.de));

/**
 * Passages pas retenus après la revue : ceux de l'analyse qui ne sont pas (à plus de moitié) dans le montage, plus les
 * séquences décochées sur la revue (note ≥ 20) ; triés par note décroissante, 100 au plus.
 */
export function passagesRestants(passages: readonly PassageNote[], scenes: readonly SceneBestOf[], src?: string): PassageNote[] {
  const gardees = plagesGardees(scenes);
  const dedans = (p: PlageTemps) => gardees.reduce((t, g) => t + recouvrement(p, g), 0) > 0.5 * (p.a - p.de);
  const res = passages.filter((p) => !dedans(p)).map((p) => ({ ...p }));
  for (const s of scenes) {
    if (s.garde || s.score < DERUSH_REGLES.noteMinPassage || res.some((p) => recouvrement(p, s) > 0.5 * (s.a - s.de))) continue;
    res.push({ de: s.de, a: s.a, note: Math.round(s.score), raison: s.raison.slice(0, 80), titre: s.titre.slice(0, 60), ...(src ? { src } : {}) });
  }
  return res.sort((x, y) => y.note - x.note || x.de - y.de).slice(0, 100);
}

/** Écran Revue → montage, en UNE opération (un seul Annuler). Pure. Ordre des appels : contrat §6. */
export function construireBestOf(
  recette: Recette,
  analyse: AnalyseBestOf,
  scenes: readonly SceneBestOf[],
  reglages: ReglagesExpress,
  bestOf: ReglagesBestOf,
  ressources: RessourcesBestOf,
): Recette {
  const gardees = scenes.filter((s) => s.garde && s.a > s.de);
  if (gardees.length === 0 || !premiereVideo(recette)) return recette;
  // 1. Les étapes du Montage express, plans = morceaux des scènes gardées, un chapitre par scène ; sans bruitages
  //    (retour de Romain) ; accroche sans texte et sans titres de section si les titres sont décochés.
  let r = etapesMontage(recette, analyse, plagesGardees(scenes), gardees, { ...reglages, bruitages: false }, { ...ressources, bruitages: [] }, {
    texteAccroche: bestOf.titres ? undefined : null,
    sections: bestOf.titres,
    bruitages: false,
  });
  // 2. Passages pas retenus (écran « Passages pas retenus », depuis Couper).
  r = definirPassages(r, passagesRestants(analyse.passages, scenes, analyse.signaux.src));
  // 3. Qui parle, 4. un chibi par personne + avatars, sous-titres pour la voix qu'on entend mal.
  if (analyse.voix && analyse.voix.voix.length > 0 && (bestOf.quiParle || bestOf.avatars)) {
    const mots = analyse.parole === 'mots' ? analyse.transcription.mots : undefined;
    // L'étape partagée par tous les montages sans IA (voix/persos-montage.ts).
    r = poserPersos(r, { voix: analyse.voix, empreintes: analyse.empreintes }, { noms: ressources.noms, chibis: ressources.chibis, ...(mots ? { mots } : {}), signaux: analyse.signaux, avatars: bestOf.avatars });
    const pour = ressources.sousTitresPour === undefined ? voixMalEntendue(analyse.voix) : ressources.sousTitresPour;
    if (pour && r.personnes?.some((p) => p.id === pour) && r.sousTitres && Array.isArray(r.sousTitres.mots)) {
      if (r.sousTitres.mode !== 'punchlines') r = choisirModeSousTitres(r, 'punchlines');
      r = sousTitresPour(r, pour);
    }
  }
  // 5. Bips sur les gros mots.
  if (bestOf.bips) r = choisirBips(r, { son: 'bip' });
  return r;
}
