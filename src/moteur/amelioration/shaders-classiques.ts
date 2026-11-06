// Améliorer l'image — shaders du repli SANS IA (même calcul que classique.ts) : déblocage 8 × 8 et agrandissement
// ×2 bicubique (Catmull-Rom). Le renforcement des contours est dans SHADER_SORTIE (shaders.ts).

const ENTETE = `#version 300 es
precision highp float;
precision highp int;
out vec4 S;`;

/**
 * Déblocage le long d'un axe (axe = (1, 0) : frontières verticales, colonnes multiples de 8 ; (0, 1) : horizontales).
 * Une passe par axe, comme classique.ts (la 2ᵉ lit le résultat de la 1ʳᵉ).
 */
export const SHADER_DEBLOCAGE = `${ENTETE}
uniform highp sampler2D E;
uniform ivec2 axe;
uniform float seuil;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 taille = textureSize(E, 0);
  vec3 ici = texelFetch(E, p, 0).rgb;
  int j = axe.x == 1 ? p.x : p.y;
  int n = axe.x == 1 ? taille.x : taille.y;
  int r = j % 8;
  int b = r >= 6 ? j - r + 8 : j - r;
  if ((r > 1 && r < 6) || b <= 0 || b >= n) { S = vec4(ici, 1.0); return; }
  ivec2 o = p - axe * j;
  vec3 p1 = texelFetch(E, o + axe * (b - 2), 0).rgb;
  vec3 p0 = texelFetch(E, o + axe * (b - 1), 0).rgb;
  vec3 q0 = texelFetch(E, o + axe * b, 0).rgb;
  vec3 q1 = texelFetch(E, o + axe * (b + 1 < n ? b + 1 : b), 0).rgb;
  float marche = luma(q0) - luma(p0);
  bool lisse = abs(luma(p1) - luma(p0)) < seuil * 0.5 && abs(luma(q1) - luma(q0)) < seuil * 0.5;
  if (abs(marche) >= seuil || !lisse) { S = vec4(ici, 1.0); return; }
  vec3 d = q0 - p0;
  float k = j == b - 2 ? 0.125 : j == b - 1 ? 0.375 : j == b ? -0.375 : -0.125;
  S = vec4(ici + k * d, 1.0);
}`;

/** Agrandissement ×2 bicubique Catmull-Rom (16 lectures, bords collés). */
export const SHADER_BICUBIQUE = `${ENTETE}
uniform highp sampler2D E;
float cr(float t) {
  float x = abs(t);
  if (x < 1.0) return 1.5 * x * x * x - 2.5 * x * x + 1.0;
  if (x < 2.0) return -0.5 * x * x * x + 2.5 * x * x - 4.0 * x + 2.0;
  return 0.0;
}
void main() {
  ivec2 m = textureSize(E, 0) - 1;
  vec2 f = gl_FragCoord.xy / 2.0 - 0.5;
  ivec2 o = ivec2(floor(f));
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 2; j++) {
    float wy = cr(f.y - float(o.y + j));
    for (int i = -1; i <= 2; i++) {
      acc += wy * cr(f.x - float(o.x + i)) * texelFetch(E, clamp(o + ivec2(i, j), ivec2(0), m), 0).rgb;
    }
  }
  S = vec4(clamp(acc, 0.0, 1.0), 1.0);
}`;
