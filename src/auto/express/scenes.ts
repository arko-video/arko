// H. Choix des séquences du « Montage express » (INTÉGRATEUR), fonctions PURES :
// regrouper la parole en scènes (pause > 20 s = nouvelle scène ; une scène trop longue est coupée à son plus grand
// silence), noter chaque scène (pics, cris, rires, jurons, mots forts, densité de parole), garder les meilleures
// jusqu'à la durée visée, dans l'ordre chronologique ; jamais un passage muet (fin d'enregistrement AFK).

import type { Mot, Sec } from '../../recette/types';
import { morceauxDeParole, REGLAGES_BLANCS } from '../coupes/blancs';
import { estJuron } from '../habillage/jurons';
import { trouverPunchlines } from '../habillage/punchlines';
import { estFort } from '../../sous-titres/nettoyage';
import type { PlageTemps, SignauxSource } from '../types';

/** pause : silence qui ouvre une nouvelle scène ; max / min : longueur (source) au-delà de laquelle on recoupe. */
export const SCENES = { pause: 20, max: 240, min: 30 };

/** Une séquence proposée sur l'écran de revue (cocher / décocher, réordonner). */
export interface SceneProposee extends PlageTemps {
  titre: string;
  /** Pourquoi elle est proposée, en français (« 3 rires · 2 pics de son »). */
  raison: string;
  /** Intérêt de 0 à 100 (sert au choix, pas affiché). */
  score: number;
  /** Cochée par défaut. */
  garde: boolean;
  /** Durée estimée APRÈS « Couper les blancs » (s). */
  duree: Sec;
}

/** Mots dont le milieu tombe dans la plage. */
export function motsDans(mots: readonly Mot[], p: PlageTemps): Mot[] {
  return mots.filter((m) => (m[1] + m[2]) / 2 >= p.de && (m[1] + m[2]) / 2 < p.a);
}

/** Mots des scènes gardées, triés (pour les sous-titres et les coupes). */
export function motsDesScenes(mots: readonly Mot[], scenes: readonly PlageTemps[]): Mot[] {
  return mots.filter((m) => scenes.some((s) => (m[1] + m[2]) / 2 >= s.de && (m[1] + m[2]) / 2 < s.a)).sort((x, y) => x[1] - y[1]);
}

/** Coupe une scène trop longue à son plus grand silence entre deux mots (récursif). */
function recouper(mots: readonly Mot[]): Mot[][] {
  const duree = mots.length > 0 ? mots[mots.length - 1]![2] - mots[0]![1] : 0;
  if (duree <= SCENES.max || mots.length < 2) return [[...mots]];
  let meilleur = -1;
  let trou = -1;
  for (let k = 1; k < mots.length; k++) {
    const avant = mots[k - 1]![2] - mots[0]![1];
    const apres = mots[mots.length - 1]![2] - mots[k]![1];
    if (avant < SCENES.min || apres < SCENES.min) continue;
    const t = mots[k]![1] - mots[k - 1]![2];
    if (t > trou) {
      trou = t;
      meilleur = k;
    }
  }
  if (meilleur < 0) return [[...mots]];
  return [...recouper(mots.slice(0, meilleur)), ...recouper(mots.slice(meilleur))];
}

/** Retire des plages les passages muets. */
function sansMuets(plages: PlageTemps[], muets: readonly PlageTemps[]): PlageTemps[] {
  let res = plages;
  for (const z of muets) {
    res = res.flatMap((p) => {
      if (z.a <= p.de || z.de >= p.a) return [p];
      const parts: PlageTemps[] = [];
      if (z.de > p.de) parts.push({ de: p.de, a: z.de });
      if (z.a < p.a) parts.push({ de: z.a, a: p.a });
      return parts;
    });
  }
  return res.filter((p) => p.a - p.de >= 1);
}

