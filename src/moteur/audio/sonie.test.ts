// F. Volume final : BS.1770 (filtre K, portes), crête vraie, gain vers −14 LUFS, limiteur ≤ −1,5 dBTP.
import { describe, expect, it } from 'vitest';
import { filtreK, gainCompense, gainVersCible, LimiteurCreteVraie, MesureurSonie, versDb } from './sonie';

const F = 48000;

/** Sinus stéréo (même signal sur les 2 canaux, ou seulement à gauche). */
function sinus(freq: number, db: number, duree: number, o: { phase?: number; gaucheSeule?: boolean } = {}): Float32Array[] {
  const n = Math.round(duree * F);
  const a = Math.pow(10, db / 20);
  const g = new Float32Array(n);
  for (let k = 0; k < n; k++) g[k] = a * Math.sin((2 * Math.PI * freq * k) / F + (o.phase ?? 0));
  return [g, o.gaucheSeule ? new Float32Array(n) : g.slice()];
}

/** Mesure en blocs de 12 000 échantillons (comme l'export). */
function mesurer(canaux: Float32Array[], bloc = 12000) {
  const m = new MesureurSonie();
  for (let k = 0; k < canaux[0]!.length; k += bloc) m.ajouter(canaux.map((c) => c.slice(k, k + bloc)));
  return m.resultat();
}

function concat(...parts: Float32Array[][]): Float32Array[] {
  return [0, 1].map((c) => {
    const res = new Float32Array(parts.reduce((t, p) => t + p[c]!.length, 0));
    let i = 0;
    for (const p of parts) {
      res.set(p[c]!, i);
      i += p[c]!.length;
    }
    return res;
  });
}

describe('sonie BS.1770 (EBU Tech 3341)', () => {
  it('sinus 1 kHz à −23 dBFS stéréo → −23,0 LUFS ; −20 dBFS stéréo → −20,0 LUFS', () => {
    expect(mesurer(sinus(1000, -23, 20)).lufs).toBeCloseTo(-23, 1);
    expect(mesurer(sinus(1000, -20, 20)).lufs).toBeCloseTo(-20, 1);
  });

  it('sinus 1 kHz à −20 dBFS sur UN canal → −23,0 LUFS (±0,1)', () => {
    expect(Math.abs(mesurer(sinus(1000, -20, 20, { gaucheSeule: true })).lufs + 23.01)).toBeLessThan(0.1);
  });

  it('porte absolue : un long silence ne change rien', () => {
    const r = mesurer(concat(sinus(1000, -23, 10), sinus(1000, -200, 30), sinus(1000, -23, 10)));
    expect(Math.abs(r.lufs + 23)).toBeLessThan(0.1);
    expect(mesurer(sinus(1000, -200, 5)).lufs).toBe(-Infinity);
  });

  it('porte relative (−10 LU) : un passage 30 dB plus bas est ignoré (EBU 3341 cas 2)', () => {
    const r = mesurer(concat(sinus(1000, -36, 10), sinus(1000, -23, 60), sinus(1000, -36, 10)));
    expect(r.lufs).toBeCloseTo(-23, 1);
  });

  it('filtre K hors 48 kHz : mêmes coefficients recalculés', () => {
    const [a, b] = filtreK(48000);
    const [c, d] = filtreK(48000.0001);
    expect(c.b0).toBeCloseTo(a.b0, 4);
    expect(c.a1).toBeCloseTo(a.a1, 4);
    expect(d.a2).toBeCloseTo(b.a2, 5);
  });
});

describe('crête vraie', () => {
  it('un sinus à fs/4 décalé de 45° : crête échantillon −3 dB, crête vraie 0 dB', () => {
    const s = sinus(12000, -1, 1, { phase: Math.PI / 4 });
    const echantillon = versDb(Math.max(...s[0]!.map(Math.abs)));
    const r = mesurer(s);
    expect(echantillon).toBeCloseTo(-4.01, 1);
    expect(r.creteDbtp).toBeGreaterThan(echantillon + 2.5);
    expect(Math.abs(r.creteDbtp + 1)).toBeLessThan(0.2);
  });

  it('sinus proche de Nyquist (20 kHz) : crête vraie > crête échantillon', () => {
    const s = sinus(20000, -6, 1, { phase: 0.3 });
    const echantillon = versDb(Math.max(...s[0]!.map(Math.abs)));
    const r = mesurer(s);
    expect(r.creteDbtp).toBeGreaterThan(echantillon);
    expect(Math.abs(r.creteDbtp + 6)).toBeLessThan(0.5);
  });
});

