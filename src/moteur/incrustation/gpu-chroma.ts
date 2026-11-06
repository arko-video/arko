// Fond vert — le moteur WebGL2 du détourage (un par fil d'exécution : la page pour l'aperçu, le Worker pour l'export).
// Il reçoit une image (canevas de travail), la détoure avec SHADER_CHROMA et laisse le résultat (prémultiplié, avec
// transparence) dans son canevas, que incruster.ts recopie. null si WebGL2 manque : le processeur prend le relais.

import { canalCle, ressemblanceCle, type ReglagesChroma } from './chroma';
import { SHADER_CHROMA, SOMMETS_CHROMA } from './shader-chroma';

type Gl = WebGL2RenderingContext;
export type CanevasGl = OffscreenCanvas | HTMLCanvasElement;

function creerCanevasGl(): CanevasGl | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(16, 16);
  if (typeof document !== 'undefined') return document.createElement('canvas');
  return null;
}

export class MoteurChroma {
  readonly canevas: CanevasGl;
  perdu = false;
  private readonly gl: Gl;
  private readonly prog: WebGLProgram;
  private readonly tex: WebGLTexture;
  private readonly u: Record<'E' | 'canal' | 'cle' | 'bas' | 'haut' | 'debordement', WebGLUniformLocation | null>;
  private l = 0;
  private h = 0;

  /** null si l'appareil n'a pas WebGL2, ou si le shader est refusé. */
  static creer(): MoteurChroma | null {
    try {
      const c = creerCanevasGl();
      const gl = c?.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      }) as Gl | null;
      return c && gl ? new MoteurChroma(c, gl) : null;
    } catch (e) {
      console.warn('[Arko] Fond vert : WebGL2 indisponible, calcul sur le processeur.', e);
      return null;
    }
  }

  private constructor(canevas: CanevasGl, gl: Gl) {
    this.canevas = canevas;
    this.gl = gl;
    canevas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.perdu = true;
    });
    const compiler = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader fond vert : ${gl.getShaderInfoLog(s) ?? '?'}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compiler(gl.VERTEX_SHADER, SOMMETS_CHROMA));
    gl.attachShader(p, compiler(gl.FRAGMENT_SHADER, SHADER_CHROMA));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Programme fond vert : ${gl.getProgramInfoLog(p) ?? '?'}`);
    this.prog = p;
    const u = (nom: string) => gl.getUniformLocation(p, nom);
    this.u = { E: u('E'), canal: u('canal'), cle: u('cle'), bas: u('bas'), haut: u('haut'), debordement: u('debordement') };
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** Taille maximale d'une texture. */
  get tailleMax(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  /** Détoure `source` (l × h) : le résultat est dans `this.canevas` (l × h, prémultiplié). */
  detourer(source: TexImageSource, l: number, h: number, reg: ReglagesChroma) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (l !== this.l || h !== this.h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, l, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.l = l;
      this.h = h;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (this.canevas.width !== l) this.canevas.width = l;
    if (this.canevas.height !== h) this.canevas.height = h;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.u.E, 0);
    gl.uniform1i(this.u.canal, canalCle(reg.couleur));
    gl.uniform1f(this.u.cle, ressemblanceCle(reg.couleur));
    gl.uniform1f(this.u.bas, reg.tolerance);
    gl.uniform1f(this.u.haut, reg.tolerance + reg.douceur);
    gl.uniform1f(this.u.debordement, reg.debordement);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, l, h);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Lit le résultat (banc d'essai) : RVBA prémultiplié, ligne 0 = haut de l'image. */
  lirePixels(l: number, h: number): Uint8Array {
    const gl = this.gl;
    const brut = new Uint8Array(l * h * 4);
    gl.readPixels(0, 0, l, h, gl.RGBA, gl.UNSIGNED_BYTE, brut);
    const res = new Uint8Array(l * h * 4);
    for (let y = 0; y < h; y++) res.set(brut.subarray((h - 1 - y) * l * 4, (h - y) * l * 4), y * l * 4);
    return res;
  }

  /** Attend la fin du travail de la carte graphique (mesure du temps par image). */
  finir() {
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
}
