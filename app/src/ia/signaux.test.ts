import { describe, expect, it } from 'vitest';
import { candidats, cadrer, evenements } from './candidats';
import { changementsDeScene, difference, enGris } from './images';
import { detecterRires, partDansBande } from './rires';
import { calmeAvant, detecterPics, enDecibels, Enveloppe, fondGlissant, lisser, PAS_ENVELOPPE } from './signaux';
import { CONNUS, signalSynthetique } from './synthese-test';

/** Sinus d'amplitude `a` à 44,1 kHz pendant `d` secondes. */
function sinus(a: number, d: number, f = 440, fe = 44100): Float32Array {
  return Float32Array.from({ length: Math.round(d * fe) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / fe));
}

describe('enveloppe', () => {
  it('mesure le volume (RMS) toutes les 20 ms, en 16 kHz', () => {
    const e = new Enveloppe(1);
    e.ajouter(sinus(0.5, 1), 44100, 0);
    const v = e.valeurs();
    expect(v.length).toBe(50);
    for (const x of v.slice(1, -1)) expect(x).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it('donne le même résultat en un morceau ou en petits morceaux', () => {
    const pcm = sinus(0.3, 2, 300);
    const un = new Enveloppe(2);
    un.ajouter(pcm, 44100, 0);
    const morceaux = new Enveloppe(2);
    for (let i = 0; i < pcm.length; i += 1024) morceaux.ajouter(pcm.subarray(i, i + 1024), 44100, i / 44100);
    const a = un.valeurs();
    const b = morceaux.valeurs();
    for (let k = 0; k < a.length; k++) expect(b[k]).toBeCloseTo(a[k]!, 3);
  });

  it('ne compte pas ce qui est hors de [tMin, tMax[ (reprise)', () => {
    const e = new Enveloppe(2);
    e.ajouter(sinus(0.5, 2), 44100, 0, 1, 2);
    const v = e.valeurs();
    expect(v[10]).toBe(0);
    expect(v[60]).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it('se restaure depuis un point de reprise', () => {
    const e = new Enveloppe(1);
    e.restaurer(Float32Array.from([0.1, 0.2]));
    expect(e.valeurs(2)[1]).toBeCloseTo(0.2, 5);
  });
});

describe('outils', () => {
  it('décibels et lissage', () => {
    expect(enDecibels(Float32Array.from([1, 0.1]))[1]).toBeCloseTo(-20, 3);
    expect(Array.from(lisser(Float32Array.from([0, 0, 3, 0, 0]), 3))).toEqual([0, 1, 1, 1, 0]);
  });

  it('cadre une plage entre 8 et 30 s, dans la vidéo', () => {
    expect(cadrer(10, 12, 100, 8, 30)).toEqual({ debut: 10, fin: 18 });
    expect(cadrer(-3, 10, 100, 8, 30)).toEqual({ debut: 0, fin: 13 });
    expect(cadrer(95, 99, 100, 8, 30)).toEqual({ debut: 92, fin: 100 });
    expect(cadrer(10, 60, 100, 8, 30)).toEqual({ debut: 10, fin: 40 });
  });
});

describe('détection sur un signal fabriqué', () => {
  const s = signalSynthetique();
  const pas = PAS_ENVELOPPE;
  const db = lisser(enDecibels(s.enveloppe), 5);
  const fond = fondGlissant(db, Math.round(30 / pas), Math.round(0.3 / pas));

  it('retrouve les pics (z-score glissant), et seulement eux', () => {
    const pics = detecterPics(db, fond, pas);
    const proche = (t: number) => pics.some((p) => Math.abs(p.t - t) < 0.5);
    for (const t of [CONNUS.calmePic, CONNUS.rire, CONNUS.cri, CONNUS.bruyant, CONNUS.picSansCalme]) expect(proche(t)).toBe(true);
    expect(pics.length).toBeLessThanOrEqual(8);
  });

  it('distingue « calme → pic » d\'un pic dans le bruit', () => {
    const pics = detecterPics(db, fond, pas);
    const a = pics.find((p) => Math.abs(p.t - CONNUS.calmePic) < 0.5)!;
    const b = pics.find((p) => Math.abs(p.t - CONNUS.picSansCalme) < 0.5)!;
    expect(calmeAvant(db, a, pas)).toBe(true);
    expect(calmeAvant(db, b, pas)).toBe(false);
  });

  it('trouve le cri et le rire, sans les confondre', () => {
    const ev = evenements(s);
    expect(ev.cris.length).toBe(1);
    expect(ev.cris[0]!.debut).toBeGreaterThan(CONNUS.cri - 0.3);
    expect(ev.cris[0]!.fin).toBeLessThan(CONNUS.cri + 1.8);
    expect(ev.rires.length).toBe(1);
    expect(ev.rires[0]!.t).toBeGreaterThan(CONNUS.rire);
    expect(ev.rires[0]!.t).toBeLessThan(CONNUS.rire + 2);
  });

  it('le spectre de l\'enveloppe d\'un rire est surtout entre 4 et 6 Hz', () => {
    const rire = Float32Array.from({ length: 64 }, (_, k) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 5 * k * pas));
    const lent = Float32Array.from({ length: 64 }, (_, k) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 1.5 * k * pas));
    expect(partDansBande(rire, 0, 64, pas)).toBeGreaterThan(0.7);
    expect(partDansBande(lent, 0, 64, pas)).toBeLessThan(0.2);
    expect(detecterRires(s.enveloppe, db, fond, pas).length).toBe(1);
  });

  it('fusionne en candidats notés, avec raison, plage et espacement', () => {
    const m = candidats(s);
    const vers = (t: number) => m.find((x) => Math.abs((x.pic ?? -99) - t) < 1);
    expect(vers(CONNUS.calmePic)?.etiquettes).toContain('silence>pic');
    expect(vers(CONNUS.calmePic)?.raison).toBe('Gros pic de son après un calme');
    expect(vers(CONNUS.rire)?.etiquettes).toContain('rire');
    expect(vers(CONNUS.cri)?.etiquettes).toEqual(expect.arrayContaining(['cri', 'scene']));
    expect(vers(CONNUS.picSansCalme)?.etiquettes).toContain('pic');
    expect(vers(CONNUS.picSansCalme)?.etiquettes).not.toContain('silence>pic');
    for (const x of m) {
      expect(x.fin - x.debut).toBeGreaterThanOrEqual(8);
      expect(x.fin - x.debut).toBeLessThanOrEqual(30);
      expect(x.debut).toBeLessThanOrEqual(x.pic!);
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(100);
    }
    const pics = m.map((x) => x.pic!).sort((a, b) => a - b);
    for (let i = 1; i < pics.length; i++) expect(pics[i]! - pics[i - 1]!).toBeGreaterThanOrEqual(20);
    // Le calme → pic et le cri (avec scène) passent devant le simple pic dans le bruit.
    expect(vers(CONNUS.calmePic)!.score).toBeGreaterThan(vers(CONNUS.picSansCalme)!.score);
    expect(m.map((x) => x.id)).toEqual(m.map((_, i) => `m${String(i + 1).padStart(2, '0')}`));
  });

  it('limite le nombre de candidats', () => {
    expect(candidats(s, { max: 2 }).length).toBe(2);
  });
});

describe('images', () => {
  it('gris, différence et changements de scène', () => {
    const noir = enGris(new Uint8ClampedArray(32 * 18 * 4));
    const blanc = enGris(new Uint8ClampedArray(32 * 18 * 4).fill(255));
    expect(difference(noir, blanc)).toBeCloseTo(1, 2);
    expect(difference(noir, noir)).toBe(0);
    const diffs = [0.05, 0.04, 0.06, 0.7, 0.05].map((d, i) => ({ t: i * 2, d }));
    expect(changementsDeScene(diffs).map((x) => x.t)).toEqual([6]);
  });
});
