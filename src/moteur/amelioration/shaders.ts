// Améliorer l'image — shaders WebGL2 (GLSL ES 3.00) des réseaux d'Anime4K, RÉÉCRITS pour Arko à partir des shaders
// mpv d'origine (https://github.com/bloc97/Anime4K, licence MIT, Copyright (c) 2019-2021 bloc97 — texte complet de
// la licence en tête de poids-restore-cnn-s.ts). Même calcul que reseau.ts (référence sur le processeur) :
// convolutions 3 × 3 lues avec texelFetch (bords collés), CReLU, puis « résidu » (Restore) ou 2 × 2 sous-pixels
// ajoutés à l'image agrandie en bilinéaire (Upscale ×2). Ligne 0 des textures = HAUT de l'image (comme mpv).

import type { Couche } from './reseau';

/** Triangle qui couvre tout l'écran, sans tampon de sommets. */
export const SOMMETS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const ENTETE = `#version 300 es
precision highp float;
precision highp int;
out vec4 S;`;

/** Écrit un nombre GLSL (toujours avec un point). */
function nb(x: number): string {
  const s = String(x);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

/** Une couche de convolution : entrée E (4 canaux), sortie 4 canaux (texture à virgule). */
export function shaderCouche(c: Couche): string {
  const lignes: string[] = [];
  for (let t = 0; t < 9; t++) {
    const dx = Math.floor(t / 3) - 1;
    const dy = (t % 3) - 1;
    lignes.push(`  v = texelFetch(E, clamp(p + ivec2(${dx}, ${dy}), ivec2(0), m), 0);`);
    for (let k = 0; k < (c.crelu ? 2 : 1); k++) {
      const m = c.poids.slice((k * 9 + t) * 16, (k * 9 + t + 1) * 16).map(nb).join(', ');
      const entree = !c.crelu ? 'v' : k === 0 ? 'max(v, 0.0)' : 'max(-v, 0.0)';
      lignes.push(`  r += mat4(${m}) * ${entree};`);
    }
  }
  return `${ENTETE}
uniform highp sampler2D E;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 m = textureSize(E, 0) - 1;
  vec4 r = vec4(${c.biais.map(nb).join(', ')});
  vec4 v;
${lignes.join('\n')}
  S = r;
}`;
}

/** Fin de Restore : image d'entrée M + force × correction R (sortie 8 bits, donc bornée entre 0 et 1). */
export const SHADER_RESIDU = `${ENTETE}
uniform highp sampler2D M;
uniform highp sampler2D R;
uniform float force;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  S = vec4(clamp(texelFetch(M, p, 0).rgb + force * texelFetch(R, p, 0).rgb, 0.0, 1.0), 1.0);
}`;

/** Fin d'Upscale ×2 : chaque pixel de sortie prend son sous-pixel (C, 4 canaux) + l'entrée M agrandie en bilinéaire. */
export const SHADER_PIXELS_2X2 = `${ENTETE}
uniform highp sampler2D M;
uniform highp sampler2D C;
uniform float force;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 q = p / 2;
  ivec2 s = p - q * 2;
  vec4 c = texelFetch(C, q, 0);
  float a = dot(c, vec4(equal(ivec4(0, 1, 2, 3), ivec4(s.y * 2 + s.x))));
  vec2 taille = vec2(textureSize(M, 0) * 2);
  vec3 base = texture(M, gl_FragCoord.xy / taille).rgb;
  S = vec4(clamp(base + force * a, 0.0, 1.0), 1.0);
}`;

/**
 * Sortie vers le canevas : renforcement adaptatif des contours (esprit CAS, voir classique.ts) puis copie,
 * retournée (ligne 0 des textures = haut ; ligne 0 du canevas WebGL = bas). force 0 = simple copie.
 */
export const SHADER_SORTIE = `${ENTETE}
uniform highp sampler2D E;
uniform float force;
void main() {
  ivec2 m = textureSize(E, 0) - 1;
  ivec2 p = ivec2(int(gl_FragCoord.x), m.y - int(gl_FragCoord.y));
  vec3 e = texelFetch(E, p, 0).rgb;
  if (force <= 0.0) { S = vec4(e, 1.0); return; }
  vec3 b = texelFetch(E, clamp(p + ivec2(0, -1), ivec2(0), m), 0).rgb;
  vec3 d = texelFetch(E, clamp(p + ivec2(-1, 0), ivec2(0), m), 0).rgb;
  vec3 f = texelFetch(E, clamp(p + ivec2(1, 0), ivec2(0), m), 0).rgb;
  vec3 h = texelFetch(E, clamp(p + ivec2(0, 1), ivec2(0), m), 0).rgb;
  vec3 mn = min(min(min(b, d), min(f, h)), e);
  vec3 mx = max(max(max(b, d), max(f, h)), e);
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / (8.0 - 3.0 * min(force, 1.0)));
  S = vec4(clamp((w * (b + d + f + h) + e) / (1.0 + 4.0 * w), 0.0, 1.0), 1.0);
}`;
