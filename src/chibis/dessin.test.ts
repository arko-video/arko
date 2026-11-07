// Tests du dessin des chibis (dev 3) : reproductible, 3 styles × 48 variantes sans erreur, retourné à droite,
// expressions différentes, catalogue, hasard, cache, PNG / zip (écriture).
import { describe, expect, it } from 'vitest';
import { FauxContexte } from '../moteur/couches/faux-contexte';
import { normaliser } from '../recette/normaliser';
import { Journal } from '../recette/normaliser-outils';
import { normaliserChibi } from '../recette/normaliser-chibis';
import type { DefinitionChibi } from '../recette/types';
import { cleChibi } from './cache';
import { ACCESSOIRES, CHEVEUX, COIFFURES, COULEURS, EMOTIONS, PEAUX, TENUES, YEUX, type StyleChibi } from './catalogue';
import { dessinerChibi, type PoseChibi } from './dessin';
import { EXPRESSIONS, phaseSignes } from './expressions';
import { chibiAuHasard, chibiRessemblant } from './hasard';
import { cadrePng, nomFichier } from './png';
import { variantes } from './variantes';
import { crc32, ecrireZip } from './zip-ecriture';

const DEF: DefinitionChibi = { style: 'feutre', graine: 42, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'sweat', accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'ronds' };

function dessiner(def: DefinitionChibi, pose: PoseChibi, cadre = { x: 200, y: 400, h: 300 }) {
  const f = new FauxContexte();
  dessinerChibi(f.ctx, def, pose, cadre);
  return f;
}
const empreinte = (f: FauxContexte) => JSON.stringify(f.traces);
/** Les 3 styles d'origine (les 6 styles « Persos » ont leurs tests dans persos/persos.test.ts). */
const CLASSIQUES: StyleChibi[] = ['feutre', 'crayon', 'paint'];

describe('dessin des chibis', () => {
  it('même définition et même pose → exactement les mêmes traits (aucun hasard, aucune horloge)', () => {
    for (const style of CLASSIQUES) {
      const a = dessiner({ ...DEF, style }, { emo: 'rit', bouche: true, t: 0.5 });
      const b = dessiner({ ...DEF, style }, { emo: 'rit', bouche: true, t: 0.5 });
      expect(empreinte(a)).toBe(empreinte(b));
      expect(a.traces.length).toBeGreaterThan(40);
    }
  });

  it('3 styles × 48 variantes : dessinées sans erreur, chacune différente de sa voisine', () => {
    const v = variantes();
    expect(v).toHaveLength(48);
    for (const style of CLASSIQUES) {
      const vues = new Set<string>();
      for (const p of v) {
        const f = dessiner({ ...DEF, style }, p);
        expect(f.traces.filter((t) => t.op === 'fill').length).toBeGreaterThan(15);
        vues.add(empreinte(f));
      }
      expect(vues.size).toBe(48); // 24 émotions × bouche fermée / ouverte : toutes différentes
    }
  });

  it('chaque émotion a une bouche fermée différente de l\'ouverte', () => {
    for (const e of EMOTIONS) expect(EXPRESSIONS[e].bouche[0]).not.toBe(EXPRESSIONS[e].bouche[1]);
  });

  it('tous les traits du catalogue se dessinent (10 coiffures, 10 tenues, 10 accessoires, 4 yeux)', () => {
    for (const coiffure of COIFFURES) for (const tenue of TENUES) expect(dessiner({ ...DEF, coiffure, tenue }, { emo: 'parle', bouche: false }).traces.length).toBeGreaterThan(30);
    for (const accessoire of ACCESSOIRES) for (const yeux of YEUX) expect(dessiner({ ...DEF, accessoire, yeux }, { emo: 'choque', bouche: true }).traces.length).toBeGreaterThan(30);
  });

  it('grosse tête, petit corps : les pieds en bas du cadre, la tête dans le haut, largeur ≈ 0,8 × hauteur', () => {
    const f = dessiner({ ...DEF, accessoire: 'aucun', coiffure: 'rase' }, { emo: 'parle', bouche: false }, { x: 500, y: 1000, h: 100 });
    const boites = f.traces.filter((t) => t.boite).map((t) => t.boite!);
    const y0 = Math.min(...boites.map((b) => b.y0));
    const y1 = Math.max(...boites.map((b) => b.y1));
    const x0 = Math.min(...boites.map((b) => b.x0));
    const x1 = Math.max(...boites.map((b) => b.x1));
    expect(y1).toBeGreaterThan(997);
    expect(y1).toBeLessThan(1003);
    expect(y0).toBeGreaterThan(895);
    expect(x1 - x0).toBeGreaterThan(65);
    expect(x1 - x0).toBeLessThan(90);
  });

  it('retourné (avatar à droite) : le dessin est le reflet autour de x', () => {
    const a = dessiner(DEF, { emo: 'frime', bouche: false });
    const b = dessiner(DEF, { emo: 'frime', bouche: false, retourne: true });
    expect(a.traces.length).toBe(b.traces.length);
    const ta = a.traces.find((t) => t.op === 'fill' && t.boite!.x1 - t.boite!.x0 > 50)!;
    const tb = b.traces[a.traces.indexOf(ta)]!;
    expect(tb.boite!.x0).toBeCloseTo(400 - ta.boite!.x1, 3);
  });

  it('jamais d\'erreur : hauteur nulle ou position invalide → rien', () => {
    expect(dessiner(DEF, { emo: 'parle', bouche: false }, { x: 0, y: 0, h: 0 }).traces).toHaveLength(0);
    expect(dessiner(DEF, { emo: 'parle', bouche: false }, { x: NaN, y: 0, h: 10 }).traces).toHaveLength(0);
    expect(() => dessiner(DEF, { emo: 'inconnue' as never, bouche: false })).not.toThrow();
  });

  it('signes animés : 6 images par seconde, en boucle ; les émotions sans signe animé ne bougent pas', () => {
    expect(phaseSignes('dort', 0)).toBe(0);
    expect(phaseSignes('dort', 1 / 6 + 0.001)).toBeCloseTo(1 / 6);
    expect(phaseSignes('dort', 1.001)).toBe(0);
    expect(phaseSignes('parle', 0.5)).toBe(0);
    expect(empreinte(dessiner(DEF, { emo: 'dort', bouche: false, t: 0 }))).not.toBe(empreinte(dessiner(DEF, { emo: 'dort', bouche: false, t: 0.5 })));
    expect(empreinte(dessiner(DEF, { emo: 'parle', bouche: false, t: 0 }))).toBe(empreinte(dessiner(DEF, { emo: 'parle', bouche: false, t: 0.5 })));
  });
});

