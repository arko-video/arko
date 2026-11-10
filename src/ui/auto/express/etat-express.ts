// État et actions du Montage express (intégrateur) : la longue vidéo, les réglages, l'analyse (sur l'appareil, avec
// reprise de la transcription), l'appel facultatif à l'IA (texte seulement), la revue des séquences, puis le montage :
// un NOUVEAU projet « Montage express — <nom> » (dans Mes montages, supprimable) construit en UNE opération
// (un seul Annuler revient à la vidéo brute).

import { reglagesAvecGouts } from '../../../auto/apprentissage/appliquer-gouts';
import { appliquerPlan } from '../../../auto/monteur-ia/appliquer';
import { planMonteur, poserEffetsBibliotheque, retenirPourquois } from './monteur-ia';
import { gouts, memoriserMontageAuto } from '../../apprentissage';
import { poserMemesAuto } from '../../clips-montage';
import { signalerFinTravail } from '../../fin-travail';
import { computed, signal } from '@preact/signals';
import { analyserPourExpress, dureeVisee } from '../../../auto/express/analyse-express';
import { analyserPourBestOf, construireBestOf, type AnalyseBestOf, type SceneBestOf } from '../../../auto/express/best-of';
import { poserStructureYoutube } from '../../../auto/habillage/structure-youtube';
import { sansSonsArko } from '../../../auto/son/sans-sons-arko';
import { ecouterMesSons } from '../son/ecoute-ui';
import { construireMontageExpress, type AnalyseExpress, type ReglagesExpress, type RessourcesExpress } from '../../../auto/express/express';
import { appliquerReponseExpress, consignesExpress, IA_EXPRESS, lireReponseExpress, messageExpress } from '../../../auto/express/ia-express';
import { dureeGardee, type SceneProposee } from '../../../auto/express/scenes';
import { ErreurArko, importerSon, lireMonSon, moduleSousTitres, nouveauProjet, recetteInitiale, trouverFournisseur, type IdFournisseur, type SourceOuverte } from '../../../moteur/api';
import { compiler } from '../../../recette/chronologie';
import { definirMusique, pistesGardees } from '../../../recette/operations';
import type { Recette } from '../../../recette/types';
import { gabarit, type Destination } from '../../../recette/destination';
import { TA } from '../../../textes-auto';
import { TV } from '../../../textes-v3';
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
import { ouvrirBruitages, poserAccentsAuto } from '../son/etat-son';
import { DUREES_BEST_OF } from '../../../auto/express/chaine-best-of';
import { enBestOf, preparerVoix, reglagesBestOf, ressourcesBestOf, retenirStyle, styleMontage, type StyleMontage } from './etat-best-of';
import { estV4, reglagesPourStyle } from './etat-v4';
import { preparerMusiqueAuto } from './musique-express';
import { avecVoix, choixVoix, voixApres } from './voix-express';
import { allerExpress, fermerExpress, garde, remplacerExpress } from './navigation-express';

export { ecranExpress } from './navigation-express';

/** Durées visées proposées (s), selon la destination ; la 2ᵉ est choisie par défaut (les mêmes que la chaîne v4). */
export const DUREES_EXPRESS: Readonly<Record<Destination, readonly { min: number; max: number }[]>> = DUREES_BEST_OF;

/**
 * Best-of v4 (dev-ui) : le parcours de best-of-v4.ts se branche ici (pas d'import : il lit les signals de ce
 * fichier). `lancer` / `monter` / `annuler` remplacent ceux du Montage express quand le Best-of est choisi.
 */
export const routeBestOf: { lancer?: () => Promise<void>; monter?: () => Promise<unknown>; annuler?: () => void } = {};
const surOuverture = new Set<() => void>();
/** Appelé à chaque ouverture du Montage express (les refus de modules et les voix forcées sont oubliés). */
export function quandOuvertureExpress(cb: () => void) {
  surOuverture.add(cb);
}

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
    // Musique de fond d'office (retour de Romain, 7/11) : un morceau par groupe de séquences, choisi par Arko.
    musiqueAuto: true,
    bords: true,
    zooms: 'normal',
    sections: d === 'youtube',
    accroche: true,
    avecIA: false,
    // Persos de qui parle (7/11) : coché d'office, comme dans le Best-of.
    persos: true,
  };
}

export const reglagesExpress = signal<ReglagesExpress>(reglagesParDefaut('youtube'));
/** Nom de la chaîne YouTube (générique et fin des best-of), gardé sur l'appareil. */
const CLE_CHAINE = 'arko.chaine';
export const chaineYoutube = signal<string>(
  (() => {
    try {
      return localStorage.getItem(CLE_CHAINE) ?? '';
    } catch {
      return '';
    }
  })(),
);
export function reglerChaine(nom: string) {
  chaineYoutube.value = nom.slice(0, 40);
  try {
    localStorage.setItem(CLE_CHAINE, chaineYoutube.peek());
  } catch {
    /* rien */
  }
}

export function reglerExpress(p: Partial<ReglagesExpress>) {
  reglagesExpress.value = { ...reglagesExpress.peek(), ...p };
}

