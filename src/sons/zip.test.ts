// Lecture sûre d'un .zip de sons : seulement les sons, noms jamais utilisés comme chemins, ni ZIP64 ni chiffré,
// plafonds (200 fichiers, 20 Mo par son), « bombe zip » arrêtée. Les archives sont fabriquées ici.
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { annoncesZip, extension, lireZip, nomSur, parcourirZip, ZIP_MAX_FICHIERS } from './zip';

interface Entree {
  nom: string;
  donnees: Uint8Array;
  compresser?: boolean;
  drapeaux?: number;
  /** Taille annoncée (pour simuler une archive qui ment). */
  tailleAnnoncee?: number;
}

/** Fabrique une archive .zip (entrées stockées ou deflate, sans CRC vérifié par le lecteur). */
function fabriquerZip(entrees: Entree[], zip64 = false): Blob {
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = new TextEncoder().encode(e.nom);
    const corps = e.compresser ? new Uint8Array(deflateRawSync(e.donnees)) : e.donnees;
    const methode = e.compresser ? 8 : 0;
    const taille = e.tailleAnnoncee ?? e.donnees.length;
    const local = new Uint8Array(30 + nom.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(6, e.drapeaux ?? 0, true);
    vl.setUint16(8, methode, true);
    vl.setUint32(18, corps.length, true);
    vl.setUint32(22, taille, true);
    vl.setUint16(26, nom.length, true);
    local.set(nom, 30);
    const central = new Uint8Array(46 + nom.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(8, e.drapeaux ?? 0, true);
    vc.setUint16(10, methode, true);
    vc.setUint32(20, corps.length, true);
    vc.setUint32(24, taille, true);
    vc.setUint16(28, nom.length, true);
    vc.setUint32(42, decalage, true);
    central.set(nom, 46);
    locaux.push(local, corps);
    centraux.push(central);
    decalage += local.length + corps.length;
  }
  const tailleRep = centraux.reduce((t, c) => t + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, entrees.length, true);
  vf.setUint16(10, zip64 ? 0xffff : entrees.length, true);
  vf.setUint32(12, tailleRep, true);
  vf.setUint32(16, decalage, true);
  return new Blob([...locaux, ...centraux, fin] as BlobPart[]);
}

const octets = (n: number, v = 7) => new Uint8Array(n).fill(v);

describe('lireZip', () => {
  it('garde seulement les sons (stockés ou compressés), avec un nom sans dossier', async () => {
    const zip = fabriquerZip([
      { nom: 'memes/boum.mp3', donnees: octets(1000) },
      { nom: 'memes/rire.WAV', donnees: octets(5000, 3), compresser: true },
      { nom: 'lisez-moi.txt', donnees: octets(10) },
      { nom: 'script.js', donnees: octets(10) },
      { nom: 'memes/', donnees: octets(0) },
      { nom: '__MACOSX/._boum.mp3', donnees: octets(10) },
    ]);
    const r = await lireZip(zip);
    expect(r.fichiers.map((f) => f.name)).toEqual(['boum.mp3', 'rire.WAV']);
    expect(r.fichiers.map((f) => f.size)).toEqual([1000, 5000]);
    expect(r.fichiers[0]!.type).toBe('audio/mpeg');
    expect(r.ignores).toBe(2);
  });

  it('un nom avec « ../ » ou un chemin absolu ne sert jamais de chemin', async () => {
    const r = await lireZip(fabriquerZip([{ nom: '../../etc/x.ogg', donnees: octets(10) }, { nom: 'C:\\Windows\\y.ogg', donnees: octets(10) }]));
    expect(r.fichiers.map((f) => f.name)).toEqual(['x.ogg', 'y.ogg']);
  });

  it('ignore les fichiers chiffrés', async () => {
    const r = await lireZip(fabriquerZip([{ nom: 'secret.mp3', donnees: octets(10), drapeaux: 1 }, { nom: 'ok.mp3', donnees: octets(10) }]));
    expect(r.fichiers.map((f) => f.name)).toEqual(['ok.mp3']);
    expect(r.ignores).toBe(1);
  });

  it('refuse le ZIP64 et une archive abîmée', async () => {
    await expect(lireZip(fabriquerZip([{ nom: 'a.mp3', donnees: octets(10) }], true))).rejects.toMatchObject({ code: 'zip' });
    await expect(lireZip(new Blob([octets(100)]))).rejects.toMatchObject({ code: 'zip' });
  });

  it('arrête une « bombe zip » (plus de données que la taille annoncée)', async () => {
    const r = await lireZip(fabriquerZip([{ nom: 'bombe.wav', donnees: octets(200_000), compresser: true, tailleAnnoncee: 1000 }]));
    expect(r.fichiers).toHaveLength(0);
    expect(r.ignores).toBe(1);
  });

  it('ignore un son annoncé à plus de 40 Mo, refuse plus de 2 000 sons', async () => {
    const gros = await lireZip(fabriquerZip([{ nom: 'gros.wav', donnees: octets(10), tailleAnnoncee: 41 * 1024 * 1024 }]));
    expect(gros.fichiers).toHaveLength(0);
    const trop = fabriquerZip(Array.from({ length: ZIP_MAX_FICHIERS + 1 }, (_, k) => ({ nom: `s${k}.mp3`, donnees: octets(4) })));
    await expect(lireZip(trop)).rejects.toMatchObject({ code: 'zip' });
  });
});

/** Blob qui refuse d'être lu en entier et note chaque morceau lu. */
class ZipEspion extends Blob {
  morceaux: number[] = [];
  override arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error('lu en entier');
  }
  override slice(de?: number, a?: number, type?: string): Blob {
    this.morceaux.push((a ?? this.size) - (de ?? 0));
    return super.slice(de, a, type);
  }
}

