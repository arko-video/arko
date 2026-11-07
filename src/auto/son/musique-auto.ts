// F+. Musique de fond AUTOMATIQUE (fonctions PURES) : à partir des séquences du montage (temps de sortie, avec leurs
// chiffres : rires, cris, pics, mots de tension) et des morceaux disponibles, Arko choisit UN morceau par groupe de
// séquences, comme dans le montage fait à la main (6 morceaux pour 16 min) :
//  - les séquences sont regroupées en blocs de ~2 à 4 min ; on change de morceau au DÉBUT d'une séquence ;
//  - pas de musique pendant l'accroche (elle commence avec la 1re séquence) ;
//  - l'ambiance suit la séquence : tension → enquête, rires → rigolo, sinon joyeux-malin, et la fin → calme ;
//  - d'où vient la musique (choix de Romain, 7/11) : d'abord Ma bibliothèque (musiques importées par l'utilisateur,
//    jamais un nom de musique de jeu : réclamations YouTube), sinon les morceaux de Kevin MacLeod (CC BY 4.0) proposés
//    par Arko, sinon une musique fabriquée par Arko (CC0, marche sans internet) ;
//  - variée : jamais deux fois de suite le même morceau, un morceau déjà pris seulement s'il n'y a plus rien d'autre.
// Les fondus (1,2 / 1,5 s), le −17 dB et la baisse quand on parle sont ceux de la piste musique (recette.musique).

import { compiler, type Scenario } from '../../recette/chronologie';
import { MEILLEUR } from '../../recette/modeles';
import type { MorceauMusique, Mot, Recette, Sec } from '../../recette/types';
import { AMBIANCES, NOMS_AMBIANCES, type Ambiance } from '../../sons/musique/generateur';
import { sansAccents } from '../../sons/recherche';
import { estJuron } from '../habillage/jurons';
import type { PlageTemps, SignauxSource } from '../types';
import { estMusiqueDeJeu } from './credits';

export type { Ambiance };

/** Règles du choix (s) : taille des groupes, dernier groupe plus court permis, durée « longue » d'un morceau. */
export const MUSIQUE_AUTO = { groupeMin: 120, groupeVise: 180, groupeMax: 240, finMin: 45, morceauLong: 60, morceauMin: 20, finCalmeDes: 3 } as const;

/* ------------------------------------------------------------------ catalogue Kevin MacLeod */

/** Un morceau de Kevin MacLeod proposé par Arko (public/musiques/kevin-macleod/), CC BY 4.0. */
export interface MorceauKevin {
  id: string;
  /** Titre EXACT sur incompetech.com (il sert au crédit). */
  titre: string;
  fichier: string;
  /** Durée du fichier d'Arko (silences des bords retirés), s. */
  duree: Sec;
  isrc: string;
  /** Ambiances, la principale d'abord. */
  ambiances: Ambiance[];
}

/**
 * Les morceaux téléchargés le 7/11/2026 sur incompetech.com (licence vérifiée sur la page de chaque morceau :
 * Creative Commons By Attribution 4.0). Les 6 premiers sont ceux du montage fait à la main que Romain a validé.
 * Convertis en AAC 96 kb/s stéréo 48 kHz, à −17 LUFS (même volume), silences des bords retirés.
 */