/** Pose les réglages d'un style (Best-of : ceux de la chaîne v4 EN ENTIER, coupe Normal = la DA, sans IA). */
function poserReglagesStyle(st: StyleMontage, d: Destination) {
  const { express, bestOf } = reglagesPourStyle(st, d, reglagesExpress.peek());
  reglagesExpress.value = express;
  if (bestOf) reglagesBestOf.value = { ...bestOf };
}

/** Montage express ou Best-of serré (retenu sur l'appareil). Best-of : ses réglages d'office à chaque choix. */
export function choisirStyle(st: StyleMontage) {
  styleMontage.value = st;
  retenirStyle(st);
  poserReglagesStyle(st, destinationExpress.peek());
}

export function choisirDestinationExpress(d: Destination) {
  destinationExpress.value = d;
  reglerExpress({ dureeVisee: { ...DUREES_EXPRESS[d][1]! }, sections: enBestOf() ? false : d === 'youtube' });
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
  const avant = reglagesExpress.peek();
  // Best-of : ses réglages d'office à CHAQUE ouverture (fin du bug de la 2ᵉ ouverture) ; Transcrire reste coché même
  // sans le module sous-titres : « Analyser » proposera de le télécharger (jamais de mode voix en silence).
  if (enBestOf()) poserReglagesStyle('bestOf', d);
  else reglagesExpress.value = { ...reglagesParDefaut(d), transcrire: module.present, musique: avant.musique, musiqueAuto: avant.musiqueAuto ?? true };
  fournisseurExpress.value = demande.peek().fournisseur;
  for (const cb of surOuverture) cb();
  void chargerMesSons();
  allerExpress('reglages');
}

/** Coche / décoche un morceau de musique (6 au plus). Choisir ses morceaux arrête la musique automatique. */
export function basculerMorceau(id: string) {
  const liste = reglagesExpress.peek().musique;
  if (liste.includes(id)) return reglerExpress({ musique: liste.filter((x) => x !== id), musiqueAuto: false });
  if (liste.length >= 6) return afficherToast(TA.express.musiqueMax);
  reglerExpress({ musique: [...liste, id], musiqueAuto: false });
}

