// Banc réel — MESURES : la recette produite par Arko (Best-of serré) contre la VÉRITÉ (le montage fait à la main,
// validé par Romain ; tests/banc-reel/verite/verite.json). Définitions précises : tests/banc-reel/LISEZ-MOI-MESURES.md.
//
// Interface (appelée par banc-chaine) :
//   mesurerDossier(dossierSortie, dossierVerite) → Resultats   (lit recette.json, analyse.json, activite.json)
//   afficher(resultats) → tableau lisible (mesure, valeur, cible, OK/KO)
// Le cœur `mesurer(entrees)` est PUR (aucun fichier) : c'est lui que testent les tests unitaires.
// Tout est comparé en TEMPS SOURCE (le seul repère commun aux deux montages), sauf la musique et la durée (sortie).
// Le placement des plans, des sous-titres et des avatars vient du code d'Arko lui-même (compiler, avatarsAuTemps) :
// on mesure ce que l'aperçu et l'export montrent vraiment.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAISSE } from '../../../src/auto/son/baisse';
import type { VoixDetectees } from '../../../src/auto/types-v3';
import { avatarsAuTemps, placerAvatars } from '../../../src/moteur/couches/avatars';
import { MUSIQUE } from '../../../src/recette/normaliser-auto-son';
import { SOUS_TITRES_VOIX } from '../../../src/recette/sous-titres-voix';
import type { Recette, TourDeParole } from '../../../src/recette/types';
import { recetteParfaite } from './plafond';
import {
  activiteForte,
  bordsDeCoupe,
  intersection,
  bruitDeFond,
  dansUnMot,
  fusionner,
  Grille,
  intervallesMots,
  longueur,
  lireMontage,
  mediane,
  planA,
  plagesGardees,
  recouvrementTotal,
  sourceA,
  versSource,
  type Activite,
  type Bord,
  type Iv,
  type Montage,
  voixDesDeuxCotes,
} from './temps';

export type { Activite, Iv } from './temps';

/* ------------------------------------------------------------------ réglages des mesures */

/** Seuils des mesures (voir LISEZ-MOI-MESURES.md). Modifiables par `reglages` pour calibrer. */
export const REGLAGES = {
  /** Pas de la grille d'échantillonnage (s). */
  pas: 0.02,
  /** Une coupe est « en plein mot » si elle tombe dans un mot à plus de 30 ms de ses bords. */
  toleranceMot: 0.03,
  /**
   * Voix forte autour d'une coupe : de chaque côté (60 ms), niveau max ≥ max(bruit de fond local + 10 dB, −40 dBFS).
   * Calibré sur la vérité (LISEZ-MOI-MESURES.md) : −40 dBFS ≈ la voix de Romain dans le mélange.
   */
  fenetreVoix: 0.06,
  margeVoixDb: 10,
  voixForteMinDb: -40,
  /** Silences : un instant est « actif » (voix ou son) si son niveau ≥ max(bruit de fond local + 10 dB, −55 dBFS). */
  actifMinDb: -55,
  /** Bruit de fond local : 10e centile du niveau sur ± 5 s. */
  fenetreBruit: 5,
  centileBruit: 0.1,
  /** Un silence compte au-delà de 0,5 s ; les marges de la DA autour des mots (0,25 s avant, 0,35 s après) n'en sont pas. */
  silenceMin: 0.5,
  margeAvantMot: 0.25,
  margeApresMot: 0.35,
  /** Plan trop court (s). */
  planCourt: 0.35,
  /** Séquence retrouvée : ≥ 50 % de sa durée gardée. Punchline gardée : ≥ 80 % de sa fenêtre. */
  sequenceTrouvee: 0.5,
  punchlineGardee: 0.8,
  /** Punchline d'Arko sur le moment : elle recouvre ≥ 30 % de la fenêtre de la vérité. */
  punchlineRecouverte: 0.3,
  /** Sous-titre de la vérité recouvert : ≥ 50 % de sa fenêtre sous une ligne d'Arko. */
  sousTitreRecouvert: 0.5,
};
export type Reglages = typeof REGLAGES;

/** Cibles (BRIEF §3 ; celles marquées « banc » sont proposées par le banc, le BRIEF n'en donne pas de chiffre). */
export const CIBLES = {
  voixNombre: 2,
  voixTemps: 0.9,
  voixPhrases: 0.9,
  sequences: 0.8,
  punchlinesGardees: 0.7,
  punchlinesArko: 0.5, // banc
  musiquePresence: 0.95,
  musiqueDb: { vise: -17, ecart: 1.5 }, // DA
  lufs: -14,
  duree: { min: 15 * 60, max: 20 * 60 },
  persosBon: 0.85, // banc
  persosMauvais: 0.1, // banc
  sousTitresRecouverts: 0.8, // banc
};

/* ------------------------------------------------------------------ types */

export type Pers = 'R' | 'G';
const PERSONNES: readonly Pers[] = ['R', 'G'];

export interface PhraseVerite {
  i: number;
  p: Pers;
  emo: string;
  sit: string | null;
  accroche: boolean;
  sequence: string;
  sortie: Iv;
  montre: Iv[];
  bouche: Iv[];
}
export interface TexteVerite {
  i: number;
  accroche: boolean;
  sequence: string;
  sortie: Iv;
  source: Iv[];
  nMots: number;
  p: Pers | null;
}
export interface SequenceVerite {
  id: string;
  plages: Iv[];
  duree: number;
  musique: string | string[] | null;
}
export interface MorceauVerite {
  i: number;
  sequence: string;
  de: number;
  a: number;
  t0: number;
  t1: number;
  zoom: number;
}
/** Ce que les mesures lisent de verite.json (format arko.banc-verite/1). */
export interface Verite {
  format: string;
  duree: number;
  accroche: { sortie: Iv; morceaux: number[]; plages: Iv[] } | null;
  sequences: SequenceVerite[];
  morceaux: MorceauVerite[];
  parole: Record<Pers, Iv[]>;
  persoMontre: Record<Pers, Iv[]>;
  phrases: PhraseVerite[];
  punchlines: TexteVerite[];
  sousTitres: TexteVerite[];
  musique: { morceaux: { nom: string; t0: number; t1: number }[] };
}

/** analyse.json écrit par banc-chaine (champs lus ici). */
export interface AnalyseBanc {
  parole?: string;
  mots?: unknown;
  voix?: VoixDetectees | null;
  avertissements?: string[];
}

export interface Entrees {
  verite: Verite;
  recette: Recette;
  analyse?: AnalyseBanc | null;
  /** Niveau de la voix en temps source (activite.json). */
  activite?: Activite | null;
  /** Mots de Whisper (intervalles source triés). */
  mots?: Iv[] | null;
  /** Parties de la source déjà transcrites (absent : toute la source). Hors de ces parties, les mesures de mots se taisent. */
  plagesMots?: Iv[] | null;
  origineMots?: string;
  /**
   * Mots de RÉFÉRENCE de la cible « en plein mot » (décision de l'orchestrateur, 7/11 au soir) : les mots de Whisper
   * NETTOYÉS par nettoyerMotsV4 avec la VAD (banc-cache/mots-nettoyes-v4.json). Absents : la cible reste sur `mots`.
   */
  motsNettoyes?: Iv[] | null;
  origineMotsNettoyes?: string;
  /** VAD de référence (toutes les trames, pas de 32 ms) : bords « en pleine parole » (p ≥ 0,5 des deux côtés). */
  vad?: { pas: number; p: Uint8Array } | null;
  dossier?: string;
  /** Nombre de plans d'accroche (absent : trouvé par la transition « glitch »). */
  nbAccroche?: number;
  reglages?: Partial<Reglages>;
  /** Partie de la source passée dans la chaîne (banc.json → plage) : la vérité est réduite à cette partie. */
  plage?: Iv | null;
}