export const MORCEAUX_KEVIN: readonly MorceauKevin[] = [
  { id: 'monkeys-spinning-monkeys', titre: 'Monkeys Spinning Monkeys', fichier: 'monkeys-spinning-monkeys.m4a', duree: 125.07, isrc: 'USUAN1400011', ambiances: ['joyeux', 'rigolo'] },
  { id: 'sneaky-snitch', titre: 'Sneaky Snitch', fichier: 'sneaky-snitch.m4a', duree: 133.83, isrc: 'USUAN1100772', ambiances: ['joyeux', 'enquete'] },
  { id: 'fluffing-a-duck', titre: 'Fluffing a Duck', fichier: 'fluffing-a-duck.m4a', duree: 64.8, isrc: 'USUAN1100768', ambiances: ['rigolo'] },
  { id: 'investigations', titre: 'Investigations', fichier: 'investigations.m4a', duree: 92.57, isrc: 'USUAN1100646', ambiances: ['enquete'] },
  { id: 'scheming-weasel-faster', titre: 'Scheming Weasel (faster version)', fichier: 'scheming-weasel-faster.m4a', duree: 85.82, isrc: 'USUAN1100085', ambiances: ['rigolo', 'enquete'] },
  { id: 'divertissement', titre: 'Divertissement - Pizzicato (from the ballet Sylvia)', fichier: 'divertissement.m4a', duree: 93.74, isrc: 'USUAN1100256', ambiances: ['calme', 'rigolo'] },
  { id: 'carefree', titre: 'Carefree', fichier: 'carefree.m4a', duree: 204.68, isrc: 'USUAN1400037', ambiances: ['calme', 'joyeux'] },
  { id: 'hidden-agenda', titre: 'Hidden Agenda', fichier: 'hidden-agenda.m4a', duree: 134.59, isrc: 'USUAN1200102', ambiances: ['enquete'] },
  { id: 'pixel-peeker-polka-faster', titre: 'Pixel Peeker Polka - faster', fichier: 'pixel-peeker-polka-faster.m4a', duree: 200.29, isrc: 'USUAN1100833', ambiances: ['rigolo', 'joyeux'] },
];

/** Nom du fichier importé dans le montage : « Kevin MacLeod - <titre>.m4a » (le crédit est retrouvé d'après ce nom). */
export function nomFichierKevin(m: Pick<MorceauKevin, 'titre'>): string {
  return `Kevin MacLeod - ${m.titre}.m4a`;
}

/** Crédit EXACT demandé sur la page du morceau (« Attribution Code »), à mettre dans la description YouTube. */
export function creditKevin(m: Pick<MorceauKevin, 'titre'>): string {
  return `"${m.titre}" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/`;
}

/* ------------------------------------------------------------------ candidats */

export type OrigineMorceau = 'bibliotheque' | 'kevin' | 'arko';

/** Un morceau que le choix automatique peut prendre. */
export interface MorceauCandidat {
  /** « bib:<id Mes sons> », « kevin:<id> » ou « arko:<ambiance>:<graine> ». */
  id: string;
  nom: string;
  duree: Sec;
  origine: OrigineMorceau;
  /** Ambiances connues (la principale d'abord) ; vide = inconnue. */
  ambiances: Ambiance[];
  /** Morceau fait pour tourner en boucle (musique fabriquée) : sa courte durée n'est pas un défaut. */
  boucle?: boolean;
}

/** Ce qu'il faut savoir d'un son de Ma bibliothèque (forme de MonSon). */
export interface SonBibliotheque {
  id: string;
  nom: string;
  duree: Sec;
  etiquette?: string;
  rayon?: string;
}

/** Mots du nom → ambiance (comparés sans accents ni majuscules, en mot entier ou en début de mot). */
const MOTS_AMBIANCES: Record<Ambiance, string[]> = {
  calme: ['calm', 'calme', 'chill', 'relax', 'lofi', 'lo fi', 'piano', 'sad', 'triste', 'ambient', 'peaceful', 'doux', 'douce', 'slow', 'sleep', 'dream', 'reve', 'outro', 'ending', 'credits', 'wallpaper', 'local forecast', 'carefree', 'divertissement', 'pizzicato'],
  enquete: ['suspense', 'myster', 'detective', 'investigat', 'enquete', 'spy', 'espion', 'sneak', 'tension', 'creepy', 'dark', 'sombre', 'horror', 'thriller', 'stealth', 'secret', 'agenda', 'snitch', 'scheming', 'cipher'],
  rigolo: ['funny', 'fun', 'comedy', 'comique', 'drole', 'rigolo', 'silly', 'goofy', 'cartoon', 'quirky', 'polka', 'circus', 'cirque', 'bouncy', 'duck', 'crazy', 'chase', 'run amok', 'merry go', 'fig leaf', 'weasel', 'monkeys'],
  joyeux: ['happy', 'joyeux', 'joy', 'upbeat', 'cheerful', 'bright', 'sunny', 'summer', 'ukulele', 'positive', 'uplifting', 'monkeys spinning', 'sneaky', 'gaming background'],
};

