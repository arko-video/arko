// Tests de la musique fabriquée par Arko : déterminisme, boucle sans clic, niveau (sonie, crête), pas de NaN, tempo,
// aigus doux (rien d'agressif sous une voix), WAV relu par le moteur, temps de calcul.
// Extraits d'écoute (à part) : ARKO_ECOUTE_MUSIQUE=<dossier> npx vitest run src/sons/musique/generateur.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MesureurSonie } from '../../moteur/audio/sonie';
import { biquad, filtrerSurPlace } from './instruments';
import { AMBIANCES, composer, fabriquerMusique, MUSIQUE_ARKO, type Ambiance } from './generateur';
import { encoderWav } from './wav';

const enDb = (x: number) => 20 * Math.log10(Math.max(1e-12, x));
const rms = (x: Float32Array, de = 0, a = x.length) => {
  let s = 0;
  for (let i = de; i < a; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, a - de));
};

const cache = new Map<string, ReturnType<typeof fabriquerMusique>>();
const musique = (a: Ambiance, graine = 1) => {
  const cle = `${a}:${graine}`;
  if (!cache.has(cle)) cache.set(cle, fabriquerMusique(a, graine));
  return cache.get(cle)!;
};

describe('musique fabriquée par Arko', () => {
  it.each(AMBIANCES)('%s : tempo 95–125, 16 mesures exactes, stéréo, sans NaN', (a) => {
    const m = musique(a);
    expect(m.bpm).toBeGreaterThanOrEqual(95);
    expect(m.bpm).toBeLessThanOrEqual(125);
    expect(m.duree).toBeCloseTo((16 * 4 * 60) / m.bpm, 3);
    expect(m.canaux).toHaveLength(2);
    for (const c of m.canaux) {
      expect(c.length).toBe(Math.round(m.duree * m.frequence));
      expect(c.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it('déterministe : même graine → mêmes échantillons ; autre graine → autre morceau', () => {
    const a = fabriquerMusique('joyeux', 3);
    const b = fabriquerMusique('joyeux', 3);
    expect(a.canaux[0]).toEqual(b.canaux[0]);
    expect(a.canaux[1]).toEqual(b.canaux[1]);
    const c = musique('joyeux', 1);
    const n = Math.min(c.canaux[0].length, a.canaux[0].length);
    let diff = 0;
    for (let i = 0; i < n; i += 7) diff += Math.abs(a.canaux[0][i]! - c.canaux[0][i]!);
    expect(diff / (n / 7)).toBeGreaterThan(0.005);
  });

  it.each(AMBIANCES)('%s : sonie −17 LUFS ± 1, crête ≤ −1,5 dBFS, assez de dynamique (pas écrasé)', (a) => {
    const m = musique(a);
    const mes = new MesureurSonie(m.frequence);
    mes.ajouter(m.canaux);
    const { lufs } = mes.resultat();
    const crete = Math.max(...m.canaux.map((c) => c.reduce((x, v) => Math.max(x, Math.abs(v)), 0)));
    const facteurCrete = enDb(crete) - enDb(rms(m.canaux[0]));
    expect(lufs).toBeGreaterThan(MUSIQUE_ARKO.lufs - 1);
    expect(lufs).toBeLessThan(MUSIQUE_ARKO.lufs + 1);
    expect(crete).toBeLessThanOrEqual(MUSIQUE_ARKO.plafond + 1e-6);
    expect(facteurCrete).toBeGreaterThan(8);
  });

  it.each(AMBIANCES)('%s : boucle sans clic (le saut fin → début est comme un pas ordinaire)', (a) => {
    const m = musique(a);
    for (const c of m.canaux) {
      const n = c.length;
      const pas: number[] = [];
      for (let i = 1; i < n; i += 13) pas.push(Math.abs(c[i]! - c[i - 1]!));
      pas.sort((x, y) => x - y);
      const p999 = pas[Math.floor(pas.length * 0.999)]!;
      const saut = Math.abs(c[0]! - c[n - 1]!);
      expect(saut).toBeLessThanOrEqual(p999);
      // Et la dérivée seconde au raccord (un « coin » s'entendrait aussi).
      const coin = Math.abs(c[1]! - 2 * c[0]! + c[n - 1]!);
      expect(coin).toBeLessThanOrEqual(p999);
    }
  });

  it.each(AMBIANCES)('%s : aigus doux (au-dessus de 5 kHz : moins de 2 % de l\'énergie) et graves présents', (a) => {
    const m = musique(a);
    const x = Float32Array.from(m.canaux[0]);
    const aigus = Float32Array.from(x);
    filtrerSurPlace(aigus, biquad('passe-haut', 5000, 0.7, m.frequence));
    filtrerSurPlace(aigus, biquad('passe-haut', 5000, 0.7, m.frequence));
    const graves = Float32Array.from(x);
    filtrerSurPlace(graves, biquad('passe-bas', 250, 0.7, m.frequence));
    const e = (s: Float32Array) => rms(s) ** 2;
    expect(e(aigus) / e(x)).toBeLessThan(0.02);
    expect(e(graves) / e(x)).toBeGreaterThan(0.05);
  });

  it('pas trop chargé : la mélodie respire (6 notes par mesure au plus en moyenne, silence sur au moins 40 % des croches)', () => {
    for (const a of AMBIANCES) {
      const { notes } = composer(a, 1);
      const melodie = notes.filter((n) => n.voix === 'melodie');
      expect(melodie.length / 16, a).toBeLessThanOrEqual(6);
      const croches = new Set(melodie.map((n) => Math.floor(n.pas / 2)));
      expect(1 - croches.size / (16 * 8), a).toBeGreaterThanOrEqual(0.4);
      // Jamais plus de 5 notes jouées en même temps (hors percussions).
      const parPas = new Map<number, number>();
      for (const n of notes) if (['melodie', 'accords', 'arpege', 'basse'].includes(n.voix)) parPas.set(Math.round(n.pas), (parPas.get(Math.round(n.pas)) ?? 0) + 1);
      expect(Math.max(...parPas.values()), a).toBeLessThanOrEqual(5);
    }
  });

  it('le WAV est relu par le moteur comme un son importé (même voie que l\'aperçu et l\'export)', async () => {
    const { importerSon, pcmSource } = await import('../import');
    const m = musique('calme');
    const fichier = new File([encoderWav(m.canaux, m.frequence)], 'Musique Arko - Fin calme 1.wav', { type: 'audio/wav' });
    const s = await importerSon(fichier);
    expect(s.infos.type).toBe('audio');
    expect(s.infos.duree).toBeCloseTo(m.duree, 1);
    const pcm = await pcmSource(s, 10, 10.5);
    expect(pcm).not.toBeNull();
    const k = Math.round((10 - pcm!.debut) * pcm!.frequence);
    const attendu = m.canaux[0][Math.round(10 * m.frequence)]!;
    expect(Math.abs(pcm!.canaux[0]![k]! - attendu)).toBeLessThan(2 / 32768 + 1e-4);
  });

  it('temps de calcul raisonnable (mesuré ; ~3 min de musique = 5 boucles)', () => {
    const t0 = performance.now();
    let duree = 0;
    for (const [a, g] of [['joyeux', 9], ['enquete', 9], ['rigolo', 9], ['calme', 9], ['joyeux', 10]] as const) duree += fabriquerMusique(a, g).duree;
    const ms = performance.now() - t0;
    console.log(`Musique Arko : ${duree.toFixed(0)} s de musique rendues en ${ms.toFixed(0)} ms (${((ms / duree) * 60).toFixed(0)} ms par minute)`);
    expect(duree).toBeGreaterThan(150);
    expect(ms).toBeLessThan(20000);
  });

  // Extraits d'écoute (30 s par ambiance), seulement si demandé.
  it.skipIf(!process.env.ARKO_ECOUTE_MUSIQUE)('écrit les extraits d\'écoute', { timeout: 120000 }, () => {
    const dossier = process.env.ARKO_ECOUTE_MUSIQUE!;
    mkdirSync(dossier, { recursive: true });
    for (const a of AMBIANCES) {
      for (const g of [1, 2]) {
        const m = fabriquerMusique(a, g);
        writeFileSync(join(dossier, `arko-${a}-${g}.wav`), encoderWav(m.canaux, m.frequence));
        console.log(a, g, `${m.bpm} BPM`, `${m.duree.toFixed(1)} s`);
      }
    }
  });
});