export interface Mesure {
  groupe: 'voix' | 'scenes' | 'cuts' | 'musique' | 'duree' | 'persos' | 'sousTitres';
  cle: string;
  nom: string;
  /** Valeur brute (nombre, part de 0 à 1, texte) ; null = pas mesurable ici. */
  valeur: number | string | boolean | null;
  /** Valeur affichée. */
  texte: string;
  cible: string;
  /** true = cible atteinte, false = manquée, null = indicatif ou pas mesurable. */
  ok: boolean | null;
  /** Mesure indicative : pas de cible, pas comptée dans le score. */
  indicatif?: boolean;
  detail?: string;
}

export interface Resultats {
  dossier: string;
  date: string;
  mesures: Mesure[];
  score: { atteintes: number; mesurees: number; total: number; part: number };
  /** Détails pour corriger (temps seulement, jamais de texte). */
  details: Record<string, unknown>;
  avertissements: string[];
}

/* ------------------------------------------------------------------ petits outils */

const pc = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1).replace('.', ',')} %`);
const nb = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const minSec = (s: number) => `${Math.floor(s / 60)} min ${nb(s % 60, 1)} s`;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const part = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Une étiquette par personne d'Arko : la personne de la vérité que ses tours recouvrent le plus (null : aucune). */
export function correspondance(tours: readonly Pick<TourDeParole, 'p' | 'ts' | 'fin'>[], parole: Record<Pers, Iv[]>): Map<string, Pers | null> {
  const parId = new Map<string, Iv[]>();
  for (const t of tours) {
    const l = parId.get(t.p) ?? [];
    l.push([t.ts, t.fin]);
    parId.set(t.p, l);
  }
  const res = new Map<string, Pers | null>();
  for (const [id, liste] of parId) {
    const f = fusionner(liste);
    let meilleure: Pers | null = null;
    let max = 0;
    for (const P of PERSONNES) {
      const rec = recouvrementTotal(fusionner(parole[P]), f);
      if (rec > max) [meilleure, max] = [P, rec];
    }
    res.set(id, meilleure);
  }
  return res;
}

/** Familles d'émotions (mesure indicative : deux émotions de la même famille « vont ensemble »). */
export const FAMILLES: Readonly<Record<string, string>> = {
  rit: 'rire', mortDeRire: 'rire',
  crie: 'colere', hurle: 'colere', enerve: 'colere', rage: 'colere',
  panique: 'peur',
  choque: 'surprise', surpris: 'surprise',
  parle: 'calme', reflechit: 'calme', confus: 'calme', gene: 'calme', dort: 'calme', malade: 'calme',
  triste: 'triste', pleure: 'triste', defaite: 'triste',
  frime: 'frime', moqueur: 'frime', determine: 'frime',
  content: 'joie', victoire: 'joie', amoureux: 'joie',
};
export const familleDe = (emo: string | undefined | null): string => (emo ? (FAMILLES[emo] ?? emo) : 'calme');

/* ------------------------------------------------------------------ mesures par groupe */

interface Contexte {
  e: Entrees;
  R: Reglages;
  v: Verite;
  m: Montage;
  g: Grille;
  mots: Iv[] | null;
  act: Activite | null;
  bruit: Float32Array | null;
  /** Grilles de la vérité en temps source : parole et perso montré, par personne. */
  parole: Record<Pers, Uint8Array>;
  montre: Record<Pers, Uint8Array>;
  /** Source gardée par la vérité : ailleurs, on ne sait pas qui parle (pas d'étiquettes). */
  connu: Uint8Array;
  mesures: Mesure[];
  details: Record<string, unknown>;
  avert: string[];
}

function ajouter(c: Contexte, x: Mesure) {
  c.mesures.push(x);
}

function mesurerVoix(c: Contexte) {
  const { e, v, g } = c;
  const voix = e.analyse?.voix ?? null;
  const tours = voix?.tours ?? e.recette.paroles ?? [];
  const origine = voix?.tours ? 'analyse.voix.tours' : 'recette.paroles';
  const liste = voix?.voix ?? (e.recette.personnes ?? []).map((p) => ({ id: p.id, niveauDb: p.niveauDb ?? NaN, part: NaN }));
  const n = liste.length;
  ajouter(c, {
    groupe: 'voix', cle: 'voix.nombre', nom: 'Voix trouvées', valeur: n, texte: String(n), cible: String(CIBLES.voixNombre),
    ok: n === CIBLES.voixNombre, ...(voix ? { detail: `méthode « ${voix.methode} »` } : {}),
  });
  const corr = correspondance(tours, v.parole);
  // Grilles d'Arko par personne de la vérité (via la correspondance).
  const arko: Record<Pers, Uint8Array> = { R: new Uint8Array(g.n), G: new Uint8Array(g.n) };
  const autre = new Uint8Array(g.n); // voix d'Arko qui ne correspond à personne
  for (const t of tours) {
    const P = corr.get(t.p) ?? null;
    g.marquer([[t.ts, t.fin]], P ? arko[P] : autre);
  }
  let total = 0;
  let bon = 0;
  let rien = 0;
  let faux = 0;
  for (let k = 0; k < g.n; k++) {
    const tR = c.parole.R[k]!;
    const tG = c.parole.G[k]!;
    if (!tR && !tG) continue;
    total++;
    const aR = arko.R[k]!;
    const aG = arko.G[k]!;
    if (!aR && !aG && !autre[k]) rien++;
    else if ((aR && !tR) || (aG && !tG) || autre[k]) faux++;
    else bon++;
  }
  const pt = part(bon, total);
  ajouter(c, {
    groupe: 'voix', cle: 'voix.temps', nom: 'Temps de parole bien attribué', valeur: pt, texte: pc(pt), cible: `≥ ${pc(CIBLES.voixTemps)}`,
    ok: pt === null ? null : pt >= CIBLES.voixTemps,
    detail: `sans voix d'Arko ${pc(part(rien, total))} · mauvaise ${pc(part(faux, total))} · ${nb(total * g.pas, 0)} s de parole (${origine})`,
  });
  // Phrases : la personne d'Arko qui recouvre le plus la bouche de la phrase (copies de l'accroche exclues).
  let phrases = 0;
  let phrasesBonnes = 0;
  const parPersonne: Record<Pers, { n: number; bonnes: number }> = { R: { n: 0, bonnes: 0 }, G: { n: 0, bonnes: 0 } };
  for (const ph of v.phrases) {
    if (ph.accroche) continue;
    let cR = 0;
    let cG = 0;
    for (const [a, b] of ph.bouche) {
      const [k0, k1] = g.cases(a, b);
      for (let k = k0; k < k1; k++) {
        cR += arko.R[k]!;
        cG += arko.G[k]!;
      }
    }
    phrases++;
    parPersonne[ph.p].n++;
    const bonne = ph.p === 'R' ? cR > cG : cG > cR;
    if (bonne) {
      phrasesBonnes++;
      parPersonne[ph.p].bonnes++;
    }
  }
  const pp = part(phrasesBonnes, phrases);
  ajouter(c, {
    groupe: 'voix', cle: 'voix.phrases', nom: 'Phrases bien attribuées (majorité)', valeur: pp, texte: `${pc(pp)} (${phrasesBonnes}/${phrases})`,
    cible: `≥ ${pc(CIBLES.voixPhrases)}`, ok: pp === null ? null : pp >= CIBLES.voixPhrases,
    detail: `Romain ${parPersonne.R.bonnes}/${parPersonne.R.n} · Guts ${parPersonne.G.bonnes}/${parPersonne.G.n}`,
  });
  // Niveaux : ceux d'Arko, et ceux de la vérité mesurés sur activite.json (médiane sur la parole de chacun seul).
  const verite: Partial<Record<Pers, number | null>> = {};
  if (c.act) {
    for (const P of PERSONNES) {
      const autreP = P === 'R' ? c.parole.G : c.parole.R;
      const vals: number[] = [];
      for (let k = 0; k < g.n; k += 2) {
        if (!c.parole[P][k] || autreP[k]) continue;
        const j = Math.floor(((k + 0.5) * g.pas) / c.act.pas);
        const d = c.act.db[j];
        if (typeof d === 'number' && Number.isFinite(d)) vals.push(d);
      }
      verite[P] = mediane(vals);
    }
  }
  const txt = liste.length
    ? liste.map((x) => `${x.id} ${Number.isFinite(x.niveauDb) ? `${nb(x.niveauDb, 0)} dB` : '?'} → ${corr.get(x.id) ?? '—'}`).join(' ; ')
    : 'aucune';
  const cibleNiv = c.act ? `vérité : R ${verite.R != null ? nb(verite.R, 0) : '?'} dB, G ${verite.G != null ? nb(verite.G, 0) : '?'} dB` : 'R ≈ −40 dB, G ≈ −25 dB';
  ajouter(c, { groupe: 'voix', cle: 'voix.niveaux', nom: 'Niveau de chaque voix (→ personne)', valeur: txt, texte: txt, cible: cibleNiv, ok: null, indicatif: true });
  c.details.voix = {
    origineTours: origine,
    correspondance: Object.fromEntries(corr),
    voix: liste,
    niveauxVerite: verite,
    tempsParole: { total: r3(total * g.pas), bon: r3(bon * g.pas), sansVoix: r3(rien * g.pas), mauvaise: r3(faux * g.pas) },
  };
}

