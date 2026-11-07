// Montages « d'avant la v3 » (Montage auto, Améliorer l'image, Ma bibliothèque : tout ce qui existait le 7/11/2026),
// écrits à la main pour couvrir TOUS les champs facultatifs déjà là. Le test retrocompat-v3.test.ts vérifie qu'ils
// s'ouvrent EXACTEMENT pareil (normaliseur ET scénario compilé) : sortie figée dans montages-v2.fige.json, AVANT
// l'échafaudage de la v3. Ne jamais régénérer ce fichier figé.

const s1 = { id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e1', duree: 7200, type: 'video', l: 1280, h: 720 };
const a1 = { id: 'a1', nom: 'Kevin MacLeod - Monkeys.mp3', taille: 1, emp: 'e2', duree: 120, type: 'audio' };
const a2 = { id: 'a2', nom: 'bruh.mp3', taille: 1, emp: 'e3', duree: 1, type: 'audio' };
const b1 = { id: 'b1', nom: 'chat qui crie.mp4', taille: 1, emp: 'e4', duree: 6, type: 'video', l: 1280, h: 720, bib: 'clip-12' };
const b2 = { id: 'b2', nom: 'explosion fond vert.mp4', taille: 1, emp: 'e5', duree: 4, type: 'video', l: 1920, h: 1080, bib: 'clip-13' };

export const MONTAGES_V2: Record<string, unknown> = {
  montageAuto: {
    format: 'arko.recette/1',
    destination: 'youtube',
    sources: [s1, a1, a2],
    plans: [{ de: 10, a: 20, zoomFixe: { force: 1.32, y: 0.45 } }, { de: 30, a: 40, trans: 'glitch' }, { de: 50, a: 70, fige: 1 }],
    mise: { type: 'recadre', x: 0.5 },
    textes: [
      { txt: 'ATTENDS…', role: 'accroche', style: 'accroche', t: 0, dur: 6 },
      { txt: 'LE CHÂTEAU', role: 'section', style: 'bandeau', t: 6, dur: 2.2 },
    ],
    sousTitres: { style: 'punchline', mode: 'punchlines', punchlines: [{ ts: 12, fin: 13.5 }], couleurCle: 'rouge', jurons: 'masques', mots: [['putain', 12, 12.4, 1], ['non', 31, 31.3]] },
    sons: [{ id: 'a2', ts: 12.1, vol: 0.63, role: 'bruitage', dur: 3, fondu: 0.3 }, { id: 'whoosh.rapide', t: 6, role: 'section' }],
    zooms: [{ ts: 35, style: 'punch' }],
    guide: null,
    boucle: false,
    export: { h: 1920, qualite: 'haute' },
    chapitres: [{ t: 0, nom: 'Début' }, { t: 12, nom: 'Le château' }, { t: 25, nom: 'La fin' }],
    blancs: { niveau: 'serre', fonduEntree: 0.02, fonduSortie: 0.04 },
    rognages: [{ src: 's1', x: 53 / 1280, y: 20 / 720, l: 1173 / 1280, h: 660 / 720 }],
    musique: { morceaux: [{ src: 'a1', t: 0 }, { src: 'a1', t: 25, debut: 10, boucle: false }], vol: 0.14, baisse: true },
    volumeFinal: { lufs: -14, crete: -1.5 },
    sections: { source: 'chapitres', son: true, dur: 2.2 },
  },
  bibliotheque: {
    format: 'arko.recette/1',
    sources: [s1, b1, b2],
    plans: [{ de: 100, a: 104 }, { src: 'b1', de: 0.5, a: 4, mise: { type: 'flou', y: 0.5 } }, { de: 104, a: 110 }],
    mise: { type: 'flou', y: 0.45 },
    textes: [{ txt: 'Regarde', t: 1, style: 'bulle', x: 0.4, y: 0.3 }],
    sousTitres: null,
    sons: [{ id: 'impact.boom', ts: 105 }],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
    incrustations: [
      { src: 'b2', t: 2, de: 0, a: 3, plein: true, cle: { couleur: [0, 177, 64], tolerance: 0.42, douceur: 0.25, debordement: 0.7 }, vol: 0.8, genre: 'fondVert' },
      { src: 'b1', t: 9, de: 1, a: 3, x: 0.75, y: 0.25, taille: 0.42, son: false, genre: 'meme' },
    ],
    amelioration: { niveau: 'fort', nettoyer: true, agrandir: false },
  },
  ameliorationSeule: { plans: [{ de: 1, a: 9 }], amelioration: 'leger', sources: [s1] },
  monteurSansIA: {
    format: 'arko.recette/1',
    titre: 'Fou rire à 1:23:45',
    sources: [s1],
    plans: [{ src: 's1', de: 5013.5, a: 5031, m: 'm07' }],
    mise: { type: 'flou' },
    textes: [{ txt: 'MORT DE RIRE', role: 'accroche', t: 0, dur: 2.5, style: 'accroche', y: 0.2 }],
    sousTitres: { mots: 'auto' },
    sons: [{ id: 'impact.boom', ts: 5020, src: 's1' }],
    zooms: [{ ts: 5020, src: 's1', style: 'punch' }],
    guide: null,
    boucle: false,
    marqueurs: [{ ts: 5020, src: 's1', type: 'rire', label: 'Rires' }],
    statut: 'brouillon',
    export: {},
  },
};
