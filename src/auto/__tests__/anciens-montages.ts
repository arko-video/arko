// Recettes « d'avant le Montage auto » (novembre 2026), écrites à la main pour couvrir TOUS les champs
// qui existaient déjà. Le test anciens-montages.test.ts vérifie qu'elles s'ouvrent exactement pareil
// (sortie du normaliseur identique à celle figée dans anciens-montages.fige.json, avant l'échafaudage).

const s1 = { id: 's1', nom: 'partie.mp4', taille: 123456789, emp: 'abc', duree: 7200, type: 'video', l: 1280, h: 720 };
const a1 = { id: 'a1', nom: 'vine boom.mp3', taille: 20000, emp: 'def', duree: 1.2, type: 'audio' };
const g1 = { id: 'g1', nom: 'intro.mp4', taille: 5000, emp: 'ghi', duree: 4, type: 'video', l: 1920, h: 1080 };

export const ANCIENS_MONTAGES: Record<string, unknown> = {
  tiktokComplet: {
    format: 'arko.recette/1',
    titre: 'Le clutch',
    sources: [s1, a1],
    plans: [
      { de: 842.3, a: 851, vit: 1.5 },
      { de: 855.2, a: 859.8, trans: { type: 'glitch', dur: 0.4, son: false }, fige: 1, m: 'm01' },
      { de: 900, a: 910, trans: 'zoom', mise: { type: 'recadre', x: 0.3 } },
    ],
    mise: { type: 'jeuCam', cam: { x: 0.02, y: 0.62, l: 0.26, h: 0.34 }, camEnHaut: false, partCam: 0.4 },
    textes: [
      { txt: 'ATTENDS LA FIN…', role: 'accroche', style: 'accroche', t: 0, dur: 2.5, y: 0.2 },
      { txt: '#1', role: 'top3', style: 'alerte', t: 5, dur: 1, x: 0.4, y: 0.3 },
    ],
    sousTitres: { style: 'pop', parLigne: 2, mots: [['non', 843, 843.4, 1], ['attends', 843.5, 844], ['quoi', 856, 856.3]] },
    sons: [{ id: 'impact.boom', ts: 857.1, vol: 1.2 }, { id: 'a1', t: 3 }],
    zooms: [{ ts: 857, dur: 0.8, force: 1.6, style: 'doux', zone: 'jeu', x: 0.4, y: 0.6 }],
    guide: { src: 'a1', debut: 12, vol: 0.5 },
    boucle: true,
    marqueurs: [{ ts: 857, type: 'cri', label: 'Gros cri' }],
    statut: 'garde',
    export: { h: 1280 },
  },
  youtubeComplet: {
    format: 'arko.recette/1',
    destination: 'youtube',
    sources: [s1, g1],
    plans: [{ de: 10, a: 70 }, { de: 100, a: 160 }, { de: 300, a: 400 }],
    mise: { type: 'recadre', x: 0.5 },
    textes: [{ txt: 'Salut', t: 1 }],
    sousTitres: { mots: 'auto' },
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    chapitres: [{ t: 0, nom: 'Début' }, { t: 60, nom: 'Le château' }, { t: 120, nom: 'La fin' }],
    intro: { src: 'g1', dur: 3 },
    outro: { modele: 'abonne', chaine: 'Romain', texte: 'Abonne-toi !', dur: 5 },
    export: { h: 1920, qualite: 'haute' },
  },
  short: {
    format: 'arko.recette/1',
    destination: 'short',
    sources: [s1],
    plans: [{ de: 0, a: 20 }],
    mise: { type: 'flou', y: 0.45 },
    textes: [],
    sousTitres: null,
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
  },
  minimal: { plans: [{ de: 1, a: 4 }] },
};
