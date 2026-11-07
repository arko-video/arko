// Tests des 6 styles « Persos » (7/11/2026) : 6 styles × 48 variantes dessinées (non vides, toutes différentes),
// même entrée → mêmes traits, proportions mesurées sur le dessin (hauteur de la tête / hauteur totale), poses du
// corps selon l'émotion, retourné, style inconnu, tous les traits du catalogue.
import { describe, expect, it } from 'vitest';
import { FauxContexte, type Trace } from '../../moteur/couches/faux-contexte';
import { normaliserChibi } from '../../recette/normaliser-chibis';
import { Journal } from '../../recette/normaliser-outils';
import type { DefinitionChibi } from '../../recette/types';
import { cleChibi } from '../cache';
import { ACCESSOIRES, COIFFURES, STYLE_DEFAUT, STYLES_ATELIER, STYLES_CHIBI, STYLES_PERSO, TENUES, YEUX, type StylePerso } from '../catalogue';
import { dessinerChibi, type PoseChibi } from '../dessin';
import { chibiAuHasard } from '../hasard';
import { variantes } from '../variantes';
import { FICHES, partTete } from './fiches';
import { GOOFY } from './papier';
import { vif } from './pixel';
import { teinte } from './rendus-persos';
import { squelette } from './squelette';

const DEF: DefinitionChibi = { style: 'bd', graine: 42, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'sweat', accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'ronds' };

function dessiner(def: DefinitionChibi, pose: PoseChibi, cadre = { x: 200, y: 400, h: 300 }) {
  const f = new FauxContexte();
  dessinerChibi(f.ctx, def, pose, cadre);
  return f;
}
const empreinte = (f: FauxContexte) => JSON.stringify(f.traces);
const aire = (t: Trace) => (t.boite!.x1 - t.boite!.x0) * (t.boite!.y1 - t.boite!.y0);

