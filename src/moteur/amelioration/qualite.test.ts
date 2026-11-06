// Améliorer l'image — qualité MESURÉE sur des images abîmées exprès (moitié de la taille + compression 4:2:0 en blocs
// 8 × 8, comme une capture OBS 720p à petit débit), comparées à l'image d'origine en taille ×2 (« ce qu'aurait donné
// un enregistrement en 1440p »). Référence : le simple agrandissement bilinéaire (ce que fait le navigateur).
// Calcul sur le processeur : c'est le même que celui de la carte graphique (vérifié dans Chrome, e2e : > 55 dB d'écart).

import { describe, expect, it } from 'vitest';
import { compresser, imageDessin, imageInterface, imageJeu, nettete, psnr, reduireMoitie } from './banc-essai';
import { executerPlanCpu, quantifier } from './plan-cpu';
import { RESTORE_CNN_S } from './poids-restore-cnn-s';
import { UPSCALE_CNN_X2_S } from './poids-upscale-cnn-x2-s';
import { choisirPlan, type ModeMoteur, type NiveauImage } from './reglages';
import { agrandirBilineaire, appliquerReseau, borner, type ImageF } from './reseau';

const abimer = (img: ImageF, q: number) => quantifier(compresser(reduireMoitie(img), q));
const ameliorer = (p: ImageF, niveau: NiveauImage, mode: ModeMoteur = 'ia') =>
  executerPlanCpu(p, choisirPlan({ niveau, nettoyer: true, agrandir: true }, mode, p.l, p.h, 2)!);

describe('Anime4K porté dans Arko', () => {
  it('les poids sont complets (4 couches par réseau, 1 008 poids)', () => {
    for (const r of [RESTORE_CNN_S, UPSCALE_CNN_X2_S]) {
      expect(r.couches).toHaveLength(4);
      expect(r.couches.reduce((s, c) => s + c.poids.length, 0)).toBe(1008);
      expect(r.couches.every((c) => c.biais.length === 4 && c.poids.every(Number.isFinite))).toBe(true);
    }
  });

  it('Upscale ×2 : sur un dessin à traits nets, bien mieux que le bilinéaire (preuve que le portage calcule juste)', () => {
    const orig = imageDessin();
    const petit = quantifier(reduireMoitie(orig));
    const bil = psnr(agrandirBilineaire(petit), orig);
    const ia = psnr(borner(appliquerReseau(petit, UPSCALE_CNN_X2_S)), orig);
    expect(ia).toBeGreaterThan(bil + 4); // mesuré : 33,9 dB contre 27,8 dB
  });
});

describe('Qualité sur une capture de jeu abîmée', () => {
  const jeu = imageJeu(512, 288);
  const hud = imageInterface(512, 288, 3);

  for (const q of [8, 14]) {
    it(`interface du jeu (texte, cases, cœurs), compression ${q} : plus fidèle que le bilinéaire`, () => {
      const p = abimer(hud, q);
      const bil = psnr(agrandirBilineaire(p), hud);
      // Mesuré (q 8 / 14) : bilinéaire 24,6 / 24,0 dB ; Léger 25,7 / 24,8 ; Fort 25,5 / 24,6 ; sans IA 25,0 / 24,2.
      expect(psnr(ameliorer(p, 'leger'), hud)).toBeGreaterThan(bil + 0.5);
      expect(psnr(ameliorer(p, 'fort'), hud)).toBeGreaterThan(bil + 0.4);
      expect(psnr(ameliorer(p, 'fort', 'classique'), hud)).toBeGreaterThan(bil);
    });

    it(`blocs du jeu (textures fines), compression ${q} : bien plus net, aussi fidèle que le bilinéaire`, () => {
      const p = abimer(jeu, q);
      const bil = agrandirBilineaire(p);
      for (const [niveau, mode] of [['leger', 'ia'], ['fort', 'ia'], ['fort', 'classique']] as const) {
        const a = ameliorer(p, niveau, mode);
        // Les détails fins écrasés par la compression ne reviennent pas (aucune méthode ne les invente) :
        // l'IA rend l'image nette sans perdre en fidélité (± 0,5 dB), elle ne fait pas de miracle sur les textures.
        expect(psnr(a, jeu)).toBeGreaterThan(psnr(bil, jeu) - 0.5);
        expect(nettete(a)).toBeGreaterThan(nettete(bil) * (mode === 'ia' ? 3 : 2));
      }
    });
  }

  it('Fort nettoie plus que Léger (image plus lisse avant agrandissement), mais reste net', () => {
    const p = abimer(jeu, 14);
    const leger = ameliorer(p, 'leger');
    const fort = ameliorer(p, 'fort');
    expect(nettete(fort)).toBeLessThan(nettete(leger));
    expect(nettete(fort)).toBeGreaterThan(nettete(agrandirBilineaire(p)) * 3);
  });
});
