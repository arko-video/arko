// Best-of v4 (dev-ui) — le parcours d'etat-v4.ts BRANCHÉ sur l'appli : les signals des écrans (etat-express.ts,
// etat-best-of.ts) et les services du navigateur (modules sur l'appareil, mesurerPourBestOf, empreinte de voix,
// nouveau projet, musique automatique de dev-musique, historique). Rien n'est téléchargé sans le geste de
// l'utilisateur : Whisper après « Télécharger » sur la carte, l'empreinte après « Séparer les voix ». Le détecteur
// de voix (Silero) est rangé dans l'appli : il n'est jamais proposé (décision de l'orchestrateur, 7/11).

import { premiereVideo } from '../../../auto/coupes/decoupe';
import { ajusterSequence } from '../../../auto/derush/ajuster';
import { morceauxDuPassage, recouperMontage, type EntreeRecoupe } from '../../../auto/coupes/recouper';
import { mesurerPourBestOf } from '../../../auto/express/mesures-best-of';
import { etatModele, garderModelesDeLAppli, telechargerModele } from '../../../auto/modeles/modeles';
import type { MesuresGardees, ModulesBestOf, MusiquePrete } from '../../../auto/types-v4';
import { lireMesuresGardees } from '../../../auto/vad/gardees';
import { calculerEmpreintesNeurales } from '../../../auto/voix/client-empreintes';
import { importerSon, lireMonSon, moduleSousTitres, nouveauProjet, telechargerModuleSousTitres, type SourceOuverte } from '../../../moteur/api';
import { compiler } from '../../../recette/chronologie';
import type { Recette } from '../../../recette/types';
import { emotionDuPassage, pistesGardees } from '../../../recette/operations';
import { TA } from '../../../textes-auto';
import { TV } from '../../../textes-v3';
import { afficherToast, ajouterSourceOuverte, annulerAction, demarrerProjet, derniereEtape, idsPris, modifier, recette, sauverEnAttente } from '../../etat';
import { formatDuree } from '../../format';
import { idCourant } from '../../montages';
import { choixVisible, sourceMonteur } from '../../monteur/etat-monteur';
import { reprendreA } from '../../navigation';
import { garderFichier } from '../../sons-gardes';
import { chibisVoix, nomsVoix, reglagesBestOf, sousTitresPourVoix } from './etat-best-of';
import { analyseExpress, destinationExpress, etatExpress, montageEnCours, quandOuvertureExpress, reglagesExpress, routeBestOf, scenesExpress, sourceExpress } from './etat-express';
import { brancherV4 } from './branchements-v4';
import { creerParcoursBestOf, type ServicesV4 } from './etat-v4';
import { preparerMusiqueAuto } from './musique-express';
import { TEXTES_MUSIQUE_EXPRESS } from './textes-musique';
import { allerExpress, fermerExpress, remplacerExpress } from './navigation-express';
import { modulePrecis, transcrirePrecis } from '../../../sous-titres/precis';
import { creerSousTitresPrecis } from './precis-v4';

/** « Sous-titres précis » (dev-mots-2) : Whisper small réécoute la voix sous-titrée des séquences gardées. */
export const sousTitresPrecis = creerSousTitresPrecis({
  lire: modulePrecis,
  enLigne: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  transcrire: (source, plages, o) => transcrirePrecis(source, plages, { ...(o.signal ? { signal: o.signal } : {}), surProgression: (p, m) => o.surProgression?.(p, m) }),
});

const present = (p: Promise<{ present: boolean }>) => p.then((x) => x.present).catch(() => false);

async function garderEcranAllume(): Promise<() => void> {
  try {
    if (!('wakeLock' in navigator)) return () => {};
    const v = await navigator.wakeLock.request('screen');
    return () => void v.release().catch(() => {});
  } catch {
    return () => {};
  }
}