/** Ambiances devinées d'après le nom (titres de Kevin MacLeod connus d'abord, puis des mots), les plus sûres d'abord. */
export function ambiancesDuNom(nom: string): Ambiance[] {
  const texte = ` ${sansAccents(nom)} `;
  for (const m of MORCEAUX_KEVIN) if (texte.includes(` ${sansAccents(m.titre.replace(/\(.*?\)/g, ''))} `)) return [...m.ambiances];
  const arko = /musique arko (joyeux malin|enquete|rigolo|fin calme)/.exec(texte);
  if (arko) return [AMBIANCES.find((a) => sansAccents(NOMS_AMBIANCES[a]) === arko[1])!];
  const score = AMBIANCES.map((a) => ({ a, n: MOTS_AMBIANCES[a].filter((m) => texte.includes(` ${m}`)).length }));
  return score.filter((x) => x.n > 0).sort((x, y) => y.n - x.n || AMBIANCES.indexOf(x.a) - AMBIANCES.indexOf(y.a)).map((x) => x.a);
}

const RESSEMBLE_MUSIQUE = /kevin\s*mac\s*leod|incompetech|music|musique|bgm|background|soundtrack|\bost\b|theme|instrumental/i;

/**
 * Musiques de Ma bibliothèque utilisables : le rayon Musiques (20 s au moins), et les longs sons du rayon Bruitages
 * dont le nom dit « musique » (anciens imports). Jamais un nom de musique de jeu (Nintendo, Mario, Sonic… :
 * réclamations YouTube, même liste que l'alerte « musiques de jeux »).
 */
export function candidatsBibliotheque(sons: readonly SonBibliotheque[]): MorceauCandidat[] {
  return sons
    .filter((s) => (s.rayon === 'musiques' ? s.duree >= MUSIQUE_AUTO.morceauMin : s.duree >= MUSIQUE_AUTO.morceauLong && RESSEMBLE_MUSIQUE.test(`${s.nom} ${s.etiquette ?? ''}`)))
    .filter((s) => !estMusiqueDeJeu(s.nom) && !estMusiqueDeJeu(s.etiquette ?? ''))
    .map((s) => ({ id: `bib:${s.id}`, nom: s.nom, duree: s.duree, origine: 'bibliotheque' as const, ambiances: ambiancesDuNom(`${s.nom} ${s.etiquette ?? ''}`) }));
}

/** Morceaux de Kevin MacLeod (seulement ceux qu'on peut avoir : en ligne, ou déjà gardés sur l'appareil). */
export function candidatsKevin(disponibles: (id: string) => boolean = () => true): MorceauCandidat[] {
  return MORCEAUX_KEVIN.filter((m) => disponibles(m.id)).map((m) => ({ id: `kevin:${m.id}`, nom: nomFichierKevin(m), duree: m.duree, origine: 'kevin' as const, ambiances: [...m.ambiances] }));
}

/** Graines des musiques fabriquées proposées pour chaque ambiance (3 morceaux différents par ambiance). */
export const GRAINES_ARKO = [1, 2, 3] as const;

/** Nom du fichier d'une musique fabriquée : « Musique Arko - Joyeux malin 2.wav ». */
export function nomMusiqueArko(ambiance: Ambiance, graine: number): string {
  return `Musique Arko - ${NOMS_AMBIANCES[ambiance]} ${graine}.wav`;
}

/** Musiques fabriquées par Arko (toujours disponibles, même sans internet). */
export function candidatsArko(): MorceauCandidat[] {
  return AMBIANCES.flatMap((a) => GRAINES_ARKO.map((g) => ({ id: `arko:${a}:${g}`, nom: nomMusiqueArko(a, g), duree: 35, origine: 'arko' as const, ambiances: [a], boucle: true })));
}

