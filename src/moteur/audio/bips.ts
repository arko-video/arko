// E. Gros mots : bip ou silence (dev 2), dans LE chemin de rendu : sur chaque juron des sous-titres (estJuron), le son
// des PLANS est coupé (fondus 10 ms) et, en mode « bip », un bip de 1 kHz à −12 dBFS est posé à la place ; la
// musique et les sons posés ne bougent pas. Aperçu = export. Contrat : conception/contrat-wankil.md §4.2.

import { estJuron } from '../../auto/habillage/jurons';
import type { Scenario } from '../../recette/chronologie';
import { placerMots } from '../../recette/sous-titres-places';
import type { Recette, Sec } from '../../recette/types';
import { morceauxDuBloc, type EntreeMixage, type SonPose } from './mixeur';
import { FREQUENCE_SORTIE, longueurPcm, type Pcm } from './reechantillonner';

export const BIP = { frequence: 1000, db: -12, fondu: 0.01, marge: 0.03 } as const;

/** Plages à bipper, en temps de sortie, triées et fusionnées (pure). */
export function plagesBip(recette: Recette, scenario: Scenario): { t0: Sec; t1: Sec }[] {
  const st = recette.sousTitres;
  if (!st || st.mots === 'auto') return [];
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const brutes = placerMots(scenario.plans, st.mots, st.src ?? premiere)
    .filter((m) => estJuron(m.mot[0]))
    .map((m) => ({ t0: Math.max(0, m.t0 - BIP.marge), t1: Math.min(scenario.duree, m.t1 + BIP.marge) }))
    .sort((a, b) => a.t0 - b.t0);
  const res: { t0: Sec; t1: Sec }[] = [];
  for (const p of brutes) {
    const der = res[res.length - 1];
    if (der && p.t0 <= der.t1 + 1e-9) der.t1 = Math.max(der.t1, p.t1);
    else res.push({ ...p });
  }
  return res;
}

export interface Bips {
  /** Transforme l'entrée du mixeur d'un bloc (son des plans coupé, bip ajouté). */
  appliquer(e: EntreeMixage): EntreeMixage;
}

/** Gain du son des plans au temps de sortie t : 0 dans une plage, fondus de 10 ms autour, 1 ailleurs. */
export function gainBips(plages: readonly { t0: Sec; t1: Sec }[], t: Sec): number {
  let g = 1;
  for (const p of plages) {
    if (t < p.t0 - BIP.fondu || t > p.t1 + BIP.fondu) continue;
    if (t >= p.t0 && t <= p.t1) return 0;
    g = Math.min(g, t < p.t0 ? (p.t0 - t) / BIP.fondu : (t - p.t1) / BIP.fondu);
  }
  return g;
}

/** Le bip d'une plage : sinus de 1 kHz à −12 dBFS (crête), avec fondus de 10 ms (mono, 48 kHz). */
export function pcmBip(duree: Sec, f = FREQUENCE_SORTIE): Pcm {
  const n = Math.max(1, Math.round(duree * f));
  const a = 10 ** (BIP.db / 20);
  const nf = BIP.fondu * f;
  const x = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const env = Math.min(1, k / nf, (n - 1 - k) / nf);
    x[k] = a * Math.max(0, env) * Math.sin((2 * Math.PI * BIP.frequence * k) / f);
  }
  return { frequence: f, debut: 0, canaux: [x] };
}

/** Copie du PCM d'un morceau avec le gain des bips (null si rien n'y tombe : le même objet est gardé). */
function couper(
  pcm: Pcm,
  plan: { t0: Sec; de: Sec; vit: number },
  plages: readonly { t0: Sec; t1: Sec }[],
): Pcm {
  const n = longueurPcm(pcm);
  const tA = plan.t0 + (pcm.debut - plan.de) / plan.vit;
  const tB = plan.t0 + (pcm.debut + n / pcm.frequence - plan.de) / plan.vit;
  if (!plages.some((p) => p.t1 + BIP.fondu > tA && p.t0 - BIP.fondu < tB)) return pcm;
  const canaux = pcm.canaux.map((c) => new Float32Array(c));
  for (let j = 0; j < n; j++) {
    const g = gainBips(plages, plan.t0 + (pcm.debut + j / pcm.frequence - plan.de) / plan.vit);
    if (g < 1) for (const c of canaux) c[j]! *= g;
  }
  return { ...pcm, canaux };
}

/** null sans `recette.bips` ou sans juron (rendu exactement comme avant). */
export function preparerBips(recette: Recette, scenario: Scenario): Bips | null {
  if (!recette.bips) return null;
  const plages = plagesBip(recette, scenario);
  if (plages.length === 0) return null;
  const avecBip = recette.bips.son === 'bip';
  const sonsBip = new Map<number, SonPose>();
  return {
    appliquer(e) {
      const f = e.frequence ?? FREQUENCE_SORTIE;
      const t1 = e.t0 + e.n / f;
      const touchees = plages.filter((p) => p.t1 + BIP.fondu > e.t0 && p.t0 - BIP.fondu < t1);
      if (touchees.length === 0) return e;
      const morceaux = morceauxDuBloc(e.scenario, e.t0, e.n, f);
      const pcmMorceaux = e.pcmMorceaux.map((pcm, i) =>
        pcm && morceaux[i] ? couper(pcm, morceaux[i]!.plan, touchees) : pcm,
      );
      const sons = [...(e.sons ?? [])];
      if (avecBip) {
        for (const p of touchees) {
          let s = sonsBip.get(p.t0);
          if (!s) sonsBip.set(p.t0, (s = { t: p.t0, vol: 1, pcm: pcmBip(p.t1 - p.t0) }));
          sons.push(s);
        }
      }
      return { ...e, pcmMorceaux, sons };
    },
  };
}
