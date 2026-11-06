// Fond vert — le shader WebGL2 (GLSL ES 3.00) du détourage. MÊME calcul que chromaCpu (chroma.ts), ligne à ligne :
// ressemblance m bornée à [0 ; 1] pour chacun des 25 voisins (texelFetch, bords collés), moyennes 3 × 3 et 5 × 5,
// alpha par douce montée et anti-poussière, anti-débordement. Sortie PRÉMULTIPLIÉE (le canevas WebGL est prémultiplié) : drawImage la pose telle quelle.
// Ligne 0 de la texture = HAUT de l'image ; la sortie est retournée (gl_FragCoord part du bas) pour que le canevas
// soit à l'endroit.

import { POUSSIERE } from './chroma';

export const SOMMETS_CHROMA = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SHADER_CHROMA = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D E;
uniform int canal;       // 1 = vert, 2 = bleu
uniform float cle;       // ressemblance de la couleur du fond (déjà bornée à 0,15 au moins)
uniform float bas;       // tolérance
uniform float haut;      // tolérance + douceur
uniform float debordement;
out vec4 S;

const float PLANCHER = 0.25;

float ressemblance(vec3 c) {
  float p = canal == 1 ? c.g : c.b;
  float q = canal == 1 ? max(c.r, c.b) : max(c.r, c.g);
  return clamp(((p - q) / max(p, PLANCHER)) / cle, 0.0, 1.0);
}

void main() {
  ivec2 taille = textureSize(E, 0);
  ivec2 ici = ivec2(int(gl_FragCoord.x), taille.y - 1 - int(gl_FragCoord.y));
  float s3 = 0.0;
  float s5 = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      ivec2 v = clamp(ici + ivec2(dx, dy), ivec2(0), taille - 1);
      float r = ressemblance(texelFetch(E, v, 0).rgb);
      s5 += r;
      if (abs(dx) <= 1 && abs(dy) <= 1) s3 += r;
    }
  }
  float moy = s3 / 9.0;
  float a = smoothstep(bas, haut, 1.0 - moy) * (1.0 - smoothstep(${POUSSIERE[0]}, ${POUSSIERE[1]}, s5 / 25.0));
  vec3 c = texelFetch(E, ici, 0).rgb;
  float quantite = min(1.0, debordement + 2.0 * moy);
  if (canal == 1) c.g -= quantite * max(0.0, c.g - max(c.r, c.b));
  else c.b -= quantite * max(0.0, c.b - max(c.r, c.g));
  S = vec4(c * a, a);
}`;
