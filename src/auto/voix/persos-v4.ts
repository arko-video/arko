// Étape « persos » de la chaîne v4 (dev-persos, 7/11/2026), PURE : qui parle dans la recette, un perso par voix,
// émotion et situation PAR PHRASE, bouche, place, et « Sous-titres pour » la voix qu'on entend mal.
//  1. Phrases : les tours de « qui parle » (dev-voix : morceaux de parole de la même voix) sont recoupés aux fins de
//     phrase (ponctuation de Whisper, trou de plus de 0,6 s entre deux mots, au creux de la voix ; une phrase trop
//     longue est coupée à son creux le plus calme) : l'émotion et la situation changent phrase par phrase (DA).
//  2. Comme la DA : le perso apparaît 0,1 s avant la phrase, reste 0,35 s après (tenue), 0,9 s au moins. Les mots que
//     la VAD a ratés (souvent la voix faible) sont rattachés au tour voisin à moins de 0,6 s : ils sont sous-titrés.
//     Deux voix séparées au niveau : un mot n'est rattaché qu'à un tour de SA voix d'après son niveau (QA, 7/11 : sans
//     ça, les mots ratés de la voix forte étaient collés de proche en proche au tour de la voix faible).
//  3. Émotion / bouche : completerToursV4 (chibis/emotions-v4.ts) — moments v4, seuils relatifs à chaque voix,
//     bouche ouverte seulement si la VAD entend parler.
//  4. Place : p1 (la voix la plus forte) à gauche, p2 à droite (moteur/couches/places-persos.ts, au rendu).
//  5. Sous-titres pour : la voix la plus faible si elle est ≥ 6 dB sous la plus forte (voixMalEntendue), ou le choix
//     de la revue ; en mode mots seulement (jamais en même temps qu'une punchline : sous-titres-voix.ts).
// Signature GELÉE (types-v4.ts). Les autres montages gardent poserPersos / completerTours (persos-montage.ts).

import { voixMalEntendue } from '../express/best-of';
import { completerToursV4, IndexMots } from '../../chibis/emotions-v4';
import { choisirModeSousTitres } from '../../recette/operations-habillage-auto';
import { sousTitresPour } from '../../recette/operations-best-of';
import type { Mot, Recette, Sec, TourDeParole } from '../../recette/types';
import type { EnveloppeDb } from '../types-v3';
import type { EntreePersos, VoixDetecteesV4 } from '../types-v4';
import { NIVEAU_VIDE, niveauxDesMorceaux } from './niveau-v4';
import { poserPersos } from './persos-montage';
import { REGLAGES_VOIX_V4 } from './qui-parle-v4';

/** Réglages de la v4 (DA de Romain : perso 0,1 s avant, 0,35 s après, 0,9 s au moins). */
export const PERSOS_V4 = {
  /** Trou entre deux mots qui finit une phrase (s). */
  trou: 0.6,
  /** Une phrase plus longue est coupée à son creux le plus calme (s). */
  longueMax: 5,
  /** Aucune phrase plus courte (s) : la coupe est abandonnée. */
  phraseMin: 0.5,
  /** Le perso apparaît `avant` s avant la phrase. */
  avant: 0.1,
  /** Il reste `tenue` s après (réglage des avatars de la recette). */
  tenue: 0.35,
  /** Il reste visible `montreMin` s au moins (apparition comprise). */
  montreMin: 0.9,
  /** Un mot hors de tout tour est rattaché au tour le plus proche s'il est à moins de `collerMot` s. */
  collerMot: 0.6,
  /** Deux phrases de la même voix à moins de `pont` s (personne d'autre entre elles) : le perso ne disparaît pas. */
  pont: 0.8,
} as const;

