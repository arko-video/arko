// B. Jurons (dev 2), fonctions PURES : reconnus sans accents ni majuscules, masqués à l'affichage en remplaçant
// la première voyelle après la 1re lettre par « * » (« putain » → « P*TAIN », « merde » → « M*RDE », « fdp » → « F*P »).
// Le mot de la transcription n'est jamais modifié : le masque est appliqué au dessin (style « punchline »).
// La ponctuation autour du mot et une élision (« d'enfoiré ») sont gardées.

/** Liste de base (français + quelques mots anglais courants en gaming), écrite sans accents. */
export const JURONS: readonly string[] = [
  'putain', 'ptn', 'putin', 'merde', 'bordel', 'connard', 'connards', 'connasse', 'enfoire', 'enfoires', 'fdp', 'batard',
  'salaud', 'salope', 'encule', 'nique', 'niquer', 'chier', 'fuck', 'fucking', 'shit', 'bitch',
];
const ENSEMBLE = new Set(JURONS);

/** Lettres seules, en minuscules et sans accents (« Enfoiré ! » → « enfoire »). */
export function motNu(mot: string): string {
  return mot
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Découpe « (d'enfoiré!) » en [« (d' », « enfoiré », « !) »] : avant, cœur du mot, après. */
function decouper(mot: string): [string, string, string] {
  const m = /^([^\p{L}\p{N}]*(?:\p{L}['’])?)([\p{L}\p{N}][\p{L}\p{N}-]*?)?([^\p{L}\p{N}]*)$/u.exec(mot);
  if (!m || !m[2]) return ['', mot, ''];
  return [m[1] ?? '', m[2], m[3] ?? ''];
}

export function estJuron(mot: string): boolean {
  if (ENSEMBLE.has(motNu(mot))) return true;
  return ENSEMBLE.has(motNu(decouper(mot)[1]));
}

const VOYELLE = /[aeiouyàâäéèêëîïôöùûüÿœæ]/i;

/** Masque un juron en gardant la casse (« putain » → « p*tain ») ; un autre mot est rendu tel quel. */
export function masquer(mot: string): string {
  if (!estJuron(mot)) return mot;
  const [avant, coeur, apres] = ENSEMBLE.has(motNu(decouper(mot)[1])) ? decouper(mot) : ['', mot, ''];
  const lettres = [...coeur];
  let i = lettres.findIndex((c, k) => k >= 1 && VOYELLE.test(c));
  if (i < 0) i = lettres.length >= 3 ? 1 : -1;
  if (i < 0) return mot;
  lettres[i] = '*';
  return avant + lettres.join('') + apres;
}

/** « putain » → « P*TAIN » (en majuscules). Un mot qui n'est pas un juron est rendu en majuscules, tel quel. */
export function masquerJuron(mot: string): string {
  return masquer(mot).toUpperCase();
}
