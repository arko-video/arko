// H. « Montage express » (INTÉGRATEUR) : assemblage PUR du montage à partir de l'analyse et des scènes gardées.
// Appelle les fonctions publiques des 3 devs dans l'ordre du contrat : A (couperLesBlancs) → D (rognerSource) →
// B (definirPunchlines, choisirModeSousTitres) → E (poserBruitages) → C (zoomsAutomatiques, après E : un bruitage
// posé compte comme moment fort) → G (titresDeSection) → F (definirMusique, choisirVolumeFinal).
// L'accroche de 6 s (« Le meilleur d'abord ») est posée juste après C : les chapitres, les titres de section et les
// morceaux de musique (en temps de sortie) sont donc placés APRÈS l'accroche, sans rien à recaler.
// Le résultat est un montage NORMAL ; l'interface l'applique en UN seul modifier() (un seul Annuler).
// L'analyse (lente, navigateur) est dans analyse-express.ts.

import { premiereVideo } from '../coupes/decoupe';
import { morceauxDeParole, REGLAGES_BLANCS } from '../coupes/blancs';
import { trouverPunchlines } from '../habillage/punchlines';
import type { ForceZoomsAuto } from '../habillage/zooms-auto';
import { compiler, sortiesDe } from '../../recette/chronologie';
import { CHAPITRES } from '../../recette/chapitres';
import { SOUS_TITRES, ySousTitres } from '../../recette/defauts';
import { gabaritDe } from '../../recette/destination';
import { MEILLEUR, modeleMeilleurDAbord } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { VOLUME_FINAL } from '../../recette/normaliser-auto-son';
import {
  choisirModeSousTitres,
  choisirVolumeFinal,
  couperLesBlancs,
  definirMusique,
  definirPunchlines,
  definirSousTitres,
  poserBruitages,
  rognerSource,
  titresDeSection,
  zoomsAutomatiques,
  type BruitagePose,
} from '../../recette/operations';
import type { Chapitre, MorceauMusique, NiveauBlancs, PisteMusique, Recette, Rognage, Sec, Source } from '../../recette/types';
import type { SignauxSource, Transcription } from '../types';
import { motsDesScenes, type SceneProposee } from './scenes';

/** Écran 1, Réglages. */
export interface ReglagesExpress {
  /** Durée visée (ex. 15 à 20 min). */
  dureeVisee: { min: Sec; max: Sec };
  garder: 'parole+forts' | 'parole';
  niveauBlancs: NiveauBlancs;
  /** Transcrire les voix avec Whisper (sinon : voix détectée au son, sans punchlines ni bruitages sur les mots). */
  transcrire: boolean;
  punchlines: boolean;
  bruitages: boolean;
  /** Ids « Mes sons » des morceaux de musique (1 à 6), ou [] pour aucune musique. */
  musique: string[];
  /** Enlever les bords de l'écran (capture OBS). */
  bords: boolean;
  zooms: ForceZoomsAuto | null;
  sections: boolean;
  /** Accroche de 6 s au début avec le meilleur moment (« Le meilleur d'abord »). */
  accroche: boolean;
  /** Avec l'IA (clé de l'utilisateur) : choisir les moments et corriger les punchlines, en n'envoyant que du texte. */
  avecIA: boolean;
}

/** Écran 2, Analyse : ce qu'on sait de la source. */
export interface AnalyseExpress {
  transcription: Transcription;
  /** 'mots' : vrais mots de Whisper ; 'voix' : zones de voix (sans texte) transformées en « mots » vides. */
  parole: 'mots' | 'voix';
  signaux: SignauxSource;
  scenes: SceneProposee[];
  /** Bords d'écran trouvés (detecterBords + cadreRognage du dev 1), null si aucun ou pas demandé. */
  cadreBords: Omit<Rognage, 'src'> | null;
  /** Messages pour l'utilisateur (« La fin (25 min sans son) n'est pas proposée »). */
  avertissements: string[];
}

/**
 * Ce que la page a préparé AVANT (tâches asynchrones) : sons de Mes sons copiés dans le projet comme sources audio,
 * bruitages choisis (proposerBruitages + choisirSon du dev 3), piste musique (ses morceaux sont RE-PLACÉS ici au
 * début des chapitres : seul l'ordre des `src` compte).
 */
export interface RessourcesExpress {
  sourcesAudio: Source[];
  bruitages: BruitagePose[];
  musique: PisteMusique | null;
}

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

/** Temps de sortie du moment le plus fort encore dans le montage (pic, puis cri, puis rire) ; null si aucun. */
export function meilleurMoment(r: Recette, s: SignauxSource | null): Sec | null {
  if (!s) return null;
  const sc = compiler(r);
  const candidats = [
    ...[...s.pics].sort((a, b) => b.z - a.z).map((p) => p.ts),
    ...[...s.cris].sort((a, b) => b.force - a.force).map((c) => c.t),
    ...[...s.rires].sort((a, b) => b.force - a.force).map((x) => x.t),
  ];
  for (const ts of candidats) {
    const t = sortiesDe(sc, s.src, ts)[0];
    if (t !== undefined) return t;
  }
  return null;
}

/**
 * Chapitres YouTube : un par scène gardée, au début de son 1er plan (le 1er à 0:00, il englobe l'accroche).
 * Règles de YouTube : 3 au moins, 10 s chacun au moins ; sinon aucun chapitre.
 */
