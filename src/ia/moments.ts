// Résumé compact des moments forts d'une source, envoyé au monteur IA (format ARKO-MOMENTS/1, phase 6).
// Environ 30 tokens par ligne : une en-tête, une ligne de légende, puis un moment par ligne.
//
//   ARKO-MOMENTS/1 src=s1 duree=10835.2 langue=fr nb=87
//   # id debut fin score etiquettes | extrait (≤ 80 caractères)
//   m01 842.3 859.8 87 rire,cri | "attends attends… NON il m'a one-shot"

import type { Mot, Sec } from '../recette/types';

export const FORMAT_MOMENTS = 'ARKO-MOMENTS/1';
export const EXTRAIT_MAX = 80;

export interface Moment {
  /** Identifiant (« m01 ») ; attribué automatiquement s'il manque. */
  id?: string;
  debut: Sec;
  fin: Sec;
  /** Intérêt du moment, de 0 à 100. */
  score: number;
  /** Étiquettes (« rire », « cri », « silence>pic »…). */
  etiquettes: string[];
  /** Ce qui est dit pendant le moment (transcription), facultatif. */
  extrait?: string;
  /** Temps source du sommet de l'action (phase 6, facultatif). */
  pic?: Sec;
  /** Pourquoi ce moment a été retenu, en français (« Gros pic de son après un calme »). Phase 6. */
  raison?: string;
  /** Mots transcrits autour du pic, en TEMPS SOURCE : remplissent les sous-titres d'un clip sans retranscrire. */
  mots?: Mot[];
}

export interface EnteteMoments {
  src: string;
  duree: Sec;
  langue?: string;
}

/** Nombre à une décimale, sans zéro inutile : 842.30 → "842.3", 1203 → "1203.0". */
function dixieme(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}

/** Étiquette sûre pour le format : minuscules, sans espace ni virgule ni barre verticale. */
function etiquette(e: string): string {
  return e.trim().toLowerCase().replace(/[\s,|]+/g, '-');
}

/** Extrait sur une ligne, guillemets doubles remplacés, coupé à 80 caractères (avec « … »). */
export function couperExtrait(s: string, max = EXTRAIT_MAX): string {
  const une = s.replace(/\s+/g, ' ').replace(/"/g, '”').trim();
  const car = [...une];
  if (car.length <= max) return une;
  return car.slice(0, max - 1).join('').trimEnd() + '…';
}

/**
 * Formate les moments (triés par début) au format ARKO-MOMENTS/1.
 * Les moments sans durée positive sont ignorés ; le score est borné à [0, 100] et arrondi.
 */
export function formaterMoments(entete: EnteteMoments, moments: Moment[]): string {
  const valides = moments
    .filter((m) => Number.isFinite(m.debut) && Number.isFinite(m.fin) && m.fin > m.debut)
    .sort((a, b) => a.debut - b.debut);
  const largeur = Math.max(2, String(valides.length).length);
  const lignes = [
    `${FORMAT_MOMENTS} src=${entete.src} duree=${dixieme(entete.duree)} langue=${entete.langue ?? 'fr'} nb=${valides.length}`,
    `# id debut fin score etiquettes | extrait (≤ ${EXTRAIT_MAX} caractères)`,
  ];
  valides.forEach((m, i) => {
    const id = m.id ?? `m${String(i + 1).padStart(largeur, '0')}`;
    const score = Math.round(Math.min(100, Math.max(0, m.score)));
    const etiq = m.etiquettes.map(etiquette).filter(Boolean).join(',') || '-';
    const extrait = m.extrait && m.extrait.trim() ? ` | "${couperExtrait(m.extrait)}"` : '';
    lignes.push(`${id} ${dixieme(m.debut)} ${dixieme(m.fin)} ${score} ${etiq}${extrait}`);
  });
  return lignes.join('\n');
}

/** Relit un résumé ARKO-MOMENTS/1 (utile pour les tests et pour relire la réponse d'une IA). */
export function lireMoments(texte: string): { entete: EnteteMoments; moments: Moment[] } | null {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const premiere = lignes[0];
  if (!premiere?.startsWith(FORMAT_MOMENTS)) return null;
  const champs = Object.fromEntries(premiere.split(/\s+/).slice(1).map((c) => c.split('=') as [string, string]));
  const entete: EnteteMoments = { src: champs.src ?? 's1', duree: Number(champs.duree ?? 0), langue: champs.langue ?? 'fr' };
  const moments: Moment[] = [];
  for (const l of lignes.slice(1)) {
    if (l.startsWith('#')) continue;
    const m = l.match(/^(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)(?:\s+\|\s+"(.*)")?$/);
    if (!m) continue;
    const mo: Moment = { id: m[1]!, debut: Number(m[2]), fin: Number(m[3]), score: Number(m[4]), etiquettes: m[5] === '-' ? [] : m[5]!.split(',') };
    if (m[6] !== undefined) mo.extrait = m[6];
    moments.push(mo);
  }
  return { entete, moments };
}