/** Lignes affichées par Arko (sous-titres placés par le compilateur), en temps source, séparées punchlines / voix. */
function lignesArko(c: Contexte): { punch: Iv[]; voix: Iv[]; toutes: Iv[]; nbPunch: number; nbVoix: number; origine: string } {
  const st = c.e.recette.sousTitres;
  const modePunch = st?.mode === 'punchlines';
  const lignes = c.m.scenario?.sousTitres?.lignes ?? [];
  const punch: Iv[] = [];
  const voix: Iv[] = [];
  let nbPunch = 0;
  let nbVoix = 0;
  let origine = 'lignes placées par Arko';
  for (const l of lignes) {
    const src = versSource(c.m, [l.t0, l.t1]);
    if (modePunch && l.style !== SOUS_TITRES_VOIX.style) {
      punch.push(...src);
      nbPunch++;
    } else {
      voix.push(...src);
      nbVoix++;
    }
  }
  // Mots pas encore transcrits (« auto ») : les plages des punchlines seules.
  if (lignes.length === 0 && modePunch && st?.punchlines?.length) {
    for (const p of st.punchlines) punch.push([p.ts, p.fin]);
    nbPunch = st.punchlines.length;
    origine = 'plages des punchlines (pas de mots)';
  }
  return { punch: fusionner(punch), voix: fusionner(voix), toutes: fusionner([...punch, ...voix]), nbPunch, nbVoix, origine };
}

function mesurerScenes(c: Contexte, lignes: ReturnType<typeof lignesArko>) {
  const { v, m, R } = c;
  const gardeSeq = plagesGardees(m, m.nbAccroche);
  const gardeTout = plagesGardees(m, 0);
  const parSequence = v.sequences.map((s) => ({ id: s.id, duree: s.duree, garde: r3(recouvrementTotal(gardeSeq, s.plages) / s.duree) }));
  const trouvees = parSequence.filter((s) => s.garde >= R.sequenceTrouvee).length;
  const ps = part(trouvees, parSequence.length);
  ajouter(c, {
    groupe: 'scenes', cle: 'scenes.sequences', nom: `Séquences retrouvées (≥ ${pc(R.sequenceTrouvee)} gardé)`, valeur: ps,
    texte: `${trouvees}/${parSequence.length} (${pc(ps)})`, cible: `≥ ${pc(CIBLES.sequences)}`, ok: ps === null ? null : ps >= CIBLES.sequences,
    detail: `temps de la vérité gardé : ${pc(part(recouvrementTotal(gardeSeq, v.sequences.flatMap((s) => s.plages)), v.sequences.reduce((x, s) => x + s.duree, 0)))}`,
  });
  const punchs = v.punchlines.filter((p) => !p.accroche);
  let gardees = 0;
  let recouvertes = 0;
  const manquees: number[] = [];
  for (const p of punchs) {
    const L = longueur(p.source);
    if (L <= 0) continue;
    if (recouvrementTotal(gardeTout, p.source) >= R.punchlineGardee * L) {
      gardees++;
      if (recouvrementTotal(lignes.punch, p.source) >= R.punchlineRecouverte * L) recouvertes++;
      else manquees.push(p.i);
    }
  }
  const pg = part(gardees, punchs.length);
  ajouter(c, {
    groupe: 'scenes', cle: 'scenes.punchlines', nom: `Punchlines de la vérité gardées (≥ ${pc(R.punchlineGardee)})`, valeur: pg,
    texte: `${gardees}/${punchs.length} (${pc(pg)})`, cible: `≥ ${pc(CIBLES.punchlinesGardees)}`, ok: pg === null ? null : pg >= CIBLES.punchlinesGardees,
  });
  const pa = part(recouvertes, gardees);
  ajouter(c, {
    groupe: 'scenes', cle: 'scenes.punchlinesArko', nom: '… et une punchline d’Arko dessus', valeur: pa, texte: `${recouvertes}/${gardees} (${pc(pa)})`,
    cible: `≥ ${pc(CIBLES.punchlinesArko)} (banc)`, ok: pa === null ? null : pa >= CIBLES.punchlinesArko,
    detail: `${lignes.nbPunch} punchlines d’Arko (${nb((lignes.nbPunch / Math.max(1, m.duree)) * 60, 1)} / min ; vérité ${nb((v.punchlines.length / v.duree) * 60, 1)} / min) · ${lignes.origine}`,
  });
  c.details.scenes = { parSequence, punchlinesSansPunchArko: manquees };
}

/** Coupes et silences d'un montage, avec les mots / l'activité donnés (pur). Sert pour Arko ET pour la vérité. */
export interface Coupes {
  bords: Bord[];
  /** Bords dans la partie transcrite (les seuls où « en plein mot » se mesure). */
  bordsTranscrits: number;
  enMot: Bord[] | null;
  forts: { b: Bord; avant: number; apres: number; seuil: number }[] | null;
  silences: Iv[] | null;
  silencesBruts: Iv[] | null;
  /** Part du montage où l'on sait s'il y a du son (mots transcrits ou activité). */
  connu: number;
}