/** Morceaux de Mes sons cochés à la main : copiés dans le projet ouvert (comme « poser » dans Mes sons). */
async function musiqueChoisie(ids: readonly string[]): Promise<MusiquePrete | null> {
  const copies: SourceOuverte[] = [];
  for (const id of ids) {
    const f = await lireMonSon(id).catch(() => null);
    if (!f) continue;
    const s = await importerSon(f, idsPris()).catch(() => null);
    if (!s) continue;
    ajouterSourceOuverte(s);
    garderFichier(s);
    copies.push(s);
  }
  return copies.length > 0 ? { piste: { morceaux: copies.map((s) => ({ src: s.infos.id, t: 0 })) }, sources: copies.map((s) => s.infos) } : null;
}

/* ------------------------------------------------------------------ recouper après coup (Habiller) */

/**
 * Ce qu'il faut pour recouper un Best-of SANS réécouter, par vidéo (empreinte du fichier) : gardé en mémoire après le
 * montage (VAD + énergie de la voix, signaux, moments). Après un rechargement : les mesures gardées sur l'appareil
 * par dev-vad (`lireGardees`, à brancher quand src/auto/vad/gardees.ts existe), sinon les mots des sous-titres seuls.
 */
const memoireRecoupe = new Map<string, Omit<EntreeRecoupe, 'mots'>>();
let lireGardees: (emp: string) => Promise<MesuresGardees | null> = async () => null;
/** Branché par l'intégrateur sur dev-vad (lecture d'IndexedDB `arko.mesures.<emp>`). */
export function brancherMesuresGardees(f: (emp: string) => Promise<MesuresGardees | null>) {
  lireGardees = f;
}

async function entreeRecoupe(r: Recette): Promise<Omit<EntreeRecoupe, 'mots'> | null> {
  const src = premiereVideo(r);
  const emp = r.sources.find((x) => x.id === src)?.emp;
  if (!emp) return null;
  const connue = memoireRecoupe.get(emp);
  if (connue) return connue;
  const mesures = await lireGardees(emp).catch(() => null);
  return mesures ? { mesures } : null;
}

const motsDe = (r: Recette) => (Array.isArray(r.sousTitres?.mots) ? r.sousTitres.mots : []);

brancherV4({
  async recouperBestOf(r, niveau) {
    const e = await entreeRecoupe(r);
    // Ni mesures ni mots : rien de sûr pour recouper (on ne coupe jamais à l'aveugle).
    if (!e && !motsDe(r).some((m) => m[0].trim())) return null;
    const n = recouperMontage(r, { ...(e ?? { mesures: null }) }, niveau);
    return n === r ? null : n;
  },
  async morceauxPassage(r, p, mots) {
    const e = await entreeRecoupe(r);
    if (!e) return null;
    const m = morceauxDuPassage({ ...e, mots: mots ?? motsDe(r) }, p, r.blancs?.niveau ?? 'normal');
    return m.length > 0 ? m.map((x) => ({ de: x.de, a: x.a })) : null;
  },
});

/* ------------------------------------------------------------------ services du navigateur */

