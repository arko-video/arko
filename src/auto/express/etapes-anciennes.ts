// Les étapes du Best-of serré D'AVANT la v4 (commit 418bfe8), rangées sous la forme des étapes de la chaîne v4
// (types-v4.ts → EtapesChaine). Fichier GELÉ (architecte, 7/11/2026 ; seul l'intégrateur y touche) : c'est la
// référence du banc (« --ancien voix,coupes »), le repli d'une étape qui lève, et le corps de départ des squelettes
// des devs. Ne rien « améliorer » ici : le comportement doit rester celui que Romain a jugé « en gros rien ».
//  - parole : zones = mots ± 0,05 s (mode mots, comme ecouterVoix), sinon énergie 8 dB au-dessus du fond (zonesDeVoix) ;
//  - mots : tels quels ; voix : separerVoix (niveau par trame + timbre) sur ces zones, ou pistes séparées ;
//  - moments : les rires (ia/rires.ts), cris et pics d'ia/signaux.ts ; coupes : morceauxDeParole (réglage demandé) ;
//  - séquences : decouperScenes → noterScenes → choisirBestOf → resserrer (comme scenesBestOf) ;
//  - habillage : punchlines, zooms automatiques, accroche = plus gros pic, chapitres, titres de section ;
//  - persos : poserPersos + « Sous-titres pour » (voixMalEntendue).

import { estFouRire } from '../derush/notation';
import { choisirBestOf, DERUSH_REGLES, noterScenes, resserrer } from '../derush/derush';
import { morceauxDeParole, REGLAGES_BLANCS } from '../coupes/blancs';
import { zonesDeVoix } from '../coupes/voix';
import { trouverPunchlines } from '../habillage/punchlines';
import { separerVoix, voixDesPistes } from '../voix/qui-parle';
import { poserPersos } from '../voix/persos-montage';
import { paroleDepuisZones } from '../vad/segments';
import { compiler } from '../../recette/chronologie';
import { gabaritDe } from '../../recette/destination';
import { MEILLEUR, modeleMeilleurDAbord } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { choisirModeSousTitres, definirPunchlines, sousTitresPour, titresDeSection, zoomsAutomatiques } from '../../recette/operations';
import type { Recette, Sec } from '../../recette/types';
import type { Morceau, PlageTemps } from '../types';
import type { EntreeDerush, SceneNotee } from '../types-v3';
import type {
  BilanHabillage,
  ChoixSequences,
  EntreeCoupes,
  EntreeHabillage,
  EntreeMoments,
  EntreeMots,
  EntreeParole,
  EntreePersos,
  EntreeSequences,
  EntreeVoix,
  EtapesChaine,
  MomentV4,
  MotsNettoyes,
  ParoleDetectee,
  ResultatHabillage,
  SeparationVoix,
  SequenceV4,
  VoixDetecteesV4,
} from '../types-v4';
import { voixMalEntendue } from './best-of';
import { chapitresDesScenes, meilleurMoment } from './express';
import { decouperScenes, dureeApresCoupe, motsDans } from './scenes';

const BLOC: Sec = 1200;
const arrondi1 = (x: number) => Math.round(x * 10) / 10;

/** Parole d'avant : les mots ± 0,05 s s'il y en a (zones de « Qui parle ? »), sinon l'énergie 8 dB au-dessus du fond. */
function paroleAncienne(e: EntreeParole): ParoleDetectee {
  const mots = (e.mots ?? []).filter((m) => m[0].trim() && m[2] > m[1]);
  if (mots.length > 0) return paroleDepuisZones(e.src, e.duree, mots.map((m) => ({ de: Math.max(0, m[1] - 0.05), a: m[2] + 0.05 })), 'mots');
  return paroleDepuisZones(e.src, e.duree, e.energie ? zonesDeVoix(e.energie) : [], 'sans-modele');
}

