// ACCENTS sonores (9/11/2026, « les sound effects d'une vidéo lambda donnent du dynamisme, les miens non ») : ce que
// fait un monteur gaming en plus des bruitages « mèmes » : un WHOOSH sur chaque transition, un POP quand une punchline
// apparaît, un IMPACT sur un gros zoom (punch-in ×1,25 et plus). Sons pris dans Mes sons d'abord (par leur nom ou leur
// dossier : « whoosh », « swoosh », « pop », « vine boom »…), sinon les sons d'Arko. Pure, en temps de SORTIE.
// Règles : discrets (−8 dB, 1,2 s au plus, fondu court), 2,5 s d'écart au moins, 10 par minute au plus, jamais à
// moins d'1 s d'un son déjà posé (bruitage, mème) ni pendant l'accroche si on le demande.

import { compiler, sortiesDe } from '../../recette/chronologie';
import type { Recette, Sec } from '../../recette/types';
import { scoreFlou } from './choix-son';

export type FamilleAccent = 'whoosh' | 'pop' | 'impact';

export const ACCENTS = { ecart: 2.5, parMinute: 10, pres: 1, gainDb: -8, durMax: 1.2, fondu: 0.15, avance: 0.12, zoomFort: 1.25 } as const;

/** Mots qui trahissent chaque famille dans un nom de fichier (anglais, français, noms de mèmes connus). */
export const MOTS_ACCENTS: Readonly<Record<FamilleAccent, readonly string[]>> = {
  whoosh: ['whoosh', 'woosh', 'swoosh', 'swish', 'swoop', 'swipe', 'transition', 'whip', 'nyoom', 'slide up', 'teleport', 'zoom'],
  pop: ['pop', 'bubble', 'mouse click', 'blip', 'bloop', 'pling', 'bling', 'notification', 'ding', 'select item', 'pick up item', 'water droplet', 'camera shutter'],
  impact: ['vine boom', 'boom', 'impact', 'punch', 'hit', 'smack', 'pow', 'bonk', 'metal pipe', 'brick on metal', 'thud', 'slam', 'bang', 'bass drop'],
};

/** Sons d'Arko de secours. */
export const ACCENTS_ARKO: Readonly<Record<FamilleAccent, string>> = { whoosh: 'whoosh.rapide', pop: 'jeu.piece', impact: 'impact.claque' };

export interface SonAccent {
  id: string;
  nom: string;
  etiquette: string;
  duree: Sec;
}

/** Les sons de Mes sons d'une famille, du meilleur au moins bon (courts seulement : 3 s au plus). */
export function sonsAccent(f: FamilleAccent, sons: readonly SonAccent[]): SonAccent[] {
  const cles = MOTS_ACCENTS[f];
  return sons
    .filter((s) => s.duree > 0 && s.duree <= 3)
    .map((s) => {
      let note = 0;
      cles.forEach((c, rang) => {
        const sc = scoreFlou(s, c);
        if (sc > 0) note = Math.max(note, (cles.length - rang) * 10 + sc);
      });
      return { s, note: note - (s.duree > 1.5 ? 3 : 0) };
    })
    .filter((x) => x.note > 0)
    .sort((a, b) => b.note - a.note)
    .map((x) => x.s);
}

export interface Accent {
  t: Sec;
  famille: FamilleAccent;
  pourquoi: 'transition' | 'punchline' | 'zoom';
}

/** Où mettre des accents dans le montage (temps de sortie), triés. `apres` : rien avant (fin de l'accroche). */
export function proposerAccents(r: Recette, o: { apres?: Sec; facteur?: number } = {}): Accent[] {
  const sc = compiler(r);
  const f = Math.min(3, Math.max(0.25, o.facteur ?? 1));
  const ecart = ACCENTS.ecart / f;
  const parDemiMinute = Math.max(1, Math.round((ACCENTS.parMinute * f) / 2));
  const bruts: (Accent & { rang: number })[] = [];
  for (const p of sc.plans) {
    if (p.trans && p.t0 > 0) bruts.push({ t: Math.max(0, p.t0 - ACCENTS.avance), famille: 'whoosh', pourquoi: 'transition', rang: 0 });
    if (p.zoomFixe && p.zoomFixe.force >= ACCENTS.zoomFort && !p.ins) bruts.push({ t: p.t0, famille: 'impact', pourquoi: 'zoom', rang: 1 });
  }
  for (const z of sc.zooms) if ((z.element.force ?? 0) >= ACCENTS.zoomFort || z.element.style === 'punch') bruts.push({ t: z.t, famille: 'impact', pourquoi: 'zoom', rang: 1 });
  const src = r.sousTitres?.src ?? r.sources.find((s) => s.type === 'video')?.id;
  if (src && r.sousTitres?.mode === 'punchlines') {
    for (const pl of r.sousTitres.punchlines ?? []) for (const t of sortiesDe(sc, src, pl.ts)) bruts.push({ t, famille: 'pop', pourquoi: 'punchline', rang: 2 });
  }
  const occupes = [...sc.sons.map((s) => s.t), ...(r.incrustations ?? []).map((i) => i.t)];
  const res: Accent[] = [];
  for (const a of bruts.sort((x, y) => x.rang - y.rang || x.t - y.t)) {
    if (a.t < (o.apres ?? 0) || a.t >= sc.duree - 0.3) continue;
    if (occupes.some((t) => Math.abs(t - a.t) < ACCENTS.pres)) continue;
    if (res.some((x) => Math.abs(x.t - a.t) < ecart)) continue;
    if (res.filter((x) => Math.abs(x.t - a.t) < 30).length >= parDemiMinute) continue;
    res.push({ t: Math.round(a.t * 100) / 100, famille: a.famille, pourquoi: a.pourquoi });
  }
  return res.sort((a, b) => a.t - b.t);
}
