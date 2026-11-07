// C. Qui parle (dev 1), fonctions PURES : séparer les voix.
// - Pistes séparées (OBS : micro et Discord sur 2 pistes) : une voix par piste, exact.
// - Une seule piste : niveau + timbre. Si les niveaux forment 2 groupes écartés d'au moins 8 dB (ex. −40 et −25 dB),
//   les trames à plus de 4 dB du seuil sont « sûres » ; un classifieur de timbre (centroïdes) appris sur elles
//   attribue les autres. Sinon : timbre seul (2 groupes), ou une seule voix.
// Puis lissage (0,3 s), tours de 0,4 s au moins, trous de moins de 0,3 s bouchés. Contrat : contrat-wankil.md §3.3.

import type { TourDeParole } from '../../recette/types';
import { zonesDeVoix } from '../coupes/voix';
import type { PlageTemps } from '../types';
import type { EmpreintesVoix, VoixDetectees, VoixTrouvee } from '../types-v3';
import { deuxGroupesDeNiveau, kMoyennes2, moyenne, plusProche, timbre } from './classement';
import { construireTours, lisserEtiquettes } from './tours';

export const REGLAGES_QUI_PARLE = {
  /** Écart minimal entre les 2 groupes de niveaux pour séparer par le niveau (dB). */
  ecartSurDb: 8,
  /** Une trame à plus de 4 dB du seuil est « sûre ». */
  margeSureDb: 4,
  /** Écart minimal de distance de timbre pour trancher sans le niveau (0 à 1). */
  margeTimbre: 0.15,
  /** Lissage (médiane) des étiquettes, en s. */
  lissage: 0.3,
  tourMin: 0.4,
  trouMax: 0.3,
  /** Voix au plus (au-delà : pistes séparées seulement). */
  voixMax: 4,
} as const;

export type ReglagesQuiParle = { -readonly [K in keyof typeof REGLAGES_QUI_PARLE]: number };

/** Timbre seul : morceaux de parole de 2 s au plus (1 s au moins pour apprendre), rapport inter / intra ≥ 1,5. */
const MORCEAU_MAX = 2;
const MORCEAU_MIN = 1;
/** Une pause de 0,2 s sépare deux morceaux. */
const PAUSE_MORCEAU = 0.2;
const RAPPORT_TIMBRE = 1.5;
/** Trames sous ce niveau : personne ne parle (dBFS). */
const NIVEAU_MIN = -70;

/** Netteté de chaque tour (sert à choisir les extraits les plus nets). */
const nettetes = new WeakMap<TourDeParole, number>();

function mediane(x: number[]): number {
  if (x.length === 0) return -100;
  const t = [...x].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)]!;
}

/** Trames de voix : dans une zone et au-dessus de −70 dB. */
function tramesDeVoix(e: EmpreintesVoix, zones: readonly PlageTemps[]): number[] {
  const n = e.db.length;
  const dedans = new Uint8Array(n);
  for (const z of zones) for (let k = Math.max(0, Math.floor(z.de / e.pas)); k < Math.min(n, Math.ceil(z.a / e.pas)); k++) dedans[k] = 1;
  const res: number[] = [];
  for (let k = 0; k < n; k++) if (dedans[k] && e.db[k]! > NIVEAU_MIN) res.push(k);
  return res;
}

/** Niveau lissé sur 100 ms (5 trames de voix voisines). */
function niveauxLisses(e: EmpreintesVoix, trames: readonly number[]): Float32Array {
  const res = new Float32Array(trames.length);
  for (let i = 0; i < trames.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(trames.length - 1, i + 2); j++) {
      if (Math.abs(trames[j]! - trames[i]!) > 2) continue;
      s += e.db[trames[j]!]!;
      c++;
    }
    res[i] = s / c;
  }
  return res;
}

/** Morceaux de parole : indices (dans `trames`) de trames qui se suivent (pause < 0,2 s), coupés à 2 s. */
function morceauxDeParole(trames: readonly number[], pas = 0.02): number[][] {
  const res: number[][] = [];
  const max = Math.round(MORCEAU_MAX / pas);
  trames.forEach((k, i) => {
    const der = res[res.length - 1];
    const prec = i > 0 ? trames[i - 1]! : -Infinity;
    if (der && k - prec < PAUSE_MORCEAU / pas && k - trames[der[0]!]! < max) der.push(i);
    else res.push([i]);
  });
  return res;
}