/** « arko:rigolo:2 » → { ambiance, graine } (null si ce n'est pas une musique fabriquée). */
export function lireIdArko(id: string): { ambiance: Ambiance; graine: number } | null {
  const m = /^arko:([a-z]+):(\d+)$/.exec(id);
  if (!m || !AMBIANCES.includes(m[1] as Ambiance)) return null;
  return { ambiance: m[1] as Ambiance, graine: Number(m[2]) };
}

/* ------------------------------------------------------------------ séquences */

/** Une séquence du montage, en temps de sortie, avec ses chiffres. */
export interface SequenceMusicale {
  t0: Sec;
  t1: Sec;
  /** Durée gardée (somme des plans), s. */
  duree: Sec;
  rires: number;
  /** Rires forts (force ≥ 0,7 ou 3 s au moins). */
  fousRires: number;
  cris: number;
  pics: number;
  jurons: number;
  /** Mots de tension (« attention », « vite », « cours », « cache-toi »…). */
  tension: number;
  titre?: string;
}

/** Mots qui disent la tension (comparés sans accents, début de mot). */
const MOTS_TENSION = [
  'attention', 'attends', 'vite', 'cours', 'courez', 'fuis', 'fuyez', 'cache', 'chut', 'aide', 'secours', 'danger', 'mort', 'meurs', 'mourir', 'tue',
  'piege', 'derriere', 'peur', 'flippe', 'stress', 'panique', 'bizarre', 'etrange', 'invisible', 'monstre', 'zombie', 'explose', 'explosion', 'tnt', 'boss', 'lave',
];

export function estMotDeTension(mot: string): boolean {
  const m = sansAccents(mot);
  return m.length >= 3 && MOTS_TENSION.some((x) => m === x || (x.length >= 4 && m.startsWith(x)));
}

/**
 * Fin de l'accroche de ~6 s (le meilleur moment copié au début, suivi d'un « glitch ») ; 0 s'il n'y en a pas.
 * L'accroche est faite d'UN plan (Montage express : modeleMeilleurDAbord) ou de 1 ou 2 plans (Best-of v4 :
 * accrocheDesMorceaux, la phrase puis la réaction) : c'est la fin du plan qui précède le 1er « glitch », s'il arrive
 * dans les 6 + 1,5 s du début (intégrateur, demande de dev-habillage : avant, 2 plans → 0, musique sur l'accroche).
 */
export function finAccroche(sc: Scenario): Sec {
  const k = sc.plans.findIndex((p, i) => i > 0 && p.trans?.type === MEILLEUR.transition);
  if (k < 1 || k > 2) return 0;
  const fin = sc.plans[k - 1]!.t1;
  return fin - sc.plans[0]!.t0 <= MEILLEUR.dureeExpress + 1.5 ? fin : 0;
}

/**
 * Séquences du montage (temps de sortie, après l'accroche) : pour chaque scène gardée, les plans qui en viennent, et
 * ce qui s'y passe (rires, cris, pics, jurons, mots de tension) dans les morceaux GARDÉS. Triées dans l'ordre du
 * montage. `scenes` : les séquences gardées (temps source), dans n'importe quel ordre.
 */