/** Scènes de parole (temps source), sans les passages muets de `signaux`. */
export function decouperScenes(mots: readonly Mot[], signaux: SignauxSource | null, pause: Sec = SCENES.pause): PlageTemps[] {
  const tries = [...mots].filter((m) => m[2] > m[1]).sort((x, y) => x[1] - y[1]);
  const groupes: Mot[][] = [];
  for (const m of tries) {
    const g = groupes[groupes.length - 1];
    if (g && m[1] - g[g.length - 1]![2] <= pause) g.push(m);
    else groupes.push([m]);
  }
  const fin = signaux?.duree ?? Infinity;
  const plages = groupes.flatMap(recouper).map((g) => ({ de: Math.max(0, g[0]![1] - 0.5), a: Math.min(fin, g[g.length - 1]![2] + 0.5) }));
  return sansMuets(plages, signaux?.muets ?? []).map((p) => ({ de: Math.round(p.de * 100) / 100, a: Math.round(p.a * 100) / 100 }));
}

/** « 754 » → « 12:34 », « 3725 » → « 1:02:05 ». */
export function horodatage(t: Sec): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

interface Stats {
  pics: number;
  cris: number;
  rires: number;
  jurons: number;
  forts: number;
  mots: number;
}

function stats(p: PlageTemps, mots: readonly Mot[], s: SignauxSource | null): Stats {
  const dans = (t: Sec) => t >= p.de && t < p.a;
  return {
    pics: s ? s.pics.filter((x) => dans(x.ts)).length : 0,
    cris: s ? s.cris.filter((x) => dans(x.t)).length : 0,
    rires: s ? s.rires.filter((x) => dans(x.t)).length : 0,
    jurons: mots.filter((m) => estJuron(m[0])).length,
    forts: mots.filter((m) => m[3] === 1 || estFort(m[0])).length,
    mots: mots.length,
  };
}

/** Points d'intérêt d'une scène, par minute gardée, ramenés à 0..100. */
function noter(st: Stats, duree: Sec): number {
  const points = st.rires * 8 + st.cris * 6 + Math.min(st.pics, 20) * 4 + st.jurons * 3 + st.forts * 3 + st.mots * 0.05;
  const parMinute = points / Math.max(0.5, duree / 60);
  return Math.round(100 * (1 - Math.exp(-parMinute / 25)));
}

function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 3 rires · 2 pics de son · 1 juron » (ou « De la parole »). */
export function raisonDe(st: Stats): string {
  const parts: string[] = [];
  if (st.rires) parts.push(pluriel(st.rires, 'rire', 'rires'));
  if (st.cris) parts.push(pluriel(st.cris, 'cri', 'cris'));
  if (st.pics) parts.push(pluriel(st.pics, 'pic de son', 'pics de son'));
  if (st.jurons) parts.push(pluriel(st.jurons, 'juron', 'jurons'));
  if (st.forts) parts.push(pluriel(st.forts, 'mot fort', 'mots forts'));
  return parts.length > 0 ? parts.slice(0, 3).join(' · ') : 'De la parole';
}

