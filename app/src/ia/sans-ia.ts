// Mode SANS IA (le mode par défaut de la phase 6), fonction PURE : Arko choisit seul les N meilleurs moments
// et applique à chacun une recette type :
//  - un plan sur la plage du moment, qui commence 1,5 s avant le début de l'action, de 12 à 30 s ;
//  - une accroche tirée de la transcription si elle est courte et forte, sinon de la raison du moment ;
//  - un zoom punch et le son « impact.boom » au pic ;
//  - les sous-titres remplis avec les mots du moment (sinon « auto » : à transcrire plus tard) ;
//  - statut « brouillon », et un titre court.

import { ACCROCHE, EXPORT_DEFAUT, MISE_DEFAUT } from '../recette/defauts';
import { normaliser } from '../recette/normaliser';
import { FORMAT_RECETTE, type MiseEnPage, type Mot, type Recette, type Sec, type Source } from '../recette/types';
import type { PropositionAgent } from './agent';
import { cadrer } from './candidats';
import type { Moment } from './moments';
import { picDe, texteDesMots } from './mots-moments';

export interface OptionsSansIA {
  /** Mise en page des clips (défaut : fond flou). */
  mise?: MiseEnPage;
  /** Moment sans mots transcrits : sous-titres « auto » (à transcrire plus tard, défaut) ou aucun. */
  sansMots?: 'auto' | 'aucun';
  /** Durée des clips (défaut 12 à 30 s). */
  dureeMin?: Sec;
  dureeMax?: Sec;
  /** Le plan commence autant de secondes avant le début de l'action (défaut 1,5 s). */
  avance?: Sec;
}