export function sequencesDuMontage(r: Recette, scenes: readonly (PlageTemps & { titre?: string })[], signaux: SignauxSource | null, mots: readonly Mot[] = []): SequenceMusicale[] {
  const sc = compiler(r);
  const apres = finAccroche(sc);
  const src = signaux?.src ?? r.sources.find((s) => s.type === 'video')?.id ?? '';
  const res: SequenceMusicale[] = [];
  for (const s of scenes) {
    const plans = sc.plans.filter((p) => !p.ins && p.src === src && p.t0 >= apres - 0.01 && p.de >= s.de - 0.01 && p.a <= s.a + 0.01);
    if (plans.length === 0) continue;
    // D'abord la scène (rapide), puis les morceaux gardés de la scène.
    const dans = (t: Sec) => t >= s.de && t < s.a && plans.some((p) => t >= p.de && t < p.a);
    const motsDedans = mots.filter((m) => dans((m[1] + m[2]) / 2));
    const rires = signaux?.rires.filter((x) => dans(x.t)) ?? [];
    const seq: SequenceMusicale = {
      t0: plans.reduce((t, p) => Math.min(t, p.t0), Infinity),
      t1: plans.reduce((t, p) => Math.max(t, p.t1), -Infinity),
      duree: plans.reduce((d, p) => d + (p.t1 - p.t0), 0),
      rires: rires.length,
      fousRires: rires.filter((x) => x.force >= 0.7 || x.a - x.de >= 3).length,
      cris: signaux?.cris.filter((x) => dans(x.t)).length ?? 0,
      pics: signaux?.pics.filter((x) => dans(x.ts)).length ?? 0,
      jurons: motsDedans.filter((m) => estJuron(m[0])).length,
      tension: motsDedans.filter((m) => estMotDeTension(m[0])).length,
    };
    if (s.titre) seq.titre = s.titre;
    res.push(seq);
  }
  return res.sort((a, b) => a.t0 - b.t0);
}

/* ------------------------------------------------------------------ ambiance */

/** Seuils minimaux (événements par minute gardée), et écart à la médiane du montage pour sortir du lot. */
export const SEUILS_AMBIANCE = { rires: 1.5, tension: 1, ecart: 1.25 } as const;

/** Rires et tension par minute gardée. */
function taux(s: SequenceMusicale): { rire: number; tension: number } {
  const minutes = Math.max(0.25, s.duree / 60);
  return { rire: (s.rires + 1.5 * s.fousRires) / minutes, tension: (0.6 * s.cris + s.tension + 0.25 * s.pics + 0.2 * s.jurons) / minutes };
}

const mediane = (l: number[]) => {
  const t = [...l].sort((a, b) => a - b);
  return t.length === 0 ? 0 : t.length % 2 ? t[(t.length - 1) / 2]! : (t[t.length / 2 - 1]! + t[t.length / 2]!) / 2;
};

/** Niveau habituel du montage (médianes) : sur une vraie session, on rit presque tout le temps. */
export function referenceAmbiances(seqs: readonly SequenceMusicale[]): { rire: number; tension: number } {
  const t = seqs.map(taux);
  return { rire: mediane(t.map((x) => x.rire)), tension: mediane(t.map((x) => x.tension)) };
}

/**
 * Ambiance d'une séquence : plus de rires que d'habitude → rigolo, plus de tension (cris, mots de tension, pics,
 * jurons) → enquête, sinon joyeux-malin. « D'habitude » = la médiane du montage (`ref`) : mesuré sur la vraie
 * session, le détecteur de rires en trouve 5 à 14 par minute partout, un seuil fixe mettrait tout en « rigolo ».
 */
export function ambianceDeSequence(s: SequenceMusicale, ref: { rire: number; tension: number } = { rire: 0, tension: 0 }): Ambiance {
  const { rire, tension } = taux(s);
  const seuilRire = Math.max(SEUILS_AMBIANCE.rires, SEUILS_AMBIANCE.ecart * ref.rire);
  const seuilTension = Math.max(SEUILS_AMBIANCE.tension, SEUILS_AMBIANCE.ecart * ref.tension);
  if (rire >= seuilRire && rire / seuilRire >= tension / seuilTension) return 'rigolo';
  if (tension >= seuilTension) return 'enquete';
  return 'joyeux';
}

/** Ambiance d'un groupe : celle qui couvre le plus de temps (à égalité : joyeux, puis rigolo, puis enquête). */
function ambianceDuGroupe(seqs: readonly SequenceMusicale[], ambiances: readonly Ambiance[], i: number, j: number): { ambiance: Ambiance; part: number } {
  const temps = new Map<Ambiance, number>();
  let total = 0;
  for (let k = i; k <= j; k++) {
    temps.set(ambiances[k]!, (temps.get(ambiances[k]!) ?? 0) + seqs[k]!.duree);
    total += seqs[k]!.duree;
  }
  const ordre: Ambiance[] = ['joyeux', 'rigolo', 'enquete', 'calme'];
  const meilleure = ordre.reduce((m, a) => ((temps.get(a) ?? 0) > (temps.get(m) ?? 0) + 1e-9 ? a : m), ordre[0]!);
  return { ambiance: meilleure, part: total > 0 ? (temps.get(meilleure) ?? 0) / total : 1 };
}