export function chapitresDesScenes(r: Recette, scenes: readonly SceneProposee[], src: string, apres: Sec = 0): Chapitre[] {
  const sc = compiler(r);
  const res: Chapitre[] = [];
  scenes.forEach((s, i) => {
    // `apres` : fin de l'accroche (sa copie du meilleur moment n'ouvre pas de chapitre).
    const plan = sc.plans.find((p) => p.t0 >= apres - 0.01 && p.src === src && p.de >= s.de - 0.01 && p.a <= s.a + 0.01);
    if (!plan) return;
    const t = i === 0 || res.length === 0 ? 0 : Math.round(plan.t0 * 100) / 100;
    const der = res[res.length - 1];
    if (der && t - der.t < CHAPITRES.dureeMin) return;
    res.push({ t, nom: s.titre.slice(0, CHAPITRES.nomMax) });
  });
  while (res.length > 0 && sc.duree - res[res.length - 1]!.t < CHAPITRES.dureeMin) res.pop();
  return res.length >= CHAPITRES.min ? res : [];
}

/** n morceaux qui se suivent : le k-ième au début du chapitre le plus proche de k × durée / n (le 1er à 0). */
export function placerMorceaux(srcs: readonly string[], debuts: readonly Sec[], duree: Sec): MorceauMusique[] {
  const n = srcs.length;
  const res: MorceauMusique[] = [];
  srcs.forEach((src, k) => {
    const vise = (k * duree) / n;
    const t = k === 0 ? 0 : debuts.length > 0 ? debuts.reduce((m, d) => (Math.abs(d - vise) < Math.abs(m - vise) ? d : m), debuts[0]!) : Math.round(vise * 100) / 100;
    if (res.some((m) => m.t === t)) return;
    res.push({ src, t });
  });
  return res;
}

/** Écran 3 → montage : applique A + D + B + E + C + accroche + chapitres + G + F aux scènes gardées (ordre donné). Pure. */
export function construireMontageExpress(
  recette: Recette,
  analyse: AnalyseExpress,
  scenes: readonly SceneProposee[],
  reglages: ReglagesExpress,
  ressources: RessourcesExpress,
): Recette {
  const gardees = scenes.filter((s) => s.garde && s.a > s.de);
  const src = premiereVideo(recette);
  if (gardees.length === 0 || !src) return recette;
  const signaux = analyse.signaux;
  const mots = motsDesScenes(analyse.transcription.mots, gardees);
  const vraisMots = analyse.parole === 'mots' && mots.length > 0;

  // 1. Plans = scènes gardées ; sous-titres = mots de ces scènes.
  let r = finir({ ...recette, plans: gardees.map((s) => ({ de: s.de, a: s.a })) });
  if (vraisMots) {
    r = definirSousTitres(r, { style: SOUS_TITRES.style, y: ySousTitres(r.mise, gabaritDe(r)), parLigne: SOUS_TITRES.parLigne, mots, src });
  }
  // 2. A — Couper les blancs (sur les plans actuels : un plan devient plusieurs morceaux).
  const niveau = reglages.niveauBlancs;
  const morceaux = morceauxDeParole(mots, reglages.garder === 'parole' ? null : signaux, REGLAGES_BLANCS[niveau]);
  r = couperLesBlancs(r, morceaux, niveau);
  // 3. D — Enlever les bords de l'écran.
  if (reglages.bords && analyse.cadreBords) r = rognerSource(r, src, analyse.cadreBords);
  // 4. B — Punchlines.
  if (vraisMots && reglages.punchlines) {
    r = choisirModeSousTitres(definirPunchlines(r, trouverPunchlines(mots, signaux)), 'punchlines');
  }
  // 5. E — Bruitages (préparés par la page).
  if (reglages.bruitages && ressources.bruitages.length > 0) r = poserBruitages(r, ressources.bruitages, ressources.sourcesAudio);
  // 6. C — Zooms automatiques (après E).
  if (reglages.zooms) r = zoomsAutomatiques(r, signaux, reglages.zooms);
  // Accroche de 6 s : le meilleur moment copié au début (textes, sons et zooms en temps de sortie décalés).
  let finAccroche = 0;
  if (reglages.accroche) {
    const t = meilleurMoment(r, signaux);
    const avec = t === null ? r : modeleMeilleurDAbord(r, t, MEILLEUR.dureeExpress);
    if (avec !== r) finAccroche = compiler(avec).plans[0]?.t1 ?? 0;
    r = avec;
  }
  // Chapitres (YouTube 16:9) puis 7. G — titres de section, placés après l'accroche.
  const chapitres = gabaritDe(r).paysage ? chapitresDesScenes(r, gardees, src, finAccroche) : [];
  if (chapitres.length > 0) {
    r = finir({ ...r, chapitres });
    if (reglages.sections) r = titresDeSection(r, { source: 'chapitres' });
  }
  // 8. F — Musique (au début des chapitres) et volume final −14 LUFS / −1,5 dBTP.
  const srcs = ressources.musique?.morceaux.map((m) => m.src) ?? [];
  if (srcs.length > 0 && ressources.musique) {
    const morceauxMusique = placerMorceaux(srcs, (r.chapitres ?? []).map((c) => c.t), compiler(r).duree);
    r = definirMusique(r, { ...ressources.musique, morceaux: morceauxMusique }, ressources.sourcesAudio);
  }
  return choisirVolumeFinal(r, { lufs: VOLUME_FINAL.lufs, crete: VOLUME_FINAL.crete });
}