describe('hasard et catalogue', () => {
  it('chibiAuHasard : reproductible, dans le catalogue, accepté tel quel par le normaliseur', () => {
    for (let g = 0; g < 300; g++) {
      const c = chibiAuHasard(g * 7919, 'crayon');
      expect(chibiAuHasard(g * 7919, 'crayon')).toEqual(c);
      expect(c.style).toBe('crayon');
      expect(PEAUX).toContain(c.peau);
      expect(CHEVEUX).toContain(c.cheveux);
      expect(COULEURS).toContain(c.couleur);
      expect(COIFFURES).toContain(c.coiffure);
      expect(TENUES).toContain(c.tenue);
      expect(ACCESSOIRES).toContain(c.accessoire);
      const j = new Journal();
      expect(normaliserChibi(c, 'chibi', j)).toEqual(c);
      expect(j.problemes).toHaveLength(0);
    }
  });
  it('« Au hasard » varie vraiment (tenues, coiffures, accessoires)', () => {
    const tenues = new Set(Array.from({ length: 200 }, (_, g) => chibiAuHasard(g).tenue));
    const coiffures = new Set(Array.from({ length: 200 }, (_, g) => chibiAuHasard(g).coiffure));
    expect(tenues.size).toBe(TENUES.length);
    expect(coiffures.size).toBe(COIFFURES.length);
  });
  it('chibiRessemblant garde les traits choisis à la main', () => {
    const c = chibiRessemblant({ coiffure: 'afro', tenue: 'astronaute', couleur: '#123456' }, 5);
    expect(c).toMatchObject({ coiffure: 'afro', tenue: 'astronaute', couleur: '#123456', graine: 5 });
  });
  it('un montage garde la copie du chibi d\'une personne', () => {
    const sources = [{ id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const, l: 1920, h: 1080 }];
    const r = normaliser({ format: 'arko.recette/1', sources, plans: [{ de: 0, a: 20 }], personnes: [{ id: 'p1', nom: 'Moi', chibi: DEF }] }, { sources }).recette;
    expect(r.personnes?.[0]?.chibi).toEqual(DEF);
  });
});

describe('cache, PNG et .zip', () => {
  it('clé du cache : définition, émotion, bouche, hauteur arrondie, retourné, image des signes', () => {
    const p: PoseChibi = { emo: 'parle', bouche: false };
    expect(cleChibi(DEF, p, 300.2)).toBe(cleChibi(DEF, p, 299.8));
    expect(cleChibi(DEF, p, 300)).not.toBe(cleChibi(DEF, { ...p, bouche: true }, 300));
    expect(cleChibi(DEF, p, 300)).not.toBe(cleChibi({ ...DEF, couleur: '#000000' }, p, 300));
    expect(cleChibi(DEF, { ...p, t: 0.4 }, 300)).toBe(cleChibi(DEF, p, 300)); // « parle » ne bouge pas
    expect(cleChibi(DEF, { emo: 'dort', bouche: false, t: 0.4 }, 300)).not.toBe(cleChibi(DEF, { emo: 'dort', bouche: false }, 300));
  });
  it('PNG : largeur 0,8 × hauteur, le chibi et ce qui dépasse tiennent dedans', () => {
    const { l, ht, cadre } = cadrePng(512);
    expect(l).toBe(410);
    expect(ht).toBe(512);
    expect(cadre.y).toBeLessThan(512);
    expect(cadre.y - cadre.h * 1.42).toBeGreaterThan(0);
    expect(cadre.x - cadre.h * 0.55).toBeGreaterThanOrEqual(0);
    expect(nomFichier('Mon Pôte !')).toBe('mon-pote');
  });
  it('.zip stocké : CRC32 juste, signatures, noms', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = ecrireZip([{ nom: 'a.png', donnees: new Uint8Array([1, 2, 3]) }, { nom: 'é.png', donnees: new Uint8Array([4]) }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const fin = z.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    expect(new TextDecoder().decode(z.slice(30, 35))).toBe('a.png');
  });
});