describe('pack de sons (dossiers, vidéos, gros .zip)', () => {
  it('garde le chemin de chaque son (étiquette du dossier) et accepte les vidéos courtes', async () => {
    const r = await lireZip(
      fabriquerZip([
        { nom: 'Pack/Laughs/rire.mp3', donnees: octets(10) },
        { nom: 'Pack/MLG Sound Effects/wow.mp4', donnees: octets(20) },
        { nom: 'x.wav', donnees: octets(5) },
      ]),
    );
    expect(r.fichiers.map((f) => [f.name, f.type])).toEqual([['rire.mp3', 'audio/mpeg'], ['wow.mp4', 'video/mp4'], ['x.wav', 'audio/wav']]);
    expect(r.chemins).toEqual(['Pack/Laughs/rire.mp3', 'Pack/MLG Sound Effects/wow.mp4', 'x.wav']);
  });

  it('lit le .zip PAR MORCEAUX (jamais en entier), entrée par entrée', async () => {
    const entrees = Array.from({ length: 30 }, (_, k) => ({ nom: `Dossier ${k % 3}/s${k}.mp3`, donnees: octets(100_000, k), compresser: k % 3 === 0 }));
    const brut = fabriquerZip(entrees);
    const espion = new ZipEspion([brut]);
    const vus: string[] = [];
    for await (const e of parcourirZip(espion)) vus.push(e.chemin);
    expect(vus).toHaveLength(30);
    expect(Math.max(...espion.morceaux)).toBeLessThan(espion.size / 10);
  });

  it('compte la taille annoncée avant de lire : plus de 600 Mo → « dossier par dossier »', async () => {
    const z = fabriquerZip(Array.from({ length: 16 }, (_, k) => ({ nom: `s${k}.wav`, donnees: octets(10), tailleAnnoncee: 39 * 1024 * 1024 })));
    await expect(annoncesZip(z)).rejects.toThrow(/dossier par dossier/);
    const petit = await annoncesZip(fabriquerZip([{ nom: 'a.mp3', donnees: octets(10) }, { nom: 'b.txt', donnees: octets(3) }]));
    expect([petit.annonces.length, petit.ignores, petit.total]).toEqual([1, 1, 10]);
  });

  it('zip piégé : entrée qui pointe hors du fichier, taille qui ment, répertoire hors du fichier', async () => {
    const z = fabriquerZip([{ nom: 'menteur.mp3', donnees: octets(100), tailleAnnoncee: 50 }, { nom: 'ok.mp3', donnees: octets(10) }]);
    const r = await lireZip(z);
    expect(r.fichiers.map((f) => f.name)).toEqual(['ok.mp3']);
    expect(r.ignores).toBe(1);
    // Décalage local hors du fichier : on modifie le répertoire central.
    const octetsZip = new Uint8Array(await fabriquerZip([{ nom: 'loin.mp3', donnees: octets(10) }]).arrayBuffer());
    const vue = new DataView(octetsZip.buffer);
    const rep = vue.getUint32(octetsZip.length - 22 + 16, true);
    vue.setUint32(rep + 42, 0x7fff0000, true);
    expect((await lireZip(new Blob([octetsZip]))).ignores).toBe(1);
    vue.setUint32(octetsZip.length - 22 + 16, 0x7fff0000, true);
    await expect(lireZip(new Blob([octetsZip]))).rejects.toMatchObject({ code: 'zip' });
  });
});

describe('noms', () => {
  it('extension et nom sûr', () => {
    expect(extension('Son.MP3')).toBe('mp3');
    expect(extension('sans')).toBe('');
    expect(nomSur('a/b\\c\u0001.ogg')).toBe('c.ogg');
  });
});
