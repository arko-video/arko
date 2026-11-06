// Lecture SÛRE d'un .zip de sons (import dans « Mes sons ») : on n'en sort que des sons (et des vidéos courtes,
// dont l'import ne garde que le son).
// - liste blanche d'extensions ; tout le reste est ignoré ;
// - au plus 2 000 fichiers, 40 Mo par fichier, 600 Mo en tout (taille annoncée ET taille réelle, compteur pendant
//   la décompression : une « bombe zip » est arrêtée) ;
// - ni ZIP64 ni fichier chiffré ; seulement « stocké » (0) et « deflate » (8) ;
// - lu PAR MORCEAUX (Blob.slice) : un pack de 500 Mo n'est jamais chargé en entier en mémoire ;
// - le chemin d'une entrée ne sert qu'à l'étiquette (nom du dossier) ; le fichier ne garde que son dernier morceau.
// Décompression : DecompressionStream('deflate-raw') du navigateur (aucune dépendance).

import { ErreurArko } from '../moteur/erreurs';

export const ZIP_MAX_FICHIERS = 2000;
export const ZIP_MAX_SON = 40 * 1024 * 1024;
export const ZIP_MAX_TOTAL = 600 * 1024 * 1024;
/** Répertoire central lu d'un coup : au plus 8 Mo (≈ 50 000 entrées). */
const REPERTOIRE_MAX = 8 * 1024 * 1024;
/** Extensions audio acceptées (en minuscules) et leur type. */
export const EXTENSIONS_AUDIO: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};
/** Vidéos courtes acceptées : seul leur son sera gardé. */
export const EXTENSIONS_VIDEO: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export interface EntreeZip {
  fichier: File;
  /** Chemin dans l'archive (pour l'étiquette du dossier ; jamais un chemin de fichier). */
  chemin: string;
}

export interface ResultatZip {
  fichiers: File[];
  /** Chemin de chaque fichier dans l'archive (même ordre que `fichiers`). */
  chemins: string[];
  /** Nombre d'entrées ignorées (pas un son, chiffrées, trop grosses, illisibles). */
  ignores: number;
}

/** Une entrée gardée du répertoire central (lecture des données plus tard, une par une). */
interface Annonce {
  chemin: string;
  nom: string;
  type: string;
  methode: number;
  tailleZip: number;
  taille: number;
  local: number;
}

/** Réglages de lecture (Ma bibliothèque : vidéos entières, plus gros fichiers). Absents = ceux de Mes sons. */
export interface OptionsZip {
  /** Type d'un nom accepté, ou "" pour l'ignorer (défaut : typeAccepte). */
  accepte?: (nom: string) => string;
  /** Taille maximale d'un fichier et du total (octets). */
  maxFichier?: number;
  maxTotal?: number;
}

const erreur = (msg = 'Ce fichier .zip est abîmé ou d\'un type non pris en charge.') => new ErreurArko(msg, 'zip');
const ZIP64 = 'Ce .zip est au format ZIP64, non pris en charge.';

/** Extension en minuscules d'un nom (« son.MP3 » → « mp3 »), ou "". */
export function extension(nom: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nom);
  return m ? m[1]!.toLowerCase() : '';
}

/** Type d'un fichier accepté (audio ou vidéo courte), ou "" s'il est refusé. */
export function typeAccepte(nom: string): string {
  const ext = extension(nom);
  return EXTENSIONS_AUDIO[ext] ?? EXTENSIONS_VIDEO[ext] ?? '';
}

/** Dernier morceau d'un chemin d'archive, nettoyé (jamais un chemin). */
export function nomSur(chemin: string): string {
  const dernier = chemin.split(/[\\/]/).pop() ?? '';
  return dernier.replace(/[\u0000-\u001f\u007f]/g, '').slice(-120);
}

async function lireMorceau(zip: Blob, de: number, a: number): Promise<{ octets: Uint8Array<ArrayBuffer>; vue: DataView }> {
  const octets = new Uint8Array(await zip.slice(de, a).arrayBuffer());
  return { octets, vue: new DataView(octets.buffer) };
}

/**
 * Lit le répertoire central (fin du fichier seulement) : les entrées acceptées, dans l'ordre, et le nombre d'ignorées.
 * Lève ErreurArko "zip" si l'archive est illisible, ZIP64, ou dépasse les plafonds annoncés.
 */