const SERVICES: ServicesV4 = {
  async lireModules(): Promise<ModulesBestOf> {
    const [w, v, e] = await Promise.all([present(moduleSousTitres()), present(etatModele('vad')), present(etatModele('empreinte'))]);
    return { whisper: w ? 'present' : 'absent', vad: v ? 'present' : 'absent', empreinte: e ? 'present' : 'absent' };
  },
  enLigne: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  telechargerWhisper: (o) => telechargerModuleSousTitres({ ...(o.signal ? { signal: o.signal } : {}), surProgression: (p, m) => o.surProgression?.(p, m) }),
  telechargerEmpreinte: (o) => telechargerModele('empreinte', o),
  mesurer: (source, reg, bestOf, o) => mesurerPourBestOf(source, reg, bestOf, o),
  empreintesNeurales: (source, morceaux, o) => calculerEmpreintesNeurales(source, morceaux, o),
  pistes(source) {
    const r0 = recette.peek();
    return r0?.sources.some((x) => x.id === source.infos.id) ? pistesGardees(r0, source.infos.id) : [];
  },
  allerA: (e, remplacer) => (remplacer ? remplacerExpress(e) : allerExpress(e)),
  retour: () => history.back(),
  toast: (m, ms, action) => afficherToast(m, ms, action),
  garderEcranAllume,
  async ouvrirProjet(source, depart) {
    await sauverEnAttente();
    await nouveauProjet();
    demarrerProjet(source, depart);
    idCourant.value = null;
    return recette.peek();
  },
  async musiqueAuto(sans, gardees, a) {
    const auto = await preparerMusiqueAuto(sans, gardees, a);
    return auto ? { piste: auto.piste, sources: auto.sources.map((s) => s.infos) } : null;
  },
  musiqueChoisie,
  modifier,
  async precis(source, a, revue) {
    const { analyse, message } = await sousTitresPrecis.appliquer(source, a, revue);
    if (message) afficherToast(message, 6000);
    return analyse;
  },
  apresMontage(source, a, gardees) {
    memoireRecoupe.delete(source.infos.emp);
    memoireRecoupe.set(source.infos.emp, { mesures: gardees, signaux: a.signaux, moments: a.moments });
    // Les 3 dernières vidéos montées seulement (les autres se relisent depuis l'appareil) : relecture point 8.
    for (const k of [...memoireRecoupe.keys()].slice(0, Math.max(0, memoireRecoupe.size - 3))) memoireRecoupe.delete(k);
    fermerExpress();
    choixVisible.value = false;
    if (sourceMonteur.peek() === source) sourceMonteur.value = null;
    derniereEtape.value = 'habiller';
    reprendreA('habiller');
    const r = recette.peek();
    // Un morceau de Kevin MacLeod dans la musique : le crédit est obligatoire, on le rappelle (demande de dev-musique).
    const kevin = !!r?.musique?.morceaux.some((m) => r.sources.find((x) => x.id === m.src)?.nom.startsWith('Kevin MacLeod'));
    const pret = TV.bestOf.pret(formatDuree(r ? compiler(r).duree : 0));
    afficherToast(kevin ? `${pret} ${TEXTES_MUSIQUE_EXPRESS.credit}` : pret, kevin ? 10000 : 8000, { label: TA.express.annulerMontage, agir: annulerAction });
  },
};

/** Le parcours du Best-of v4 de l'appli (un seul). */
export const parcoursV4 = creerParcoursBestOf(
  {
    source: sourceExpress,
    destination: destinationExpress,
    reglages: reglagesExpress,
    bestOf: reglagesBestOf,
    etat: etatExpress,
    analyse: analyseExpress,
    scenes: scenesExpress,
    noms: nomsVoix,
    chibis: chibisVoix,
    pour: sousTitresPourVoix,
    montageEnCours,
  },
  SERVICES,
);

quandOuvertureExpress(() => parcoursV4.ouvrir());
routeBestOf.lancer = () => parcoursV4.demanderAnalyse();
routeBestOf.monter = () => parcoursV4.monter();
routeBestOf.annuler = () => parcoursV4.annuler();

/* ------------------------------------------------------------------ branchements (intégrateur) */

// Au démarrage (ce module est chargé avec les écrans du Montage express, dès l'ouverture d'Arko) : les mesures gardées
// sur l'appareil par la passe du son (dev-vad, IndexedDB `arko.mesures.<emp>`) pour recouper sans réécouter, même
// après un rechargement ; « ± 1 phrase » sur la revue (dev-scenes) ; le menu Émotion de « Qui parle ? » (dev-persos).
brancherMesuresGardees(lireMesuresGardees);
brancherV4({ ajusterSequence, emotionDuPassage });
// Le détecteur de voix (livré avec l'appli) gardé d'avance, en ligne, peu après le démarrage : une 1ʳᵉ analyse hors
// ligne l'aura déjà (relecture point 6). Depuis le site d'Arko lui-même, sans accord ; rien hors ligne.
if (typeof window !== 'undefined') setTimeout(() => void garderModelesDeLAppli(navigator.onLine !== false), 5000);
