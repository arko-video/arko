// C. Qui parle (dev 1), fonctions PURES : relier les mots (Whisper) aux tours de parole.
// Un mot appartient à la personne dont les tours le recouvrent le plus ; une phrase = mots sans trou > 0,6 s
// (et dits par la même personne : un échange rapide donne deux phrases).

import type { Mot, Sec, TourDeParole } from '../../recette/types';
import { TROU_PHRASE } from '../derush/contexte';
import type { PhraseVoix } from '../types-v3';

/** Temps recouvert par chaque personne sur [ts, fin] (un mot sans durée compte comme un point). */
export function recouvrementParPersonne(tours: readonly TourDeParole[], ts: Sec, fin: Sec): Map<string, number> {
  const res = new Map<string, number>();
  for (const t of tours) {
    if (t.ts > fin || t.fin < ts) continue;
    const d = fin > ts ? Math.min(fin, t.fin) - Math.max(ts, t.ts) : 1e-6;
    if (d > 0 || (fin <= ts && t.ts <= ts && ts <= t.fin)) res.set(t.p, (res.get(t.p) ?? 0) + Math.max(d, 1e-6));
  }
  return res;
}

/** La personne qui recouvre le plus [ts, fin] (null si personne). */
export function personneDe(tours: readonly TourDeParole[], ts: Sec, fin: Sec): string | null {
  let meilleure: string | null = null;
  let max = 0;
  for (const [p, d] of recouvrementParPersonne(tours, ts, fin)) {
    if (d > max) {
      max = d;
      meilleure = p;
    }
  }
  return meilleure;
}

/** Id de la personne qui dit ce mot (recouvrement le plus long), ou null. */
export function personneDuMot(tours: readonly TourDeParole[], mot: Mot): string | null {
  return personneDe(tours, mot[1], mot[2]);
}

/** Les phrases et leur personne (pour l'écran « Qui parle ? » et la correction d'un toucher). */
export function phrasesParPersonne(mots: readonly Mot[], tours: readonly TourDeParole[]): PhraseVoix[] {
  const tries = [...tours].sort((x, y) => x.ts - y.ts);
  // Balayage : seuls les tours proches du mot sont regardés (20 000 tours × des milliers de mots restent rapides).
  let debut = 0;
  const qui = mots.map((m) => {
    while (debut < tries.length && tries[debut]!.fin < m[1] - 30) debut++;
    const proches: TourDeParole[] = [];
    for (let i = debut; i < tries.length && tries[i]!.ts <= m[2]; i++) proches.push(tries[i]!);
    return personneDe(proches, m[1], m[2]);
  });
  const phrases: PhraseVoix[] = [];
  let k0 = 0;
  const fermer = (k1: number) => {
    if (k1 <= k0) return;
    const ceux = mots.slice(k0, k1);
    // La personne de la phrase : celle qui dit le plus de ses mots (en durée).
    const parP = new Map<string, number>();
    ceux.forEach((m, j) => {
      const p = qui[k0 + j];
      if (p) parP.set(p, (parP.get(p) ?? 0) + Math.max(0.01, m[2] - m[1]));
    });
    const p = [...parP.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const texte = ceux.map((m) => m[0]).join(' ').replace(/\s+([,.!?…])/g, '$1').trim();
    phrases.push({ k0, k1, ts: ceux[0]![1], fin: ceux[ceux.length - 1]![2], p, texte });
    k0 = k1;
  };
  let courant = qui[0] ?? null;
  for (let k = 1; k <= mots.length; k++) {
    if (k === mots.length) {
      fermer(k);
      break;
    }
    const trou = mots[k]![1] - mots[k - 1]![2] > TROU_PHRASE;
    const change = qui[k] !== null && courant !== null && qui[k] !== courant;
    if (trou || change) {
      fermer(k);
      courant = null;
    }
    courant = qui[k] ?? courant;
  }
  return phrases;
}
