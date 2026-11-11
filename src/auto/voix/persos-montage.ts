// « Persos de qui parle » (7/11/2026) : l'étape PARTAGÉE par tous les montages sans IA (Montage express, Best-of
// serré, clips du monteur sans IA). À partir des voix reconnues (« Qui parle ? ») : une personne par voix qui parle
// dans le montage, son perso (celui choisi, sinon le perso tout prêt 1, 2, 3… dans l'ordre des voix), puis les
// avatars (mode « parle », rebond). L'émotion et la situation de chaque tour viennent des mots (completerTours).
// Pure. Le placement à l'écran est calculé au rendu (moteur/couches/places-persos.ts) : aperçu = export.

import { chibiDe } from '../../moteur/couches/avatars';
import { activerAvatars, definirQuiParle, donnerChibi } from '../../recette/operations';
import type { OptionsQuiParle } from '../../recette/operations-voix';
import type { DefinitionChibi, Mot, Recette, ReglagesAvatars, Sec, TourDeParole } from '../../recette/types';
import type { PlageTemps, SignauxSource } from '../types';
import type { EmpreintesVoix, VoixDetectees } from '../types-v3';

/** Réglages : il faut au moins `paroleMin` s de parole dans le montage pour poser des persos. */
export const PERSOS = { paroleMin: 1.5, margeClip: 5, tenue: 1, ilotMax: 0.6, ilotEcart: 0.4 } as const;

/**
 * Corrige les « îlots » : un tour très court (moins de 0,6 s) d'une voix, collé (moins de 0,4 s) entre deux tours de
 * la MÊME autre voix, est presque toujours une erreur d'écoute (un mot plus fort, un rire) : il est rendu à cette
 * voix. Évite qu'un perso apparaisse une fraction de seconde (clignotement) et que l'autre se coupe. Pure.
 */
export function corrigerIlots<T extends TourDeParole>(tours: readonly T[]): T[] {
  const res = [...tours].sort((a, b) => a.ts - b.ts);
  for (let i = 1; i + 1 < res.length; i++) {
    const t = res[i]!;
    const av = res[i - 1]!;
    const ap = res[i + 1]!;
    if (av.p === ap.p && t.p !== av.p && t.fin - t.ts < PERSOS.ilotMax && t.ts - av.fin < PERSOS.ilotEcart && ap.ts - t.fin < PERSOS.ilotEcart) res[i] = { ...t, p: av.p };
  }
  return res;
}

/** Ce que l'utilisateur a choisi sur la revue (cartes des voix) : noms et persos. */
export interface ChoixPersos {
  noms?: Readonly<Record<string, string>>;
  chibis?: Readonly<Record<string, { def: DefinitionChibi; bib?: string }>>;
}

/** Les voix écoutées (null : pas de voix, ou écoute impossible). */
export interface VoixEcoutees {
  voix: VoixDetectees | null;
  empreintes: readonly EmpreintesVoix[];
}

export interface OptionsPersos extends ChoixPersos {
  /** Mots de la transcription (vrais mots : émotion et situation des tours). */
  mots?: readonly Mot[];
  signaux?: SignauxSource | null;
  /** false : qui parle seulement (noms, sous-titres pour une voix), sans avatars. Défaut : oui. */
  avatars?: boolean;
  /** Clip : ne garder que les tours de ce passage de la source (± 5 s). */
  plage?: PlageTemps;
  /** Compléter les tours autrement (Best-of v4 : completerToursV4) ; défaut : completerTours. */
  completer?: OptionsQuiParle['completer'];
  /** Réglages des avatars (défaut : « parle » + rebond, tenue d'office) ; le Best-of v4 donne la tenue de la DA. */
  reglagesAvatars?: ReglagesAvatars;
}

/** Perso par défaut d'une voix : le perso tout prêt de son numéro (Voix 1 → perso 1…), le même que les avatars. */
export function chibiParDefaut(id: string): DefinitionChibi {
  return chibiDe({ id, nom: id });
}

/** Secondes de parole de `tours` dans les plans vidéo du montage (temps source, sans les éléments insérés). */
export function paroleDansMontage(r: Recette, tours: readonly TourDeParole[]): Sec {
  const premiere = r.sources.find((s) => s.type === 'video')?.id;
  let total = 0;
  for (const p of r.plans) {
    if (p.ins) continue;
    const src = p.src ?? premiere;
    for (const t of tours) if ((t.src ?? premiere) === src) total += Math.max(0, Math.min(t.fin, p.a) - Math.max(t.ts, p.de));
  }
  return total;
}

/**
 * Pose qui parle + un perso par voix + les avatars. Sans voix, ou sans parole dans le montage (moins de 1,5 s) :
 * la recette est rendue telle quelle (aucun perso). Une voix qui ne parle pas dans le passage (clip) n'a pas de perso.
 */
export function poserPersos(r: Recette, ecoute: VoixEcoutees, o: OptionsPersos = {}): Recette {
  const v = ecoute.voix;
  if (!v || v.voix.length === 0 || v.tours.length === 0) return r;
  const plage = o.plage;
  const tous = v.methode === 'pistes' ? v.tours : corrigerIlots(v.tours);
  const tours = plage ? tous.filter((t) => t.fin > plage.de - PERSOS.margeClip && t.ts < plage.a + PERSOS.margeClip) : tous;
  const enTout = paroleDansMontage(r, tours.map((t) => (t.src ? t : { ...t, src: v.src })));
  if (enTout < PERSOS.paroleMin) return r;
  const quiParle = new Set(tours.map((t) => t.p));
  const voix = v.voix.filter((x) => quiParle.has(x.id));
  let res = definirQuiParle(r, { ...v, voix, tours }, { noms: o.noms, empreintes: ecoute.empreintes, ...(o.mots ? { mots: o.mots } : {}), signaux: o.signaux ?? null, ...(o.completer ? { completer: o.completer } : {}) });
  for (const p of res.personnes ?? []) {
    const c = o.chibis?.[p.id];
    res = donnerChibi(res, p.id, c?.def ?? p.chibi ?? chibiParDefaut(p.id), c?.bib ?? p.bib);
  }
  if (o.avatars !== false) res = activerAvatars(res, o.reglagesAvatars ?? { mode: 'parle', rebond: true, tenue: PERSOS.tenue });
  return res;
}