export function coupesDe(m: Montage, g: Grille, R: Reglages, mots: Iv[] | null, plagesMots: Iv[] | null | undefined, act: Activite | null, bruit: Float32Array | null): Coupes {
  const bords = bordsDeCoupe(m);
  // Partie transcrite de la source (mots-arko.json → plages) : hors d'elle, on ne sait pas s'il y a des mots.
  const transcrit = plagesMots ? g.marquer(plagesMots) : new Uint8Array(g.n).fill(1);
  const bordsT = bords.filter((b) => transcrit[g.k(b.ts)]);
  const enMot = mots ? bordsT.filter((b) => dansUnMot(mots, b.ts, R.toleranceMot)) : null;
  let forts: Coupes['forts'] = null;
  if (act && bruit) {
    forts = [];
    for (const b of bords) {
      const n = voixDesDeuxCotes(act, bruit, b.ts, R.fenetreVoix, R.margeVoixDb, R.voixForteMinDb);
      if (n.forte) forts.push({ b, ...n });
    }
  }
  // Silences du montage (temps de sortie) : ni mot (avec les marges de la DA), ni voix / son (activité).
  // Sans mots connus ni activité à un endroit, on ne sait pas : ce n'est pas compté comme un silence.
  let silences: Iv[] | null = null;
  let silencesBruts: Iv[] | null = null;
  let connu = 0;
  if (mots || act) {
    const marges = mots ? g.marquer(mots.map(([a, b]): Iv => [a - R.margeAvantMot, b + R.margeApresMot])) : new Uint8Array(g.n);
    const bruts = mots ? g.marquer(mots) : new Uint8Array(g.n);
    const forte = act && bruit ? activiteForte(act, bruit, g, R.margeVoixDb, R.actifMinDb) : new Uint8Array(g.n);
    const n = Math.ceil(m.duree / R.pas);
    const courir = (occupe: Uint8Array): Iv[] => {
      const res: Iv[] = [];
      let debut: number | null = null;
      let connus = 0;
      for (let i = 0; i <= n; i++) {
        const t = (i + 0.5) * R.pas;
        let calme = false;
        if (i < n) {
          const ts = sourceA(m, t);
          if (ts === null) {
            // Élément inséré ou arrêt sur image : aucun son de la source.
            connus++;
            calme = true;
          } else {
            const k = g.k(ts);
            const motConnu = mots !== null && transcrit[k] === 1;
            if (motConnu || act) {
              connus++;
              calme = (!motConnu || !occupe[k]) && (!act || !forte[k]);
            }
          }
        }
        if (calme && debut === null) debut = i * R.pas;
        if (!calme && debut !== null) {
          const fin = Math.min(m.duree, i * R.pas);
          if (fin - debut > R.silenceMin + 1e-9) res.push([r3(debut), r3(fin)]);
          debut = null;
        }
      }
      connu = connus / Math.max(1, n);
      return res;
    };
    silencesBruts = courir(bruts);
    silences = courir(marges);
  }
  return { bords, bordsTranscrits: bordsT.length, enMot, forts, silences, silencesBruts, connu };
}

/** Bords de coupe en pleine parole : VAD ≥ 0,5 juste avant ET juste après le bord (± 60 ms), hors accroche. */
export function bordsEnPleineParole(m: Montage, vad: { pas: number; p: Uint8Array }, seuil = 0.5, ecart = 0.06): { n: number; total: number } {
  const p = (t: number) => {
    const k = Math.floor(t / vad.pas);
    return k >= 0 && k < vad.p.length ? vad.p[k]! / 255 : 0;
  };
  const bords = bordsDeCoupe(m).filter((b) => b.plan >= m.nbAccroche);
  return { n: bords.filter((b) => p(b.ts - ecart) >= seuil && p(b.ts + ecart) >= seuil).length, total: bords.length };
}

