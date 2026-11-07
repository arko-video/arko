// Séquences du Best-of v4 (dev-scenes), fonction PURE pour la revue : « Plus de contexte / Moins » d'une séquence.
// Une touche = une phrase de plus (ou de moins) au début ou à la fin, bornes toujours dans une pause entre deux
// paroles ; le moment au cœur reste toujours dedans. La durée affichée est recalculée par e.dureeDe (= le montage) ;
// le centile (★) et le titre ne changent pas. Contrat : CONTRAT.md §1.6.

import type { EntreeSequences, SequenceV4 } from '../types-v4';
import { debutPhrase, finPhrase, momentsDans, noterHistoire, paroleDeLaPlage, plageEntre } from './histoires';
import { parolesActives, raisonHistoire } from './sequences';

const arrondi1 = (x: number) => Math.round(x * 10) / 10;

/**
 * La séquence avec une phrase de plus (`sens` = 1 : « Plus de contexte ») ou de moins (−1 : « Moins ») au début ou
 * à la fin. Rend la MÊME séquence (même objet) si ce n'est pas possible : plus rien avant / après, ou la phrase à
 * retirer contient le moment au cœur, ou il ne resterait rien.
 */
export function ajusterSequence(s: SequenceV4, e: EntreeSequences, cote: 'debut' | 'fin', sens: 1 | -1): SequenceV4 {
  const u = parolesActives(e);
  const r = paroleDeLaPlage(u, s);
  if (!r) return s;
  let [i0, i1] = r;
  if (cote === 'debut') {
    if (sens > 0) {
      if (i0 === 0) return s;
      i0 = debutPhrase(u, i0 - 1);
    } else {
      i0 = finPhrase(u, i0) + 1;
      if (i0 > i1) return s;
    }
  } else if (sens > 0) {
    if (i1 >= u.length - 1) return s;
    i1 = finPhrase(u, i1 + 1);
  } else {
    i1 = debutPhrase(u, i1) - 1;
    if (i1 < i0) return s;
  }
  const p = plageEntre(u, i0, i1, e.duree);
  // Le cœur reste dedans (« Moins » ne retire jamais le moment fort).
  if (sens < 0 && (p.de > s.coeur.de + 0.01 || p.a < s.coeur.a - 0.01)) return s;
  const iCoeur = e.moments.findIndex((m) => Math.abs(m.de - s.coeur.de) < 0.01 && Math.abs(m.a - s.coeur.a) < 0.01);
  const h = noterHistoire({ i0, i1, coeur: s.coeur, iCoeur, forceCoeur: iCoeur >= 0 ? e.moments[iCoeur]!.force : 0 }, e, u);
  return { ...s, de: p.de, a: p.a, duree: arrondi1(h.garde), noteBrute: h.noteBrute, moments: momentsDans(e.moments, p), raison: raisonHistoire(h, e.moments).slice(0, 80) };
}
