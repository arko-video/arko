// Banc réel — PLAFOND : la recette qu'aurait produite un Arko parfait, fabriquée à partir de verite.json seul
// (mêmes plans, mêmes voix, mêmes persos, mêmes punchlines et sous-titres, même musique). Mesurée contre la vérité,
// elle doit donner ~100 % partout : sinon c'est une mesure (ou un seuil) qui est fausse.
// Aucun texte : les « mots » des sous-titres sont des marques vides posées dans les fenêtres de la vérité.

import type { Emotion, Mot, Recette, Situation, TourDeParole } from '../../../src/recette/types';
import type { AnalyseBanc, Iv, Verite } from './mesurer';
import { fusionner, longueur } from './temps';

/** Mots fictifs : `n` marques réparties dans [de, a] (texte « x », jamais de vrai texte). */
function marques(de: number, a: number, n: number): Mot[] {
  const k = Math.max(1, n);
  const pas = (a - de) / k;
  const res: Mot[] = [];
  for (let i = 0; i < k; i++) res.push(['x', r2(de + i * pas), r2(de + (i + 0.9) * pas)]);
  return res;
}
const r2 = (x: number) => Math.round(x * 1000) / 1000;

/** La recette parfaite, son analyse (voix) et des mots fictifs (les bouches de la vérité) pour les mesures de coupe. */
export function recetteParfaite(v: Verite): { recette: Recette; analyse: AnalyseBanc; mots: Iv[] } {
  const nbAccroche = v.accroche?.morceaux.length ?? 0;
  const finSource = Math.max(...v.morceaux.map((m) => m.a)) + 60;
  const sources: Recette['sources'] = [{ id: 's1', nom: 'session.mp4', taille: 1, emp: 'verite', duree: finSource, type: 'video', l: 1280, h: 720 }];
  v.musique.morceaux.forEach((m, k) => sources.push({ id: `m${k + 1}`, nom: `${m.nom}.mp3`, taille: 1, emp: `musique-${k}`, duree: 600, type: 'audio' }));
  const plans: Recette['plans'] = v.morceaux.map((m, k) => ({
    de: m.de,
    a: m.a,
    ...(m.zoom > 1.001 ? { zoomFixe: { force: m.zoom } } : {}),
    ...(k === nbAccroche && nbAccroche > 0 ? { trans: 'glitch' } : {}),
  }));
  // Tours de parole : une phrase = un tour par morceau qu'elle touche (de sa 1re bouche à sa dernière).
  const tours: TourDeParole[] = [];
  const dejaPris: Record<'R' | 'G', Iv[]> = { R: [], G: [] };
  for (const passe of [false, true]) {
    for (const ph of v.phrases) {
      if (ph.accroche !== passe) continue;
      const parMorceau = new Map<number, Iv[]>();
      for (const w of ph.bouche) {
        const k = v.morceaux.findIndex((m) => w[0] >= m.de - 0.002 && w[1] <= m.a + 0.002);
        const l = parMorceau.get(k) ?? [];
        l.push(w);
        parMorceau.set(k, l);
      }
      for (const ws of parMorceau.values()) {
        const ts = Math.min(...ws.map((w) => w[0]));
        const fin = Math.max(...ws.map((w) => w[1]));
        // Les copies de l'accroche ne doublent pas un tour déjà posé.
        if (passe && dejaPris[ph.p].some(([a, b]) => ts < b && a < fin)) continue;
        dejaPris[ph.p].push([ts, fin]);
        const tour: TourDeParole = { ts, fin, p: ph.p === 'R' ? 'p1' : 'p2', emo: ph.emo as Emotion };
        if (ph.sit) tour.sit = ph.sit as Situation;
        tours.push(tour);
      }
    }
  }
  tours.sort((a, b) => a.ts - b.ts || a.p.localeCompare(b.p));
  // Mots fictifs : dans chaque punchline (jusqu'à 0,2 s avant sa fin) et chaque sous-titre de la vérité.
  const mots: Mot[] = [];
  const vus = new Set<string>();
  for (const x of [...v.punchlines.map((p) => ({ ...p, apres: 0.2 })), ...v.sousTitres.map((s) => ({ ...s, apres: 0.05 }))]) {
    for (const [de, a] of x.source) {
      const cle = `${de}-${a}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const fin = Math.max(de + 0.1, a - x.apres);
      const n = Math.max(1, Math.round((x.nMots * (a - de)) / Math.max(0.01, longueur(x.source))));
      mots.push(...marques(de, fin, n));
    }
  }
  mots.sort((a, b) => a[1] - b[1]);
  const punchlines = fusionner(v.punchlines.flatMap((p) => p.source)).map(([ts, fin]) => ({ ts, fin }));
  const recette: Recette = {
    format: 'arko.recette/1',
    titre: 'Plafond (vérité)',
    sources,
    plans,
    mise: { type: 'flou' },
    textes: [],
    sousTitres: { mots, mode: 'punchlines', punchlines, pour: 'p1', src: 's1' },
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: { qualite: 'haute' },
    destination: 'youtube',
    musique: { morceaux: v.musique.morceaux.map((m, k) => ({ src: `m${k + 1}`, t: m.t0, fin: m.t1 })), vol: 0.14, baisse: true },
    volumeFinal: { lufs: -14, crete: -1.5 },
    personnes: [
      { id: 'p1', nom: 'Romain', niveauDb: -40 },
      { id: 'p2', nom: 'Guts', niveauDb: -25 },
    ],
    paroles: tours,
    avatars: { mode: 'parle', tenue: 0.35 },
  };
  const partR = longueur(v.parole.R) / Math.max(1e-9, longueur(v.parole.R) + longueur(v.parole.G));
  const analyse: AnalyseBanc = {
    parole: 'mots',
    voix: {
      src: 's1',
      methode: 'niveau+timbre',
      voix: [
        { id: 'p1', niveauDb: -40, part: partR },
        { id: 'p2', niveauDb: -25, part: 1 - partR },
      ],
      tours,
      sure: 1,
    },
  };
  // Mots pour les mesures de coupe quand ceux de Whisper manquent : les bouches de la vérité.
  const motsCoupe = fusionner([...v.parole.R, ...v.parole.G]);
  return { recette, analyse, mots: motsCoupe };
}
