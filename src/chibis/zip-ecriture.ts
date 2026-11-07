// D. Écriture d'un .zip « stocké » (sans compression : les PNG sont déjà compressés), pur et sans dépendance.
// Format : en-têtes locaux + répertoire central + fin de répertoire (APPNOTE, version 2.0, noms en UTF-8).

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE_CRC[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface FichierZip {
  nom: string;
  donnees: Uint8Array;
}

/** Fabrique le .zip (octets). Date fixe (1/1/2026) : même entrée → mêmes octets. */
export function ecrireZip(fichiers: readonly FichierZip[]): Uint8Array {
  const enc = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;
  const heure = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const crc = crc32(f.donnees);
    const n = f.donnees.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // stocké
    local.setUint16(10, heure, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, n, true);
    local.setUint32(22, n, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.donnees);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, n, true);
    c.setUint32(24, n, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    central.push(new Uint8Array(c.buffer), nom);
    decalage += 30 + nom.length + n;
  }
  const tailleCentral = central.reduce((s, m) => s + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);
  const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
  const res = new Uint8Array(tout.reduce((s, m) => s + m.length, 0));
  let i = 0;
  for (const m of tout) {
    res.set(m, i);
    i += m.length;
  }
  return res;
}
