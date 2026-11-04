// Génère les icônes PWA d'Arko (public/icones) à partir d'un SVG : carré citron arrondi, « A » sombre.
// Usage : node scripts/icones.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dossier = fileURLToPath(new URL('../public/icones/', import.meta.url));
const CITRON = '#C8FF4D';
const FOND = '#0F1115';

/** Icône normale : carré citron arrondi sur fond transparent. */
function svgNormale(taille) {
  const r = taille * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="${(r * 512) / taille}" fill="${CITRON}"/>
  ${lettre(1)}
</svg>`;
}

/** Icône masquable : fond plein (Android découpe librement), lettre dans la zone sûre de 80 %. */
function svgMasquable() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${CITRON}"/>
  ${lettre(0.78)}
</svg>`;
}

/** « A » géométrique en traits épais (pas de police nécessaire). */
function lettre(echelle) {
  const t = `translate(256 256) scale(${echelle}) translate(-256 -256)`;
  return `<g transform="${t}" fill="none" stroke="${FOND}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 388 256 124 362 388"/>
    <path d="M192 296h128"/>
  </g>`;
}

await mkdir(dossier, { recursive: true });
await sharp(Buffer.from(svgNormale(192))).resize(192, 192).png().toFile(`${dossier}icone-192.png`);
await sharp(Buffer.from(svgNormale(512))).png().toFile(`${dossier}icone-512.png`);
await sharp(Buffer.from(svgMasquable())).png().toFile(`${dossier}icone-maskable-512.png`);
console.log('Icônes écrites dans', dossier);
