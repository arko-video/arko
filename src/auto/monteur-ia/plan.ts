// Monteur IA, ÉTAPE 1 : le PLAN renvoyé par le monteur (Mon Hub) et sa VALIDATION. Arko ne croit jamais un plan sur
// parole : temps bornés à la vidéo, séquences triées sans chevauchement, accroche de 8 s au plus, effets qui
// désignent un VRAI fichier de la bibliothèque (sinon retirés), densité plafonnée, textes raccourcis. Chaque
// correction est notée dans le journal (montré à l'utilisateur). Chaque élément garde son « pourquoi ». Pur.

import type { Sec } from '../../recette/types';
import type { Dossier } from './dossier';

export const TYPES_EFFET = ['zoom', 'bruitage', 'accent', 'meme', 'fondVert', 'texte', 'transition'] as const;
export type TypeEffet = (typeof TYPES_EFFET)[number];

export const LIMITES_PLAN = { accrocheMax: 8, effetsParMinute: 12, texteMax: 80, titreMax: 100, pourquoiMax: 160, sequenceMin: 2, titresMax: 3 } as const;

export interface EffetPlan {
  t: Sec;
  type: TypeEffet;
  /** Nom du fichier de la bibliothèque (bruitage, accent, meme, fondVert), texte (texte), type (transition), force (zoom). */
  quoi: string;
  pourquoi: string;
}

export interface PlanMonteur {
  accroche: { de: Sec; a: Sec; texte: string } | null;
  intro: string | null;
  sequences: { de: Sec; a: Sec; titre: string; pourquoi: string }[];
  effets: EffetPlan[];
  titres: string[];
  miniature: { texte: string; emo: string; t: Sec } | null;
}

export interface PlanValide {
  plan: PlanMonteur;
  /** Corrections faites (phrases simples). */
  journal: string[];
}

const nombre = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const texte = (x: unknown, max: number): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const r2 = (x: number) => Math.round(x * 100) / 100;
const cle = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

const RAYON_DU_TYPE: Partial<Record<TypeEffet, readonly Dossier['bibliotheque'][number]['rayon'][]>> = {
  bruitage: ['bruitages'],
  accent: ['bruitages'],
  meme: ['memes', 'fondsVerts'],
  fondVert: ['fondsVerts', 'memes'],
};

/** Valide un plan reçu (JSON déjà lu, forme inconnue) contre le dossier qui l'a demandé. Ne lève jamais. */
export function validerPlan(brut: unknown, d: Dossier): PlanValide {
  const journal: string[] = [];
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const D = d.duree;
  const dansVideo = (t: number) => t >= 0 && t <= D;

  // Accroche.
  let accroche: PlanMonteur['accroche'] = null;
  const ac = o.accroche as Record<string, unknown> | undefined;
  const ade = nombre(ac?.de);
  const aa = nombre(ac?.a);
  if (ade !== null && aa !== null && aa > ade && dansVideo(ade) && dansVideo(aa)) {
    const a = Math.min(aa, ade + LIMITES_PLAN.accrocheMax);
    if (a < aa) journal.push(`Accroche raccourcie à ${LIMITES_PLAN.accrocheMax} s.`);
    accroche = { de: r2(ade), a: r2(a), texte: texte(ac?.texte, LIMITES_PLAN.texteMax) };
  } else if (ac) journal.push('Accroche illisible : retirée.');

  // Séquences : dans la vidéo, au moins 2 s, triées, sans chevauchement.
  const seqs: PlanMonteur['sequences'] = [];
  for (const x of Array.isArray(o.sequences) ? (o.sequences as Record<string, unknown>[]) : []) {
    const de = nombre(x?.de);
    const a = nombre(x?.a);
    if (de === null || a === null || a - de < LIMITES_PLAN.sequenceMin || !dansVideo(de) || !dansVideo(a)) {
      journal.push('Une séquence hors de la vidéo ou trop courte : retirée.');
      continue;
    }
    seqs.push({ de: r2(de), a: r2(a), titre: texte(x.titre, LIMITES_PLAN.texteMax), pourquoi: texte(x.pourquoi, LIMITES_PLAN.pourquoiMax) });
  }
  seqs.sort((p, q) => p.de - q.de);
  const sequences: PlanMonteur['sequences'] = [];
  for (const s of seqs) {
    const der = sequences[sequences.length - 1];
    if (der && s.de < der.a) {
      if (s.a <= der.a) {
        journal.push(`Séquence à ${Math.round(s.de)} s comprise dans la précédente : retirée.`);
        continue;
      }
      journal.push(`Séquence à ${Math.round(s.de)} s : début décalé (elle chevauchait la précédente).`);
      s.de = der.a;
      if (s.a - s.de < LIMITES_PLAN.sequenceMin) continue;
    }
    sequences.push(s);
  }

  // Effets : type connu, temps dans la vidéo, fichier qui existe, densité plafonnée.
  const fichiers = new Map(d.bibliotheque.map((f) => [cle(f.nom), f]));
  const candidats: EffetPlan[] = [];
  for (const x of Array.isArray(o.effets) ? (o.effets as Record<string, unknown>[]) : []) {
    const t = nombre(x?.t);
    const type = x?.type as TypeEffet;
    if (t === null || !dansVideo(t) || !TYPES_EFFET.includes(type)) {
      journal.push('Un effet illisible ou hors de la vidéo : retiré.');
      continue;
    }
    let quoi = texte(x.quoi, LIMITES_PLAN.texteMax);
    const rayons = RAYON_DU_TYPE[type];
    if (rayons) {
      const f = fichiers.get(cle(quoi));
      if (!f || !rayons.includes(f.rayon)) {
        journal.push(`« ${quoi || '?'} » n'est pas dans ta bibliothèque : effet retiré.`);
        continue;
      }
      quoi = f.nom;
    }
    if (type === 'zoom') {
      const force = Number(quoi);
      quoi = String(Number.isFinite(force) ? Math.min(2, Math.max(1.05, force)) : 1.3);
    }
    if (type === 'texte' && !quoi) continue;
    candidats.push({ t: r2(t), type, quoi, pourquoi: texte(x.pourquoi, LIMITES_PLAN.pourquoiMax) });
  }
  candidats.sort((p, q) => p.t - q.t);
  const effets: EffetPlan[] = [];
  let enTrop = 0;
  for (const e of candidats) {
    if (effets.filter((x) => Math.abs(x.t - e.t) < 30).length >= LIMITES_PLAN.effetsParMinute / 2) {
      enTrop++;
      continue;
    }
    effets.push(e);
  }
  if (enTrop > 0) journal.push(`${enTrop} effet${enTrop > 1 ? 's' : ''} en trop (plus de ${LIMITES_PLAN.effetsParMinute} par minute) : retiré${enTrop > 1 ? 's' : ''}.`);

  const titres = (Array.isArray(o.titres) ? o.titres : []).map((x) => texte(x, LIMITES_PLAN.titreMax)).filter(Boolean).slice(0, LIMITES_PLAN.titresMax);
  const mi = o.miniature as Record<string, unknown> | undefined;
  const mt = nombre(mi?.t);
  const miniature = mi && mt !== null && dansVideo(mt) ? { texte: texte(mi.texte, 30), emo: texte(mi.emo, 20) || 'choque', t: r2(mt) } : null;
  const intro = texte(o.intro, 240) || null;

  return { plan: { accroche, intro, sequences, effets, titres, miniature }, journal };
}
