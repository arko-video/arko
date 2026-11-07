// Tests de la hauteur de la voix (dev-moments) : sons FABRIQUÉS seulement (aucun fichier, aucun modèle).
import { describe, expect, it } from 'vitest';
import { hasard } from '../../ia/synthese-test';
import { AccumulateurHauteur, f0Mediane, hauteurDuSon, REGLAGES_HAUTEUR } from './hauteur';

const F = REGLAGES_HAUTEUR.frequence;

/** Voix voisée simple : 4 harmoniques d'une fondamentale f0 (Hz), amplitude a. */
function voyelle(f0: number, duree: number, a = 0.1): Float32Array {
  const x = new Float32Array(Math.round(duree * F));
  for (let i = 0; i < x.length; i++) {
    const t = i / F;
    x[i] = a * (Math.sin(2 * Math.PI * f0 * t) + 0.6 * Math.sin(4 * Math.PI * f0 * t) + 0.4 * Math.sin(6 * Math.PI * f0 * t) + 0.25 * Math.sin(8 * Math.PI * f0 * t));
  }
  return x;
}

function bruit(duree: number, a = 0.1, graine = 3): Float32Array {
  const r = hasard(graine);
  return Float32Array.from({ length: Math.round(duree * F) }, () => a * (2 * r() - 1));
}

const voisees = (f0: Float32Array) => Array.from(f0).filter((x) => x > 0);

describe('AccumulateurHauteur', () => {
  it.each([90, 150, 260, 420])('retrouve une fondamentale de %d Hz à 2 % près', (f) => {
    const h = hauteurDuSon(voyelle(f, 1));
    expect(h.pas).toBe(0.02);
    const v = voisees(h.f0);
    expect(v.length).toBeGreaterThan(40);
    expect(Math.abs(f0Mediane(h, 0, 1) - f) / f).toBeLessThan(0.02);
  });

  it('ne trouve pas de hauteur dans du bruit', () => {
    const h = hauteurDuSon(bruit(1));
    expect(voisees(h.f0).length).toBeLessThan(5);
  });

  it('ne calcule que là où la VAD entend de la voix (p ≥ 0,5)', () => {
    const p = new Uint8Array(Math.ceil(2 / 0.032));
    for (let k = 0; k < p.length; k++) p[k] = k * 0.032 >= 1 ? 230 : 40;
    const h = hauteurDuSon(voyelle(150, 2), 0, { pas: 0.032, p });
    const avant = voisees(h.f0.subarray(0, 48));
    const apres = voisees(h.f0.subarray(52, 100));
    expect(avant.length).toBe(0);
    expect(apres.length).toBeGreaterThan(40);
  });

  it('donne le même résultat en un morceau ou en petits morceaux (jamais tout le son gardé)', () => {
    const x = voyelle(180, 3);
    const entier = hauteurDuSon(x);
    const acc = new AccumulateurHauteur(3);
    const taille = 1234;
    for (let i = 0; i < x.length; i += taille) acc.ajouter(x.subarray(i, Math.min(x.length, i + taille)), i / F);
    const morceaux = acc.resultat();
    expect(Array.from(morceaux.f0)).toEqual(Array.from(entier.f0));
  });

  it('repart proprement après un trou (silence sauté) et place les valeurs au bon temps', () => {
    const acc = new AccumulateurHauteur(10);
    acc.ajouter(voyelle(150, 1), 0);
    acc.ajouter(voyelle(220, 1), 5); // trou de 4 s
    const h = acc.resultat();
    expect(f0Mediane(h, 0, 1)).toBeGreaterThan(145);
    expect(f0Mediane(h, 0, 1)).toBeLessThan(155);
    expect(voisees(h.f0.subarray(Math.round(1.1 / 0.02), Math.round(4.9 / 0.02))).length).toBe(0);
    expect(Math.abs(f0Mediane(h, 5, 6) - 220)).toBeLessThan(5);
  });
});
