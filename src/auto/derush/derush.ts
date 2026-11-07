// C. Derush du Best-of (dev 1), fonctions PURES : noter les scènes, resserrer une scène drôle mais longue (au lieu de
// la jeter), choisir jusqu'à la durée visée, et lister les « passages pas retenus » triés par note.
// Appelé par l'intégrateur (auto/express/best-of.ts). Contrat : conception/contrat-wankil.md §3.2.

import type { PassageNote, Sec } from '../../recette/types';
import { dureeApresCoupe, horodatage, motsDans, titreDe } from '../express/scenes';
import { estJuron } from '../habillage/jurons';
import type { PlageTemps } from '../types';
import type { EntreeDerush, SceneNotee } from '../types-v3';
import { debutDePhrase } from './contexte';
import { estFouRire, estProtegee, indicesScene, noterIndices, raisonIndices } from './notation';

export const DERUSH_REGLES = {
  /** Une scène protégée plus longue que ça (après coupe) est resserrée plutôt que jetée. */
  resserrerAuDela: 120,
  /** Cible d'une scène resserrée (s, après coupe). */
  cibleResserree: { min: 60, max: 90 },
  /** Contexte gardé avant chaque sous-moment fort, et chute après. */
  miseEnPlace: { min: 5, max: 15 },
  chute: 2,
  /** Deux morceaux gardés à moins de 3 s l'un de l'autre sont fusionnés. */
  fusion: 3,
  /** Un passage noté sous 20 n'est pas proposé dans « Passages pas retenus ». */
  noteMinPassage: 20,
} as const;

/** Trou d'au moins 2,5 s entre deux mots : on ne remonte pas la mise en place au-delà. */
const PAUSE_MISE_EN_PLACE = 2.5;
/** Un morceau enlevé par resserrer plus court que ça n'est pas proposé comme passage. */
const PASSAGE_MIN: Sec = 5;
const PASSAGES_MAX = 100;

const arrondi = (x: number) => Math.round(x * 100) / 100;

/** Durée gardée après Couper les blancs (sans mots : la durée de la plage). */
function dureeGardee(e: EntreeDerush, p: PlageTemps): Sec {
  const ceux = motsDans(e.mots, p);
  const d = ceux.length > 0 ? dureeApresCoupe(ceux, e.signaux, p) : 0;
  return d > 0 ? d : p.a - p.de;
}

/** Titre d'un passage : la meilleure punchline, sinon « Passage à 12:34 ». */
function titrePassage(e: EntreeDerush, p: PlageTemps): string {
  const t = titreDe(motsDans(e.mots, p), e.signaux, 0);
  return t === 'Partie 0' ? `Passage à ${horodatage(p.de)}` : t;
}

/** Note chaque scène (indices, note, raison, titre = meilleure punchline, protégée). Même ordre que `scenes`. */
export function noterScenes(scenes: readonly PlageTemps[], e: EntreeDerush): SceneNotee[] {
  return scenes.map((p, i) => {
    const indices = indicesScene(p, e.mots, e.signaux, e.paroles);
    return {
      de: p.de,
      a: p.a,
      note: noterIndices(indices),
      raison: raisonIndices(indices),
      titre: titreDe(motsDans(e.mots, p), e.signaux, i + 1),
      indices,
      protegee: estProtegee(indices),
    };
  });
}

/** Un sous-moment fort d'une scène : l'action [t0, t1] et son poids (plus fort d'abord). */
interface SousMoment {
  t0: Sec;
  t1: Sec;
  poids: number;
}

/** Les sous-moments forts de la plage : fous rires, rires, cris, pics (avec leur réaction), jurons. */
function sousMoments(scene: PlageTemps, e: EntreeDerush): SousMoment[] {
  const s = e.signaux;
  const dans = (t: Sec) => t >= scene.de && t < scene.a;
  const res: SousMoment[] = [];
  for (const r of s?.rires ?? []) if (dans(r.t)) res.push({ t0: r.de, t1: r.a, poids: estFouRire(r) ? 20 : 8 });
  for (const c of s?.cris ?? []) if (dans(c.t)) res.push({ t0: c.de, t1: c.a, poids: 6 });
  for (const p of s?.pics ?? []) {
    if (!dans(p.ts)) continue;
    const reaction = [...(s?.rires ?? []), ...(s?.cris ?? [])].filter((x) => x.de >= p.ts && x.de <= p.ts + 3);
    const fin = reaction.reduce((f, x) => Math.max(f, x.a), p.ts + 0.5);
    res.push({ t0: p.ts, t1: fin, poids: 4 + (reaction.length > 0 ? 5 : 0) + Math.min(3, p.z / 3) });
  }
  for (const m of e.mots) if (dans(m[1]) && estJuron(m[0])) res.push({ t0: m[1], t1: m[2], poids: 3 });
  return res.sort((x, y) => y.poids - x.poids || x.t0 - y.t0);
}

/** Morceau gardé autour d'un sous-moment : mise en place (5 à 15 s, début de phrase) et chute (+2 s). */
function morceauAutour(sm: SousMoment, scene: PlageTemps, e: EntreeDerush): PlageTemps {
  const R = DERUSH_REGLES;
  const debut = debutDePhrase(e.mots, sm.t0, R.miseEnPlace.min, R.miseEnPlace.max, PAUSE_MISE_EN_PLACE) ?? sm.t0 - R.miseEnPlace.min;
  return { de: Math.max(scene.de, debut), a: Math.min(scene.a, sm.t1 + R.chute) };
}

