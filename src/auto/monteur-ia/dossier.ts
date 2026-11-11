// Monteur IA (module Mon Hub, docs/monteur-ia/plan.md), ÉTAPE 1 : le DOSSIER qu'Arko envoie au monteur. Petit (pas
// d'image ni de son) : les phrases (qui parle, quand, émotion, dit fort ou non), les réactions (rires, cris, pics),
// les scènes candidates, la bibliothèque (noms et durées seulement), les goûts appris, la DA. Pur.

import type { ExempleMonteur, Gouts } from '../apprentissage/gouts';
import type { Emotion } from '../../chibis/catalogue';
import type { Mot, Sec, TourDeParole } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';

export const VERSION_DOSSIER = 1;

export interface PhraseDossier {
  de: Sec;
  a: Sec;
  texte: string;
  /** Id de la personne (« p1 »…), null si inconnu. */
  qui: string | null;
  emo?: Emotion;
  /** Au moins un mot dit fort (crié) ou un pic de son pendant la phrase. */
  fort?: true;
}

export interface FichierDossier {
  nom: string;
  duree: Sec;
  rayon: 'bruitages' | 'musiques' | 'memes' | 'fondsVerts';
  /** Ce qu'Arko a entendu dans le son (« Arko écoute tes sons ») : whoosh, pop, impact, rire, fail… */
  ecoute?: string;
}