export async function annoncesZip(zip: Blob, o: OptionsZip = {}): Promise<{ annonces: Annonce[]; ignores: number; total: number; nomsIgnores: string[] }> {
  const maxFichier = o.maxFichier ?? ZIP_MAX_SON;
  const maxTotal = o.maxTotal ?? ZIP_MAX_TOTAL;
  const trop = `Ce .zip dépasse ${Math.round(maxTotal / (1024 * 1024))} Mo : importe-le dossier par dossier.`;
  const queue = Math.min(zip.size, 22 + 65535);
  const fin = await lireMorceau(zip, zip.size - queue, zip.size);
  // Fin du répertoire central : signature 0x06054b50, cherchée dans les derniers 64 Kio (+ 22 octets).
  let ici = -1;
  for (let i = fin.octets.length - 22; i >= 0; i--) {
    if (fin.vue.getUint32(i, true) === 0x06054b50) {
      ici = i;
      break;
    }
  }
  if (ici < 0) throw erreur();
  if (ici >= 20 && fin.vue.getUint32(ici - 20, true) === 0x07064b50) throw erreur(ZIP64);
  const nbEntrees = fin.vue.getUint16(ici + 10, true);
  const tailleRep = fin.vue.getUint32(ici + 12, true);
  const debutRep = fin.vue.getUint32(ici + 16, true);
  if (nbEntrees === 0xffff || tailleRep === 0xffffffff || debutRep === 0xffffffff) throw erreur(ZIP64);
  const finRep = zip.size - queue + ici;
  if (debutRep + tailleRep > finRep || tailleRep > REPERTOIRE_MAX) throw erreur();
  const rep = await lireMorceau(zip, debutRep, debutRep + tailleRep);

  const annonces: Annonce[] = [];
  const nomsIgnores: string[] = [];
  let ignores = 0;
  let total = 0;
  let p = 0;
  for (let k = 0; k < nbEntrees; k++) {
    if (p + 46 > rep.octets.length || rep.vue.getUint32(p, true) !== 0x02014b50) throw erreur();
    const drapeaux = rep.vue.getUint16(p + 8, true);
    const methode = rep.vue.getUint16(p + 10, true);
    const tailleZip = rep.vue.getUint32(p + 20, true);
    const taille = rep.vue.getUint32(p + 24, true);
    const lgNom = rep.vue.getUint16(p + 28, true);
    const lgExtra = rep.vue.getUint16(p + 30, true);
    const lgComm = rep.vue.getUint16(p + 32, true);
    const local = rep.vue.getUint32(p + 42, true);
    const chemin = new TextDecoder().decode(rep.octets.subarray(p + 46, p + 46 + lgNom));
    p += 46 + lgNom + lgExtra + lgComm;
    if (tailleZip === 0xffffffff || taille === 0xffffffff || local === 0xffffffff) throw erreur(ZIP64);
    const nom = nomSur(chemin);
    const estDossier = chemin.endsWith('/') || chemin.endsWith('\\');
    if (estDossier || chemin.includes('__MACOSX') || nom.startsWith('.')) continue;
    const type = (o.accepte ?? typeAccepte)(nom);
    if (!type || drapeaux & 0x1 || (methode !== 0 && methode !== 8) || taille > maxFichier) {
      ignores++;
      nomsIgnores.push(chemin);
      continue;
    }
    if (annonces.length >= ZIP_MAX_FICHIERS) throw erreur(`Ce .zip contient plus de ${ZIP_MAX_FICHIERS} sons : découpe-le en plusieurs.`);
    if (total + taille > maxTotal) throw erreur(o.maxTotal ? trop : 'Ce .zip dépasse 600 Mo de sons : importe-le dossier par dossier.');
    total += taille;
    annonces.push({ chemin, nom, type, methode, tailleZip, taille, local });
  }
  return { annonces, ignores, total, nomsIgnores };
}

/**
 * Parcourt les sons d'un .zip UN PAR UN (chaque entrée lue avec Blob.slice, puis lâchée par l'appelant).
 * `ignore()` est appelé pour chaque entrée refusée ou illisible. La taille RÉELLE est comptée pendant la lecture.
 */
export async function* parcourirZip(zip: Blob, ignore: (chemin?: string) => void = () => undefined, o: OptionsZip = {}): AsyncGenerator<EntreeZip> {
  const { annonces, nomsIgnores } = await annoncesZip(zip, o);
  for (const nom of nomsIgnores) ignore(nom);
  const maxTotal = o.maxTotal ?? ZIP_MAX_TOTAL;
  let reel = 0;
  for (const a of annonces) {
    const tete = await lireMorceau(zip, a.local, Math.min(zip.size, a.local + 30));
    if (tete.octets.length < 30 || tete.vue.getUint32(0, true) !== 0x04034b50) {
      ignore(a.chemin);
      continue;
    }
    const debut = a.local + 30 + tete.vue.getUint16(26, true) + tete.vue.getUint16(28, true);
    if (debut + a.tailleZip > zip.size) {
      ignore(a.chemin);
      continue;
    }
    let donnees: Blob;
    try {
      const brut = zip.slice(debut, debut + a.tailleZip);
      // « Stocké » : un morceau du .zip, lu plus tard par morceaux (une vidéo de 200 Mo n'est jamais en mémoire).
      donnees = a.methode === 0 ? brut : new Blob([await decompresser(brut, a.taille)]);
      if (donnees.size !== a.taille) throw erreur();
    } catch {
      ignore(a.chemin);
      continue;
    }
    reel += donnees.size;
    if (reel > maxTotal) throw erreur(o.maxTotal ? `Ce .zip dépasse ${Math.round(maxTotal / (1024 * 1024))} Mo : importe-le dossier par dossier.` : 'Ce .zip dépasse 600 Mo de sons : importe-le dossier par dossier.');
    yield { fichier: new File([donnees], a.nom, { type: a.type }), chemin: a.chemin };
  }
}

/** Lit un .zip et renvoie tous ses sons (pour les petits .zip ; l'import d'un pack utilise parcourirZip). */
export async function lireZip(zip: Blob): Promise<ResultatZip> {
  const res: ResultatZip = { fichiers: [], chemins: [], ignores: 0 };
  for await (const e of parcourirZip(zip, () => res.ignores++)) {
    res.fichiers.push(e.fichier);
    res.chemins.push(e.chemin);
  }
  return res;
}

/** Décompresse (deflate brut) en s'arrêtant dès qu'on dépasse la taille annoncée. */
async function decompresser(brut: Blob, attendu: number): Promise<Uint8Array<ArrayBuffer>> {
  const flux = brut.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const lecteur = flux.getReader();
  const sortie = new Uint8Array(attendu);
  let n = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (n + value.length > attendu) {
      await lecteur.cancel();
      throw erreur();
    }
    sortie.set(value, n);
    n += value.length;
  }
  return n === attendu ? sortie : sortie.slice(0, n);
}
