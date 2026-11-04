// Nettoyage (pur) des mots donnés par Whisper : ponctuation collée au mot, hallucinations retirées,
// mots forts marqués. Entrée : mots bruts en temps source. Sortie : Mot[] de la recette.

import type { Mot } from '../recette/types';
import type { MotBrut } from './messages';

/** Un mot plus long que ça est une hallucination (Whisper qui « étire » un mot dans un silence). */
export const DUREE_MAX_MOT = 1.5;
/** En dessous de ce volume (RMS de 0 à 1), le son est « faible » : pas de vraie voix. */
export const NIVEAU_FAIBLE = 0.02;
/** Un écart plus grand entre deux mots termine une phrase. */
const PAUSE_PHRASE = 1;

/** Mots mis en valeur automatiquement (vocabulaire gaming FR). */
const MOTS_FORTS = new Set([
  'non', 'quoi', 'mdr', 'ptdr', 'lol', 'wesh', 'gg', 'jamais', 'incroyable', 'impossible',
  'énorme', 'dingue', 'ouf', 'wow', 'waouh', 'sérieux', 'attends', 'attendez', 'attend',
]);

/** Texte de comparaison : minuscules, sans ponctuation ni symboles, sans espaces autour. */
export function cle(txt: string): string {
  return txt.normalize('NFC').toLowerCase().replace(/[\p{P}\p{S}]/gu, '').trim();
}

/** true si le texte n'est fait que de ponctuation (« , », « ! », « ... »). */
function queDeLaPonctuation(txt: string): boolean {
  return /^[\p{P}\s]+$/u.test(txt);
}

/**
 * Enlève les espaces et colle au mot précédent :
 * - la ponctuation isolée (« super » + « ! » → « super! ») ;
 * - la suite d'une élision, collée par Whisper sans espace (« Aujourd » + « 'hui » → « Aujourd'hui »).
 */
export function collerPonctuation(mots: MotBrut[]): MotBrut[] {
  const res: MotBrut[] = [];
  for (const m of mots) {
    const txt = m.txt.trim();
    if (!txt) continue;
    const precedent = res[res.length - 1];
    if (queDeLaPonctuation(txt)) {
      if (precedent) precedent.txt += txt.replace(/\s+/g, '');
      continue;
    }
    if (precedent && /^['’]/.test(m.txt)) {
      precedent.txt += txt;
      precedent.fin = Math.max(precedent.fin, m.fin);
      precedent.niveau = Math.max(precedent.niveau, m.niveau);
      continue;
    }
    res.push({ ...m, txt });
  }
  return res;
}

/** Découpe en phrases : fin sur « . ! ? … » ou sur une pause de plus d'une seconde. */
function phrases(mots: MotBrut[]): MotBrut[][] {
  const res: MotBrut[][] = [];
  let courante: MotBrut[] = [];
  mots.forEach((m, i) => {
    const precedent = mots[i - 1];
    if (precedent && m.ts - precedent.fin > PAUSE_PHRASE && courante.length > 0) {
      res.push(courante);
      courante = [];
    }
    courante.push(m);
    if (/[.!?…]$/.test(m.txt)) {
      res.push(courante);
      courante = [];
    }
  });
  if (courante.length > 0) res.push(courante);
  return res;
}

/** Une phrase inventée par Whisper (génériques de sous-titres vus pendant son apprentissage) ? */
function phraseInventee(phrase: MotBrut[]): boolean {
  const texte = phrase.map((m) => cle(m.txt)).join(' ');
  // « Amara.org » et « Sous-titrage … » ne sont jamais prononcés dans un clip : toujours retirés.
  if (texte.includes('amara') || /^sous ?titr/.test(texte.replace(/-/g, ' '))) return true;
  // « Merci d'avoir regardé » peut être vraiment dit : retiré seulement si le son est faible.
  if (texte.includes('merci davoir regardé')) {
    const moyen = phrase.reduce((s, m) => s + m.niveau, 0) / phrase.length;
    return moyen < NIVEAU_FAIBLE;
  }
  return false;
}

/** Retire les répétitions en boucle : un groupe de 1 à 4 mots répété 3 fois ou plus n'est gardé qu'une fois. */
export function retirerRepetitions(mots: MotBrut[]): MotBrut[] {
  const cles = mots.map((m) => cle(m.txt));
  const res: MotBrut[] = [];
  let i = 0;
  while (i < mots.length) {
    let saut = 0;
    for (let n = 1; n <= 4 && saut === 0; n++) {
      let fois = 1;
      while (memeGroupe(cles, i, i + fois * n, n)) fois++;
      if (fois >= 3) {
        res.push(...mots.slice(i, i + n));
        saut = fois * n;
      }
    }
    if (saut > 0) i += saut;
    else res.push(mots[i++]!);
  }
  return res;
}

function memeGroupe(cles: string[], a: number, b: number, n: number): boolean {
  if (b + n > cles.length) return false;
  for (let k = 0; k < n; k++) if (cles[a + k] !== cles[b + k]) return false;
  return true;
}

/**
 * Mots de plus de 1,5 s : dans un son faible, c'est une hallucination (retirée) ;
 * sinon c'est souvent un vrai mot suivi d'un silence (le dernier d'une phrase) : on le raccourcit.
 */
function retirerMotsEtires(mots: MotBrut[]): MotBrut[] {
  return mots
    .filter((m) => m.fin - m.ts <= DUREE_MAX_MOT || m.niveau >= NIVEAU_FAIBLE)
    .map((m) => (m.fin - m.ts > DUREE_MAX_MOT ? { ...m, fin: Math.round((m.ts + DUREE_MAX_MOT) * 100) / 100 } : m));
}

/** Retire les hallucinations : mots étirés, phrases inventées, répétitions en boucle. */
export function filtrerHallucinations(mots: MotBrut[]): MotBrut[] {
  const gardes = phrases(retirerMotsEtires(mots)).filter((p) => !phraseInventee(p)).flat();
  return retirerRepetitions(gardes);
}

/** Un mot fort : dans la liste, en MAJUSCULES, ou suivi de « ! ». */
export function estFort(txt: string): boolean {
  const c = cle(txt);
  if (MOTS_FORTS.has(c)) return true;
  const lettres = txt.replace(/[^\p{L}]/gu, '');
  if (lettres.length >= 2 && lettres === lettres.toUpperCase() && lettres !== lettres.toLowerCase()) return true;
  return txt.trim().endsWith('!');
}

/** Espace insécable (U+00A0, présente dans toutes les polices) avant « ! ? : ; » à la fin d'un mot, comme en français. */
export function espaceFrancaise(txt: string): string {
  return txt.replace(/([^\s\u00A0\u202F])([!?:;][\p{P}]*)$/u, '$1\u00A0$2');
}

/** Chaîne complète : mots bruts de Whisper → mots de la recette, triés par temps. langue : "fr", "en"… ou "auto". */
export function nettoyer(bruts: MotBrut[], langue = 'fr'): Mot[] {
  const tries = [...bruts].sort((a, b) => a.ts - b.ts);
  return filtrerHallucinations(collerPonctuation(tries)).map((m): Mot => {
    const txt = langue === 'fr' ? espaceFrancaise(m.txt) : m.txt;
    return estFort(txt) ? [txt, m.ts, m.fin, 1] : [txt, m.ts, m.fin];
  });
}