/** Mots « forts » qui font une bonne accroche quand ils sont dits au moment de l'action. */
const FORTS = /(^|[\s'’])(non+|nan|quoi|attends?|oh+|wow|waouh|incroyable|jamais|allez|go|gg|ah+|olala|pardon|wesh|mdr|trop|dingue|fou)([\s,.!?…]|$)|[!?]/i;

/** Étiquette principale d'un moment (la plus parlante). */
export function etiquettePrincipale(m: Moment): string {
  for (const e of ['silence>pic', 'cri', 'rire', 'pic', 'scene']) if (m.etiquettes.includes(e)) return e;
  return m.etiquettes[0] ?? 'pic';
}

/** Accroches de secours, selon l'étiquette (6 mots au plus). On varie avec le rang du clip. */
const ACCROCHES: Record<string, string[]> = {
  'silence>pic': ['ATTENDS LA FIN…', 'PERSONNE NE S’Y ATTENDAIT', 'REGARDE BIEN…'],
  cri: ['LE CRI DE TROP', 'J’AI HURLÉ SI FORT', 'ÇA M’A FAIT CRIER'],
  rire: ['MORT DE RIRE', 'FOU RIRE GARANTI', 'J’EN PLEURE ENCORE'],
  pic: ['LE CLUTCH', 'CE MOMENT LÀ…', 'ATTENDS LA FIN…'],
  scene: ['RETOURNEMENT DE SITUATION', 'ATTENDS LA FIN…', 'REGARDE BIEN…'],
};

const TITRES: Record<string, string> = {
  'silence>pic': 'Calme puis gros pic',
  cri: 'Le cri',
  rire: 'Fou rire',
  pic: 'Gros pic',
  scene: 'Changement de scène',
};

/** Extrait court (1 à 6 mots, 40 caractères au plus) ET fort, dit autour de l'action ; sinon null. */
export function extraitFort(m: Moment): string | null {
  const pic = picDe(m);
  const autour = (m.mots ?? []).filter((w) => w[1] >= pic - 2 && w[1] <= pic + 2.5);
  const essais = [autour.length ? texteDesMots(autour) : '', m.extrait ?? ''];
  const fortsMarques = autour.some((w) => w[3] === 1);
  for (const txt of essais) {
    const nb = txt.split(/\s+/).filter(Boolean).length;
    if (nb >= 1 && nb <= 6 && txt.length <= 40 && (FORTS.test(txt) || fortsMarques)) return txt.replace(/["“”«»]/g, '').trim();
  }
  return null;
}

/** Texte d'accroche d'un moment (en majuscules). */
export function accrocheDuMoment(m: Moment, rang = 0): string {
  const extrait = extraitFort(m);
  if (extrait) return extrait.toUpperCase();
  const liste = ACCROCHES[etiquettePrincipale(m)] ?? ACCROCHES.pic!;
  return liste[rang % liste.length]!;
}

/** « 1:02:05 » ou « 4:07 », à la seconde la plus proche (59,98 s → « 1:00 »). */
export function heure(t: Sec): string {
  const s = Math.max(0, Math.round(t));
  const h = Math.floor(s / 3600);
  const mn = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(mn).padStart(2, '0')}:${sec}` : `${mn}:${sec}`;
}

/** Titre court : l'extrait fort s'il y en a un, sinon le type de moment et l'heure (« Fou rire à 1:23:45 »). */
export function titreDuMoment(m: Moment): string {
  const extrait = extraitFort(m);
  if (extrait) {
    const t = extrait.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return `${TITRES[etiquettePrincipale(m)] ?? 'Moment fort'} à ${heure(picDe(m))}`;
}

/** Le clip proposé pour UN moment (recette normalisée, avec ses problèmes éventuels). */
export function clipDuMoment(m: Moment, source: Source, rang = 0, o: OptionsSansIA = {}): PropositionAgent {
  const pic = picDe(m);
  const avance = o.avance ?? 1.5;
  let { debut: de, fin: a } = cadrer(m.debut - avance, m.fin, source.duree, o.dureeMin ?? 12, o.dureeMax ?? 30);
  // Sécurité : le pic doit être dans le plan (moment venu d'ailleurs, mal formé).
  if (pic < de || pic > a) ({ debut: de, fin: a } = cadrer(pic - avance, pic + 10, source.duree, o.dureeMin ?? 12, o.dureeMax ?? 30));
  const mots: Mot[] = (m.mots ?? []).filter((w) => w[1] >= de && w[1] < a).map((w) => [...w] as Mot);
  const sansMots = o.sansMots ?? 'auto';
  const brut: Recette = {
    format: FORMAT_RECETTE,
    titre: titreDuMoment(m),
    sources: [{ ...source }],
    plans: [{ src: source.id, de, a, ...(m.id ? { m: m.id } : {}) }],
    mise: o.mise ? { ...o.mise } : { ...MISE_DEFAUT },
    textes: [{ txt: accrocheDuMoment(m, rang), role: 'accroche', t: ACCROCHE.t, dur: ACCROCHE.dur, style: ACCROCHE.style, y: ACCROCHE.y }],
    sousTitres: mots.length > 0 ? { mots } : sansMots === 'auto' ? { mots: 'auto' } : null,
    sons: [{ id: 'impact.boom', ts: pic, src: source.id }],
    zooms: [{ ts: pic, src: source.id, style: 'punch' }],
    guide: null,
    boucle: false,
    marqueurs: [{ ts: pic, src: source.id, type: etiquettePrincipale(m), ...(m.raison ? { label: m.raison } : {}) }],
    statut: 'brouillon',
    export: { ...EXPORT_DEFAUT },
  };
  const { recette, problemes } = normaliser(brut, { sources: [source] });
  return { recette, raison: m.raison ?? '', problemes };
}

/**
 * Propose `nombre` clips sans IA : les moments au meilleur score (à égalité, le plus tôt), un clip chacun.
 * `sourceInfos` = les infos de la source analysée (`SourceOuverte.infos`).
 */
export function clipsSansIA(moments: Moment[], sourceInfos: Source, nombre = 10, options: OptionsSansIA = {}): PropositionAgent[] {
  const choisis = [...moments].sort((x, y) => y.score - x.score || x.debut - y.debut).slice(0, Math.max(0, Math.floor(nombre)));
  return choisis.map((m, i) => clipDuMoment(m, sourceInfos, i, options));
}
