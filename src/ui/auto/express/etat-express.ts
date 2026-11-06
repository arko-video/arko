// État et actions du Montage express (intégrateur) : la longue vidéo, les réglages, l'analyse (sur l'appareil, avec
// reprise de la transcription), l'appel facultatif à l'IA (texte seulement), la revue des séquences, puis le montage :
// un NOUVEAU projet « Montage express — <nom> » (dans Mes montages, supprimable) construit en UNE opération
// (un seul Annuler revient à la vidéo brute).

import { computed, signal } from '@preact/signals';
import { analyserPourExpress, dureeVisee } from '../../../auto/express/analyse-express';
import { construireMontageExpress, type AnalyseExpress, type ReglagesExpress, type RessourcesExpress } from '../../../auto/express/express';
import { appliquerReponseExpress, consignesExpress, IA_EXPRESS, lireReponseExpress, messageExpress } from '../../../auto/express/ia-express';
import { dureeGardee, type SceneProposee } from '../../../auto/express/scenes';
import { ErreurArko, importerSon, lireMonSon, moduleSousTitres, nouveauProjet, recetteInitiale, trouverFournisseur, type IdFournisseur, type SourceOuverte } from '../../../moteur/api';
import { compiler } from '../../../recette/chronologie';
import { gabarit, type Destination } from '../../../recette/destination';
import { TA } from '../../../textes-auto';
import { destinationChoisie } from '../../destination';
import { afficherToast, ajouterSourceOuverte, annulerAction, demarrerProjet, derniereEtape, idsPris, modifier, recette, sauverEnAttente } from '../../etat';
import { formatDuree } from '../../format';
import { chargerMesSons } from '../../mes-sons';
import { idCourant } from '../../montages';
import { cleGardee } from '../../monteur/cles-monteur';
import { choixVisible, demande, sourceMonteur } from '../../monteur/etat-monteur';
import { reprendreA } from '../../navigation';
import { garderFichier } from '../../sons-gardes';
import { ouvrirOutil } from '../../habillage';
import { ouvrirBruitages } from '../son/etat-son';
import { allerExpress, fermerExpress, garde, remplacerExpress } from './navigation-express';

export { ecranExpress } from './navigation-express';

/** Durées visées proposées (s), selon la destination ; la 2ᵉ est choisie par défaut. */
export const DUREES_EXPRESS: Record<Destination, { min: number; max: number }[]> = {
  youtube: [{ min: 480, max: 720 }, { min: 900, max: 1200 }, { min: 1500, max: 1800 }],
  tiktok: [{ min: 45, max: 60 }, { min: 60, max: 120 }, { min: 120, max: 180 }],
  short: [{ min: 30, max: 45 }, { min: 45, max: 60 }, { min: 120, max: 180 }],
};

export const sourceExpress = signal<SourceOuverte | null>(null);
export const destinationExpress = signal<Destination>('youtube');
export const fournisseurExpress = signal<IdFournisseur>('anthropic');

function reglagesParDefaut(d: Destination): ReglagesExpress {
  return {
    dureeVisee: DUREES_EXPRESS[d][1]!,
    garder: 'parole+forts',
    niveauBlancs: 'normal',
    transcrire: true,
    punchlines: true,
    // Retour de Romain (6/11) : décoché d'office ; coché, rien n'est posé sans sa validation (revue après le montage).
    bruitages: false,
    musique: [],
    bords: true,
    zooms: 'normal',
    sections: d === 'youtube',
    accroche: true,
    avecIA: false,
  };
}

export const reglagesExpress = signal<ReglagesExpress>(reglagesParDefaut('youtube'));
export function reglerExpress(p: Partial<ReglagesExpress>) {
  reglagesExpress.value = { ...reglagesExpress.peek(), ...p };
}

export function choisirDestinationExpress(d: Destination) {
  destinationExpress.value = d;
  reglerExpress({ dureeVisee: DUREES_EXPRESS[d][1]!, sections: d === 'youtube' });
}

export type EtatAnalyseExpress =
  | { phase: 'avant' }
  | { phase: 'encours'; p: number; message: string }
  | { phase: 'erreur'; message: string }
  | { phase: 'fini' };
export const etatExpress = signal<EtatAnalyseExpress>({ phase: 'avant' });
export const analyseExpress = signal<AnalyseExpress | null>(null);
export const scenesExpress = signal<SceneProposee[]>([]);
/** Texte envoyé à l'IA (« Voir ce qui est envoyé ») et ce qu'elle a donné. */
export const envoiIA = signal<string | null>(null);
export const messageIA = signal<string | null>(null);
/** Le montage se construit (copie des sons, opération). */
export const montageEnCours = signal(false);

