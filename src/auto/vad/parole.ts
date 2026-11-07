// Étape « parole » de la chaîne v4 (dev-vad), PURE : où quelqu'un parle sur toute la source.
//  1. Silero VAD (le modèle rangé dans l'appli) : segments de segments.ts (réglages calibrés sur la vraie session) ;
//  2. sans le modèle (fichier qui ne charge pas, appareil trop vieux) : repli sur l'énergie de la bande voix ET le
//     rythme des syllabes (sans-modele.ts), jamais les mots seuls quand l'énergie existe ;
//  3. ni VAD ni énergie : les mots de Whisper ± 0,05 s (comme avant) ; rien du tout : aucune parole.
// Les passages muets (fin AFK…) ne contiennent jamais de parole. Signature GELÉE (types-v4.ts).

import type { PlageTemps } from '../types';
import type { EntreeParole, ParoleDetectee, SegmentParole } from '../types-v4';
import { paroleSansModele } from './sans-modele';
import { paroleDepuisProbas, paroleDepuisZones } from './segments';

/** Retire des segments les passages muets (plages triées ou non). */
function horsMuets<T extends PlageTemps>(segments: readonly T[], muets: readonly PlageTemps[]): T[] {
  if (muets.length === 0) return [...segments];
  const res: T[] = [];
  for (const s of segments) {
    let morceaux: T[] = [s];
    for (const m of muets) {
      morceaux = morceaux.flatMap((x) => {
        if (m.a <= x.de || m.de >= x.a) return [x];
        const reste: T[] = [];
        if (m.de > x.de) reste.push({ ...x, a: m.de });
        if (m.a < x.a) reste.push({ ...x, de: m.a });
        return reste;
      });
    }
    res.push(...morceaux.filter((x) => x.a - x.de > 1e-6));
  }
  return res;
}

function partDe(segments: readonly PlageTemps[], duree: number): number {
  return duree > 0 ? Math.min(1, segments.reduce((t, s) => t + (s.a - s.de), 0) / duree) : 0;
}

export function detecterParoleV4(e: EntreeParole): ParoleDetectee {
  const muets = e.signaux?.muets ?? [];
  let p: ParoleDetectee;
  if (e.vad) p = paroleDepuisProbas(e.vad, e.duree);
  else if (e.energie && e.energie.db.length > 0) p = paroleDepuisZones(e.src, e.duree, paroleSansModele(e.energie, e.duree), 'sans-modele');
  else {
    const mots = (e.mots ?? []).filter((m) => m[0].trim() && m[2] > m[1]);
    p = paroleDepuisZones(e.src, e.duree, mots.map((m) => ({ de: Math.max(0, m[1] - 0.05), a: m[2] + 0.05 })), mots.length > 0 ? 'mots' : 'sans-modele');
  }
  if (muets.length === 0) return p;
  const segments: SegmentParole[] = horsMuets(p.segments, muets);
  return { ...p, segments, part: partDe(segments, e.duree) };
}
