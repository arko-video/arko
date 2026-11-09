// APPRENTISSAGE des goûts de l'utilisateur (9/11/2026, « chaque jour l'améliorer, viser la perfection ») : Arko garde
// une EMPREINTE de chaque montage auto (ce qu'il a posé), puis, à l'export, la compare à la version finale de
// l'utilisateur : ce qu'il a gardé, retiré ou ajouté à la main. Les GOÛTS (densités de chaque famille, sons et clips
// aimés ou rejetés, durée) s'ajustent, et le montage suivant s'en sert. Pur, sans IA, tout reste sur l'appareil.
// Un seul montage ne change pas tout : chaque observation déplace les réglages de moitié vers ce que l'utilisateur
// a fait, bornés (0,25 à 3) ; un son retiré 2 fois n'est plus proposé tout seul (il reste posable à la main).

import { compiler } from '../../recette/chronologie';
import type { Recette, Sec } from '../../recette/types';

export type Famille = 'bruitages' | 'accents' | 'memes' | 'zooms' | 'transitions' | 'punchlines';
export const FAMILLES: readonly Famille[] = ['bruitages', 'accents', 'memes', 'zooms', 'transitions', 'punchlines'];

/** Ce qu'on retient d'un montage (petit : pas de mots ni d'images). */
export interface Empreinte {
  duree: Sec;
  /** Éléments posés, en temps de sortie, avec leur nom stable (nom du fichier, ou id du son d'Arko). */
  elements: { f: Famille; t: Sec; nom: string; auto: boolean }[];
  /** E3 : morceaux gardés (temps SOURCE), pour apprendre les marges avant / après les mots. */
  plans?: { de: Sec; a: Sec }[];
}

export interface Gouts {
  version: 1;
  /** Nombre de montages appris. */
  n: number;
  /** Multiplicateurs de densité (1 = réglage d'Arko). */
  densite: Record<Famille, number>;
  /** Durée finale / durée du montage auto (moyenne glissante). */
  duree: number;
  /** Noms de sons ou de clips : + = aimé (gardé, ajouté), − = retiré. */
  notes: Record<string, number>;
  /** E3 : secondes à ajouter (+) ou enlever (−) aux marges des jump cuts, avant et après les mots. */
  marges?: { avant: Sec; apres: Sec };
}

export const GOUTS_DEPART: Gouts = { version: 1, n: 0, densite: { bruitages: 1, accents: 1, memes: 1, zooms: 1, transitions: 1, punchlines: 1 }, duree: 1, notes: {} };