/** Musique fabriquée : accords + batterie (crêtes fortes), −30 LUFS environ. */
function musique(duree: number, niveau = 0.05): Float32Array[] {
  const n = Math.round(duree * F);
  const g = new Float32Array(n);
  let graine = 1;
  for (let k = 0; k < n; k++) {
    const t = k / F;
    const coup = (t % 0.5) < 0.05 ? Math.exp(-((t % 0.5) * 60)) * 6 : 0;
    graine = (graine * 16807) % 2147483647;
    g[k] = niveau * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 330 * t) + coup * (graine / 2147483647 - 0.5) * 2);
  }
  return [g, g.slice()];
}

describe('gain et limiteur', () => {
  it('gain vers la cible, borné ; silence → 0', () => {
    expect(gainVersCible({ lufs: -20, creteDbtp: -3 }, { lufs: -14, crete: -1.5 })).toBe(6);
    expect(gainVersCible({ lufs: -60, creteDbtp: -40 }, { lufs: -14, crete: -1.5 })).toBe(20);
    expect(gainVersCible({ lufs: -Infinity, creteDbtp: -Infinity }, { lufs: -14, crete: -1.5 })).toBe(0);
  });

  it('gain + limiteur : −14 LUFS ±0,5 et crête vraie ≤ −1,5 dBTP, durée gardée (retard compensé)', () => {
    const son = musique(20);
    const cible = { lufs: -14, crete: -1.5 };
    const essai = gainVersCible(mesurer(son), cible);
    expect(essai).toBeGreaterThan(5);
    // Passe 1 : on essaie le limiteur à ce gain et on mesure ce qu'il fait perdre ; passe 2 : gain corrigé.
    const gain = gainCompense(essai, mesurer(limiter(son, essai)).lufs, cible);
    const fini = limiter(son, gain);
    expect(fini[0]!.length).toBe(son[0]!.length);
    // Pas de décalage : le son limité suit l'original (même signe au même instant).
    const k0 = 3 * F + 1234;
    expect(fini[0]![k0]! / son[0]![k0]!).toBeGreaterThan(0);
    const apres = mesurer(fini);
    expect(apres.creteDbtp).toBeLessThanOrEqual(-1.5);
    expect(Math.abs(apres.lufs + 14)).toBeLessThan(0.5);
  });

  it('un son déjà sous le plafond passe tel quel (au gain près)', () => {
    const son = sinus(1000, -20, 2);
    const fini = limiter(son, 6);
    expect(Math.abs(mesurer(fini).lufs - (mesurer(son).lufs + 6))).toBeLessThan(0.05);
    expect(Math.abs(fini[0]![48000]! - son[0]![48000]! * Math.pow(10, 6 / 20))).toBeLessThan(1e-4);
  });
});

/** Passe le son dans le limiteur, bloc par bloc, en compensant son retard (comme l'export). */
function limiter(son: Float32Array[], gain: number): Float32Array[] {
  {
    const lim = new LimiteurCreteVraie(gain, -1.5);
    const sortie: Float32Array[][] = [];
    let aJeter = lim.latence;
    const pousser = (b: Float32Array[]) => {
      lim.traiter(b);
      const j = Math.min(aJeter, b[0]!.length);
      aJeter -= j;
      sortie.push(b.map((c) => c.slice(j)));
    };
    for (let k = 0; k < son[0]!.length; k += 12000) pousser(son.map((c) => c.slice(k, k + 12000)));
    pousser([new Float32Array(lim.latence), new Float32Array(lim.latence)]);
    return concat(...sortie);
  }
}
