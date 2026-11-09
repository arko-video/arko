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
import { transitionsDesScenes } from '../habillage/transitions-auto';
import { eclaircir } from '../apprentissage/appliquer-gouts';
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
import type { PlageTemps, SignauxSource, Transcription } from '../types';
import type { EmpreintesVoix, VoixDetectees } from '../types-v3';
import { poserPersos, type ChoixPersos } from '../voix/persos-montage';
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
  /** Ids « Mes sons » des morceaux de musique (1 à 6), ou [] pour aucune musique (quand `musiqueAuto` est faux). */
  musique: string[];
  /**
   * Musique automatique (défaut de la page : oui) : un morceau par groupe de séquences, choisi par Arko (Ma
   * bibliothèque, sinon Kevin MacLeod, sinon une musique fabriquée), voir auto/son/musique-auto.ts. Absent = non.
   */
  musiqueAuto?: boolean;
  /** Enlever les bords de l'écran (capture OBS). */
  bords: boolean;
  zooms: ForceZoomsAuto | null;
  sections: boolean;
  /** Accroche de 6 s au début avec le meilleur moment (« Le meilleur d'abord »). */
  accroche: boolean;
  /** Avec l'IA (clé de l'utilisateur) : choisir les moments et corriger les punchlines, en n'envoyant que du texte. */
  avecIA: boolean;
  /** « Persos de qui parle » : voix reconnues, un perso par voix, avatars au bon moment. Absent = oui. */
  persos?: boolean;
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
  /** Voix reconnues (« Persos de qui parle ») : absentes si on ne les a pas écoutées. */
  voix?: VoixDetectees | null;
  empreintes?: EmpreintesVoix[];
}

/**
 * Ce que la page a préparé AVANT (tâches asynchrones) : sons de Mes sons copiés dans le projet comme sources audio,
 * bruitages choisis (proposerBruitages + choisirSon du dev 3), piste musique (morceaux choisis à la main : RE-PLACÉS
 * ici au début des chapitres, seul l'ordre des `src` compte ; musique automatique : déjà placés, gardés tels quels).
 */
