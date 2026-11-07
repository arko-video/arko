// Étape « séquences » de la chaîne v4 (dev-scenes), PURE : les HISTOIRES du Best-of et les passages pas retenus.
// 1. Histoires candidates (histoires.ts) autour de chaque moment fort (force ≥ 0,5, et les 3 meilleurs de chaque bloc)
//    et de chaque échange de parole : mise en place au début de l'échange, chute à la fin de la phrase après la
//    réaction, ≈ 60 s gardées (30 à 120 s de source), bornes dans les pauses.
// 2. Fusion (même histoire → la mieux notée ; voisines → une seule si ≤ 120 s), note brute SANS plafond, centile.
// 3. Choix réparti sur toute la session (repartition.ts) : blocs de 20 min de son actif, la moitié des places au
//    prorata de la parole des blocs, le reste aux meilleures notes, jusqu'à la durée visée (± 5 %, mesurée par
//    e.dureeDe = la même découpe que le montage). Départage : note brute, force du cœur… jamais l'ordre.
// Le derush d'avant (noterScenes / choisirBestOf / resserrer de derush.ts) ne change pas : il sert encore au monteur
// sans IA et aux étapes d'avant (express/etapes-anciennes.ts). Signature GELÉE (types-v4.ts). Contrat : §1.6.

import type { Mot, PassageNote, Sec } from '../../recette/types';
import { horodatage, motsDans, titreDe } from '../express/scenes';
import { motsDouteux } from '../moments/regles';
import { estAudible, niveauParole, PAROLE_AUDIBLE, tramesDeParole } from '../vad/audible';
import type { PlageTemps } from '../types';
import type { ChoixSequences, EntreeSequences, GenreMoment, MomentV4, SequenceV4 } from '../types-v4';
import {
  coeurs,
  debutPhrase,
  echanges,
  finPhrase,
  fusionnerHistoires,
  histoireAutour,
  meilleureDAbord,
  noterHistoire,
  paroleDans,
  paroles,
  plageEntre,
  REGLES_HISTOIRES,
  type Histoire,
} from './histoires';
import { blocsActifs, centiles, choisirHistoires, REGLES_CHOIX, type Blocs } from './repartition';

const arrondi1 = (x: number) => Math.round(x * 10) / 10;
const arrondi2 = (x: number) => Math.round(x * 100) / 100;

/** Paroles hors des passages muets (Whisper peut y inventer des mots). */
export function parolesActives(e: Pick<EntreeSequences, 'mots' | 'parole' | 'moments' | 'signaux'>): PlageTemps[] {
  const muets = e.signaux.muets;
  return paroles(e).filter((p) => !muets.some((m) => p.de >= m.de && p.a <= m.a));
}

/** e.dureeDe gardée en mémoire (les mêmes plages reviennent souvent quand on complète et fusionne les histoires). */
export function avecMemoire(e: EntreeSequences): EntreeSequences {
  const memo = new Map<string, Sec>();
  const dureeDe = (plages: readonly PlageTemps[]) => {
    const cle = plages.map((p) => `${p.de}|${p.a}`).join(';');
    let d = memo.get(cle);
    if (d === undefined) {
      d = e.dureeDe(plages);
      memo.set(cle, d);
    }
    return d;
  };
  return { ...e, dureeDe };
}

const NOMS: Record<GenreMoment, [string, string]> = {
  fouRire: ['fou rire', 'fous rires'],
  rire: ['rire', 'rires'],
  cri: ['cri', 'cris'],
  phraseForte: ['phrase forte', 'phrases fortes'],
  exclamation: ['exclamation', 'exclamations'],
  juron: ['juron', 'jurons'],
  calmePuisPic: ['calme puis gros son', 'calmes puis gros sons'],
  sonFort: ['son fort', 'sons forts'],
  echanges: ['échanges rapides', 'échanges rapides'],
};
const ORDRE_GENRES: readonly GenreMoment[] = ['fouRire', 'rire', 'cri', 'echanges', 'phraseForte', 'exclamation', 'juron', 'calmePuisPic', 'sonFort'];

