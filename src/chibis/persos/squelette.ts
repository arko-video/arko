// D. Squelette d'un perso (styles « Persos ») : épaules, coudes, mains, hanches, genoux, pieds pour une émotion,
// d'après la fiche du style et la posture. Pur (aucun dessin) : coudes et genoux trouvés par une cinématique
// inverse à 2 os (longueurs fixes, pli du côté voulu).

import type { Emotion } from '../catalogue';
import type { Pt } from '../courbes';
import type { Fiche } from './fiches';
import { MAINS, POSTURES, type FormeMain, type PoseJambes, type PoseMain, type Posture } from './postures';

/** Un membre : racine (épaule, hanche), articulation (coude, genou), bout (main, pied). */
export interface Membre {
  a: Pt;
  b: Pt;
  c: Pt;
  forme: FormeMain;
  devant: boolean;
}

export interface Squelette {
  posture: Posture;
  /** Penches et déplacements, déjà exagérés selon le style. */
  corps: number;
  tete: number;
  saut: number;
  etire: number;
  /** Le haut du corps descend de `plie` unités (jambes pliées). */
  plie: number;
  /** Côté droit (x > 0) puis gauche. */
  bras: [Membre, Membre];
  jambes: [Membre, Membre];
}

/** Coude (ou genou) et bout d'un membre de longueurs l1, l2 qui vise `cible` ; pli du côté de `pref`. */
export function plier(a: Pt, cible: Pt, l1: number, l2: number, pref: Pt): [Pt, Pt] {
  let dx = cible[0] - a[0];
  let dy = cible[1] - a[1];
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.5;
  const ux = dx / d;
  const uy = dy / d;
  d = Math.max(min, Math.min(max, d));
  dx = ux * d;
  dy = uy * d;
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const A = Math.acos(cosA);
  const coude = (sgn: number): Pt => {
    const c = Math.cos(sgn * A);
    const s = Math.sin(sgn * A);
    return [a[0] + (ux * c - uy * s) * l1, a[1] + (ux * s + uy * c) * l1];
  };
  const p1 = coude(1);
  const p2 = coude(-1);
  const score = (p: Pt) => (p[0] - a[0] - dx / 2) * pref[0] + (p[1] - a[1] - dy / 2) * pref[1];
  return [score(p1) >= score(p2) ? p1 : p2, [a[0] + dx, a[1] + dy]];
}

function unBras(f: Fiche, p: Posture['d'], cote: 1 | -1, plie: number, teteTilt: number): Membre {
  const m = MAINS[p];
  let a: Pt = [cote * f.epaule.x, f.epaule.y + plie];
  const L = f.bras[0] + f.bras[1];
  let cible: Pt;
  if (m.base === 'epaule') cible = [a[0] + cote * m.dx * L, a[1] + m.dy * L];
  else if (m.base === 'torse') {
    const t = f.torse;
    cible = [cote * m.dx * ((t.lh + t.lb) / 2), t.haut + plie + m.dy * (t.bas - t.haut)];
  } else {
    // Autour de la tête, qui penche autour du cou.
    const x = cote * m.dx * f.tete.rx;
    const y = f.tete.cy - f.cou + m.dy * f.tete.ry;
    const rr = (teteTilt * Math.PI) / 180;
    cible = [x * Math.cos(rr) - y * Math.sin(rr), f.cou + plie + x * Math.sin(rr) + y * Math.cos(rr)];
  }
  const pref: Pt = [cote * m.coude[0], m.coude[1]];
  if (f.membres === 'moignons') {
    // Mini bras : il pointe vers la cible, sans jamais l'atteindre.
    // Toujours vers l'extérieur : un mini bras ne passe jamais devant le visage. Levé : il part plus haut.
    const dy = cible[1] - a[1];
    const ecart = dy < -L * 0.5 ? Math.abs(dy) * 0.22 + 1 : Math.abs(dy) * 0.45 + 2;
    const dx = cote > 0 ? Math.max(cible[0] - a[0], ecart) : Math.min(cible[0] - a[0], -ecart);
    if (dy < -L * 0.5) a = [a[0] - cote * 2.5, a[1] - 7];
    const l = Math.hypot(dx, dy) || 1;
    const c: Pt = [a[0] + (dx / l) * L, a[1] + (dy / l) * L];
    return { a, b: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], c, forme: m.forme, devant: true };
  }
  const [b, c] = plier(a, cible, f.bras[0], f.bras[1], pref);
  return { a, b, c, forme: m.forme, devant: m.devant ?? false };
}

function uneJambe(f: Fiche, j: PoseJambes, cote: 1 | -1, plie: number): Membre {
  const L = f.jambe[0] + f.jambe[1];
  const a: Pt = [cote * f.hanche.x, f.hanche.y + plie];
  let pied: Pt = [cote * f.hanche.x * 1.15, 0];
  let pref: Pt = [cote, 0];
  switch (j) {
    case 'ecartees': pied = [cote * (f.hanche.x + 0.42 * L), 0]; break;
    case 'saut': pied = [cote * (f.hanche.x + 0.3 * L), a[1] + 0.72 * L]; pref = [cote, -0.5]; break;
    case 'flechies': pied = [cote * (f.hanche.x + 0.32 * L), 0]; break;
    case 'genoux': pied = [cote * (f.hanche.x + 0.3 * L), 0]; pref = [-cote, 0]; break;
    case 'croisees': if (cote > 0) pied = [-f.hanche.x * 0.8, 0]; break;
    case 'pointe': if (cote > 0) { pied = [f.hanche.x * 1.6, -0.32 * L]; pref = [1, 0.6]; } break;
    default: break;
  }
  if (f.membres === 'moignons') {
    const ecart = j === 'ecartees' || j === 'saut' ? 4 : j === 'genoux' ? -2 : 0;
    const leve = cote > 0 && j === 'pointe' ? -4 : 0;
    const c: Pt = [cote * (f.hanche.x + ecart), -f.pied.h * 0.6 + leve];
    return { a: c, b: c, c, forme: 'ouverte', devant: false };
  }
  const [b, c] = plier(a, pied, f.jambe[0], f.jambe[1], pref);
  return { a, b, c, forme: 'ouverte', devant: false };
}

/** Squelette pour une émotion ; `mains` (situation de jeu) remplace la pose des bras de l'émotion. */
export function squelette(f: Fiche, emo: Emotion, mains: [PoseMain | undefined, PoseMain | undefined] = [undefined, undefined]): Squelette {
  const base = POSTURES[emo] ?? POSTURES.parle;
  const p: Posture = { ...base, d: mains[0] ?? base.d, g: mains[1] ?? base.g };
  const x = f.exagere;
  // Un buste ne s'accroupit pas (son bord du bas reste en bas) et saute moins haut.
  const plie = f.buste ? 0 : p.plie * Math.min(x, 1.3);
  // Penches bornées : un perso exagéré ne doit pas tomber.
  const max = f.membres === 'moignons' ? 18 : 30; // la mascotte penche tout entière
  const tete = Math.max(-max, Math.min(max, p.tete * x));
  const bras: [Membre, Membre] = [unBras(f, p.d, 1, plie, tete), unBras(f, p.g, -1, plie, tete)];
  const jambes: [Membre, Membre] = [uneJambe(f, p.jambes, 1, plie), uneJambe(f, p.jambes, -1, plie)];
  return { posture: p, corps: Math.max(-12, Math.min(12, p.corps * x)), tete, saut: p.saut * x * (f.buste ? 0.5 : 1), etire: p.etire * x, plie, bras, jambes };
}