export interface Dossier {
  version: typeof VERSION_DOSSIER;
  da: 'youtube' | 'tiktok';
  duree: Sec;
  dureeVisee: { min: Sec; max: Sec };
  personnes: { id: string; nom: string }[];
  phrases: PhraseDossier[];
  reactions: { t: Sec; type: 'rire' | 'cri' | 'pic'; force: number }[];
  /** Scènes de l'analyse ; `garde` = le DÉRUSH d'Arko (ce qu'il monterait, après les choix de Romain sur la revue). */
  scenes: { de: Sec; a: Sec; note: number; garde?: true }[];
  bibliotheque: FichierDossier[];
  gouts?: Pick<Gouts, 'n' | 'densite' | 'duree'> & { rejetes: string[]; aimes: string[] };
  /** D1 : derniers exemples « Arko a proposé → Romain a fait » (le monteur IA s'en inspire, D2). */
  exemples?: ExempleMonteur[];
  /**
   * Les réglages de Romain dans Arko (11/11) : le monteur IA les respecte (pas de zoom si les zooms sont coupés, pas
   * de texte sans punchlines, pas d'accroche si elle est décochée…) et connaît le nom de la chaîne pour les titres.
   */
  reglages?: ReglagesDossier;
  /** F8 : menus, chargements, bureau vus à l'image (« Arko regarde l'image ») : à ne JAMAIS mettre dans le montage. */
  zonesMortes?: { de: Sec; a: Sec; genre: 'menu' | 'chargement' | 'bureau' }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Phrases : mots regroupés (pause de plus de 0,6 s, ponctuation finale ou changement de personne). */
export function phrasesDe(mots: readonly Mot[], tours: readonly TourDeParole[] = [], signaux: SignauxSource | null = null): PhraseDossier[] {
  const quiA = (t: Sec) => tours.find((x) => t >= x.ts && t < x.fin) ?? null;
  const res: PhraseDossier[] = [];
  let cur: Mot[] = [];
  let curQui: string | null = null;
  const fermer = () => {
    if (cur.length === 0) return;
    const de = cur[0]![1];
    const a = cur[cur.length - 1]![2];
    const tour = quiA((de + a) / 2);
    const p: PhraseDossier = { de: r2(de), a: r2(a), texte: cur.map((m) => m[0].trim()).join(' ').replace(/\s+([!?…,.])/g, '$1'), qui: curQui };
    if (tour?.emo) p.emo = tour.emo;
    if (cur.some((m) => m[3] === 1) || signaux?.pics.some((x) => x.ts >= de && x.ts <= a)) p.fort = true;
    res.push(p);
    cur = [];
  };
  for (const m of [...mots].sort((x, y) => x[1] - y[1])) {
    const qui = quiA(m[1])?.p ?? null;
    const der = cur[cur.length - 1];
    if (der && (m[1] - der[2] > 0.6 || /[.!?…]$/.test(der[0].trim()) || (qui !== null && curQui !== null && qui !== curQui))) fermer();
    if (cur.length === 0) curQui = qui;
    cur.push(m);
  }
  fermer();
  return res;
}

export interface ReglagesDossier {
  chaine?: string;
  accroche: boolean;
  punchlines: boolean;
  bruitages: boolean;
  /** null = pas de zooms. */
  zooms: string | null;
  sections: boolean;
  musiqueAuto: boolean;
  persos: boolean;
  /** « Couper les menus et chargements » et « Arko écoute mes sons » cochés. */
  regard: boolean;
  ecoute: boolean;
}

export interface EntreeDossier {
  reglages?: ReglagesDossier;
  da: Dossier['da'];
  duree: Sec;
  dureeVisee: Dossier['dureeVisee'];
  mots: readonly Mot[];
  tours?: readonly TourDeParole[];
  personnes?: readonly { id: string; nom: string }[];
  signaux?: SignauxSource | null;
  scenes?: readonly (PlageTemps & { score?: number; note?: number; garde?: boolean })[];
  bibliotheque?: readonly FichierDossier[];
  gouts?: Gouts | null;
  exemples?: readonly ExempleMonteur[];
}

export function construireDossier(e: EntreeDossier): Dossier {
  const s = e.signaux ?? null;
  const reactions: Dossier['reactions'] = s
    ? [
        ...s.rires.map((x) => ({ t: r2(x.t), type: 'rire' as const, force: r2(x.force) })),
        ...s.cris.map((x) => ({ t: r2(x.t), type: 'cri' as const, force: r2(x.force) })),
        ...s.pics.map((x) => ({ t: r2(x.ts), type: 'pic' as const, force: 1 })),
      ].sort((a, b) => a.t - b.t)
    : [];
  const vues = (s?.muets ?? []).filter((m) => m.vu);
  const dedans = (t: Sec) => vues.some((z) => t >= z.de && t < z.a);
  const d: Dossier = {
    version: VERSION_DOSSIER,
    da: e.da,
    duree: r2(e.duree),
    dureeVisee: e.dureeVisee,
    personnes: [...(e.personnes ?? [])],
    phrases: phrasesDe(e.mots, e.tours ?? [], s).filter((p) => !dedans((p.de + p.a) / 2)),
    reactions: reactions.filter((x) => !dedans(x.t)),
    scenes: (e.scenes ?? []).map((x) => ({ de: r2(x.de), a: r2(x.a), note: Math.round(x.note ?? x.score ?? 0), ...(x.garde ? { garde: true as const } : {}) })),
    bibliotheque: [...(e.bibliotheque ?? [])].map((f) => ({ ...f, duree: r2(f.duree) })),
  };
  if (vues.length > 0) d.zonesMortes = vues.map((z) => ({ de: r2(z.de), a: r2(z.a), genre: z.vu! }));
  if (e.reglages) d.reglages = { ...e.reglages };
  if (e.exemples && e.exemples.length > 0) d.exemples = e.exemples.slice(0, 10);
  if (e.gouts && e.gouts.n > 0) {
    const notes = Object.entries(e.gouts.notes);
    d.gouts = { n: e.gouts.n, densite: e.gouts.densite, duree: e.gouts.duree, rejetes: notes.filter(([k, v]) => (k.includes('@') ? v <= -1 : v <= -2)).map(([k]) => (k.includes('@') ? `${k.replace('@', ' (pas pour ')})` : k)), aimes: notes.filter(([, v]) => v >= 2).map(([k]) => k) };
  }
  return d;
}