/** Range et fusionne les morceaux à moins de `fusion` s. */
function fusionner(morceaux: readonly PlageTemps[], fusion: Sec): PlageTemps[] {
  const tries = [...morceaux].sort((x, y) => x.de - y.de);
  const res: PlageTemps[] = [];
  for (const m of tries) {
    const der = res[res.length - 1];
    if (der && m.de - der.a < fusion) der.a = Math.max(der.a, m.a);
    else res.push({ ...m });
  }
  return res;
}

/**
 * Resserre une scène : garde chaque sous-moment fort avec sa mise en place (5 à 15 s, depuis le début de la phrase)
 * et sa chute (+2 s), fusionne les morceaux proches (< 3 s), jusqu'à environ `cible` s. Toujours au moins 1 morceau.
 */
export function resserrer(scene: SceneNotee, e: EntreeDerush, cible: Sec): PlageTemps[] {
  const R = DERUSH_REGLES;
  const total = (ms: readonly PlageTemps[]) => ms.reduce((t, m) => t + dureeGardee(e, m), 0);
  let gardes: PlageTemps[] = [];
  for (const sm of sousMoments(scene, e)) {
    const essai = fusionner([...gardes, morceauAutour(sm, scene, e)], R.fusion);
    const t = total(essai);
    if (gardes.length > 0 && t > cible * 1.15) continue;
    gardes = essai;
    if (t >= cible * 0.9) break;
  }
  if (gardes.length === 0) {
    // Rien de fort à repérer : le début de la scène, à la durée visée.
    gardes = [{ de: scene.de, a: Math.min(scene.a, scene.de + cible) }];
  }
  return gardes.map((m) => ({ de: arrondi(m.de), a: arrondi(m.a) }));
}

/** Les trous d'une scène entre ses morceaux gardés (les morceaux « enlevés » par resserrer). */
function enleves(scene: PlageTemps, morceaux: readonly PlageTemps[]): PlageTemps[] {
  const res: PlageTemps[] = [];
  let t = scene.de;
  for (const m of morceaux) {
    if (m.de - t >= PASSAGE_MIN) res.push({ de: t, a: m.de });
    t = Math.max(t, m.a);
  }
  if (scene.a - t >= PASSAGE_MIN) res.push({ de: t, a: scene.a });
  return res;
}

function passageDe(e: EntreeDerush, p: PlageTemps, note: number, raison: string): PassageNote {
  const pa: PassageNote = { de: arrondi(p.de), a: arrondi(p.a), note, raison: raison.slice(0, 80), titre: titrePassage(e, p).slice(0, 60) };
  if (e.signaux?.src) pa.src = e.signaux.src;
  return pa;
}

/**
 * Choisit les scènes du Best-of jusqu'à `dureeVisee` (après coupe) : les mieux notées d'abord, les protégées longues
 * resserrées (champ `morceaux`), remises dans l'ordre chronologique. Les autres (et les morceaux enlevés par
 * resserrer, notés à part) deviennent des « passages pas retenus » (note ≥ 20), triés par note décroissante.
 */
export function choisirBestOf(notees: readonly SceneNotee[], e: EntreeDerush, dureeVisee: Sec): { gardees: SceneNotee[]; passages: PassageNote[] } {
  const R = DERUSH_REGLES;
  const cible = (R.cibleResserree.min + R.cibleResserree.max) / 2;
  const prets = notees.map((sc) => {
    if (!sc.protegee || sc.indices.duree <= R.resserrerAuDela) return { sc, duree: sc.indices.duree };
    const morceaux = resserrer(sc, e, cible);
    return { sc: { ...sc, morceaux }, duree: morceaux.reduce((t, m) => t + dureeGardee(e, m), 0) };
  });
  const ordre = prets.map((_, i) => i).sort((x, y) => prets[y]!.sc.note - prets[x]!.sc.note || x - y);
  const garde = new Set<number>();
  let total = 0;
  for (const i of ordre) {
    const { duree } = prets[i]!;
    if (total >= dureeVisee * 0.95) break;
    if (duree <= 0) continue;
    if (total > 0 && total + duree > dureeVisee * 1.1) continue;
    garde.add(i);
    total += duree;
  }
  const gardees = prets.filter((_, i) => garde.has(i)).map((x) => x.sc).sort((x, y) => x.de - y.de);
  const passages: PassageNote[] = [];
  prets.forEach(({ sc }, i) => {
    if (!garde.has(i)) {
      passages.push(passageDe(e, sc, sc.note, sc.raison));
      return;
    }
    if (!sc.morceaux) return;
    for (const p of enleves(sc, sc.morceaux)) {
      const ind = indicesScene(p, e.mots, e.signaux, e.paroles);
      passages.push(passageDe(e, p, noterIndices(ind), raisonIndices(ind)));
    }
  });
  const tries = passages.filter((p) => p.note >= R.noteMinPassage && p.a - p.de >= 0.5).sort((x, y) => y.note - x.note || x.de - y.de);
  return { gardees, passages: tries.slice(0, PASSAGES_MAX) };
}