export interface RessourcesExpress {
  sourcesAudio: Source[];
  bruitages: BruitagePose[];
  musique: PisteMusique | null;
  /** Noms des voix et persos choisis sur la revue (cartes des voix). */
  noms?: Readonly<Record<string, string>>;
  chibis?: ChoixPersos['chibis'];
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

/** Options des étapes communes (le Best-of serré les règle autrement que le Montage express). */
export interface OptionsEtapes {
  /** Texte de l'accroche de 6 s (null : aucun texte) ; absent = « ATTENDS… ». */
  texteAccroche?: string | null;
  /** G. Titres de section ; absent = `reglages.sections`. */
  sections?: boolean;
  /** E. Bruitages ; absent = `reglages.bruitages`. */
  bruitages?: boolean;
  /** Transitions aux changements de scène (vertical seulement) ; absent = oui. */
  transitions?: boolean;
  /** Goûts appris (E3) : secondes ajoutées aux marges des jump cuts avant / après les mots. */
  marges?: { avant: Sec; apres: Sec };
  /** Goûts appris : part des punchlines gardée (< 1 : éclaircies ; absent = toutes). */
  facteurPunchlines?: number;
  /** Monteur IA : l'accroche commence à ce temps SOURCE (s'il est dans le montage), et dure `dureeAccroche`. */
  accrocheSource?: Sec;
  dureeAccroche?: Sec;
}

/**
 * Les étapes du Montage express, dans l'ordre : plans = `plages` (temps source, dans l'ordre donné), A → D → B → (E)
 * → C → accroche → chapitres (un par élément de `scenes`, au début de son 1er plan) → G → F + volume final. Pure.
 */
export function etapesMontage(
  recette: Recette,
  analyse: AnalyseExpress,
  plages: readonly PlageTemps[],
  scenes: readonly SceneProposee[],
  reglages: ReglagesExpress,
  ressources: RessourcesExpress,
  o: OptionsEtapes = {},
): Recette {
  const src = premiereVideo(recette);
  if (plages.length === 0 || !src) return recette;
  const signaux = analyse.signaux;
  const mots = motsDesScenes(analyse.transcription.mots, plages);
  const vraisMots = analyse.parole === 'mots' && mots.length > 0;

  // 1. Plans = plages gardées ; sous-titres = mots de ces plages.
  let r = finir({ ...recette, plans: plages.map((s) => ({ de: s.de, a: s.a })) });
  if (vraisMots) {
    r = definirSousTitres(r, { style: SOUS_TITRES.style, y: ySousTitres(r.mise, gabaritDe(r)), parLigne: SOUS_TITRES.parLigne, mots, src });
  }
  // 2. A — Couper les blancs (sur les plans actuels : un plan devient plusieurs morceaux).
  const niveau = reglages.niveauBlancs;
  const base = REGLAGES_BLANCS[niveau];
  const blancs = o.marges ? { ...base, avant: Math.max(0.05, base.avant + o.marges.avant), apres: Math.max(0.05, base.apres + o.marges.apres) } : base;
  const morceaux = morceauxDeParole(mots, reglages.garder === 'parole' ? null : signaux, blancs);
  r = couperLesBlancs(r, morceaux, niveau);
  // 3. D — Enlever les bords de l'écran.
  if (reglages.bords && analyse.cadreBords) r = rognerSource(r, src, analyse.cadreBords);
  // 4. B — Punchlines.
  if (vraisMots && reglages.punchlines) {
    r = choisirModeSousTitres(definirPunchlines(r, eclaircir(trouverPunchlines(mots, signaux), o.facteurPunchlines ?? 1)), 'punchlines');
  }
  // 5. E — Bruitages (préparés par la page).
  if ((o.bruitages ?? reglages.bruitages) && ressources.bruitages.length > 0) r = poserBruitages(r, ressources.bruitages, ressources.sourcesAudio);
  // 6. C — Zooms automatiques (après E).
  if (reglages.zooms) r = zoomsAutomatiques(r, signaux, reglages.zooms);
  // Accroche de 6 s : le meilleur moment copié au début (textes, sons et zooms en temps de sortie décalés).
  let finAccroche = 0;
  if (reglages.accroche) {
    const choisi = o.accrocheSource === undefined ? undefined : sortiesDe(compiler(r), src, o.accrocheSource)[0];
    const t = choisi ?? meilleurMoment(r, signaux);
    const avec = t === null ? r : modeleMeilleurDAbord(r, t, o.dureeAccroche ?? MEILLEUR.dureeExpress, o.texteAccroche === undefined ? {} : { texte: o.texteAccroche });
    if (avec !== r) finAccroche = compiler(avec).plans[0]?.t1 ?? 0;
    r = avec;
  }
  // Transitions aux changements de scène (TikTok vertical seulement : la DA YouTube garde des coupes franches).
  if (!gabaritDe(r).paysage && (o.transitions ?? true)) r = transitionsDesScenes(r, plages, signaux);
  // Chapitres (YouTube 16:9) puis 7. G — titres de section, placés après l'accroche.
  const chapitres = gabaritDe(r).paysage ? chapitresDesScenes(r, scenes, src, finAccroche) : [];
  if (chapitres.length > 0) {
    r = finir({ ...r, chapitres });
    if (o.sections ?? reglages.sections) r = titresDeSection(r, { source: 'chapitres' });
  }
  // 8. F — Musique (au début des chapitres) et volume final −14 LUFS / −1,5 dBTP. Musique automatique (un morceau par
  //    groupe de séquences, après l'accroche : auto/son/musique-auto.ts) : ses morceaux arrivent DÉJÀ placés (un
  //    début > 0) et sont gardés tels quels ; les morceaux choisis à la main (tous à 0) sont placés ici.
  const srcs = ressources.musique?.morceaux.map((m) => m.src) ?? [];
  if (srcs.length > 0 && ressources.musique) {
    const places = ressources.musique.morceaux.some((m) => m.t > 0 || m.fin !== undefined);
    const morceauxMusique = places ? ressources.musique.morceaux.map((m) => ({ ...m })) : placerMorceaux(srcs, (r.chapitres ?? []).map((c) => c.t), compiler(r).duree);
    r = definirMusique(r, { ...ressources.musique, morceaux: morceauxMusique }, ressources.sourcesAudio);
  }
  return choisirVolumeFinal(r, { lufs: VOLUME_FINAL.lufs, crete: VOLUME_FINAL.crete });
}

/** Persos de qui parle (étape partagée), si demandés et si des voix ont été reconnues. Pure. */
export function etapePersos(r: Recette, analyse: AnalyseExpress, reglages: Pick<ReglagesExpress, 'persos'>, ressources: Pick<RessourcesExpress, 'noms' | 'chibis'>): Recette {
  if (reglages.persos === false || !analyse.voix) return r;
  const mots = analyse.parole === 'mots' ? analyse.transcription.mots : undefined;
  return poserPersos(r, { voix: analyse.voix, empreintes: analyse.empreintes ?? [] }, { noms: ressources.noms, chibis: ressources.chibis, ...(mots ? { mots } : {}), signaux: analyse.signaux });
}

/** Écran 3 → montage : A + D + B + E + C + accroche + chapitres + G + F aux scènes gardées (ordre donné), puis les persos. Pure. */
export function construireMontageExpress(
  recette: Recette,
  analyse: AnalyseExpress,
  scenes: readonly SceneProposee[],
  reglages: ReglagesExpress,
  ressources: RessourcesExpress,
  o: OptionsEtapes = {},
): Recette {
  const gardees = scenes.filter((s) => s.garde && s.a > s.de);
  const r = etapesMontage(recette, analyse, gardees, gardees, reglages, ressources, o);
  return r === recette ? r : etapePersos(r, analyse, reglages, ressources);
}