const FIN_PHRASE = /[.!?…]["»”)]?$/;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Instant le plus calme (énergie la plus basse) de [de, a] ; le milieu sans énergie. */
function creux(env: EnveloppeDb | null, de: Sec, a: Sec): Sec {
  if (!env || a - de < 2 * env.pas) return (de + a) / 2;
  let mt = (de + a) / 2;
  let mv = Infinity;
  for (let i = Math.ceil(de / env.pas); i < Math.min(env.db.length, Math.floor(a / env.pas)); i++) {
    const v = env.db[i]!;
    if (v < mv - 1e-9) [mv, mt] = [v, (i + 0.5) * env.pas];
  }
  return mt;
}

/** Premier indice de `tours` (triés par début) dont le début est ≥ t. */
function premierApres(tours: readonly TourDeParole[], t: Sec): number {
  let bas = 0;
  let haut = tours.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (tours[m]!.ts < t) bas = m + 1;
    else haut = m;
  }
  return bas;
}

/** La voix d'un mot (id), ou null si on ne sait pas. */
export type VoixDuMot = (m: Mot) => string | null;

/**
 * Voix d'un mot d'après son NIVEAU, quand qui parle a séparé 2 voix au niveau dans un même mélange : la voix forte
 * au-dessus du seuil de qui parle (+ 3 dB), la faible en dessous (− 3 dB), même centile que qui parle ; null entre
 * les deux, ou sans séparation au niveau (pistes séparées, empreinte seule, 3 voix…), ou sans énergie. Pure.
 */
export function voixDesMotsParNiveau(v: Pick<VoixDetecteesV4, 'methode' | 'voix' | 'separation'>, energie: EnveloppeDb | null): VoixDuMot | null {
  const s = v.separation;
  if (!energie || energie.db.length === 0 || v.methode === 'pistes' || v.voix.length !== 2 || s.seuilDb === null) return null;
  if (s.par !== 'niveau' && s.par !== 'niveau+empreinte') return null;
  const [forte, faible] = [...v.voix].sort((a, b) => b.niveauDb - a.niveauDb);
  const seuil = s.seuilDb;
  const marge = REGLAGES_VOIX_V4.ambiguDb;
  return (m) => {
    const n = niveauxDesMorceaux([{ de: m[1], a: m[2], parties: [{ de: m[1], a: m[2] }], seg: 0 }], energie)[0]!;
    if (!(n > NIVEAU_VIDE)) return null;
    if (n >= seuil + marge) return forte!.id;
    if (n <= seuil - marge) return faible!.id;
    return null;
  };
}

/**
 * Rattache les mots hors de tout tour au tour le plus proche (< 0,6 s), sans empiéter sur le tour d'une autre voix.
 * `tours` triés par début, sans chevauchement d'une même voix (modifiés sur place ; restent triés à 0,6 s près).
 * `voixDuMot` (2 voix au niveau) : un mot n'est rattaché qu'à un tour de sa voix. Sans lui, une suite de mots ratés
 * par la VAD se collait de proche en proche (chaque mot rattaché allonge le tour) au tour de L'AUTRE voix.
 */
function collerLesMots(tours: TourDeParole[], mots: IndexMots, voixDuMot: VoixDuMot | null = null): void {
  const V = 4; // voisins regardés de chaque côté (les tours d'une même voix ne se chevauchent pas)
  for (const m of mots.mots) {
    const mi = (m[1] + m[2]) / 2;
    const i0 = premierApres(tours, mi);
    const voisins: number[] = [];
    for (let i = Math.max(0, i0 - V); i < Math.min(tours.length, i0 + V); i++) voisins.push(i);
    if (voisins.some((i) => tours[i]!.ts <= mi && mi < tours[i]!.fin)) continue;
    let k = -1;
    let d: number = PERSOS_V4.collerMot;
    const qui = voixDuMot?.(m) ?? null;
    for (const i of voisins) {
      const t = tours[i]!;
      if (qui !== null && t.p !== qui) continue; // le niveau du mot dit que c'est l'autre voix
      // Trou entre le mot et le tour.
      const e = Math.max(0, mi < t.ts ? t.ts - m[2] : m[1] - t.fin);
      if (e < d) [d, k] = [e, i];
    }
    if (k < 0) continue;
    const t = tours[k]!;
    const de = Math.min(t.ts, m[1]);
    const a = Math.max(t.fin, m[2]);
    if (voisins.some((i) => i !== k && tours[i]!.p !== t.p && tours[i]!.ts < a && de < tours[i]!.fin)) continue;
    t.ts = r3(de);
    t.fin = r3(a);
  }
}

