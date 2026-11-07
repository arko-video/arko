// Une recette qui utilise TOUS les champs de la v3 « Best-of » (tests de l'échafaudage). Fichier GELÉ.

const s1 = { id: 's1', nom: 'obs.mkv.mp4', taille: 1, emp: 'e1', duree: 7200, type: 'video', l: 1920, h: 1080, pistes: 2 };
const b1 = { id: 'b1', nom: 'chat.mp4', taille: 1, emp: 'e4', duree: 6, type: 'video', l: 1280, h: 720, bib: 'clip-12' };

const chibiGuts = {
  style: 'feutre', graine: 42, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'cowboy',
  accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'points',
};

export const RECETTE_V3 = (): unknown => ({
  format: 'arko.recette/1',
  destination: 'youtube',
  sources: [s1, b1],
  plans: [
    { de: 10, a: 20 },
    { ins: { type: 'image', img: 'i1' }, de: 0, a: 2, trans: 'flash' },
    { ins: { type: 'carton', txt: 'Plus tard…', fond: '#000000', couleur: '#FFE500', style: 'accroche' }, de: 0, a: 1.5 },
    { ins: { type: 'chibi', emo: 'choque', p: 'p2', txt: 'QUOI ?!', fond: '#3498DB' }, de: 0, a: 1.5 },
    { ins: { type: 'clip' }, src: 'b1', de: 1, a: 4, mise: { type: 'flou', y: 0.5 } },
  ],
  mise: { type: 'recadre', x: 0.5 },
  textes: [],
  sousTitres: null,
  sons: [],
  zooms: [],
  guide: null,
  boucle: false,
  export: {},
  personnes: [
    { id: 'p1', nom: 'Guts', couleur: '#E74C3C', piste: 0, niveauDb: -40, chibi: chibiGuts, bib: 'chibi-1', place: { x: 0.12, y: 0.97, taille: 0.3 } },
    { id: 'p2', nom: 'Romain', piste: 1, niveauDb: -25 },
  ],
  paroles: [
    { ts: 11, fin: 12.5, p: 'p1', emo: 'rit', b: 'f/A=' },
    { ts: 12.6, fin: 14, p: 'p2', sur: false },
    { ts: 15, fin: 18, p: 'p1', src: 's1', emo: 'crie' },
  ],
  avatars: { mode: 'parle', rebond: true, tenue: 0.5 },
  derush: { passages: [{ src: 's1', de: 300, a: 340, note: 72, raison: '2 rires · échanges rapides', titre: 'Le pont' }] },
  images: [{ id: 'i1', nom: 'carte.png', emp: 'e9', taille: 2000, l: 800, h: 600 }],
  pistesAudio: [{ src: 's1', pistes: [{ n: 0, nom: 'Micro' }, { n: 1, vol: 0.8, nom: 'Discord' }] }],
  bips: { son: 'bip' },
});