function mesurerCuts(c: Contexte) {
  const { m, R, g, mots, act, bruit } = c;
  const x = coupesDe(m, g, R, mots, c.e.plagesMots, act, bruit);
  // La vérité mesurée dans les MÊMES conditions (mêmes mots, même activité) : sa valeur sert de référence quand la
  // cible du BRIEF (0) n'est pas atteignable par la vérité elle-même à cause des mesures (mots de Whisper mal placés,
  // sons du jeu dans la bande de la voix).
  const mv = lireMontage(recetteParfaite(c.v).recette);
  const ref = coupesDe(mv, g, R, mots, c.e.plagesMots, act, bruit);
  const minutes = m.duree / 60;
  const minutesV = mv.duree / 60;
  // En plein mot. Décision de l'orchestrateur (7/11 au soir) : la CIBLE se mesure sur les mots NETTOYÉS
  // (nettoyerMotsV4, avec la VAD) ET la parole de la VAD (aucun bord en pleine parole de plus que la vérité) ; les
  // mots BRUTS de Whisper (étirés sur les silences : 18 % des coupes de la main y tombent) restent indicatifs.
  const pm = x.enMot ? part(x.enMot.length, x.bordsTranscrits) : null;
  const pmV = ref.enMot ? part(ref.enMot.length, ref.bordsTranscrits) : null;
  const tol = Math.round(R.toleranceMot * 1000);
  const nett = c.e.motsNettoyes && c.e.motsNettoyes.length > 0 ? c.e.motsNettoyes : null;
  const brut: Mesure = {
    groupe: 'cuts', cle: nett ? 'cuts.pleinMotBrut' : 'cuts.pleinMot', nom: nett ? `… sur les mots BRUTS de Whisper (${tol} ms, indicatif)` : `Coupes en plein mot (Whisper, ${tol} ms)`,
    valeur: x.enMot ? x.enMot.length : null,
    texte: x.enMot ? `${x.enMot.length} / ${x.bordsTranscrits} bords (${pc(pm)})` : 'pas de mots',
    cible: nett ? `indicatif (vérité ${pc(pmV)})` : x.enMot ? `0, ou ≤ vérité ${pc(pmV)}` : '0',
    ok: nett ? null : x.enMot ? x.enMot.length === 0 || (pm ?? 1) <= (pmV ?? 0) + 1e-9 : null,
    detail: `${c.e.origineMots ? `mots : ${c.e.origineMots}` : 'mots donnés'}${x.bordsTranscrits < x.bords.length ? ` · ${x.bordsTranscrits} bords sur ${x.bords.length} dans la partie transcrite` : ''} · vérité ${ref.enMot?.length ?? '—'} / ${ref.bordsTranscrits}`,
  };
  if (nett) {
    const xn = coupesDe(m, g, R, nett, c.e.plagesMots, null, null);
    const rn = coupesDe(mv, g, R, nett, c.e.plagesMots, null, null);
    const pn = part(xn.enMot!.length, xn.bordsTranscrits);
    const pnV = part(rn.enMot!.length, rn.bordsTranscrits);
    const okMots = xn.enMot!.length === 0 || (pn ?? 1) <= (pnV ?? 0) + 1e-9;
    const pleine = c.e.vad ? { a: bordsEnPleineParole(m, c.e.vad), v: bordsEnPleineParole(mv, c.e.vad) } : null;
    const okVad = !pleine || part(pleine.a.n, pleine.a.total)! <= (part(pleine.v.n, pleine.v.total) ?? 0) + 1e-9;
    ajouter(c, {
      groupe: 'cuts', cle: 'cuts.pleinMot', nom: `Coupes en plein mot (mots nettoyés + VAD, ${tol} ms)`,
      valeur: xn.enMot!.length,
      texte: `${xn.enMot!.length} / ${xn.bordsTranscrits} bords (${pc(pn)})${pleine ? ` ; pleine parole ${pc(part(pleine.a.n, pleine.a.total))}` : ''}`,
      cible: `≤ vérité ${pc(pnV)}${pleine ? ` et ${pc(part(pleine.v.n, pleine.v.total))}` : ''}`,
      ok: okMots && okVad,
      detail: `mots : ${c.e.origineMotsNettoyes ?? 'nettoyés'} · vérité ${rn.enMot!.length} / ${rn.bordsTranscrits}${pleine ? ` · pleine parole (VAD ≥ 0,5 des 2 côtés, ± 60 ms) : Arko ${pleine.a.n} / ${pleine.a.total}, vérité ${pleine.v.n} / ${pleine.v.total}` : ' · pas de VAD de référence'}`,
    });
  }
  ajouter(c, brut);
  const pf = x.forts ? part(x.forts.length, x.bords.length) : null;
  const pfV = ref.forts ? part(ref.forts.length, ref.bords.length) : null;
  ajouter(c, {
    groupe: 'cuts', cle: 'cuts.voixForte', nom: `Coupes pendant la voix forte (2 côtés, ≥ ${R.voixForteMinDb} dB)`,
    valeur: pf, texte: x.forts ? `${x.forts.length} / ${x.bords.length} bords (${pc(pf)})` : 'pas d’activite.json',
    cible: x.forts ? `≤ vérité ${pc(pfV)}` : '≤ vérité', ok: pf === null ? null : pf <= (pfV ?? 0) + 1e-9,
  });
  // Silences : temps mort par minute de montage (les longs blancs pèsent plus que les petites pauses) et blancs > 2 s,
  // comparés à la vérité mesurée de la même façon.
  const parMin = (l: Iv[] | null, mn: number) => (l ? longueur(l) / Math.max(1e-9, mn) : null);
  const sm = parMin(x.silences, minutes);
  const smV = parMin(ref.silences, minutesV);
  const longs = (l: Iv[] | null, d: number) => (l ? l.filter(([a, b]) => b - a > d).length : 0);
  const l2 = longs(x.silences, 2) / Math.max(1e-9, minutes);
  const l2V = longs(ref.silences, 2) / Math.max(1e-9, minutesV);
  ajouter(c, {
    groupe: 'cuts', cle: 'cuts.silences', nom: `Silences > ${nb(R.silenceMin, 1)} s (nombre, temps mort)`, valeur: x.silences ? r3(sm ?? 0) : null,
    texte: x.silences ? `${x.silences.length} · ${nb(sm ?? 0, 1)} s / min · ${longs(x.silences, 2)} > 2 s` : 'pas de mots ni d’activité',
    cible: x.silences ? `0, ou ≤ vérité (${nb(smV ?? 0, 1)} s / min · ${longs(ref.silences, 2)} > 2 s)` : '0',
    ok: x.silences ? x.silences.length === 0 || ((sm ?? 0) <= (smV ?? 0) + 1e-9 && l2 <= l2V + 1e-9) : null,
    detail: `> 1 s : ${longs(x.silences, 1)} (vérité ${longs(ref.silences, 1)}) · total ${nb(longueur(x.silences ?? []), 1)} s (vérité ${ref.silences?.length ?? '—'} silences, ${nb(longueur(ref.silences ?? []), 1)} s) · ${mots ? 'mots' : 'sans mots'} + ${act ? 'activité' : 'sans activité'} · sans les marges de la DA : ${x.silencesBruts ? `${x.silencesBruts.length} (${nb(longueur(x.silencesBruts), 1)} s)` : '—'}`,
  });
  if (x.silences && x.connu < 0.999) c.avert.push(`Silences mesurés sur ${pc(x.connu)} du montage seulement (pas de mots transcrits ni d'activité ailleurs).`);
  const plans = m.plans.filter((p) => p.video);
  const durees = plans.map((p) => p.t1 - p.t0);
  const moy = durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : 0;
  ajouter(c, {
    groupe: 'cuts', cle: 'cuts.planMoyen', nom: 'Durée moyenne d’un plan', valeur: r3(moy), texte: `${nb(moy, 2)} s (${plans.length} plans)`,
    cible: `vérité ${nb(c.v.duree / c.v.morceaux.length, 2)} s (${c.v.morceaux.length})`, ok: null, indicatif: true,
  });
  const courts = durees.filter((d) => d < R.planCourt - 1e-9).length;
  ajouter(c, { groupe: 'cuts', cle: 'cuts.plansCourts', nom: `Plans < ${nb(R.planCourt, 2)} s`, valeur: courts, texte: String(courts), cible: '0', ok: courts === 0 });
  c.details.cuts = {
    bords: x.bords.length,
    enPleinMot: (x.enMot ?? []).slice(0, 40).map((b) => ({ sortie: r3(b.t), source: r3(b.ts), cote: b.cote })),
    voixForte: (x.forts ?? []).slice(0, 40).map((f) => ({ sortie: r3(f.b.t), source: r3(f.b.ts), cote: f.b.cote, avant: r3(f.avant), apres: r3(f.apres), seuil: r3(f.seuil) })),
    silences: x.silences?.slice(0, 60) ?? null,
    silencesBruts: x.silencesBruts ? { nb: x.silencesBruts.length, duree: r3(longueur(x.silencesBruts)) } : null,
    verite: { enPleinMot: ref.enMot?.length ?? null, bordsTranscrits: ref.bordsTranscrits, voixForte: ref.forts?.length ?? null, bords: ref.bords.length, silences: ref.silences?.length ?? null },
  };
}

function mesurerMusique(c: Contexte) {
  const { e, m } = c;
  const r = e.recette;
  const mus = r.musique;
  const fin = m.duree;
  const ivs: Iv[] = [];
  (mus?.morceaux ?? []).forEach((x, k, l) => {
    let t1 = x.fin ?? l[k + 1]?.t ?? fin;
    if (x.boucle === false) {
      const d = r.sources.find((s) => s.id === x.src)?.duree;
      if (d && d > 0) t1 = Math.min(t1, x.t + d - (x.debut ?? 0));
    }
    ivs.push([Math.max(0, x.t), Math.min(fin, t1)]);
  });
  const f = fusionner(ivs);
  const apres = Math.max(0, fin - m.finAccroche);
  const couvert = recouvrementTotal(f, [[m.finAccroche, fin]]);
  const pm = part(couvert, apres);
  ajouter(c, {
    groupe: 'musique', cle: 'musique.presence', nom: 'Musique de fond (hors accroche)', valeur: pm ?? 0,
    texte: mus ? `${pc(pm)} (${mus.morceaux.length} morceaux)` : 'aucune', cible: `≥ ${pc(CIBLES.musiquePresence)}`, ok: (pm ?? 0) >= CIBLES.musiquePresence,
    detail: `accroche ${nb(m.finAccroche, 1)} s : musique sur ${pc(part(recouvrementTotal(f, [[0, m.finAccroche]]), m.finAccroche))} (vérité : aucune)`,
  });
  const baisse = !!mus && mus.baisse !== false;
  const reglagesOk = BAISSE.seuil === 0.03 && BAISSE.ratio === 6 && BAISSE.attaque === 0.02 && BAISSE.relache === 0.4;
  ajouter(c, {
    groupe: 'musique', cle: 'musique.baisse', nom: 'Baisse quand on parle', valeur: baisse,
    texte: mus ? `${baisse ? 'oui' : 'non'} (seuil ${BAISSE.seuil}, ratio ${BAISSE.ratio}, ${BAISSE.attaque * 1000} / ${BAISSE.relache * 1000} ms)` : '—',
    cible: 'oui (0,03 · 6 · 20 / 400 ms)', ok: baisse && reglagesOk,
  });
  const vol = mus ? (mus.vol ?? MUSIQUE.vol) : null;
  const db = vol !== null && vol > 0 ? 20 * Math.log10(vol) : null;
  ajouter(c, {
    groupe: 'musique', cle: 'musique.niveau', nom: 'Niveau de la musique', valeur: db === null ? null : r3(db), texte: db === null ? '—' : `${nb(db, 1)} dB`,
    cible: `${CIBLES.musiqueDb.vise} ± ${nb(CIBLES.musiqueDb.ecart, 1)} dB`, ok: db === null ? false : Math.abs(db - CIBLES.musiqueDb.vise) <= CIBLES.musiqueDb.ecart,
  });
  const vf = r.volumeFinal;
  ajouter(c, {
    groupe: 'musique', cle: 'musique.lufs', nom: 'Volume final demandé', valeur: vf?.lufs ?? null, texte: vf ? `${vf.lufs} LUFS, crête ${vf.crete} dBTP` : 'aucun',
    cible: `${CIBLES.lufs} LUFS`, ok: !!vf && Math.abs(vf.lufs - CIBLES.lufs) < 0.05,
  });
}