export const totalExpress = computed(() => dureeGardee(scenesExpress.value));

let controleur: AbortController | null = null;
garde.enCours = () => etatExpress.peek().phase === 'encours';
garde.possible = (e) => sourceExpress.peek() !== null && (e === 'reglages' || (e === 'revue' ? analyseExpress.peek() !== null : true));

/**
 * Ouvre le Montage express sur une vidéo (choix à l'import, ou un montage de Mes montages). « Transcrire les voix »
 * est coché d'office seulement si le module sous-titres est déjà sur l'appareil (pas de téléchargement surprise).
 */
export async function ouvrirExpress(source: SourceOuverte) {
  const module = await moduleSousTitres().catch(() => ({ present: false }));
  if (sourceExpress.peek()?.infos.emp !== source.infos.emp) {
    analyseExpress.value = null;
    scenesExpress.value = [];
    etatExpress.value = { phase: 'avant' };
  }
  sourceExpress.value = source;
  const d = destinationChoisie.peek() ?? 'youtube';
  destinationExpress.value = d;
  reglagesExpress.value = { ...reglagesParDefaut(d), transcrire: module.present, musique: reglagesExpress.peek().musique };
  fournisseurExpress.value = demande.peek().fournisseur;
  void chargerMesSons();
  allerExpress('reglages');
}

/** Coche / décoche un morceau de musique (6 au plus). */
export function basculerMorceau(id: string) {
  const liste = reglagesExpress.peek().musique;
  if (liste.includes(id)) return reglerExpress({ musique: liste.filter((x) => x !== id) });
  if (liste.length >= 6) return afficherToast(TA.express.musiqueMax);
  reglerExpress({ musique: [...liste, id] });
}

/** Demande à l'IA de choisir les séquences (texte seulement). Sans clé ou en cas d'erreur : le choix d'Arko reste. */
async function demanderIA(a: AnalyseExpress, signal: AbortSignal): Promise<{ scenes: SceneProposee[]; mots: AnalyseExpress['transcription']['mots'] } | null> {
  const f = trouverFournisseur(fournisseurExpress.peek());
  const message = messageExpress(a.scenes, a.transcription.mots, a.signaux, dureeVisee(reglagesExpress.peek()));
  envoiIA.value = message;
  const cle = await cleGardee(f.id);
  if (!cle) {
    messageIA.value = TA.express.cleManque;
    return null;
  }
  etatExpress.value = { phase: 'encours', p: 1, message: TA.express.ia(f.nom) };
  try {
    const modele = demande.peek().fournisseur === f.id && demande.peek().modele ? demande.peek().modele : f.modeleParDefaut;
    const rep = await f.appeler({ cle, modele, systeme: consignesExpress(), message, maxTokens: IA_EXPRESS.maxTokens, signal });
    const lue = lireReponseExpress(rep.texte, a.scenes.length);
    messageIA.value = lue ? TA.express.iaOk(f.nom) : TA.express.iaIllisible;
    return lue ? appliquerReponseExpress(a.scenes, a.transcription.mots, lue) : null;
  } catch (e) {
    if (signal.aborted) throw e;
    messageIA.value = TA.express.iaErreur(e instanceof ErreurArko ? e.message : String(e));
    return null;
  }
}

/** Écran 2 : analyse sur l'appareil (reprise de la transcription), puis l'IA si demandée, puis la revue. */
export async function lancerExpress() {
  const source = sourceExpress.peek();
  if (!source) return;
  controleur?.abort();
  const c = new AbortController();
  controleur = c;
  envoiIA.value = null;
  messageIA.value = null;
  etatExpress.value = { phase: 'encours', p: 0, message: TA.express.ecoute };
  allerExpress('analyse');
  try {
    const reg = reglagesExpress.peek();
    let a = await analyserPourExpress(source, reg, { signal: c.signal, surProgression: (p, message) => controleur === c && (etatExpress.value = { phase: 'encours', p, message }) });
    if (reg.avecIA && a.parole === 'mots' && a.scenes.length > 0) {
      const ia = await demanderIA(a, c.signal);
      if (ia) a = { ...a, scenes: ia.scenes, transcription: { ...a.transcription, mots: ia.mots } };
    }
    if (controleur !== c) return;
    analyseExpress.value = a;
    scenesExpress.value = a.scenes;
    etatExpress.value = { phase: 'fini' };
    remplacerExpress('revue');
  } catch (e) {
    if (controleur !== c) return;
    if ((e instanceof ErreurArko && e.code === 'annule') || c.signal.aborted) {
      etatExpress.value = { phase: 'avant' };
      afficherToast(TA.express.annule, 5000);
      history.back();
      return;
    }
    console.error(e);
    etatExpress.value = { phase: 'erreur', message: e instanceof ErreurArko ? e.message : TA.commun.erreur };
  } finally {
    if (controleur === c) controleur = null;
  }
}