function motsAnciens(e: EntreeMots): MotsNettoyes {
  const mots = [...e.mots].sort((x, y) => x[1] - y[1]);
  return { mots, bilan: { avant: e.mots.length, apres: mots.length, piles: 0, motsDePiles: 0, repartis: 0, horsParole: 0, etires: 0, recales: 0 } };
}

/** Le détail v4 d'une séparation d'avant (rien de mesuré en plus). */
function separationDe(m: VoixDetecteesV4['methode'], n: number): SeparationVoix {
  const par: SeparationVoix['par'] = m === 'pistes' ? 'pistes' : m === 'niveau+timbre' ? 'niveau' : m === 'timbre' ? 'timbre' : 'une';
  return { par, seuilDb: null, ecartDb: null, cosinusCentres: null, ambigu: 0, morceaux: n, proposerEmpreinte: null };
}

function voixAnciennes(e: EntreeVoix): VoixDetecteesV4 | null {
  const principale = e.empreintes[0];
  if (!principale) return null;
  const d = e.pistesSeparees && e.empreintes.length >= 2 ? voixDesPistes(e.empreintes, e.src) : separerVoix(principale, e.parole.segments, e.src);
  if (d.voix.length === 0 || d.tours.length === 0) return null;
  return { ...d, separation: separationDe(d.methode, e.parole.segments.length) };
}

function momentsAnciens(e: EntreeMoments): MomentV4[] {
  const s = e.signaux;
  const res: MomentV4[] = [
    ...s.rires.map((r): MomentV4 => ({ de: r.de, a: r.a, t: r.t, genre: estFouRire(r) ? 'fouRire' : 'rire', force: r.force, indices: ['ancien'] })),
    ...s.cris.map((c): MomentV4 => ({ de: c.de, a: c.a, t: c.t, genre: 'cri', force: c.force, indices: ['ancien'] })),
    ...s.pics.map((p): MomentV4 => ({ de: p.ts, a: p.ts + 0.5, t: p.ts, genre: 'sonFort', force: Math.min(1, p.z / 10), indices: ['ancien'] })),
  ];
  return res.sort((x, y) => x.t - y.t || x.de - y.de);
}

function coupesAnciennes(e: EntreeCoupes): Morceau[] {
  const r = REGLAGES_BLANCS[e.niveau] ?? REGLAGES_BLANCS.normal;
  const signaux = e.garder === 'parole' ? null : e.signaux;
  if (!e.plages) return morceauxDeParole(e.mots, signaux, r);
  return e.plages.flatMap((p) => morceauxDeParole(motsDans(e.mots, p), signaux, r, p));
}

/** Comme scenesBestOf (express/best-of.ts) : scènes notées, choisies, les protégées longues resserrées. */
function sequencesAnciennes(e: EntreeSequences): ChoixSequences {
  const d: EntreeDerush = { mots: e.mots, signaux: e.signaux, ...(e.voix ? { paroles: e.voix.tours } : {}) };
  const notees = noterScenes(decouperScenes(e.mots, e.signaux), d);
  const { gardees, passages } = choisirBestOf(notees, d, e.dureeVisee);
  const choisies = new Map(gardees.map((g) => [`${g.de}|${g.a}`, g]));
  const cible = (DERUSH_REGLES.cibleResserree.min + DERUSH_REGLES.cibleResserree.max) / 2;
  const dureeDe = (plages: readonly PlageTemps[]) =>
    plages.reduce((t, p) => {
      const x = dureeApresCoupe(motsDans(d.mots, p), d.signaux, p);
      return t + (x > 0 ? x : p.a - p.de);
    }, 0);
  const scenes = notees.map((n: SceneNotee): SequenceV4 => {
    const g = choisies.get(`${n.de}|${n.a}`);
    const morceaux = g?.morceaux ?? (n.protegee && n.indices.duree > DERUSH_REGLES.resserrerAuDela ? resserrer(n, d, cible) : undefined);
    const s: SequenceV4 = {
      de: n.de,
      a: n.a,
      titre: n.titre,
      raison: n.raison,
      score: n.note,
      garde: g !== undefined,
      duree: arrondi1(morceaux ? dureeDe(morceaux) : n.indices.duree),
      protegee: n.protegee,
      coeur: { de: n.de, a: n.a },
      noteBrute: n.note,
      centile: n.note,
      bloc: Math.floor(n.de / BLOC),
      moments: [],
    };
    if (morceaux) s.morceaux = morceaux;
    return s;
  });
  return { scenes, passages };
}

