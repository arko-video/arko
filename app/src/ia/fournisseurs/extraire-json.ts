// Retrouve les recettes dans le texte écrit par une IA, même mal emballé :
// bloc ```json, phrases autour, tableau seul ou {"recettes":[…]}, virgules en trop,
// et JSON coupé (on garde alors les recettes complètes). Fonctions pures.

export interface JsonExtrait {
  /** Les recettes brutes trouvées (pas encore normalisées). */
  recettes: unknown[];
  /** true si le JSON était coupé : seules les recettes complètes ont été gardées. */
  coupe: boolean;
  /** Remarques en français pour l'utilisateur. */
  remarques: string[];
}

/** Cherche les recettes dans la réponse de l'IA. */
export function extraireRecettes(reponse: string): JsonExtrait {
  const texte = sansEmballage(reponse);
  const debut = texte.search(/[[{]/);
  if (debut < 0) return { recettes: [], coupe: false, remarques: ['La réponse ne contient aucun JSON.'] };

  // 1. Cas normal : un bloc JSON complet.
  const fin = finDuBloc(texte, debut);
  if (fin >= 0) {
    const valeur = lire(texte.slice(debut, fin + 1));
    if (valeur !== undefined) return interpreter(valeur);
  }

  // 2. JSON coupé ou abîmé : on récupère les recettes complètes, une par une.
  const tableau = texte[debut] === '[' ? debut : premierTableau(texte, debut);
  if (tableau < 0) return { recettes: [], coupe: fin < 0, remarques: ['Le JSON de la réponse est illisible.'] };
  const { morceaux, complet } = elementsDuTableau(texte, tableau);
  const recettes: unknown[] = [];
  const remarques: string[] = [];
  morceaux.forEach((m, i) => {
    const v = lire(m);
    if (v === undefined) remarques.push(`La recette n° ${i + 1} est illisible : ignorée.`);
    else recettes.push(v);
  });
  const coupe = fin < 0 || !complet;
  if (coupe) remarques.unshift(`La réponse de l'IA était coupée : ${recettes.length} recette(s) complète(s) récupérée(s).`);
  return { recettes, coupe, remarques };
}

/** Retire le bloc ```json … ``` (même sans les ``` de fin) et les caractères invisibles du début. */
function sansEmballage(reponse: string): string {
  const t = reponse.replace(/^﻿/, '');
  const bloc = t.match(/```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)(?:```|$)/);
  return bloc && /[[{]/.test(bloc[1]!) ? bloc[1]! : t;
}

/** JSON.parse tolérant : retire d'abord les virgules en trop. undefined si illisible. */
function lire(morceau: string): unknown {
  try {
    return JSON.parse(sansVirgulesFinales(morceau)) as unknown;
  } catch {
    return undefined;
  }
}

/** Range la valeur lue : tableau de recettes, {"recettes": […]}, autre nom de liste, ou recette seule. */
function interpreter(valeur: unknown): JsonExtrait {
  if (Array.isArray(valeur)) return { recettes: valeur, coupe: false, remarques: [] };
  if (typeof valeur !== 'object' || valeur === null) {
    return { recettes: [], coupe: false, remarques: ['La réponse ne contient pas de liste de recettes.'] };
  }
  const obj = valeur as Record<string, unknown>;
  if (Array.isArray(obj.recettes)) return { recettes: obj.recettes, coupe: false, remarques: [] };
  // Autre nom (« recipes », « clips »…) : la première liste d'objets qui ont des plans.
  for (const [cle, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.some((r) => typeof r === 'object' && r !== null && 'plans' in r)) {
      return { recettes: v, coupe: false, remarques: [`La liste "${cle}" a été lue comme "recettes".`] };
    }
  }
  if ('plans' in obj) return { recettes: [obj], coupe: false, remarques: ['Une seule recette, sans la liste "recettes" : acceptée.'] };
  return { recettes: [], coupe: false, remarques: ['La réponse ne contient pas de liste "recettes".'] };
}

/**
 * Index du } ou ] qui ferme le bloc ouvert à `debut` (-1 si le texte s'arrête avant).
 * Les accolades écrites DANS les chaînes ("…{…") ne comptent pas.
 */
function finDuBloc(t: string, debut: number): number {
  let profondeur = 0;
  let dansChaine = false;
  for (let i = debut; i < t.length; i++) {
    const c = t[i];
    if (dansChaine) {
      if (c === '\\') i++;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') dansChaine = true;
    else if (c === '{' || c === '[') profondeur++;
    else if (c === '}' || c === ']') {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return -1;
}

/** Index du premier [ placé directement dans l'objet ouvert à `debut` (ex. la liste "recettes"). */
function premierTableau(t: string, debut: number): number {
  let profondeur = 0;
  let dansChaine = false;
  for (let i = debut; i < t.length; i++) {
    const c = t[i];
    if (dansChaine) {
      if (c === '\\') i++;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') dansChaine = true;
    else if (c === '[' && profondeur === 1) return i;
    else if (c === '{' || c === '[') profondeur++;
    else if (c === '}' || c === ']') profondeur--;
  }
  return -1;
}

/** Les objets complets d'un tableau ouvert à `debut` ; `complet` = le ] final a été vu. */
function elementsDuTableau(t: string, debut: number): { morceaux: string[]; complet: boolean } {
  const morceaux: string[] = [];
  let profondeur = 0;
  let dansChaine = false;
  let depart = -1;
  for (let i = debut + 1; i < t.length; i++) {
    const c = t[i];
    if (dansChaine) {
      if (c === '\\') i++;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') dansChaine = true;
    else if (c === '{' || c === '[') {
      if (profondeur === 0) depart = i;
      profondeur++;
    } else if (c === '}' || c === ']') {
      if (profondeur === 0) return { morceaux, complet: true }; // le ] du tableau
      profondeur--;
      if (profondeur === 0 && depart >= 0) morceaux.push(t.slice(depart, i + 1));
    }
  }
  return { morceaux, complet: false };
}

/** Retire les virgules juste avant } ou ] (erreur fréquente des IA), sans toucher aux chaînes. */
export function sansVirgulesFinales(t: string): string {
  let res = '';
  let dansChaine = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (dansChaine) {
      res += c;
      if (c === '\\' && i + 1 < t.length) res += t[++i];
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') dansChaine = true;
    if (c === ',' && /^\s*[}\]]/.test(t.slice(i + 1, i + 40))) continue;
    res += c;
  }
  return res;
}