function mesurerDuree(c: Contexte) {
  const r = c.e.recette;
  const d = c.m.duree + (r.intro?.dur ?? 0) + (r.outro?.dur ?? 0);
  const partielle = !!c.e.plage;
  ajouter(c, {
    groupe: 'duree', cle: 'duree.totale', nom: 'Durée du montage', valeur: r3(d), texte: minSec(d), cible: partielle ? 'indicatif (partie de la session)' : '15 à 20 min',
    ok: partielle ? null : d >= CIBLES.duree.min && d <= CIBLES.duree.max, detail: `vérité ${minSec(c.v.duree)}`,
    ...(partielle ? { indicatif: true } : {}),
  });
}

/** Émotion de la vérité (indice dans la liste des émotions) par case source et par personne ; −1 = aucune. */
function grillesEmotions(v: Verite, g: Grille): { emo: Record<Pers, Int16Array>; noms: string[] } {
  const noms: string[] = [];
  const emo: Record<Pers, Int16Array> = { R: new Int16Array(g.n).fill(-1), G: new Int16Array(g.n).fill(-1) };
  // Les phrases de l'accroche sont des copies : elles ne remplissent que les cases encore vides.
  for (const passe of [false, true]) {
    for (const ph of v.phrases) {
      if (ph.accroche !== passe) continue;
      let i = noms.indexOf(ph.emo);
      if (i < 0) i = noms.push(ph.emo) - 1;
      for (const [a, b] of ph.montre) {
        const [k0, k1] = g.cases(a, b);
        for (let k = k0; k < k1; k++) if (!passe || emo[ph.p][k] === -1) emo[ph.p][k] = i;
      }
    }
  }
  return { emo, noms };
}

function mesurerPersos(c: Contexte, corr: Map<string, Pers | null>) {
  const { e, m, g, R } = c;
  const r = e.recette;
  const sc = m.scenario;
  const actifs = !!r.avatars && !!r.personnes?.length && !!r.paroles?.length && !!sc;
  let places: ReturnType<typeof placerAvatars> = [];
  if (actifs) {
    try {
      places = placerAvatars(r, sc!);
    } catch (err) {
      c.avert.push(`Avatars : placement impossible (${String(err)})`);
    }
  }
  const { emo: emoV, noms } = grillesEmotions(c.v, g);
  let den = 0;
  let bon = 0;
  let parole = 0;
  let mauvais = 0;
  let montres = 0;
  let sansParole = 0;
  let emoDen = 0;
  let emoFamille = 0;
  let emoExacte = 0;
  const n = Math.ceil(m.duree / R.pas);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * R.pas;
    // Élément inséré ou arrêt sur image : pas de vérité à comparer (et aucun avatar sur un élément inséré).
    const ts = sourceA(m, t);
    if (ts === null || !planA(m, t)?.video) continue;
    const k = g.k(ts);
    // Seulement là où la vérité dit qui parle (la source qu'elle a gardée).
    if (!c.connu[k]) continue;
    const vis = actifs && places.length > 0 ? visibles(r, places, t, sc!) : [];
    const T: Record<Pers, boolean> = { R: !!c.parole.R[k], G: !!c.parole.G[k] };
    const S: Record<Pers, boolean> = { R: !!c.montre.R[k], G: !!c.montre.G[k] };
    const D = new Map<Pers | 'X', string>();
    for (const x of vis) {
      const P = corr.get(x.p) ?? 'X';
      if (!D.has(P)) D.set(P, x.emo);
    }
    if (D.size > 0) {
      montres++;
      if (!T.R && !T.G && !S.R && !S.G) sansParole++;
    }
    if (!T.R && !T.G) continue;
    parole++;
    let faux = false;
    for (const [P] of D) if (P === 'X' || !S[P]) faux = true;
    if (faux) mauvais++;
    for (const P of PERSONNES) {
      if (!T[P]) continue;
      den++;
      const em = D.get(P);
      if (em === undefined) continue;
      bon++;
      const iv = emoV[P][k]!;
      if (iv >= 0) {
        emoDen++;
        if (familleDe(em) === familleDe(noms[iv])) emoFamille++;
        if (em === noms[iv]) emoExacte++;
      }
    }
  }
  const pb = part(bon, den);
  const pm = part(mauvais, parole);
  ajouter(c, {
    groupe: 'persos', cle: 'persos.bon', nom: 'Perso montré quand la bonne personne parle', valeur: actifs ? pb : 0, texte: actifs ? pc(pb) : 'aucun avatar',
    cible: `≥ ${pc(CIBLES.persosBon)} (banc)`, ok: !actifs ? false : pb === null ? null : pb >= CIBLES.persosBon,
    detail: `sur ${nb(den * R.pas, 0)} s de parole de la vérité gardées dans le montage`,
  });
  ajouter(c, {
    groupe: 'persos', cle: 'persos.mauvais', nom: 'Mauvais perso montré pendant la parole', valeur: actifs ? pm : null, texte: actifs ? pc(pm) : '—',
    cible: `≤ ${pc(CIBLES.persosMauvais)} (banc)`, ok: actifs && pm !== null ? pm <= CIBLES.persosMauvais : null,
    detail: `perso montré sans que personne ne parle : ${pc(part(sansParole, montres))} du temps où un perso est montré (dans la source gardée par la vérité)`,
  });
  const pe = part(emoFamille, emoDen);
  ajouter(c, {
    groupe: 'persos', cle: 'persos.emotions', nom: 'Émotion de la même famille (indicatif)', valeur: pe, texte: actifs ? `${pc(pe)} (exacte ${pc(part(emoExacte, emoDen))})` : '—',
    cible: 'indicatif', ok: null, indicatif: true,
  });
  c.details.persos = { avatars: actifs, placements: places.length, tempsParoleGarde: r3(den * R.pas) };
}

/** Avatars visibles au temps de sortie t (le code d'Arko lui-même). */
function visibles(r: Recette, places: ReturnType<typeof placerAvatars>, t: number, sc: NonNullable<Montage['scenario']>) {
  try {
    return avatarsAuTemps(r, places, t, sc.gab, undefined, null).filter((x) => x.echelle > 0);
  } catch {
    return [];
  }
}