function bilanDe(r: Recette, accroche: BilanHabillage['accroche']): BilanHabillage {
  const z = r.plans.map((p) => p.zoomFixe?.force ?? 1);
  return {
    punchlines: r.sousTitres?.punchlines?.length ?? 0,
    zoomsForts: z.filter((x) => x >= 1.2).length,
    zoomsLegers: z.filter((x) => x > 1 && x < 1.2).length,
    plans: r.plans.length,
    accroche,
    chapitres: r.chapitres?.length ?? 0,
    titres: r.textes.filter((x) => x.role === 'section').length,
  };
}

/** B punchlines → C zooms → accroche (plus gros pic) → chapitres → G titres (comme etapesMontage). */
function habillageAncien(r0: Recette, e: EntreeHabillage): ResultatHabillage {
  let r = r0;
  const vraisMots = e.mots.some((m) => m[0].trim());
  if (vraisMots && e.punchlines) r = choisirModeSousTitres(definirPunchlines(r, trouverPunchlines(e.mots, e.signaux)), 'punchlines');
  if (e.zooms) r = zoomsAutomatiques(r, e.signaux, e.zooms);
  let finAccroche = 0;
  let accroche: BilanHabillage['accroche'] = null;
  if (e.accroche) {
    const t = meilleurMoment(r, e.signaux);
    const avec = t === null ? r : modeleMeilleurDAbord(r, t, MEILLEUR.dureeExpress, e.titres ? {} : { texte: null });
    if (avec !== r && t !== null) {
      const p = avec.plans[0]!;
      finAccroche = compiler(avec).plans[0]?.t1 ?? 0;
      accroche = { plages: [{ de: p.de, a: p.a }], t, raison: 'pic' };
    }
    r = avec;
  }
  const chapitres = gabaritDe(r).paysage ? chapitresDesScenes(r, e.sequences, e.src, finAccroche) : [];
  if (chapitres.length > 0) {
    r = normaliser({ ...r, chapitres }, { sources: r.sources }).recette;
    if (e.titres) r = titresDeSection(r, { source: 'chapitres' });
  }
  return { recette: r, bilan: bilanDe(r, accroche) };
}

/** poserPersos + « Sous-titres pour » (la voix qu'on entend mal, ou le choix de la revue), comme construireBestOf. */
function persosAnciens(r0: Recette, e: EntreePersos): Recette {
  const v = e.voix;
  if (!v || v.voix.length === 0 || !(e.quiParle || e.avatars)) return r0;
  let r = poserPersos(r0, { voix: v, empreintes: e.empreintes }, { noms: e.noms, chibis: e.chibis, ...(e.mots ? { mots: e.mots } : {}), signaux: e.signaux, avatars: e.avatars });
  const pour = e.sousTitresPour === undefined ? voixMalEntendue(v) : e.sousTitresPour;
  if (pour && r.personnes?.some((p) => p.id === pour) && r.sousTitres && Array.isArray(r.sousTitres.mots)) {
    if (r.sousTitres.mode !== 'punchlines') r = choisirModeSousTitres(r, 'punchlines');
    r = sousTitresPour(r, pour);
  }
  return r;
}

/** Le Best-of serré d'avant la v4, étape par étape. */
export const ETAPES_ANCIENNES: EtapesChaine = {
  parole: paroleAncienne,
  mots: motsAnciens,
  voix: voixAnciennes,
  moments: momentsAnciens,
  coupes: coupesAnciennes,
  sequences: sequencesAnciennes,
  habillage: habillageAncien,
  persos: persosAnciens,
};