/** Nom stable d'un son / clip (« Bruh - Sound Effect.mp3 » et « bruh sound effect » → la même clé). */
export function cleNom(nom: string): string {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const borne = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const pres = (a: Sec, b: Sec) => Math.abs(a - b) < 0.5;

export function empreinteDe(r: Recette): Empreinte {
  const sc = compiler(r);
  const nomSource = (id: string) => cleNom(r.sources.find((s) => s.id === id)?.nom ?? id);
  const el: Empreinte['elements'] = [];
  for (const p of sc.sons) {
    const role = p.element.role;
    if (role === 'section') continue;
    el.push({ f: role === 'accent' ? 'accents' : 'bruitages', t: p.t, nom: nomSource(p.element.id), auto: role === 'bruitage' || role === 'accent' });
  }
  for (const i of r.incrustations ?? []) el.push({ f: 'memes', t: i.t, nom: nomSource(i.src), auto: true });
  for (const z of sc.zooms) el.push({ f: 'zooms', t: z.t, nom: 'zoom', auto: true });
  for (const p of sc.plans) {
    if (p.zoomFixe && p.zoomFixe.force >= 1.25) el.push({ f: 'zooms', t: p.t0, nom: 'zoom', auto: true });
    if (p.trans) el.push({ f: 'transitions', t: p.t0, nom: p.trans.type, auto: true });
  }
  if (r.sousTitres?.mode === 'punchlines') for (const pl of r.sousTitres.punchlines ?? []) el.push({ f: 'punchlines', t: pl.ts, nom: 'punchline', auto: true });
  const plans = sc.plans.filter((p) => !p.ins).map((p) => ({ de: Math.round(p.de * 100) / 100, a: Math.round(p.a * 100) / 100 }));
  return { duree: Math.round(sc.duree * 100) / 100, elements: el.map((e) => ({ ...e, t: Math.round(e.t * 100) / 100 })), plans };
}

export interface Observation {
  par: Record<Famille, { proposes: number; gardes: number; ajoutes: number }>;
  aimes: string[];
  retires: string[];
  dureeRatio: number;
  /** E3 : décalages moyens des bords des morceaux (+ = Romain garde plus), et combien de bords comptés. */
  marges: { avant: Sec; apres: Sec; n: number };
}

/**
 * Compare le montage auto et la version finale. Un élément est « gardé » s'il en reste un de la même famille et du
 * même nom à moins de 0,5 s (en temps de sortie : couper avant lui le décale, on compare donc aussi par ordre, au
 * nom). Les temps des punchlines sont des temps source : comparés tels quels.
 */
export function comparer(auto: Empreinte, fin: Empreinte): Observation {
  const par = Object.fromEntries(FAMILLES.map((f) => [f, { proposes: 0, gardes: 0, ajoutes: 0 }])) as Observation['par'];
  const aimes: string[] = [];
  const retires: string[] = [];
  const decalage = fin.duree - auto.duree;
  const restants = [...fin.elements];
  for (const e of auto.elements.filter((x) => x.auto)) {
    par[e.f].proposes++;
    // Même place, ou décalée d'autant que la durée a changé (une coupe avant l'élément).
    const k = restants.findIndex((x) => x.f === e.f && x.nom === e.nom && (pres(x.t, e.t) || (e.f !== 'punchlines' && x.t <= e.t + 0.5 && x.t >= e.t + decalage - 0.5)));
    if (k >= 0) {
      par[e.f].gardes++;
      if (e.f === 'bruitages' || e.f === 'accents' || e.f === 'memes') aimes.push(e.nom);
      restants.splice(k, 1);
    } else if (e.f === 'bruitages' || e.f === 'accents' || e.f === 'memes') retires.push(e.nom);
  }
  // Ce qui reste dans la version finale et n'était pas dans l'auto : ajouté à la main.
  for (const x of restants) {
    if (auto.elements.some((e) => e.f === x.f && e.nom === x.nom && pres(e.t, x.t))) continue;
    par[x.f].ajoutes++;
    if (x.f === 'bruitages' || x.f === 'accents' || x.f === 'memes') aimes.push(x.nom, x.nom);
  }
  return { par, aimes, retires, dureeRatio: auto.duree > 0 ? fin.duree / auto.duree : 1, marges: margesObservees(auto.plans ?? [], fin.plans ?? []) };
}

/** E3 : pour chaque morceau auto, le morceau final qui le recouvre le plus ; petits décalages seulement (< 1,5 s). */
export function margesObservees(auto: readonly { de: Sec; a: Sec }[], fin: readonly { de: Sec; a: Sec }[]): Observation['marges'] {
  let av = 0;
  let ap = 0;
  let n = 0;
  for (const p of auto) {
    let best: { de: Sec; a: Sec } | null = null;
    let rec = 0;
    for (const q of fin) {
      const r = Math.min(p.a, q.a) - Math.max(p.de, q.de);
      if (r > rec) (rec = r), (best = q);
    }
    if (!best) continue;
    const dav = p.de - best.de;
    const dap = best.a - p.a;
    if (Math.abs(dav) < 1.5 && Math.abs(dap) < 1.5) {
      av += dav;
      ap += dap;
      n++;
    }
  }
  return n === 0 ? { avant: 0, apres: 0, n: 0 } : { avant: Math.round((av / n) * 1000) / 1000, apres: Math.round((ap / n) * 1000) / 1000, n };
}

/** Les goûts après une observation (la moitié du chemin vers ce que l'utilisateur a fait). */
export function apprendre(g: Gouts, o: Observation): Gouts {
  const densite = { ...g.densite };
  for (const f of FAMILLES) {
    const { proposes, gardes, ajoutes } = o.par[f];
    if (proposes === 0 && ajoutes === 0) continue;
    const vise = proposes === 0 ? 1 + Math.min(1, ajoutes / 4) : (gardes + ajoutes) / proposes;
    densite[f] = Math.round(borne(densite[f] * (0.5 + 0.5 * vise), 0.25, 3) * 100) / 100;
  }
  const notes = { ...g.notes };
  for (const n of o.aimes) notes[n] = borne((notes[n] ?? 0) + 1, -5, 5);
  for (const n of o.retires) notes[n] = borne((notes[n] ?? 0) - 1, -5, 5);
  const duree = Math.round(borne(g.duree * 0.5 + borne(o.dureeRatio, 0.5, 1.5) * 0.5, 0.5, 1.5) * 100) / 100;
  const m = g.marges ?? { avant: 0, apres: 0 };
  const marges = o.marges && o.marges.n >= 3 ? { avant: Math.round(borne(m.avant + 0.5 * o.marges.avant, -0.2, 0.4) * 100) / 100, apres: Math.round(borne(m.apres + 0.5 * o.marges.apres, -0.2, 0.4) * 100) / 100 } : m;
  return { version: 1, n: g.n + 1, densite, duree, notes, ...(marges.avant !== 0 || marges.apres !== 0 ? { marges } : {}) };
}

/** Un son / clip que l'utilisateur a retiré 2 fois de plus qu'il ne l'a gardé : plus jamais proposé tout seul. */
export function rejete(g: Gouts, nom: string): boolean {
  return (g.notes[cleNom(nom)] ?? 0) <= -2;
}

/** Bonus de choix d'un son / clip aimé (0 à 5). */
export function bonus(g: Gouts, nom: string): number {
  return Math.max(0, g.notes[cleNom(nom)] ?? 0);
}

/** Relit des goûts gardés (texte JSON) ; illisible → goûts de départ. */
export function lireGouts(brut: string | null | undefined): Gouts {
  try {
    const o = JSON.parse(brut ?? '') as Partial<Gouts>;
    if (!o || o.version !== 1) return structuredClone(GOUTS_DEPART);
    const densite = { ...GOUTS_DEPART.densite };
    for (const f of FAMILLES) if (typeof o.densite?.[f] === 'number') densite[f] = borne(o.densite[f], 0.25, 3);
    const notes: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.notes ?? {})) if (typeof v === 'number') notes[k] = borne(v, -5, 5);
    const res: Gouts = { version: 1, n: typeof o.n === 'number' ? o.n : 0, densite, duree: typeof o.duree === 'number' ? borne(o.duree, 0.5, 1.5) : 1, notes };
    if (o.marges && typeof o.marges.avant === 'number' && typeof o.marges.apres === 'number') res.marges = { avant: borne(o.marges.avant, -0.2, 0.4), apres: borne(o.marges.apres, -0.2, 0.4) };
    return res;
  } catch {
    return structuredClone(GOUTS_DEPART);
  }
}