/* ------------------------------------------------------------------ groupes */

/** Un groupe de séquences qui partagent un morceau. */
export interface GroupeMusical {
  /** Début (temps de sortie) : le début de sa 1re séquence. */
  t: Sec;
  /** Fin : le début du groupe suivant, ou la fin de la dernière séquence. */
  fin: Sec;
  ambiance: Ambiance;
  /** Indices (inclus) des séquences du groupe. */
  de: number;
  a: number;
}

/**
 * Regroupe les séquences (dans l'ordre) en blocs de ~2 à 4 min, de la même ambiance si possible (programmation
 * dynamique : coût = écart à 3 min, hors bornes très cher, + séquences d'une autre ambiance). La dernière peut être
 * plus courte (45 s) : c'est la fin, en calme quand il y a au moins 3 groupes.
 */
export function grouperSequences(seqs: readonly SequenceMusicale[]): GroupeMusical[] {
  const n = seqs.length;
  if (n === 0) return [];
  const ref = referenceAmbiances(seqs);
  const ambiances = seqs.map((x) => ambianceDeSequence(x, ref));
  const R = MUSIQUE_AUTO;
  const cout = (i: number, j: number) => {
    const d = seqs[j]!.t1 - seqs[i]!.t0;
    const min = j === n - 1 ? R.finMin : R.groupeMin;
    let c = 0.3 * (Math.abs(d - R.groupeVise) / R.groupeVise);
    if (d < min) c += ((min - d) / 20) ** 2;
    if (d > R.groupeMax) c += ((d - R.groupeMax) / 30) ** 2 * (j > i ? 1 : 0.05);
    c += 3 * (1 - ambianceDuGroupe(seqs, ambiances, i, j).part);
    return c;
  };
  const meilleur = new Array<number>(n + 1).fill(Infinity);
  const coupe = new Array<number>(n + 1).fill(0);
  meilleur[0] = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= j; i++) {
      const c = meilleur[i]! + cout(i, j);
      if (c < meilleur[j + 1]!) {
        meilleur[j + 1] = c;
        coupe[j + 1] = i;
      }
    }
  }
  const bornes: [number, number][] = [];
  for (let j = n; j > 0; j = coupe[j]!) bornes.unshift([coupe[j]!, j - 1]);
  const groupes = bornes.map(([i, j], k): GroupeMusical => ({
    t: seqs[i]!.t0,
    fin: k + 1 < bornes.length ? seqs[bornes[k + 1]![0]]!.t0 : seqs[j]!.t1,
    ambiance: ambianceDuGroupe(seqs, ambiances, i, j).ambiance,
    de: i,
    a: j,
  }));
  // La fin de la vidéo : calme (comme le pizzicato du montage à la main), quand la vidéo a plusieurs parties.
  if (groupes.length >= R.finCalmeDes) groupes[groupes.length - 1]!.ambiance = 'calme';
  return groupes;
}

/* ------------------------------------------------------------------ choix des morceaux */

const PRIORITE: Record<OrigineMorceau, number> = { bibliotheque: 100, kevin: 50, arko: 0 };

/**
 * Un morceau par groupe. Ma bibliothèque d'abord (seule, si elle a au moins 3 musiques utilisables, ou autant que de
 * groupes) ; sinon ses musiques puis Kevin MacLeod puis la musique fabriquée. Parmi elles : la bonne ambiance, un
 * morceau pas encore pris, long (≥ 60 s), jamais le même que le groupe d'avant. Rend les ids des candidats.
 */