function mesurerSousTitres(c: Contexte, corr: Map<string, Pers | null>, lignes: ReturnType<typeof lignesArko>) {
  const { e, v, R } = c;
  const pour = e.recette.sousTitres?.pour;
  const P = pour ? (corr.get(pour) ?? null) : null;
  ajouter(c, {
    groupe: 'sousTitres', cle: 'sousTitres.pour', nom: 'Sous-titres de la voix faible pour', valeur: P ?? null,
    texte: pour ? `${P === 'R' ? 'Romain' : P === 'G' ? 'Guts' : '?'} (${pour})` : 'personne', cible: 'Romain (R)', ok: P === 'R',
  });
  const sous = v.sousTitres.filter((x) => !x.accroche);
  let rec = 0;
  let recVoix = 0;
  for (const x of sous) {
    const L = longueur(x.source);
    if (L <= 0) continue;
    if (recouvrementTotal(lignes.toutes, x.source) >= R.sousTitreRecouvert * L) rec++;
    if (recouvrementTotal(lignes.voix, x.source) >= R.sousTitreRecouvert * L) recVoix++;
  }
  const pr = part(rec, sous.length);
  const surR = recouvrementTotal(fusionner(v.parole.R), lignes.voix);
  const surG = recouvrementTotal(fusionner(v.parole.G), lignes.voix);
  ajouter(c, {
    groupe: 'sousTitres', cle: 'sousTitres.recouverts', nom: 'Sous-titres de la vérité recouverts', valeur: pr, texte: `${rec}/${sous.length} (${pc(pr)})`,
    cible: `≥ ${pc(CIBLES.sousTitresRecouverts)} (banc)`, ok: pr === null ? null : pr >= CIBLES.sousTitresRecouverts,
    detail: `par les lignes « boîte » seules : ${pc(part(recVoix, sous.length))} · ${lignes.nbVoix} lignes boîte, sur la parole de R ${nb(surR, 0)} s / de G ${nb(surG, 0)} s`,
  });
}

/* ------------------------------------------------------------------ cœur pur */

/**
 * La vérité réduite à une partie [de, a] de la source (banc lancé avec --plage) : morceaux, phrases et textes qui y
 * tiennent, séquences gardées à moitié au moins dedans, parole coupée aux bords. Pure.
 */
export function restreindreVerite(v: Verite, [de, a]: Iv): Verite {
  const dans = (l: readonly Iv[]) => l.length > 0 && l.every(([x, y]) => x >= de - 1e-6 && y <= a + 1e-6);
  const couper = (l: readonly Iv[]) => intersection(fusionner(l), [[de, a]]);
  const morceaux = v.morceaux.filter((m) => dans([[m.de, m.a]]));
  const sequences = v.sequences
    .map((s) => ({ ...s, plages: couper(s.plages) }))
    .filter((s) => longueur(s.plages) >= 0.5 * s.duree)
    .map((s) => ({ ...s, duree: longueur(s.plages) }));
  const accroche = v.accroche && dans(v.accroche.plages) ? { ...v.accroche, morceaux: v.accroche.morceaux.map((_, k) => k) } : null;
  return {
    ...v,
    duree: morceaux.reduce((x, m) => x + (m.t1 - m.t0), 0),
    accroche,
    sequences,
    morceaux: accroche ? morceaux : morceaux.filter((m) => m.sequence !== 'accroche'),
    parole: { R: couper(v.parole.R), G: couper(v.parole.G) },
    persoMontre: { R: couper(v.persoMontre.R), G: couper(v.persoMontre.G) },
    phrases: v.phrases.filter((x) => dans(x.bouche)),
    punchlines: v.punchlines.filter((x) => dans(x.source)),
    sousTitres: v.sousTitres.filter((x) => dans(x.source)),
  };
}

/** Mesure une recette d'Arko contre la vérité. PURE : toutes les données sont dans `e`. */
export function mesurer(e: Entrees): Resultats {
  const R: Reglages = { ...REGLAGES, ...e.reglages };
  const v = e.plage ? restreindreVerite(e.verite, e.plage) : e.verite;
  const m = lireMontage(e.recette, e.nbAccroche);
  const mots = e.mots && e.mots.length > 0 ? e.mots : null;
  const act = e.activite && e.activite.db.length > 0 ? e.activite : null;
  // Fin de la grille source : tout ce qui est lu doit y tenir (boucles, pas de « ... » sur de longues listes).
  let finSource = Math.max(mots ? mots[mots.length - 1]![1] : 0, act ? act.db.length * act.pas : 0);
  for (const x of v.morceaux) finSource = Math.max(finSource, x.a);
  for (const p of m.plans) finSource = Math.max(finSource, p.a);
  for (const t of e.analyse?.voix?.tours ?? []) finSource = Math.max(finSource, t.fin);
  for (const t of e.recette.paroles ?? []) finSource = Math.max(finSource, t.fin);
  for (const w of mots ?? []) finSource = Math.max(finSource, w[1]);
  const g = new Grille(R.pas, finSource + 1);
  const c: Contexte = {
    e, R, v, m, g, mots, act,
    bruit: act ? bruitDeFond(act, R.fenetreBruit, R.centileBruit) : null,
    parole: { R: g.marquer(v.parole.R), G: g.marquer(v.parole.G) },
    montre: { R: g.marquer(v.persoMontre.R), G: g.marquer(v.persoMontre.G) },
    connu: g.marquer(v.morceaux.map((x): Iv => [x.de, x.a])),
    mesures: [],
    details: { accroche: { plans: m.nbAccroche, fin: r3(m.finAccroche) }, compile: !!m.scenario },
    avert: [...(e.analyse?.avertissements ?? []).map((x) => `analyse : ${x}`)],
  };
  if (e.plage) c.avert.push(`Chaîne lancée sur une partie de la session (${e.plage[0]}–${e.plage[1]} s) : vérité réduite à cette partie (${v.sequences.length} séquences, ${v.punchlines.length} punchlines), durée indicative.`);
  if (!m.scenario) c.avert.push('Recette non compilée par Arko : plans recalculés à la main, ni sous-titres ni avatars mesurés.');
  if (m.nbAccroche === 0) c.avert.push('Pas d’accroche trouvée (aucun plan d’entrée « glitch » au début).');
  if (!mots) c.avert.push('Pas de mots de Whisper : coupes en plein mot non mesurées.');
  if (!act) c.avert.push('Pas d’activite.json : coupes pendant la voix forte non mesurées, silences sans le niveau de la voix.');
  const lignes = lignesArko(c);
  const corrRecette = correspondance(e.recette.paroles ?? [], v.parole);
  mesurerVoix(c);
  mesurerScenes(c, lignes);
  mesurerCuts(c);
  mesurerMusique(c);
  mesurerDuree(c);
  mesurerPersos(c, corrRecette);
  mesurerSousTitres(c, corrRecette, lignes);
  c.details.correspondanceRecette = Object.fromEntries(corrRecette);
  // Score : part des cibles atteintes (une cible pas mesurable compte comme manquée ; les mesures indicatives n'en ont pas).
  const avecCible = c.mesures.filter((x) => !x.indicatif);
  const mesurees = avecCible.filter((x) => x.ok !== null);
  const atteintes = mesurees.filter((x) => x.ok).length;
  return {
    dossier: e.dossier ?? '',
    date: new Date().toISOString(),
    mesures: c.mesures,
    score: { atteintes, mesurees: mesurees.length, total: avecCible.length, part: r3(atteintes / Math.max(1, avecCible.length)) },
    details: c.details,
    avertissements: c.avert,
  };
}