/** « Musique automatique » : cochée, Arko choisit (les morceaux cochés à la main sont oubliés) ; décochée sans morceau = pas de musique. */
export function choisirMusiqueAuto(v: boolean) {
  reglerExpress(v ? { musiqueAuto: true, musique: [] } : { musiqueAuto: false });
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
  if (enBestOf() && routeBestOf.lancer) return routeBestOf.lancer();
  controleur?.abort();
  const c = new AbortController();
  controleur = c;
  envoiIA.value = null;
  messageIA.value = null;
  etatExpress.value = { phase: 'encours', p: 0, message: TA.express.ecoute };
  allerExpress('analyse');
  try {
    const reg = reglagesAvecGouts(reglagesExpress.peek(), gouts.peek());
    const bestOf = enBestOf();
    // « Arko écoute tes sons » : les sons ajoutés depuis la dernière fois sont écoutés avant de choisir les effets.
    await ecouterMesSons();
    const o = { signal: c.signal, surProgression: (p: number, message: string) => controleur === c && (etatExpress.value = { phase: 'encours', p, message: message || TA.express.scenes }) };
    // Best-of : qui parle sur les pistes gardées de la vidéo (si le montage d'où l'on vient en a choisi).
    const r0 = recette.peek();
    const pistes = r0?.sources.some((x) => x.id === source.infos.id) ? pistesGardees(r0, source.infos.id) : [];
    let a = bestOf ? await analyserPourBestOf(source, reg, reglagesBestOf.peek(), { ...o, pistes }) : await analyserPourExpress(source, reg, voixApres(o, reg));
    // Persos de qui parle : la même écoute des voix que le Best-of (auto/voix/voix-montage.ts).
    if (!bestOf && reg.persos !== false) a = await avecVoix(source, a, { ...o, pistes });
    preparerVoix(a);
    if (!bestOf && reg.avecIA && a.parole === 'mots' && a.scenes.length > 0) {
      const ia = await demanderIA(a, c.signal);
      if (ia) a = { ...a, scenes: ia.scenes, transcription: { ...a.transcription, mots: ia.mots } };
    }
    if (controleur !== c) return;
    analyseExpress.value = a;
    scenesExpress.value = a.scenes;
    etatExpress.value = { phase: 'fini' };
    signalerFinTravail('Arko : le montage est prêt', 'Viens vérifier et modifier si besoin.');
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
  routeBestOf.annuler?.();
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
  // Monteur IA (A9) : un plan validé est ouvert → c'est LUI qui décide des séquences, de l'accroche et des effets.
  const planIA = planMonteur.peek()?.plan ?? null;
  const avecPlan = planIA !== null && planIA.sequences.length > 0;
  if (!avecPlan && estV4(a) && routeBestOf.monter) return void (await routeBestOf.monter());
  if (!source || !a || montageEnCours.peek() || (!avecPlan && !scenes.some((s) => s.garde))) return;
  montageEnCours.value = true;
  try {
    // Goûts appris (exports précédents) : zooms, punchlines, durée visée nuancés (E1, E2).
    const reg = reglagesAvecGouts(reglagesExpress.peek(), gouts.peek());
    const bestOf = enBestOf();
    await sauverEnAttente();
    await nouveauProjet();
    const nom = source.infos.nom.replace(/\.[^.]+$/, '');
    demarrerProjet(source, { ...recetteInitiale(source, destinationExpress.peek()), titre: (bestOf ? TV.bestOf.titreProjet : TA.express.titreProjet)(nom) });
    idCourant.value = null;
    const journalPlan: string[] = [];
    const construire = (r: Recette, res: RessourcesExpress) => sansSonsArko(poserStructureYoutube(construireSans(r, res), { chaine: chaineYoutube.peek() }));
    const construireSans = (r: Recette, res: RessourcesExpress) =>
      avecPlan
        ? ((x) => (journalPlan.splice(0, journalPlan.length, ...x.journal), x.recette))(appliquerPlan(r, a, planIA, reg, { ...res, ...choixVoix() }))
        : bestOf ? construireBestOf(r, a as AnalyseBestOf, scenes as SceneBestOf[], reg, reglagesBestOf.peek(), ressourcesBestOf(res)) : construireMontageExpress(r, a, scenes, reg, { ...res, ...choixVoix() }, { transitions: gouts.peek().densite.transitions >= 0.5, facteurPunchlines: gouts.peek().densite.punchlines, ...(gouts.peek().marges ? { marges: gouts.peek().marges } : {}) });
    // Un nouveau montage, construit en UNE opération : un seul Annuler revient à la vidéo brute.
    if (reg.musiqueAuto === true) {
      // Musique automatique : le montage est construit une fois SANS musique (pur), Arko y choisit un morceau par
      // groupe de séquences et ouvre les fichiers (tâche lente), puis la piste est posée dans la même opération.
      const r0 = recette.peek();
      const sans = r0 ? construire(r0, { sourcesAudio: [], bruitages: [], musique: null }) : null;
      const gardees = scenes.filter((x) => x.garde && x.a > x.de);
      const auto = sans && sans !== r0 ? await preparerMusiqueAuto(sans, gardees, a).catch((e: unknown) => (console.error(e), null)) : null;
      const sourcesMusique = auto?.sources.map((x) => x.infos) ?? [];
      const avec = sans && auto ? definirMusique(sans, auto.piste, sourcesMusique) : sans;
      modifier((r) => (r === r0 && avec ? avec : construire(r, { sourcesAudio: sourcesMusique, bruitages: [], musique: auto?.piste ?? null })));
    } else {
      const ressources = await preparerRessources(reg);
      modifier((r) => construire(r, ressources));
    }
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
    afficherToast((bestOf ? TV.bestOf.pret : TA.express.pret)(formatDuree(r ? compiler(r).duree : 0)), 8000, { label: TA.express.annulerMontage, agir: annulerAction });
    // Plan du monteur IA : ses sons / mèmes à lui (une opération, un Annuler), puis on s'arrête là (pas les choix
    // automatiques d'Arko par-dessus). Le journal des corrections est rappelé.
    if (avecPlan) {
      const n = await poserEffetsBibliotheque(planIA.effets).catch((e: unknown) => (console.error(e), 0));
      memoriserMontageAuto(recette.peek());
      retenirPourquois(planIA);
      planMonteur.value = null;
      afficherToast(`Monté avec le plan du monteur IA${n > 0 ? ` (${n} sons et mèmes)` : ''}.${journalPlan.length > 0 ? ` ${journalPlan[0]}` : ''}`, 9000, { label: TA.express.annulerMontage, agir: annulerAction });
      return;
    }
    // Mèmes et fonds verts de Ma bibliothèque aux moments forts (TikTok) : une opération à part, son propre Annuler.
    if (!bestOf && a.parole === 'mots') await poserMemesAuto(a.transcription.mots, source.infos.id, a.signaux, reg.accroche ? 6.5 : 0).catch((e: unknown) => console.error(e));
    // Effets de rythme (whoosh / pop / impact) et bruitages : UNIQUEMENT les sons de Ma bibliothèque (demande de
    // Romain, 9/11/2026) ; les sons fabriqués par Arko restent posables à la main.
    if (!bestOf && reg.bruitages) await poserAccentsAuto(reg.accroche ? 6.5 : 0, { bibliothequeSeule: true }).catch((e: unknown) => console.error(e));
    // Ce qu'Arko a posé : comparé à la version finale à l'export (apprentissage des goûts).
    memoriserMontageAuto(recette.peek());
    // Bruitages demandés : la revue (écouter dans la vidéo, cocher) s'ouvre ; rien n'est posé sans validation.
    if (!bestOf && reg.bruitages && a.parole === 'mots') {
      ouvrirOutil('sons');
      void ouvrirBruitages({ bibliothequeSeule: true });
    }
  } catch (e) {
    console.error(e);
    afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 6000);
  } finally {
    montageEnCours.value = false;
  }
}