/** Spectre moyen (énergies moyennées, puis dB moins leur moyenne) de quelques trames. */
function spectreMoyen(bandes: Float32Array, ks: readonly number[]): Float64Array {
  const m = new Float64Array(8);
  for (const k of ks) for (let b = 0; b < 8; b++) m[b]! += 10 ** (bandes[k * 8 + b]! / 10) / ks.length;
  let moy = 0;
  for (let b = 0; b < 8; b++) {
    m[b] = 10 * Math.log10(m[b]! + 1e-12);
    moy += m[b]! / 8;
  }
  for (let b = 0; b < 8; b++) m[b]! -= moy;
  return m;
}

/** Attribue chaque trame de voix à un groupe (0 = la plus faible) ; sûre ou non, et sa netteté. */
function classer(e: EmpreintesVoix, trames: readonly number[], r: ReglagesQuiParle): { methode: VoixDetectees['methode']; g: Int8Array; sure: Uint8Array; nettete: Float32Array; voix: number } {
  const m = trames.length;
  const g = new Int8Array(m);
  const sure = new Uint8Array(m).fill(1);
  const nettete = new Float32Array(m);
  const niveaux = niveauxLisses(e, trames);
  const groupes = deuxGroupesDeNiveau(niveaux, r.ecartSurDb);
  if (groupes) {
    const x = trames.map((k) => timbre(e.bandes, k));
    niveaux.forEach((l, i) => {
      g[i] = l < groupes.seuil ? 0 : 1;
      sure[i] = Math.abs(l - groupes.seuil) > r.margeSureDb ? 1 : 0;
      nettete[i] = Math.abs(l - groupes.seuil);
    });
    const c0 = moyenne(x.filter((_, i) => sure[i] && g[i] === 0));
    const c1 = moyenne(x.filter((_, i) => sure[i] && g[i] === 1));
    if (c0 && c1)
      for (let i = 0; i < m; i++) {
        if (sure[i]) continue;
        const p = plusProche(x[i]!, c0, c1);
        if (p.ecart >= r.margeTimbre) g[i] = p.g; // sinon : le niveau tranche
      }
    return { methode: 'niveau+timbre', g, sure, nettete, voix: 2 };
  }
  // Timbre seul, par MORCEAUX de parole (≤ 2 s, entre deux pauses) : leur spectre moyen ne dépend presque plus des
  // voyelles dites, seulement de la voix (« spectre moyen à long terme »).
  const morceaux = morceauxDeParole(trames);
  const points = morceaux.map((ix) => spectreMoyen(e.bandes, ix.map((i) => trames[i]!)));
  const utiles = morceaux.map((ix, j) => (ix.length >= MORCEAU_MIN / e.pas ? j : -1)).filter((j) => j >= 0);
  const km = kMoyennes2(utiles.map((j) => points[j]!));
  const part0 = km ? km.groupes.filter((x) => x === 0).length / km.groupes.length : 0;
  if (!km || km.rapport < RAPPORT_TIMBRE || part0 < 0.1 || part0 > 0.9) return { methode: 'une', g, sure, nettete, voix: 1 };
  // La voix 0 est la plus faible (niveau médian de son groupe).
  const niv = [0, 1].map((v) => mediane(utiles.flatMap((j, u) => (km.groupes[u] === v ? morceaux[j]!.map((i) => niveaux[i]!) : []))));
  const centres = niv[0]! > niv[1]! ? [km.c[1], km.c[0]] : [km.c[0], km.c[1]];
  morceaux.forEach((ix, j) => {
    const p = plusProche(points[j]!, centres[0]!, centres[1]!);
    for (const i of ix) {
      g[i] = p.g;
      sure[i] = p.ecart >= r.margeTimbre ? 1 : 0;
      nettete[i] = p.ecart * 10;
    }
  });
  return { methode: 'timbre', g, sure, nettete, voix: 2 };
}

