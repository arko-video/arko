// Convertit les shaders CNN d'Anime4K (format mpv, GLSL) en données TypeScript pour Arko.
// Anime4K : https://github.com/bloc97/Anime4K — licence MIT, Copyright (c) 2019-2021 bloc97.
// On ne copie que les POIDS (les nombres des matrices) ; les shaders WebGL2 d'Arko sont écrits à part
// (src/moteur/amelioration/shaders.ts) et refont le même calcul.
//
// Usage (une seule fois, les fichiers produits sont dans le dépôt) :
//   node scripts/anime4k-vers-arko.mjs <dossier qui contient les .glsl téléchargés depuis le dépôt Anime4K>
// Fichiers lus : Anime4K_Restore_CNN_S.glsl (glsl/Restore) et Anime4K_Upscale_CNN_x2_S.glsl (glsl/Upscale).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2];
if (!dossier) throw new Error('Donne le dossier des fichiers .glsl d’Anime4K.');
const SORTIE = new URL('../src/moteur/amelioration/', import.meta.url);

/** Ordre des 9 décalages dans les shaders d'Anime4K : x de −1 à 1, puis y de −1 à 1. */
const DECALAGES = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) DECALAGES.push([x, y]);

/** Découpe un shader mpv en passes (une par //!DESC) et lit les matrices de chaque convolution. */
function lirePasses(texte) {
  const passes = [];
  for (const bloc of texte.split('//!DESC ').slice(1)) {
    const desc = bloc.split('\n')[0].trim();
    const termes = [...bloc.matchAll(/mat4\(([^)]*)\)\s*\*\s*go_(\d)\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)];
    const biais = bloc.match(/result \+= vec4\(([^)]*)\);/);
    if (termes.length === 0) {
      passes.push({ desc, conv: false });
      continue;
    }
    const crelu = termes.some((t) => t[2] === '1');
    const poids = [];
    termes.forEach((t, i) => {
      const attendu = DECALAGES[i % 9];
      const k = Math.floor(i / 9);
      if (Number(t[2]) !== k || Number(t[3]) !== attendu[0] || Number(t[4]) !== attendu[1]) {
        throw new Error(`${desc} : terme ${i} inattendu (go_${t[2]}(${t[3]}, ${t[4]}))`);
      }
      const m = t[1].split(',').map((s) => s.trim());
      if (m.length !== 16) throw new Error(`${desc} : matrice de ${m.length} nombres`);
      poids.push(...m);
    });
    if (termes.length !== (crelu ? 18 : 9)) throw new Error(`${desc} : ${termes.length} termes`);
    if (!biais) throw new Error(`${desc} : biais introuvable`);
    passes.push({ desc, conv: true, crelu, poids, biais: biais[1].split(',').map((s) => s.trim()) });
  }
  return passes;
}

function ecrire(fichierGlsl, nomTs, nomConst, sortie) {
  const texte = readFileSync(join(dossier, fichierGlsl), 'utf8');
  const entete = texte.split('//!DESC')[0].trim();
  if (!entete.includes('MIT License') || !entete.includes('bloc97')) throw new Error(`${fichierGlsl} : licence MIT introuvable`);
  const passes = lirePasses(texte);
  const convs = passes.filter((p) => p.conv);
  const nom = passes[0].desc.replace(/-Conv-.*$/, '');
  const lignes = [
    entete,
    '',
    `// Poids du réseau ${nom}, copiés tels quels depuis ${fichierGlsl}`,
    '// (https://github.com/bloc97/Anime4K) par scripts/anime4k-vers-arko.mjs. Ne pas modifier à la main.',
    `// Passes d'origine : ${passes.map((p) => p.desc.replace(nom + '-', '')).join(' → ')}.`,
    '',
    "import type { Reseau } from './reseau';",
    '',
    `export const ${nomConst}: Reseau = {`,
    `  nom: '${nom}',`,
    `  sortie: '${sortie}',`,
    '  couches: [',
  ];
  for (const c of convs) {
    lignes.push(`    {`, `      crelu: ${c.crelu},`, `      biais: [${c.biais.join(', ')}],`, '      poids: [');
    for (let i = 0; i < c.poids.length; i += 8) lignes.push(`        ${c.poids.slice(i, i + 8).join(', ')},`);
    lignes.push('      ],', '    },');
  }
  lignes.push('  ],', '};', '');
  writeFileSync(new URL(nomTs, SORTIE), lignes.join('\n'));
  console.log(`${nomTs} : ${convs.length} convolutions, ${convs.reduce((s, c) => s + c.poids.length, 0)} poids`);
}

ecrire('Anime4K_Restore_CNN_S.glsl', 'poids-restore-cnn-s.ts', 'RESTORE_CNN_S', 'residu');
ecrire('Anime4K_Upscale_CNN_x2_S.glsl', 'poids-upscale-cnn-x2-s.ts', 'UPSCALE_CNN_X2_S', 'pixels2x2');
