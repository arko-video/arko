// Lecture SÛRE d'un .zip de sons (import dans « Mes sons ») : on n'en sort que des fichiers audio.
// - liste blanche d'extensions audio ; tout le reste est ignoré ;
// - au plus 200 fichiers, 20 Mo par son, 100 Mo en tout (taille annoncée ET taille réelle, compteur pendant
//   la décompression : une « bombe zip » est arrêtée) ;
// - ni ZIP64 ni fichier chiffré ; seulement « stocké » (0) et « deflate » (8) ;
// - le nom d'un fichier n'est jamais utilisé comme chemin : on ne garde que son dernier morceau, comme nom affiché.
// Décompression : DecompressionStream('deflate-raw') du navigateur (aucune dépendance).

import { ErreurArko } from '../moteur/erreurs';

export const ZIP_MAX_FICHIERS = 200;
export const ZIP_MAX_SON = 20 * 1024 * 1024;
export const ZIP_MAX_TOTAL = 100 * 1024 * 1024;
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

export interface ResultatZip {
  fichiers: File[];
  /** Nombre d'entrées ignorées (pas un son, chiffrées, trop grosses, illisibles). */
  ignores: number;
}

const erreur = (msg = 'Ce fichier .zip est abîmé ou d\'un type non pris en charge.') => new ErreurArko(msg, 'zip');

/** Extension en minuscules d'un nom (« son.MP3 » → « mp3 »), ou "". */
export function extension(nom: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nom);
  return m ? m[1]!.toLowerCase() : '';
}

/** Dernier morceau d'un chemin d'archive, nettoyé (jamais un chemin). */
export function nomSur(chemin: string): string {
  const dernier = chemin.split(/[\\/]/).pop() ?? '';
  return dernier.replace(/[\u0000-\u001f\u007f]/g, '').slice(-120);
}

/** Lit un .zip et renvoie ses sons. Lève ErreurArko "zip" si l'archive est illisible, ZIP64 ou trop grosse. */
export async function lireZip(zip: Blob): Promise<ResultatZip> {
  const octets = new Uint8Array(await zip.arrayBuffer());
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  // Fin du répertoire central : signature 0x06054b50, cherchée dans les derniers 64 Kio (+ 22 octets).
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 22 - 65535); i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw erreur();
  if (fin >= 20 && vue.getUint32(fin - 20, true) === 0x07064b50) throw erreur('Ce .zip est au format ZIP64, non pris en charge.');
  const nbEntrees = vue.getUint16(fin + 10, true);
  const tailleRep = vue.getUint32(fin + 12, true);
  const debutRep = vue.getUint32(fin + 16, true);
  if (nbEntrees === 0xffff || tailleRep === 0xffffffff || debutRep === 0xffffffff) throw erreur('Ce .zip est au format ZIP64, non pris en charge.');
  if (debutRep + tailleRep > fin) throw erreur();

  const fichiers: File[] = [];
  let ignores = 0;
  let total = 0;
  let p = debutRep;
  for (let k = 0; k < nbEntrees; k++) {
    if (p + 46 > fin || vue.getUint32(p, true) !== 0x02014b50) throw erreur();
    const drapeaux = vue.getUint16(p + 8, true);
    const methode = vue.getUint16(p + 10, true);
    const tailleZip = vue.getUint32(p + 20, true);
    const taille = vue.getUint32(p + 24, true);
    const lgNom = vue.getUint16(p + 28, true);
    const lgExtra = vue.getUint16(p + 30, true);
    const lgComm = vue.getUint16(p + 32, true);
    const local = vue.getUint32(p + 42, true);
    const chemin = new TextDecoder().decode(octets.subarray(p + 46, p + 46 + lgNom));
    p += 46 + lgNom + lgExtra + lgComm;
    if (tailleZip === 0xffffffff || taille === 0xffffffff || local === 0xffffffff) throw erreur('Ce .zip est au format ZIP64, non pris en charge.');
    const nom = nomSur(chemin);
    const ext = extension(nom);
    const estDossier = chemin.endsWith('/') || chemin.endsWith('\\');
    if (estDossier || chemin.includes('__MACOSX') || nom.startsWith('.')) continue;
    if (!EXTENSIONS_AUDIO[ext] || drapeaux & 0x1 || (methode !== 0 && methode !== 8) || taille > ZIP_MAX_SON) {
      ignores++;
      continue;
    }
    if (fichiers.length >= ZIP_MAX_FICHIERS) throw erreur(`Ce .zip contient plus de ${ZIP_MAX_FICHIERS} sons : découpe-le en plusieurs.`);
    if (total + taille > ZIP_MAX_TOTAL) throw erreur('Ce .zip dépasse 100 Mo de sons.');
    if (local + 30 > octets.length || vue.getUint32(local, true) !== 0x04034b50) {
      ignores++;
      continue;
    }
    const debut = local + 30 + vue.getUint16(local + 26, true) + vue.getUint16(local + 28, true);
    if (debut + tailleZip > octets.length) {
      ignores++;
      continue;
    }
    const brut = octets.slice(debut, debut + tailleZip);
    try {
      const donnees = methode === 0 ? brut : await decompresser(brut, taille);
      if (donnees.length !== taille) throw erreur();
      total += taille;
      fichiers.push(new File([donnees], nom, { type: EXTENSIONS_AUDIO[ext] }));
    } catch {
      ignores++;
    }
  }
  return { fichiers, ignores };
}

/** Décompresse (deflate brut) en s'arrêtant dès qu'on dépasse la taille annoncée. */
async function decompresser(brut: Uint8Array<ArrayBuffer>, attendu: number): Promise<Uint8Array<ArrayBuffer>> {
  const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
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