/** Phrases simples de ce qu'Arko a appris (pour l'utilisateur). */
export function resumeGouts(g: Gouts): string[] {
  const NOMS: Record<Famille, string> = { bruitages: 'bruitages', accents: 'effets de rythme', memes: 'mèmes', zooms: 'zooms', transitions: 'transitions', punchlines: 'punchlines' };
  const res: string[] = [];
  for (const f of FAMILLES) {
    const d = g.densite[f];
    if (d >= 1.15) res.push(`Plus de ${NOMS[f]} (×${d.toFixed(2)})`);
    else if (d <= 0.85) res.push(`Moins de ${NOMS[f]} (×${d.toFixed(2)})`);
  }
  if (g.marges && (Math.abs(g.marges.avant) >= 0.05 || Math.abs(g.marges.apres) >= 0.05)) res.push(`Coupes : ${g.marges.avant >= 0 ? '+' : ''}${g.marges.avant.toFixed(2)} s avant les mots, ${g.marges.apres >= 0 ? '+' : ''}${g.marges.apres.toFixed(2)} s après`);
  if (g.duree <= 0.9) res.push(`Montages plus courts (×${g.duree.toFixed(2)})`);
  else if (g.duree >= 1.1) res.push(`Montages plus longs (×${g.duree.toFixed(2)})`);
  const rejetes = Object.entries(g.notes).filter(([, v]) => v <= -2).map(([k]) => k);
  if (rejetes.length > 0) res.push(`${rejetes.length} son${rejetes.length > 1 ? 's' : ''} ou clip${rejetes.length > 1 ? 's' : ''} que tu retires toujours : plus proposé${rejetes.length > 1 ? 's' : ''}`);
  return res;
}

/** D1 : un EXEMPLE pour le monteur IA (« Arko a proposé → Romain a fait »), petit et lisible. */
export interface ExempleMonteur {
  date: string;
  /** Par famille : proposés, gardés, ajoutés à la main. */
  par: Observation['par'];
  retires: string[];
  ajoutes: string[];
  dureeRatio: number;
  marges: { avant: Sec; apres: Sec };
}

export function exempleDe(o: Observation, date: string): ExempleMonteur {
  const unique = (l: string[]) => [...new Set(l)].slice(0, 12);
  const gardes = new Set(o.aimes);
  return {
    date,
    par: o.par,
    retires: unique(o.retires),
    ajoutes: unique(o.aimes.filter((n, i, l) => l.indexOf(n) !== i && gardes.has(n))),
    dureeRatio: Math.round(o.dureeRatio * 100) / 100,
    marges: { avant: o.marges.avant, apres: o.marges.apres },
  };
}