// Petits outils du normaliseur : journal des problèmes, bornes, suggestions de clés et d'identifiants.

import type { Probleme } from './types';
import { arrondir, formaterNombre, lireTemps } from './temps';

/** Collecte les problèmes trouvés pendant la normalisation. */
export class Journal {
  readonly problemes: Probleme[] = [];
  ajouter(niveau: Probleme['niveau'], chemin: string, message: string) {
    this.problemes.push({ chemin, niveau, message });
  }
  corrige(chemin: string, message: string) {
    this.ajouter('corrige', chemin, message);
  }
  ignore(chemin: string, message: string) {
    this.ajouter('ignore', chemin, message);
  }
  conseil(chemin: string, message: string) {
    this.ajouter('conseil', chemin, message);
  }
  bloquant(chemin: string, message: string) {
    this.ajouter('bloquant', chemin, message);
  }
}

export type Objet = Record<string, unknown>;

export function estObjet(v: unknown): v is Objet {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function borner(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Distance d'édition (Levenshtein) entre deux chaînes. */
export function distance(a: string, b: string): number {
  const ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = ligne[0]!;
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const haut = ligne[j]!;
      ligne[j] = Math.min(ligne[j]! + 1, ligne[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = haut;
    }
  }
  return ligne[b.length]!;
}

/** Les `n` éléments de `liste` les plus proches de `mot` (sous-chaîne d'abord, puis distance). */
export function proches(mot: string, liste: readonly string[], n = 3): string[] {
  const m = mot.toLowerCase();
  const decouper = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const morceaux = decouper(m);
  // Score : meilleure distance entre un morceau du mot et un morceau du candidat (ou entre les deux en entier).
  const score = (c: string) => {
    let s = distance(m, c.toLowerCase());
    for (const a of morceaux) for (const b of decouper(c)) s = Math.min(s, distance(a, b) + (a === b ? 0 : 0.5));
    return s;
  };
  const tries = [...liste].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  // Le meilleur d'abord, puis les sons de la même famille (« impact.* »), puis les autres.
  const meilleur = tries[0];
  if (!meilleur) return [];
  const famille = meilleur.split('.')[0];
  const memeFamille = tries.slice(1).filter((c) => c.includes('.') && c.split('.')[0] === famille);
  const autres = tries.slice(1).filter((c) => !memeFamille.includes(c));
  return [meilleur, ...memeFamille, ...autres].slice(0, n);
}

/** Signale (et ignore) les clés inconnues d'un objet, avec une suggestion si une clé connue ressemble. */
export function verifierCles(obj: Objet, connues: readonly string[], chemin: string, journal: Journal) {
  for (const cle of Object.keys(obj)) {
    if (connues.includes(cle)) continue;
    const [proche] = proches(cle, connues, 1);
    const ou = chemin ? `${chemin}.${cle}` : cle;
    const suggestion = proche && distance(cle.toLowerCase(), proche.toLowerCase()) <= 2 ? ` Voulais-tu dire "${proche}" ?` : '';
    journal.ignore(ou, `La clé "${cle}" est inconnue : ignorée.${suggestion}`);
  }
}

interface RegleNombre {
  defaut: number;
  min: number;
  max: number;
  /** Nom affiché dans les messages (« la vitesse »). */
  nom: string;
}

/** Lit un nombre (ou une chaîne « 0,8 »), applique défaut et bornes, et note les corrections. */
export function lireNombre(v: unknown, chemin: string, journal: Journal, r: RegleNombre): number {
  if (v === undefined || v === null) return r.defaut;
  const x = lireTemps(v);
  if (x === null) {
    journal.corrige(chemin, `${majuscule(r.nom)} (${JSON.stringify(v)}) n'est pas un nombre : remplacé par ${formaterNombre(r.defaut)}.`);
    return r.defaut;
  }
  const b = arrondir(borner(x, r.min, r.max));
  if (b !== arrondir(x)) {
    journal.corrige(chemin, `${majuscule(r.nom)} (${formaterNombre(x)}) était hors limites : ramené à ${formaterNombre(b)}.`);
  }
  return b;
}

export function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Si l'IA a entouré son JSON de ```json … ```, on retire l'emballage. */
export function nettoyerTexteJson(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  return m ? m[1]! : t;
}