describe('6 styles « Persos »', () => {
  it('catalogue : 6 styles ajoutés à la fin, en tête de l\'atelier ; style par défaut = un des 6', () => {
    expect(STYLES_CHIBI.slice(3)).toEqual([...STYLES_PERSO]);
    expect(STYLES_ATELIER).toEqual(['papier', 'feutre', 'crayon', 'paint']);
    expect(STYLE_DEFAUT).toBe('papier');
    expect(STYLES_PERSO).toContain(STYLE_DEFAUT);
    expect(chibiAuHasard(5).style).toBe(STYLE_DEFAUT);
  });

  it('6 styles × 48 variantes : dessinées sans erreur, non vides, toutes différentes', () => {
    const v = variantes();
    expect(v).toHaveLength(48);
    for (const style of STYLES_PERSO) {
      const vues = new Set<string>();
      for (const p of v) {
        const f = dessiner({ ...DEF, style }, p);
        const remplis = f.traces.filter((t) => t.op === 'fill');
        // Pixel : un remplissage par couleur ; les autres : une forme par remplissage.
        expect(remplis.length, `${style} ${p.emo}`).toBeGreaterThan(8);
        if (style !== 'pixel') expect(f.traces.length, `${style} ${p.emo}`).toBeGreaterThan(30);
        vues.add(empreinte(f));
      }
      expect(vues.size, style).toBe(48);
    }
  });

  it('même définition et même pose → exactement les mêmes traits ; une autre graine → un autre dessin', () => {
    for (const style of STYLES_PERSO) {
      const a = dessiner({ ...DEF, style }, { emo: 'pleure', bouche: true, t: 0.5 });
      expect(empreinte(dessiner({ ...DEF, style }, { emo: 'pleure', bouche: true, t: 0.5 }))).toBe(empreinte(a));
      if (style !== 'pixel' && style !== 'cartoon' && style !== 'mascotte' && style !== 'bd') {
        // Styles au trait irrégulier (raté, papier) : la graine change le dessin.
        expect(empreinte(dessiner({ ...DEF, style, graine: 43 }, { emo: 'pleure', bouche: true, t: 0.5 }))).not.toBe(empreinte(a));
      }
    }
  });

  it('proportions mesurées : hauteur de la tête / hauteur totale selon le style', () => {
    const attendu: Record<StylePerso, [number, number]> = {
      bd: [0.19, 0.26], cartoon: [0.29, 0.37], rate: [0.29, 0.4], mascotte: [0.75, 0.95], pixel: [0.27, 0.38], papier: [0.3, 0.42],
    };
    for (const style of STYLES_PERSO) {
      const def: DefinitionChibi = { ...DEF, style, coiffure: 'rase', accessoire: 'aucun', tenue: 'armure' };
      const f = dessiner(def, { emo: 'parle', bouche: false }, { x: 500, y: 1000, h: 400 });
      const remplis = f.traces.filter((t) => t.op === 'fill' && t.boite);
      const haut = Math.min(...remplis.map((t) => t.boite!.y0));
      const peau = (style === 'pixel' ? vif(def.peau) : teinte(style, def.peau)).toLowerCase();
      const tete = remplis.filter((t) => t.fillStyle.toLowerCase() === peau).sort((a, b) => aire(b) - aire(a))[0]!;
      const part = (tete.boite!.y1 - tete.boite!.y0) / (1000 - haut);
      expect(part, style).toBeGreaterThan(attendu[style][0]);
      expect(part, style).toBeLessThan(attendu[style][1]);
      // La fiche dit la même chose (sans les cheveux ni le cou).
      expect(partTete(style), style).toBeGreaterThan(attendu[style][0] - 0.02);
    }
    // Pas de chibi : en BD la tête fait 1/4 à 1/5 de la hauteur, en dessin animé et en pixel environ 1/3.
    expect(partTete('bd')).toBeGreaterThanOrEqual(0.2);
    expect(partTete('bd')).toBeLessThanOrEqual(0.25);
    expect(Math.abs(partTete('cartoon') - 1 / 3)).toBeLessThan(0.03);
    expect(Math.abs(partTete('pixel') - 1 / 3)).toBeLessThan(0.04);
  });

  it('papier découpé en buste : bord du bas au pied du cadre, pas de jambes, tête ≈ 1/3 du buste', () => {
    const def: DefinitionChibi = { ...DEF, style: 'papier', coiffure: 'rase', accessoire: 'aucun', tenue: 'armure' };
    const f = dessiner(def, { emo: 'parle', bouche: false }, { x: 500, y: 1000, h: 400 });
    const remplis = f.traces.filter((t) => t.op === 'fill' && t.boite);
    const bas = Math.max(...remplis.map((t) => t.boite!.y1));
    expect(bas).toBeGreaterThan(995);
    expect(bas).toBeLessThan(1000 + 400 * 0.04); // le bord déchiré et son ombre dépassent à peine (DEBORD_BUSTE.bas)
    // Aucune chaussure (couleur des chaussures de l'armure) : pas de pieds.
    expect(remplis.some((t) => t.fillStyle.toLowerCase() === teinte('papier', '#59616B').toLowerCase())).toBe(false);
    expect(partTete('papier')).toBeGreaterThan(0.3);
    expect(partTete('papier')).toBeLessThan(0.4);
  });

  it('le corps change selon l\'émotion : bras en l\'air (victoire, rage), mains sur la tête (panique), bras ballants (triste)', () => {
    for (const style of STYLES_PERSO) {
      const f = FICHES[style];
      const haut = (emo: Parameters<typeof squelette>[1]) => Math.max(...squelette(f, emo).bras.map((b) => -b.c[1]));
      if (style !== 'mascotte') {
        for (const e of ['victoire', 'rage'] as const) expect(haut(e), `${style} ${e}`).toBeGreaterThan(-f.epaule.y);
        expect(haut('panique'), style).toBeGreaterThan(-f.tete.cy - f.tete.ry);
        if (!f.buste) expect(haut('triste'), style).toBeLessThan(-f.torse.bas + 6);
        else expect(haut('triste'), style).toBeLessThan(-f.epaule.y - 25);
        expect(squelette(f, 'panique').bras.every((b) => b.devant)).toBe(true);
      } else {
        expect(haut('victoire')).toBeGreaterThan(haut('triste') + 3);
      }
      expect(squelette(f, 'victoire').saut).toBeGreaterThan(0);
      expect(squelette(f, 'defaite').tete).toBeGreaterThan(15);
    }
  });

  it('retourné (avatar à droite) : le reflet du dessin', () => {
    for (const style of STYLES_PERSO) {
      const a = dessiner({ ...DEF, style }, { emo: 'pointe' as never, bouche: false });
      const b = dessiner({ ...DEF, style }, { emo: 'moqueur', bouche: false, retourne: true });
      const c = dessiner({ ...DEF, style }, { emo: 'moqueur', bouche: false });
      expect(a.traces.length).toBeGreaterThan(0); // émotion inconnue : dessiné comme « parle »
      const boite = (f: FauxContexte) => f.traces.filter((t) => t.boite).map((t) => t.boite!);
      const xs = (f: FauxContexte) => [Math.min(...boite(f).map((x) => x.x0)), Math.max(...boite(f).map((x) => x.x1))];
      const [b0, b1] = xs(b);
      const [c0, c1] = xs(c);
      // Pixel : à une case près ; papier : l'ombre portée reste en bas à droite (la lumière ne se retourne pas).
      const tol = style === 'pixel' ? (300 / 56) * 1.5 : style === 'papier' ? 3 : 1;
      expect(Math.abs(b0 - (400 - c1)), style).toBeLessThan(tol);
      expect(Math.abs(b1 - (400 - c0)), style).toBeLessThan(tol);
    }
  });

  it('tous les traits du catalogue se dessinent dans les 6 styles', () => {
    for (const style of STYLES_PERSO) {
      for (const coiffure of COIFFURES) for (const tenue of TENUES) expect(dessiner({ ...DEF, style, coiffure, tenue }, { emo: 'rit', bouche: true }).traces.length).toBeGreaterThan(8);
      for (const accessoire of ACCESSOIRES) for (const yeux of YEUX) expect(dessiner({ ...DEF, style, accessoire, yeux }, { emo: 'choque', bouche: false }).traces.length).toBeGreaterThan(8);
    }
  });

  it('normaliseur : les 6 styles sont acceptés ; un style inconnu retombe sur le feutre (et se dessine)', () => {
    for (const style of STYLES_PERSO) {
      const j = new Journal();
      expect(normaliserChibi({ ...DEF, style }, 'chibi', j)!.style).toBe(style);
      expect(j.problemes).toHaveLength(0);
    }
    const j = new Journal();
    expect(normaliserChibi({ ...DEF, style: 'aquarelle' }, 'chibi', j)!.style).toBe('feutre');
    expect(j.problemes).toHaveLength(1);
    expect(dessiner({ ...DEF, style: 'aquarelle' as never }, { emo: 'parle', bouche: false }).traces.length).toBeGreaterThan(30);
  });

  it('cache : le style fait partie de la clé', () => {
    const p: PoseChibi = { emo: 'parle', bouche: false };
    expect(new Set(STYLES_CHIBI.map((style) => cleChibi({ ...DEF, style }, p, 300))).size).toBe(9);
  });

  it('papier goofy : un œil à peine plus petit que l\'autre (10 à 15 %), à peine de travers (7/11)', () => {
    expect(GOOFY.gros / GOOFY.petit).toBeGreaterThanOrEqual(1.1);
    expect(GOOFY.gros / GOOFY.petit).toBeLessThanOrEqual(1.15);
    expect(GOOFY.travers).toBeLessThanOrEqual(5);
    expect(GOOFY.decale).toBeLessThanOrEqual(0.6);
  });
});
