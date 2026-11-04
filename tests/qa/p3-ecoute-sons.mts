import { writeFileSync } from 'node:fs';
const racine = process.argv[2];
const out = process.argv[3];
const { synthetiser, idsSynthese, FREQ } = await import(racine + '/src/sons/synthese/index.ts');
const { CATALOGUE } = await import(racine + '/src/sons/catalogue.ts');
function wav(s: Float32Array, f: number) {
  const b = Buffer.alloc(44 + s.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(f, 24); b.writeUInt32LE(f * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(s.length * 4, 40);
  for (let i = 0; i < s.length; i++) b.writeFloatLE(s[i], 44 + i * 4);
  return b;
}
const res: any[] = [];
for (const c of CATALOGUE) {
  const t0 = performance.now();
  const a = synthetiser(c.id)!;
  const ms = performance.now() - t0;
  const b = synthetiser(c.id)!;
  let ident = a.length === b.length; for (let i = 0; ident && i < a.length; i++) if (a[i] !== b[i]) ident = false;
  let crete = 0, nan = 0; for (const v of a) { if (!Number.isFinite(v)) nan++; crete = Math.max(crete, Math.abs(v)); }
  writeFileSync(`${out}/${c.id}.wav`, wav(a, FREQ));
  res.push({ id: c.id, duree: a.length / FREQ, dureeCat: c.duree, ms: +ms.toFixed(1), deterministe: ident, creteDb: +(20 * Math.log10(crete)).toFixed(2), debut: +a[0].toFixed(4), fin: +a[a.length - 1].toFixed(5), nan });
}
console.log(JSON.stringify({ ids: idsSynthese().length, res }, null, 1));