/** Les phrases de chaque voix, dans l'ordre (les mêmes objets). */
function parVoix(phrases: readonly TourDeParole[]): Map<string, TourDeParole[]> {
  const res = new Map<string, TourDeParole[]>();
  for (const t of phrases) {
    const l = res.get(t.p);
    if (l) l.push(t);
    else res.set(t.p, [t]);
  }
  return res;
}

/** Points de coupe d'un tour : fins de phrase des mots, puis creux des phrases trop longues. */
function coupesDuTour(t: TourDeParole, mots: IndexMots, env: EnveloppeDb | null): Sec[] {
  const P = PERSOS_V4;
  const dedans = mots.milieuDans(t.ts, t.fin);
  const coupes: Sec[] = [];
  for (let i = 0; i + 1 < dedans.length; i++) {
    const a = dedans[i]!;
    const b = dedans[i + 1]!;
    if (FIN_PHRASE.test(a[0].trim()) || b[1] - a[2] > P.trou) coupes.push(b[1] > a[2] ? creux(env, a[2], b[1]) : (a[2] + b[1]) / 2);
  }
  // Phrases trop longues : coupées à leur creux le plus calme, au milieu (entre 30 % et 70 %), jusqu'à tenir.
  const bords = [t.ts, ...coupes.filter((c) => c > t.ts && c < t.fin), t.fin];
  const res: Sec[] = [];
  const decouper = (de: Sec, a: Sec) => {
    if (a - de <= P.longueMax) return;
    const c = creux(env, de + 0.3 * (a - de), de + 0.7 * (a - de));
    decouper(de, c);
    res.push(c);
    decouper(c, a);
  };
  for (let i = 0; i + 1 < bords.length; i++) {
    decouper(bords[i]!, bords[i + 1]!);
    if (i + 2 < bords.length) res.push(bords[i + 1]!);
  }
  res.sort((x, y) => x - y);
  // Jamais de phrase plus courte que 0,5 s : la coupe est abandonnée.
  const gardees: Sec[] = [];
  let der = t.ts;
  for (const c of res) {
    if (c - der >= P.phraseMin && t.fin - c >= P.phraseMin) {
      gardees.push(c);
      der = c;
    }
  }
  return gardees;
}

/**
 * Les tours de « qui parle » → les PHRASES du Best-of v4 (temps source, triées) : mots ratés rattachés, tours
 * recoupés aux fins de phrase, perso 0,1 s avant la 1re phrase, 0,9 s visible au moins. Pure.
 */