/** Sépare les voix d'UNE piste (mélange). `zones` = où quelqu'un parle (zonesDeVoix, ou les mots). */
export function separerVoix(e: EmpreintesVoix, zones: readonly PlageTemps[], src: string, o: Partial<ReglagesQuiParle> = {}): VoixDetectees {
  const r: ReglagesQuiParle = { ...REGLAGES_QUI_PARLE, ...o };
  const trames = tramesDeVoix(e, zones);
  if (trames.length === 0) return { src, methode: 'une', voix: [], tours: [], sure: 0 };
  const c = classer(e, trames, r);
  const n = e.db.length;
  const etiq = new Int8Array(n).fill(-1);
  const sure = new Uint8Array(n);
  const nettete = new Float32Array(n);
  trames.forEach((k, i) => {
    etiq[k] = c.g[i]!;
    sure[k] = c.sure[i]!;
    nettete[k] = c.nettete[i]!;
  });
  const lissees = lisserEtiquettes(etiq, Math.round(r.lissage / e.pas), c.voix);
  const ids = Array.from({ length: c.voix }, (_, v) => `p${v + 1}`);
  const { tours, nettetes: nt } = construireTours(lissees, sure, nettete, e.pas, ids, { tourMin: r.tourMin, trouMax: r.trouMax, src });
  tours.forEach((t, i) => nettetes.set(t, nt[i]!));
  const voix: VoixTrouvee[] = ids.map((id, v) => {
    const siennes = trames.filter((k) => lissees[k] === v);
    return { id, niveauDb: Math.round(mediane(siennes.map((k) => e.db[k]!)) * 10) / 10, part: siennes.length / trames.length };
  });
  let sures = 0;
  for (const k of trames) sures += sure[k]!;
  return { src, methode: c.methode, voix: voix.filter((v) => v.part > 0), tours, sure: sures / trames.length };
}

/** Pistes séparées : une voix par piste (zones de voix de chacune, 8 dB au-dessus de son bruit de fond). */
export function voixDesPistes(pistes: readonly EmpreintesVoix[], src: string, o: Partial<ReglagesQuiParle> = {}): VoixDetectees {
  const r: ReglagesQuiParle = { ...REGLAGES_QUI_PARLE, ...o };
  const voix: VoixTrouvee[] = [];
  const tours: TourDeParole[] = [];
  let total = 0;
  pistes.forEach((e, j) => {
    const id = `p${j + 1}`;
    const zones = zonesDeVoix({ pas: e.pas, db: e.db }, { margeDb: r.ecartSurDb });
    const etiq = new Int8Array(e.db.length).fill(-1);
    for (const z of zones) for (let k = Math.floor(z.de / e.pas); k < Math.min(etiq.length, Math.ceil(z.a / e.pas)); k++) etiq[k] = 0;
    const sure = new Uint8Array(e.db.length).fill(1);
    const nettete = new Float32Array(e.db.length).fill(10);
    const res = construireTours(etiq, sure, nettete, e.pas, [id], { tourMin: r.tourMin, trouMax: r.trouMax, src });
    res.tours.forEach((t) => nettetes.set(t, 10));
    const trames: number[] = [];
    etiq.forEach((v, k) => v === 0 && trames.push(k));
    total += trames.length;
    tours.push(...res.tours);
    const v: VoixTrouvee = { id, niveauDb: Math.round(mediane(trames.map((k) => e.db[k]!)) * 10) / 10, part: trames.length };
    v.piste = e.piste ?? j;
    voix.push(v);
  });
  for (const v of voix) v.part = total > 0 ? v.part / total : 0;
  tours.sort((x, y) => x.ts - y.ts || x.fin - y.fin);
  return { src, methode: 'pistes', voix, tours, sure: 1 };
}

/** 3 extraits à écouter pour la voix `p` : ses tours SÛRS de 2 à 4 s, les plus nets, espacés d'au moins 60 s. */
export function extraitsDeVoix(d: VoixDetectees, p: string, n = 3): PlageTemps[] {
  const siens = d.tours.filter((t) => t.p === p && t.sur !== false);
  const net = (t: TourDeParole) => nettetes.get(t) ?? 0;
  // D'abord les tours de 2 à 4 s ; à défaut, les plus longs ramenés à 4 s (leur milieu), puis ceux d'au moins 1 s.
  const candidats = [
    ...siens.filter((t) => t.fin - t.ts >= 2 && t.fin - t.ts <= 4).map((t) => ({ de: t.ts, a: t.fin, n: net(t) + 100 })),
    ...siens.filter((t) => t.fin - t.ts > 4).map((t) => ({ de: (t.ts + t.fin) / 2 - 2, a: (t.ts + t.fin) / 2 + 2, n: net(t) + 50 })),
    ...siens.filter((t) => t.fin - t.ts >= 1 && t.fin - t.ts < 2).map((t) => ({ de: t.ts, a: t.fin, n: net(t) })),
  ].sort((x, y) => y.n - x.n || x.de - y.de);
  const choisis: PlageTemps[] = [];
  for (const ecart of [60, 20, 0]) {
    for (const c of candidats) {
      if (choisis.length >= n) break;
      if (choisis.every((x) => Math.abs(x.de - c.de) >= ecart && (x.de !== c.de || x.a !== c.a))) choisis.push({ de: Math.round(c.de * 100) / 100, a: Math.round(c.a * 100) / 100 });
    }
  }
  return choisis.sort((x, y) => x.de - y.de);
}