export function choisirMorceaux(groupes: readonly GroupeMusical[], candidats: readonly MorceauCandidat[]): string[] {
  const bib = candidats.filter((c) => c.origine === 'bibliotheque');
  const liste = bib.length >= Math.min(3, groupes.length) && bib.length > 0 ? bib : candidats;
  const pris = new Map<string, number>();
  const res: string[] = [];
  groupes.forEach((g) => {
    const avant = res[res.length - 1];
    let meilleur: MorceauCandidat | null = null;
    let score = -Infinity;
    liste.forEach((c, rang) => {
      let s = PRIORITE[c.origine];
      if (c.ambiances[0] === g.ambiance) s += 40;
      else if (c.ambiances.includes(g.ambiance)) s += 28;
      else if (c.ambiances.length === 0) s += 12;
      s -= 70 * (pris.get(c.id) ?? 0);
      if (c.id === avant) s -= 1000;
      if (!c.boucle && c.duree < MUSIQUE_AUTO.morceauLong) s -= 15;
      s -= rang * 0.001; // à égalité : l'ordre de la liste
      if (s > score) {
        score = s;
        meilleur = c;
      }
    });
    const c = meilleur as MorceauCandidat | null;
    if (!c) return;
    res.push(c.id);
    pris.set(c.id, (pris.get(c.id) ?? 0) + 1);
  });
  return res;
}

/** Le plan de la musique : les groupes et le morceau (id de candidat) de chacun. */
export interface PlanMusique {
  groupes: (GroupeMusical & { morceau: string })[];
}

/** Groupes + morceaux. Vide s'il n'y a ni séquence ni morceau. */
export function planifierMusique(seqs: readonly SequenceMusicale[], candidats: readonly MorceauCandidat[]): PlanMusique {
  const groupes = grouperSequences(seqs);
  const ids = choisirMorceaux(groupes, candidats);
  if (ids.length !== groupes.length) return { groupes: [] };
  return { groupes: groupes.map((g, k) => ({ ...g, morceau: ids[k]! })) };
}

/** Remplace un morceau introuvable (téléchargement raté…) par une musique fabriquée de la même ambiance, pas encore prise. */
export function remplacerParArko(plan: PlanMusique, id: string): PlanMusique {
  const pris = new Set(plan.groupes.map((g) => g.morceau));
  return {
    groupes: plan.groupes.map((g) => {
      if (g.morceau !== id) return g;
      const graine = GRAINES_ARKO.find((x) => !pris.has(`arko:${g.ambiance}:${x}`)) ?? GRAINES_ARKO[0];
      const nouveau = `arko:${g.ambiance}:${graine}`;
      pris.add(nouveau);
      return { ...g, morceau: nouveau };
    }),
  };
}

/**
 * Morceaux de la piste musique : un par groupe (`src` = id de la source audio du morceau), au début du groupe ;
 * deux groupes de suite sur le même morceau n'en font qu'un. Le 1er commence après l'accroche.
 */
export function morceauxDuPlan(plan: PlanMusique, sourceDe: (idCandidat: string) => string | undefined): MorceauMusique[] {
  const res: MorceauMusique[] = [];
  for (const g of plan.groupes) {
    const src = sourceDe(g.morceau);
    if (!src) continue;
    if (res[res.length - 1]?.src === src) continue;
    res.push({ src, t: Math.round(g.t * 100) / 100 });
  }
  return res;
}

/**
 * La piste de la musique automatique : `baisseSur: 'parole'` pour le Best-of v4 (une `AnalyseV4`, `v: 4` : ses tours
 * de parole viennent du détecteur de voix), sinon comme avant. `force` impose le choix (null = jamais). Pure.
 */
export function pisteAuto(morceaux: MorceauMusique[], analyse: { v?: number }, force?: 'parole' | null): { morceaux: MorceauMusique[]; baisseSur?: 'parole' } {
  const baisseSur = force === undefined ? (analyse.v === 4 ? 'parole' : null) : force;
  return baisseSur ? { morceaux, baisseSur } : { morceaux };
}