export function phrasesDesTours(
  tours: readonly TourDeParole[],
  o: { mots?: readonly Mot[]; energie?: EnveloppeDb | null; energieDe?: (p: string) => EnveloppeDb | null; voixDuMot?: VoixDuMot | null } = {},
): TourDeParole[] {
  const P = PERSOS_V4;
  const mots = new IndexMots(o.mots ?? []);
  const envDe = (p: string) => o.energieDe?.(p) ?? o.energie ?? null;
  const base = tours.filter((t) => t.fin > t.ts).map((t) => ({ ...t })).sort((x, y) => x.ts - y.ts || x.fin - y.fin);
  collerLesMots(base, mots, o.voixDuMot ?? null);
  // 1. Recoupe aux fins de phrase.
  const phrases: TourDeParole[] = [];
  for (const t of base) {
    let de = t.ts;
    for (const c of coupesDuTour(t, mots, envDe(t.p))) {
      phrases.push({ ...t, ts: r3(de), fin: r3(c) });
      de = c;
    }
    phrases.push({ ...t, ts: r3(de), fin: t.fin });
  }
  phrases.sort((x, y) => x.ts - y.ts || x.fin - y.fin);
  // 2. Apparition 0,1 s avant (sans repasser sur la phrase précédente de la même voix).
  const derFin = new Map<string, Sec>();
  for (const t of phrases) {
    const avant = derFin.get(t.p) ?? -Infinity;
    if (t.ts - avant > 1e-6) t.ts = r3(Math.max(0, avant, t.ts - P.avant));
    derFin.set(t.p, Math.max(avant, t.fin));
  }
  // 2 bis. Pont : le perso reste entre deux phrases proches de la même voix si personne d'autre ne parle entre elles.
  for (const liste of parVoix(phrases).values()) {
    for (let i = 0; i + 1 < liste.length; i++) {
      const a = liste[i]!;
      const b = liste[i + 1]!;
      const trou = b.ts - a.fin;
      if (trou <= 0 || trou >= P.pont) continue;
      let autre = false;
      for (let k = Math.max(0, premierApres(phrases, a.fin) - 4); k < phrases.length && phrases[k]!.ts < b.ts; k++) {
        const x = phrases[k]!;
        if (x.p !== a.p && x.ts < b.ts && x.fin > a.fin) autre = true;
      }
      if (!autre) a.fin = b.ts;
    }
  }
  // 3. Visible 0,9 s au moins : un passage de parole d'une voix (phrases à moins de la tenue) trop court est
  //    prolongé, sans aller sur la phrase suivante d'une autre voix.
  for (const liste of parVoix(phrases).values()) {
    let i = 0;
    while (i < liste.length) {
      let j = i;
      while (j + 1 < liste.length && liste[j + 1]!.ts - liste[j]!.fin < P.tenue) j++;
      const debut = liste[i]!.ts;
      const der = liste[j]!;
      const vise = debut + P.montreMin - P.tenue;
      if (der.fin < vise) {
        let suivante = Infinity;
        for (let k = premierApres(phrases, der.fin - 1e-9); k < phrases.length; k++) {
          if (phrases[k]!.p !== der.p) {
            suivante = phrases[k]!.ts;
            break;
          }
        }
        const prochaine = liste[j + 1]?.ts ?? Infinity;
        der.fin = r3(Math.max(der.fin, Math.min(vise, suivante, prochaine)));
      }
      i = j + 1;
    }
  }
  return phrases;
}

/** Best-of v4 : qui parle + persos + émotion par phrase + « Sous-titres pour ». Sans voix : la recette telle quelle. */
export function poserPersosV4(r0: Recette, e: EntreePersos): Recette {
  const v = e.voix;
  if (!v || v.voix.length === 0 || v.tours.length === 0 || !(e.quiParle || e.avatars)) return r0;
  // L'énergie de la voix : la piste de la personne (pistes séparées), sinon le mélange.
  const piste = new Map(v.voix.map((x) => [x.id, x.piste]));
  const energieDe = (p: string) => e.empreintes.find((x) => x.piste !== undefined && x.piste === piste.get(p)) ?? e.empreintes[0] ?? null;
  const tours = phrasesDesTours(v.tours, { mots: e.mots ?? [], energieDe, voixDuMot: voixDesMotsParNiveau(v, e.empreintes[0] ?? null) });
  // Pistes séparées : la voix de chacun est sur SA piste (exact) ; la VAD de la piste principale ne l'entend pas
  // forcément : la bouche suit alors l'énergie de sa piste seule.
  const vad = v.methode === 'pistes' ? null : e.parole.probas;
  let r = poserPersos(r0, { voix: { ...v, tours }, empreintes: e.empreintes }, {
    noms: e.noms,
    chibis: e.chibis,
    ...(e.mots ? { mots: e.mots } : {}),
    signaux: e.signaux,
    avatars: e.avatars,
    completer: (t, c) => completerToursV4(t, { ...c, vad, moments: e.moments }),
    reglagesAvatars: { mode: 'reactions', rebond: true, tenue: PERSOS_V4.tenue },
  });
  const pour = e.sousTitresPour === undefined ? voixMalEntendue(v) : e.sousTitresPour;
  if (pour && r.personnes?.some((p) => p.id === pour) && r.sousTitres && Array.isArray(r.sousTitres.mots)) {
    if (r.sousTitres.mode !== 'punchlines') r = choisirModeSousTitres(r, 'punchlines');
    r = sousTitresPour(r, pour);
  }
  return r;
}
