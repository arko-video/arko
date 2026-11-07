// Best-of v4 — « Sous-titres précis » (dev-mots-2, 7/11/2026). Fonctions PURES ; le Worker est dans
// src/sous-titres/precis.ts (page) et worker-precis.ts.
//
// Après la revue, AVANT le montage : Whisper réécoute SEULEMENT les tours de la voix sous-titrée (la voix faible,
// « Sous-titres pour ») dans les séquences gardées, chaque tour remonté vers −20 dBFS (gain de dev-mots) et les tours
// COLLÉS dans des fenêtres de 28 s (0,2 s de blanc entre eux). Ses mots remplacent ceux de l'analyse dans ces tours
// (même nettoyage nettoyerMotsV4) ; le montage refait ensuite punchlines, sous-titres de la voix faible et émotions des
// persos avec ces mots. Les coupes (morceaux de l'analyse) ne bougent pas. Moteur : Whisper small
// (sous-titres/config-precis.ts), avec l'accord de l'utilisateur (ui/auto/express/precis-v4.ts).
//
// MESURÉ (vraie session, 3 séquences gardées par le Best-of = 201 s, 30 tours et 30 sous-titres de Romain dans la
// vérité ; transformers.js 4.3.2 sur onnxruntime-web WASM 1 fil comme le Worker, sauf turbo : onnxruntime-node ;
// texte comparé aux sous-titres du montage à la main ; calcul sur une VM à 2 cœurs partagée) :
//                                       tours R  sous-titres R  mots de R justes  écrits faux  calcul      à télécharger
//   Arko d'aujourd'hui (base, analyse)   19/30      17/30        39/132 (30 %)       50 %        —             —
//   base, séquences réécoutées           21/30      23/30        55/132 (42 %)       53 %     69 s/min         —
//   base, tour par tour + gain           25/30      26/30        54/132 (41 %)       54 %    106 s/min*        —
//   base, tours collés + gain            24/30      25/30        77/132 (58 %)       47 %     38 s/min*        —
//   small q8, séquences réécoutées       20/30      19/30        62/132 (47 %)       37 %    113 s/min      252 Mo
//   small q8, tour par tour + gain       27/30      28/30        84/132 (64 %)       41 %    252 s/min*     252 Mo
//   small q8, tours collés + gain        26/30      26/30        92/132 (70 %)       32 %    106 s/min*     252 Mo
//   small q4/q8, tours collés + gain     25/30      25/30        87/132 (66 %)       30 %    137 s/min*     226 Mo
//   large-v3-turbo q4, tour par tour     28/30      29/30       105/132 (80 %)       27 %    375 s/min*   ≈ 760 Mo
//   (* par minute de tours de la voix faible : ≈ 36 % du temps des séquences gardées sur cette session)
// Toute la session (banc v4, mode mots ; 152 tours réécoutés = 505 s pour un montage de 16 min 55 ; 62 sous-titres de
// Romain = 287 mots) : small q4/q8 → mots de Romain justes 80 → 217 (28 → 76 %), écrits faux 45 → 34 %, « ! » 1 → 15,
// sous-titres de la vérité recouverts 32 → 61 / 227, calcul 920 s ; base réécoutant les mêmes tours : 80 → 104 justes
// mais 66 → 104 faux, 38 / 227 (pas assez : pas retenu). Rapport : equipe/rapports/dev-mots-2.md.

import type { Mot } from '../../recette/types';
import { plagesGardees } from '../express/best-of';
import type { PlageTemps } from '../types';
import type { AnalyseV4, RevueV4 } from '../types-v4';
import { energieDuMelange } from '../vad/audible';
import { nettoyerMotsV4 } from './nettoyage-v4';

export const PASSE_PRECISE = {
  /** Marge autour d'un tour (s) : le début et la fin des mots ne sont jamais rognés. */
  marge: 0.3,
  /** Deux tours à moins de `colle` s n'en font qu'un. */
  colle: 0.05,
  /** Un bout de tour plus court n'est pas réécouté (s). */
  min: 0.2,
} as const;

const milieu = (m: Mot) => (m[1] + m[2]) / 2;

