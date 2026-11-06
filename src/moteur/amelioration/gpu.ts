// Améliorer l'image — le moteur WebGL2 (carte graphique). Un seul par fil d'exécution (la page, le Worker d'export),
// créé à la première image à améliorer. Il reçoit l'image source entière, la fait passer dans les réseaux d'Anime4K
// (ou le repli sans IA) et dessine le résultat dans son canevas, que le compositeur recopie avec drawImage.

import { RESTORE_CNN_S } from './poids-restore-cnn-s';
import { UPSCALE_CNN_X2_S } from './poids-upscale-cnn-x2-s';
import type { ModeMoteur, PlanTraitement } from './reglages';
import type { Reseau } from './reseau';
import { SHADER_PIXELS_2X2, SHADER_RESIDU, SHADER_SORTIE, SOMMETS, shaderCouche } from './shaders';
import { SHADER_BICUBIQUE, SHADER_DEBLOCAGE } from './shaders-classiques';

type Gl = WebGL2RenderingContext;
type CanevasGl = OffscreenCanvas | HTMLCanvasElement;
interface Texture { t: WebGLTexture; l: number; h: number }
interface Programme { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

/** Seuil du déblocage sans IA (marche de luminance au-delà de laquelle c'est un vrai contour). */
const SEUIL_DEBLOCAGE = 0.07;

function creerCanevasGl(): CanevasGl | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(16, 16);
  if (typeof document !== 'undefined') return document.createElement('canvas');
  return null;
}

export class MoteurGpu {
  readonly mode: Exclude<ModeMoteur, 'aucun'>;
  readonly canevas: CanevasGl;
  perdu = false;
  private readonly gl: Gl;
  private readonly fbo: WebGLFramebuffer;
  private readonly programmes = new Map<string, Programme>();
  private readonly textures = new Map<string, Texture>();