/* ------------------------------------------------------------------ fichiers */

export interface OptionsDossier {
  /** Mots de Whisper (défaut : $BANC_CACHE/mots-arko.json, sinon analyse.json → mots). */
  mots?: string;
  /** Mots nettoyés de référence (défaut : $BANC_CACHE/mots-nettoyes-v4.json s'il existe). */
  motsNettoyes?: string;
  /** Niveau de la voix (défaut : <dossierSortie>/activite.json, sinon $BANC_CACHE/activite.json). */
  activite?: string;
  nbAccroche?: number;
  reglages?: Partial<Reglages>;
}

const CACHE = process.env.BANC_CACHE ?? '/home/claude/banc-cache';

/** Parties transcrites d'un fichier de mots ({ plages: [{ de, a }] }) ; null si le fichier ne le dit pas (tout). */
export function plagesTranscrites(brut: unknown): Iv[] | null {
  const pl = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as { plages?: unknown }).plages : undefined;
  if (!Array.isArray(pl)) return null;
  const res: Iv[] = [];
  for (const x of pl) {
    if (Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number') res.push([x[0], x[1]]);
    else if (x && typeof x === 'object' && typeof (x as { de?: unknown }).de === 'number' && typeof (x as { a?: unknown }).a === 'number') {
      res.push([(x as { de: number }).de, (x as { a: number }).a]);
    }
  }
  return fusionner(res);
}

function lireJson<T>(chemin: string): T {
  return JSON.parse(readFileSync(chemin, 'utf8')) as T;
}

/** Lit recette.json, analyse.json, activite.json de `dossierSortie` et verite.json de `dossierVerite`, puis mesure. */
export async function mesurerDossier(dossierSortie: string, dossierVerite: string, o: OptionsDossier = {}): Promise<Resultats> {
  const verite = lireJson<Verite>(join(dossierVerite, 'verite.json'));
  const recette = lireJson<Recette>(join(dossierSortie, 'recette.json'));
  const cheminAnalyse = join(dossierSortie, 'analyse.json');
  const analyse = existsSync(cheminAnalyse) ? lireJson<AnalyseBanc>(cheminAnalyse) : null;
  const avert: string[] = [];
  let activite: Activite | null = null;
  for (const ch of [o.activite, join(dossierSortie, 'activite.json'), join(CACHE, 'activite.json')]) {
    if (ch && existsSync(ch)) {
      activite = lireJson<Activite>(ch);
      break;
    }
  }
  let mots: Iv[] | null = null;
  let plagesMots: Iv[] | null = null;
  let origineMots: string | undefined;
  for (const ch of [o.mots, join(CACHE, 'mots-arko.json')]) {
    if (ch && existsSync(ch)) {
      const brut = lireJson<unknown>(ch);
      mots = intervallesMots(brut);
      plagesMots = plagesTranscrites(brut);
      origineMots = ch;
      break;
    }
  }
  if (!mots && analyse?.mots) {
    mots = intervallesMots(analyse.mots);
    origineMots = 'analyse.json (mots)';
    if (analyse.parole === 'voix') avert.push('Les « mots » de analyse.json sont des zones de voix (mode voix), pas des mots de Whisper.');
  }
  // Mots nettoyés de référence (cible « en plein mot ») et VAD de référence (toutes les trames).
  let motsNettoyes: Iv[] | null = null;
  const cheminNett = o.motsNettoyes ?? join(CACHE, 'mots-nettoyes-v4.json');
  if (existsSync(cheminNett)) motsNettoyes = intervallesMots(lireJson<{ mots: unknown }>(cheminNett).mots);
  let vad: Entrees['vad'] = null;
  const fv = join(CACHE, 'vad-v5-continu.u8');
  const mv = join(CACHE, 'vad-v5-continu.json');
  if (existsSync(fv) && existsSync(mv)) {
    const b = readFileSync(fv);
    vad = { pas: lireJson<{ pas: number }>(mv).pas, p: new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
  }
  // Partie de la session passée dans la chaîne (banc.json de banc-chaine : « plage »).
  let plage: Iv | null = null;
  const cheminBanc = join(dossierSortie, 'banc.json');
  if (existsSync(cheminBanc)) {
    const p = lireJson<{ plage?: { de: number; a: number } | null }>(cheminBanc).plage;
    if (p && typeof p.de === 'number' && typeof p.a === 'number') plage = [p.de, p.a];
  }
  const res = mesurer({
    verite, recette, analyse, activite, mots, plagesMots, plage, dossier: dossierSortie,
    ...(origineMots ? { origineMots } : {}),
    ...(motsNettoyes && motsNettoyes.length > 0 ? { motsNettoyes, origineMotsNettoyes: cheminNett, vad } : {}),
    ...(o.nbAccroche !== undefined ? { nbAccroche: o.nbAccroche } : {}),
    ...(o.reglages ? { reglages: o.reglages } : {}),
  });
  res.avertissements.unshift(...avert);
  return res;
}

/* ------------------------------------------------------------------ affichage */

const NOMS_GROUPES: Record<Mesure['groupe'], string> = {
  voix: 'Voix', scenes: 'Scènes', cuts: 'Cuts', musique: 'Musique', duree: 'Durée', persos: 'Persos', sousTitres: 'Sous-titres',
};

/** Tableau lisible : mesure, valeur, cible, OK / KO (et les détails utiles en dessous). */
export function afficher(r: Resultats): string {
  const lignes: string[][] = [['', 'Mesure', 'Valeur', 'Cible', '']];
  let groupe = '';
  for (const x of r.mesures) {
    const g = x.groupe !== groupe ? NOMS_GROUPES[x.groupe] : '';
    groupe = x.groupe;
    lignes.push([g, x.nom, x.texte, x.cible, x.ok === null ? '·' : x.ok ? 'OK' : 'KO']);
  }
  const largeurs = [0, 1, 2, 3, 4].map((k) => Math.min(k === 2 ? 46 : 60, Math.max(...lignes.map((l) => [...l[k]!].length))));
  const coupe = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);
  const pad = (s: string, n: number) => coupe(s, n) + ' '.repeat(Math.max(0, n - [...coupe(s, n)].length));
  const sortie: string[] = [];
  sortie.push(`Banc réel — ${r.dossier || '(en mémoire)'} — ${r.date}`);
  const trait = largeurs.map((n) => '─'.repeat(n)).join('─┼─');
  lignes.forEach((l, i) => {
    sortie.push(l.map((s, k) => pad(s, largeurs[k]!)).join(' │ '));
    if (i === 0) sortie.push(trait);
  });
  sortie.push(trait);
  sortie.push(`Score : ${r.score.atteintes} cibles atteintes sur ${r.score.total} (${pc(r.score.part)}) ; ${r.score.mesurees} mesurables ici.`);
  const avecDetail = r.mesures.filter((x) => x.detail);
  if (avecDetail.length) {
    sortie.push('Détails :');
    for (const x of avecDetail) sortie.push(`  - ${x.nom} : ${x.detail}`);
  }
  if (r.avertissements.length) {
    sortie.push('Avertissements :');
    for (const a of r.avertissements) sortie.push(`  ! ${a}`);
  }
  return sortie.join('\n');
}