/** Mots vides et tics de parole : jamais le sujet d'un titre. */
const MOTS_VIDES = new Set(
  "alors aussi avec avoir bah bon bref cette ceux chez comme comment dans donc elle elles encore enfin est était faire fait genre ici juste là leur mais même moi nous oui ouais parce pour quand quoi rien sans sont sous suis sur tout tous toute très trop vas voila voilà vous wesh ahah haha euh hein putain merde".split(' '),
);
const normal = (t: string) => t.toLowerCase().replace(/[^a-zà-ÿ0-9'-]/g, '');
const plein = (t: string) => normal(t).length >= 4 && !MOTS_VIDES.has(normal(t));

/** Les mots pleins qui reviennent au moins 2 fois dans la scène (son sujet : « creeper », « diamants »…). */
function motsDuSujet(mots: readonly Mot[]): Set<string> {
  const n = new Map<string, number>();
  for (const m of mots) if (plein(m[0])) n.set(normal(m[0]), (n.get(normal(m[0])) ?? 0) + 1);
  return new Set([...n].filter(([, k]) => k >= 2).map(([w]) => w));
}

function noteTitre(ceux: readonly Mot[], sujet: ReadonlySet<string>, s: SignauxSource | null): number {
  const pleins = ceux.filter((m) => plein(m[0]));
  const fin = ceux[ceux.length - 1]?.[2] ?? 0;
  const reaction = s ? [...s.rires, ...s.cris].some((x) => x.t >= fin - 0.3 && x.t <= fin + 2.5) : false;
  const taille = ceux.length >= 3 && ceux.length <= 8 ? 2 : ceux.length >= 2 ? 0 : -3;
  return pleins.length * 2 + pleins.filter((m) => sujet.has(normal(m[0]))).length * 3 + (reaction ? 3 : 0) + taille;
}

/**
 * Titre : la meilleure punchline de la scène (« ON A GAGNÉ » → « On a gagné »), sinon « Partie n ». `douteux`
 * (facultatif, aligné sur `mots`) : les mots que Whisper a sans doute inventés, jamais dans un titre.
 */
export function titreDe(mots: readonly Mot[], s: SignauxSource | null, n: number, douteux?: ArrayLike<number>): string {
  const sansInvente = (x: { k0: number; k1: number }) => !douteux || !Array.from({ length: x.k1 - x.k0 }, (_, k) => douteux[x.k0 + k]).some(Boolean);
  // La punchline qui RÉSUME le mieux la scène (avant : la plus longue, d'où des titres « au hasard ») : des mots
  // qui ont du sens (pas « ouais », « genre »…), un mot qui revient dans la scène (le sujet), une réaction juste
  // après (rire, cri). Un « Non! » seul ne fait pas un titre. La première à égalité.
  const sujet = motsDuSujet(mots);
  const p = trouverPunchlines(mots, s)
    .filter(sansInvente)
    .map((x) => ({ x, note: noteTitre(mots.slice(x.k0, x.k1), sujet, s) }))
    .reduce<{ x: ReturnType<typeof trouverPunchlines>[number]; note: number } | undefined>((m, c) => (!m || c.note > m.note ? c : m), undefined)?.x;
  const texte = p ? mots.slice(p.k0, p.k1).map((m) => m[0]).join(' ').replace(/\s+([!?…,.])/g, '$1').trim() : '';
  if (!texte) return `Partie ${n}`;
  const bas = texte.toLowerCase();
  const titre = bas.charAt(0).toUpperCase() + bas.slice(1);
  return titre.length > 40 ? `${titre.slice(0, 39).trimEnd()}…` : titre;
}

/** Durée gardée par « Couper les blancs » (réglage Normal) dans la scène. */
export function dureeApresCoupe(mots: readonly Mot[], s: SignauxSource | null, p: PlageTemps): Sec {
  return morceauxDeParole(mots, s, REGLAGES_BLANCS.normal, p).reduce((t, m) => t + (m.a - m.de), 0);
}

/**
 * Note les scènes et coche les meilleures jusqu'à `dureeVisee` (durée APRÈS Couper les blancs, estimée) ;
 * renvoyées dans l'ordre chronologique. Une scène qui ferait trop dépasser est sautée (on tente les suivantes).
 */
export function choisirScenes(scenes: readonly PlageTemps[], mots: readonly Mot[], signaux: SignauxSource | null, dureeVisee: Sec): SceneProposee[] {
  const notees: SceneProposee[] = scenes.map((p, i) => {
    const ceux = motsDans(mots, p);
    const duree = Math.round(dureeApresCoupe(ceux, signaux, p) * 10) / 10;
    const st = stats(p, ceux, signaux);
    return { de: p.de, a: p.a, titre: titreDe(ceux, signaux, i + 1), raison: raisonDe(st), score: noter(st, duree), garde: false, duree };
  });
  let total = 0;
  const ordre = notees.map((_, i) => i).sort((x, y) => notees[y]!.score - notees[x]!.score || x - y);
  for (const i of ordre) {
    const sc = notees[i]!;
    if (total >= dureeVisee * 0.95) break;
    if (sc.duree <= 0) continue;
    if (total > 0 && total + sc.duree > dureeVisee * 1.1) continue;
    sc.garde = true;
    total += sc.duree;
  }
  return notees;
}

/** Durée totale estimée des scènes cochées. */
export function dureeGardee(scenes: readonly SceneProposee[]): Sec {
  return scenes.reduce((t, s) => t + (s.garde ? s.duree : 0), 0);
}