export function annulerExpress() {
  controleur?.abort();
}

export function basculerScene(i: number) {
  scenesExpress.value = scenesExpress.peek().map((s, k) => (k === i ? { ...s, garde: !s.garde } : s));
}

/** Change l'ordre d'une séquence (−1 : plus haut, +1 : plus bas). */
export function deplacerScene(i: number, sens: -1 | 1) {
  const liste = [...scenesExpress.peek()];
  const j = i + sens;
  if (j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j]!, liste[i]!];
  scenesExpress.value = liste;
}

/** Durée maximale de la destination (YouTube 60 min, TikTok 10 min, Short 3 min). */
export function dureeMaxExpress(): number {
  const g = gabarit(destinationExpress.peek());
  return g.dureeLimite ?? g.dureeMax;
}

/** Copie un son de Mes sons dans le projet ouvert (même chemin que « poser » dans Mes sons). */
async function copierMonSon(id: string): Promise<SourceOuverte | null> {
  const f = await lireMonSon(id).catch(() => null);
  if (!f) return null;
  const s = await importerSon(f, idsPris());
  ajouterSourceOuverte(s);
  garderFichier(s);
  return s;
}

/**
 * Musique : morceaux de Mes sons copiés dans le projet (tâche lente, AVANT l'opération). Les bruitages ne sont JAMAIS
 * posés ici : s'ils sont demandés, la revue s'ouvre après le montage et l'utilisateur coche ceux qu'il garde.
 */
async function preparerRessources(reg: ReglagesExpress): Promise<RessourcesExpress> {
  const copies: SourceOuverte[] = [];
  for (const id of reg.musique) {
    const s = await copierMonSon(id).catch(() => null);
    if (s) copies.push(s);
  }
  const morceaux = copies.map((s) => ({ src: s.infos.id, t: 0 }));
  return { sourcesAudio: copies.map((s) => s.infos), bruitages: [], musique: morceaux.length > 0 ? { morceaux } : null };
}

/** Écran 3 → « Monter la vidéo » : nouveau projet, ressources, UNE opération, puis Habiller. */
export async function monterExpress() {
  const source = sourceExpress.peek();
  const a = analyseExpress.peek();
  const scenes = scenesExpress.peek();
  if (!source || !a || montageEnCours.peek() || !scenes.some((s) => s.garde)) return;
  montageEnCours.value = true;
  try {
    const reg = reglagesExpress.peek();
    await sauverEnAttente();
    await nouveauProjet();
    const nom = source.infos.nom.replace(/\.[^.]+$/, '');
    demarrerProjet(source, { ...recetteInitiale(source, destinationExpress.peek()), titre: TA.express.titreProjet(nom) });
    idCourant.value = null;
    const ressources = await preparerRessources(reg);
    modifier((r) => construireMontageExpress(r, a, scenes, reg, ressources));
    fermerExpress();
    choixVisible.value = false;
    if (sourceMonteur.peek() === source) sourceMonteur.value = null;
    analyseExpress.value = null;
    scenesExpress.value = [];
    etatExpress.value = { phase: 'avant' };
    sourceExpress.value = null;
    derniereEtape.value = 'habiller';
    reprendreA('habiller');
    const r = recette.peek();
    afficherToast(TA.express.pret(formatDuree(r ? compiler(r).duree : 0)), 8000, { label: TA.express.annulerMontage, agir: annulerAction });
    // Bruitages demandés : la revue (écouter dans la vidéo, cocher) s'ouvre ; rien n'est posé sans validation.
    if (reg.bruitages && a.parole === 'mots') {
      ouvrirOutil('sons');
      void ouvrirBruitages();
    }
  } catch (e) {
    console.error(e);
    afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 6000);
  } finally {
    montageEnCours.value = false;
  }
}