/** « Fou rire · 2 cris · 3 punchlines » (3 éléments au plus ; « De la parole » sinon). */
export function raisonHistoire(h: Pick<Histoire, 'moments' | 'punchlines' | 'echanges'>, moments: readonly MomentV4[]): string {
  const n = new Map<GenreMoment, number>();
  for (const i of h.moments) {
    const g = moments[i]?.genre;
    if (g) n.set(g, (n.get(g) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const g of ORDRE_GENRES) {
    const k = n.get(g) ?? 0;
    if (k > 0) parts.push(g === 'echanges' || k === 1 ? NOMS[g][0] : `${k} ${NOMS[g][1]}`);
  }
  if (h.echanges >= 2 && !n.has('echanges')) parts.push(NOMS.echanges[0]);
  if (h.punchlines > 0) parts.push(h.punchlines > 1 ? `${h.punchlines} punchlines` : '1 punchline');
  const texte = parts.slice(0, 3).join(' · ');
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : 'De la parole';
}

/** Une histoire vue comme une séquence de la revue (titre = meilleure punchline sans mot inventé, sinon « Partie n »). */
export function enSequence(h: Histoire, e: Pick<EntreeSequences, 'mots' | 'signaux' | 'moments'>, n: number, centile: number, bloc: number, garde: boolean): SequenceV4 {
  const ceux = motsDans(e.mots, h).filter((m) => m[0].trim());
  return {
    de: h.de,
    a: h.a,
    titre: titreDe(ceux, e.signaux, n, motsDouteux(ceux)),
    raison: raisonHistoire(h, e.moments).slice(0, 80),
    score: centile,
    garde,
    duree: arrondi1(h.garde),
    protegee: false,
    coeur: { de: arrondi2(h.coeur.de), a: arrondi2(h.coeur.a) },
    noteBrute: h.noteBrute,
    centile,
    bloc,
    moments: [...h.moments],
  };
}

/** Un passage pas retenu (Habiller → Couper → « Passages pas retenus »). */
function enPassage(s: SequenceV4, e: Pick<EntreeSequences, 'signaux'>): PassageNote {
  const titre = s.titre.startsWith('Partie ') ? `Passage à ${horodatage(s.de)}` : s.titre;
  return { de: s.de, a: s.a, note: s.centile, raison: s.raison, titre: titre.slice(0, 60), ...(e.signaux.src ? { src: e.signaux.src } : {}) };
}

/** Durée gardée visée pour une histoire : ≈ 60 s, moins si toute la vidéo doit être plus courte (TikTok, Short). */
function cibleHistoire(dureeVisee: Sec): Sec {
  const R = REGLES_HISTOIRES;
  return Math.max(R.garde.min, Math.min(R.garde.cible, dureeVisee));
}

/** Il faut au moins tant de mots écrits, pas inventés (boucles, piles, phrases toutes faites), quand la session en a. */
export const MOTS_MIN_SEQUENCE = 3;

/**
 * Une histoire a-t-elle de la VRAIE parole ? (1) au moins 2 s de parole (VAD) ; (2) audible : ses 10 % les plus forts
 * pas à plus de 15 dB sous ceux de la session (vad/audible.ts ; sans niveau de la voix : pas regardé) ; (3) en mode
 * mots, au moins 3 mots qui ne sont ni des boucles, ni des piles, ni des phrases toutes faites (motsDouteux).
 */
export function filtreParoleVraie(e: Pick<EntreeSequences, 'mots' | 'parole' | 'signaux' | 'energie'>, u: readonly PlageTemps[]): (p: PlageTemps) => boolean {
  const vad = e.parole.methode !== 'mots' && e.parole.segments.length > 0;
  const segments = vad ? e.parole.segments.filter((s) => !e.signaux.muets.some((m) => s.de >= m.de && s.a <= m.a)) : u;
  const energie = e.energie ?? null;
  const parle = energie ? tramesDeParole(energie, segments) : null;
  const reference = energie && parle ? niveauParole(energie, parle) : null;
  const ecrits: Mot[] = e.mots.filter((m) => m[0].trim());
  const douteux = motsDouteux(ecrits);
  const debuts = ecrits.map((m) => m[1]);
  const vrais = new Int32Array(ecrits.length + 1);
  ecrits.forEach((_, i) => (vrais[i + 1] = vrais[i]! + (douteux[i] ? 0 : 1)));
  const premier = (t: Sec) => {
    let bas = 0;
    let haut = debuts.length;
    while (bas < haut) {
      const mi = (bas + haut) >> 1;
      if (debuts[mi]! < t) bas = mi + 1;
      else haut = mi;
    }
    return bas;
  };
  return (p) => {
    let parole = 0;
    for (const s of segments) if (s.a > p.de && s.de < p.a) parole += Math.min(s.a, p.a) - Math.max(s.de, p.de);
    if (parole < PAROLE_AUDIBLE.paroleMin) return false;
    if (energie && parle && reference) {
      const n = niveauParole(energie, parle, p.de, p.a);
      if (!n || !estAudible(n.db, reference.db)) return false;
    }
    if (ecrits.length > 0 && vrais[premier(p.a)]! - vrais[premier(p.de)]! < MOTS_MIN_SEQUENCE) return false;
    return true;
  };
}

/** Les histoires candidates de la session (fusionnées, sans recouvrement, dans l'ordre chronologique), avec de la vraie parole. */
export function histoiresCandidates(e: EntreeSequences, u: readonly PlageTemps[], blocs: Blocs): Histoire[] {
  if (u.length === 0) return [];
  const R = REGLES_HISTOIRES;
  const cible = cibleHistoire(e.dureeVisee);
  const brutes: Histoire[] = [];
  for (const i of coeurs(e.moments, blocs.blocDe)) {
    const h = histoireAutour(e.moments[i]!, i, e, u, cible);
    if (h) brutes.push(h);
  }
  // Histoires « de parole » : chaque échange d'au moins 3 s de parole, cœur au milieu (sans moment).
  for (const x of echanges(u)) {
    const t = (x.de + x.a) / 2;
    if (paroleDans(u, x) < R.paroleEchangeMin || blocs.blocDe(t) < 0) continue;
    const h = histoireAutour({ de: t, a: t }, -1, e, u, cible);
    if (h) brutes.push(h);
  }
  const vraie = filtreParoleVraie(e, u);
  const fusionnees = fusionnerHistoires(brutes, e, u).filter((h) => vraie(h));
  // Une histoire qui garde moins de 15 s n'est proposée que s'il n'y a pas mieux.
  const assez = fusionnees.filter((h) => h.garde >= R.garde.min);
  return assez.length > 0 ? assez : fusionnees;
}

/**
 * Raccourcit une histoire (phrases entières, d'abord le bout le plus loin du cœur) jusqu'à `max` s gardées : quand
 * une seule histoire dépasse déjà une vidéo très courte. Le cœur reste dedans.
 */
export function raccourcir(h: Histoire, max: Sec, e: EntreeSequences, u: readonly PlageTemps[]): Histoire {
  let a = h.i0;
  let b = h.i1;
  let x = h;
  for (let tour = 0; tour < 200 && x.garde > max; tour++) {
    const avant = h.coeur.de - u[a]!.de;
    const apres = u[b]!.a - h.coeur.a;
    const essais: ('debut' | 'fin')[] = avant >= apres ? ['debut', 'fin'] : ['fin', 'debut'];
    let pris = false;
    for (const cote of essais) {
      const na = cote === 'debut' ? finPhrase(u, a) + 1 : a;
      const nb = cote === 'fin' ? debutPhrase(u, b) - 1 : b;
      if (nb < na) continue;
      const q = plageEntre(u, na, nb, e.duree);
      if (q.de > h.coeur.de + 1e-6 || q.a < h.coeur.a - 1e-6) continue;
      a = na;
      b = nb;
      pris = true;
      break;
    }
    if (!pris) break;
    x = noterHistoire({ i0: a, i1: b, coeur: h.coeur, iCoeur: h.iCoeur, forceCoeur: h.forceCoeur }, e, u);
  }
  return x;
}

export function choisirSequencesV4(e0: EntreeSequences): ChoixSequences {
  const e = avecMemoire(e0);
  const u = parolesActives(e);
  if (u.length === 0) return { scenes: [], passages: [] };
  const blocs = blocsActifs(e.duree, e.signaux.muets, u);
  const histoires = histoiresCandidates(e, u, blocs);
  if (histoires.length === 0) return { scenes: [], passages: [] };
  const c = centiles(histoires.map((h) => h.noteBrute));
  const garde = choisirHistoires(histoires, blocs, c, e.dureeVisee);
  // Une seule histoire déjà trop longue pour la vidéo (TikTok, Short) : on la raccourcit.
  const haut = e.dureeVisee * (1 + REGLES_CHOIX.tolerance);
  if (garde.size === 1) {
    const i = [...garde][0]!;
    if (histoires[i]!.garde > haut) histoires[i] = raccourcir(histoires[i]!, haut, e, u);
  }
  const blocDe = (h: Histoire) => Math.max(0, blocs.blocDe((h.coeur.de + h.coeur.a) / 2));
  const scenes = histoires.map((h, i) => enSequence(h, e, i + 1, c[i]!, blocDe(h), garde.has(i)));
  const passages = histoires
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => !garde.has(i) && c[i]! >= REGLES_CHOIX.centilePassage)
    .sort((x, y) => meilleureDAbord(x.h, y.h))
    .slice(0, REGLES_CHOIX.passagesMax)
    .map(({ i }) => enPassage(scenes[i]!, e));
  return { scenes, passages };
}