  /** null si l'appareil n'a pas WebGL2 (ou s'il refuse de le créer). */
  static creer(): MoteurGpu | null {
    try {
      const c = creerCanevasGl();
      const gl = c?.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }) as Gl | null;
      return c && gl ? new MoteurGpu(c, gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(canevas: CanevasGl, gl: Gl) {
    this.canevas = canevas;
    this.gl = gl;
    this.fbo = gl.createFramebuffer()!;
    canevas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.perdu = true;
    });
    const flottant = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.mode = flottant && this.essaiFlottant() ? 'ia' : 'classique';
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** Vérifie qu'on peut vraiment dessiner dans une texture RGBA16F (certains pilotes l'annoncent sans le faire). */
  private essaiFlottant(): boolean {
    const gl = this.gl;
    const t = this.texture('essai', 4, 4, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok;
  }

  /** Taille maximale d'une texture (pour ne pas dépasser en ×2). */
  get tailleMax(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  private texture(nom: string, l: number, h: number, flottant: boolean): Texture {
    const gl = this.gl;
    const ancienne = this.textures.get(nom);
    if (ancienne && ancienne.l === l && ancienne.h === h) return ancienne;
    if (ancienne) gl.deleteTexture(ancienne.t);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const filtre = flottant ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (flottant) gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, l, h);
    else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, l, h);
    const tex = { t, l, h };
    this.textures.set(nom, tex);
    return tex;
  }

  private programme(cle: string, source: () => string): Programme {
    const deja = this.programmes.get(cle);
    if (deja) return deja;
    const gl = this.gl;
    const compiler = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader ${cle} : ${gl.getShaderInfoLog(s) ?? '?'}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compiler(gl.VERTEX_SHADER, SOMMETS));
    gl.attachShader(p, compiler(gl.FRAGMENT_SHADER, source()));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Programme ${cle} : ${gl.getProgramInfoLog(p) ?? '?'}`);
    const prog = { p, u: new Map<string, WebGLUniformLocation | null>() };
    this.programmes.set(cle, prog);
    return prog;
  }

  /** Une passe : dessine tout `cible` (null = le canevas) avec le programme, ses textures et ses nombres. */
  private passe(prog: Programme, cible: Texture | null, l: number, h: number, entrees: Record<string, Texture>, nombres: Record<string, number | [number, number]> = {}) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    const u = (nom: string) => {
      if (!prog.u.has(nom)) prog.u.set(nom, gl.getUniformLocation(prog.p, nom));
      return prog.u.get(nom)!;
    };
    Object.entries(entrees).forEach(([nom, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.uniform1i(u(nom), i);
    });
    for (const [nom, v] of Object.entries(nombres)) {
      if (Array.isArray(v)) gl.uniform2i(u(nom), v[0], v[1]);
      else gl.uniform1f(u(nom), v);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, cible ? this.fbo : null);
    if (cible) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cible.t, 0);
    gl.viewport(0, 0, l, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Fait passer l'image dans les couches d'un réseau ; renvoie la texture (à virgule) de la dernière couche. */
  private couches(nom: string, r: Reseau, entree: Texture): Texture {
    let cur = entree;
    r.couches.forEach((c, i) => {
      const sortie = this.texture(i % 2 === 0 ? 'a' : 'b', entree.l, entree.h, true);
      this.passe(this.programme(`${nom}${i}`, () => shaderCouche(c)), sortie, sortie.l, sortie.h, { E: cur });
      cur = sortie;
    });
    return cur;
  }

  /**
   * Améliore `source` (l × h) selon `plan` et dessine le résultat dans `this.canevas` (l × h, ou 2l × 2h).
   * `attendre` : attend la fin du travail de la carte graphique (pour mesurer le temps par image).
   */
  traiter(source: TexImageSource, l: number, h: number, plan: PlanTraitement, attendre = false): { l: number; h: number } {
    const gl = this.gl;
    const entree = this.texture('entree', l, h, false);
    gl.bindTexture(gl.TEXTURE_2D, entree.t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    let cur = entree;
    const ia = plan.mode === 'ia' && this.mode === 'ia';
    if (plan.deblocage) {
      const deb = this.programme('deblocage', () => SHADER_DEBLOCAGE);
      const d1 = this.texture('deblocage1', l, h, false);
      const d2 = this.texture('deblocage2', l, h, false);
      this.passe(deb, d1, l, h, { E: cur }, { axe: [1, 0], seuil: SEUIL_DEBLOCAGE });
      this.passe(deb, d2, l, h, { E: d1 }, { axe: [0, 1], seuil: SEUIL_DEBLOCAGE });
      cur = d2;
    }
    if (ia && plan.nettoyage > 0) {
      const r = this.couches('restore', RESTORE_CNN_S, cur);
      const net = this.texture('nettoyee', l, h, false);
      this.passe(this.programme('residu', () => SHADER_RESIDU), net, l, h, { M: cur, R: r }, { force: plan.nettoyage });
      cur = net;
    }
    if (plan.agrandissement) {
      const grande = this.texture('grande', 2 * l, 2 * h, false);
      if (ia && plan.agrandissement === 'ia') {
        const c = this.couches('upscale', UPSCALE_CNN_X2_S, cur);
        this.passe(this.programme('pixels', () => SHADER_PIXELS_2X2), grande, grande.l, grande.h, { M: cur, C: c }, { force: 1 });
      } else {
        this.passe(this.programme('bicubique', () => SHADER_BICUBIQUE), grande, grande.l, grande.h, { E: cur });
      }
      cur = grande;
    }
    if (this.canevas.width !== cur.l) this.canevas.width = cur.l;
    if (this.canevas.height !== cur.h) this.canevas.height = cur.h;
    this.passe(this.programme('sortie', () => SHADER_SORTIE), null, cur.l, cur.h, { E: cur }, { force: plan.contours });
    if (attendre) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return { l: cur.l, h: cur.h };
  }

  /** Lit le résultat (tests et banc d'essai) : pixels RVBA, ligne 0 = haut de l'image. */
  lirePixels(l: number, h: number): Uint8Array {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const brut = new Uint8Array(l * h * 4);
    gl.readPixels(0, 0, l, h, gl.RGBA, gl.UNSIGNED_BYTE, brut);
    const res = new Uint8Array(l * h * 4);
    for (let y = 0; y < h; y++) res.set(brut.subarray((h - 1 - y) * l * 4, (h - y) * l * 4), y * l * 4);
    return res;
  }
}