/** Triées, fusionnées sous `colle` s. */
function fusionner(plages: readonly PlageTemps[], colle: number): PlageTemps[] {
  const res: PlageTemps[] = [];
  for (const p of [...plages].sort((x, y) => x.de - y.de)) {
    const d = res[res.length - 1];
    if (d && p.de <= d.a + colle) d.a = Math.max(d.a, p.a);
    else res.push({ de: p.de, a: p.a });
  }
  return res;
}

/**
 * Ce que la 2ᵉ passe réécoute : les tours de la voix sous-titrée (`revue.sousTitresPour`) dans les séquences gardées,
 * élargis de `marge`, coupés aux bords des séquences, fusionnés ; seulement ceux qui touchent un morceau gardé par les
 * coupes (quand l'analyse en a). Vide : personne de sous-titré, pas de voix, rien de gardé.
 */
export function plagesPrecises(
  a: Pick<AnalyseV4, 'voix' | 'morceaux'>,
  revue: Pick<RevueV4, 'scenes' | 'sousTitresPour'>,
  r: typeof PASSE_PRECISE = PASSE_PRECISE,
): PlageTemps[] {
  const p = revue.sousTitresPour;
  if (!p || !a.voix) return [];
  const sequences = fusionner(plagesGardees(revue.scenes), r.colle);
  if (sequences.length === 0) return [];
  const morceaux = fusionner(a.morceaux ?? [], 0);
  const touche = (x: PlageTemps) => morceaux.length === 0 || morceaux.some((m) => m.a > x.de && m.de < x.a);
  const bouts: PlageTemps[] = [];
  for (const t of a.voix.tours) {
    if (t.p !== p) continue;
    for (const s of sequences) {
      const de = Math.max(s.de, t.ts - r.marge);
      const fin = Math.min(s.a, t.fin + r.marge);
      if (fin - de >= r.min) bouts.push({ de: Math.round(de * 1000) / 1000, a: Math.round(fin * 1000) / 1000 });
    }
  }
  return fusionner(bouts, r.colle).filter(touche);
}

/** Le milieu du mot tombe-t-il dans une des plages (triées, sans chevauchement) ? Recherche dichotomique. */
function dansPlages(plages: readonly PlageTemps[], t: number): boolean {
  let bas = 0;
  let haut = plages.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (plages[m]!.a <= t) bas = m + 1;
    else haut = m;
  }
  return bas < plages.length && plages[bas]!.de <= t;
}

/**
 * L'analyse avec les mots de la 2ᵉ passe : dans les `plages` réécoutées, les mots d'avant sont retirés et ceux de la
 * passe précise (déjà passés par nettoyer + corrections, comme tout mot du Worker) sont nettoyés par nettoyerMotsV4
 * puis mis à leur place. Hors des plages, rien ne change. Mode voix (pas de mots) ou rien réécouté : `a` tel quel.
 */
export function avecMotsPrecis(a: AnalyseV4, plages: readonly PlageTemps[], mots: readonly Mot[]): AnalyseV4 {
  if (a.parole !== 'mots' || plages.length === 0) return a;
  const triees = fusionner(plages, 0);
  // Le niveau de toutes les voix (pistes séparées : leur mélange), comme l'étape « mots » de la chaîne.
  const nettoyes = nettoyerMotsV4({ mots, plages: triees, parole: a.paroleDetectee, energie: energieDuMelange(a.empreintes) ?? a.energie }).mots;
  const dans = (m: Mot) => dansPlages(triees, milieu(m));
  const gardes = a.transcription.mots.filter((m) => !dans(m));
  const nouveaux = nettoyes.filter(dans);
  const tous = [...gardes, ...nouveaux].sort((x, y) => x[1] - y[1]);
  return { ...a, transcription: { ...a.transcription, mots: tous } };
}

/** Comptes pour le journal (jamais de texte) : mots d'avant et d'après dans les plages réécoutées, secondes. */
export function bilanPrecis(avant: AnalyseV4, apres: AnalyseV4, plages: readonly PlageTemps[]): { avant: number; apres: number; secondes: number } {
  const triees = fusionner(plages, 0);
  const compte = (a: AnalyseV4) => a.transcription.mots.filter((m) => m[0].trim() && dansPlages(triees, milieu(m))).length;
  return { avant: compte(avant), apres: compte(apres), secondes: Math.round(triees.reduce((s, p) => s + p.a - p.de, 0) * 10) / 10 };
}
