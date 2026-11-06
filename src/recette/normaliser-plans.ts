// Normalisation des plans, des transitions et des mises en page (globale et par plan).

import { ALIAS_TRANSITION, FIGE, JEU_CAM, MISE_DEFAUT, TRANSITION, TYPES_MISE, TYPES_TRANSITION, VITESSE } from './defauts';
import { normaliserZoomFixe } from './normaliser-auto-habillage';
import { borner, estObjet, Journal, lireNombre, verifierCles, type Objet } from './normaliser-outils';
import { arrondir, DUREE_MIN_PLAN, formaterSecondes, lireTemps } from './temps';
import type { Cadre, MiseEnPage, Plan, Source, Transition } from './types';

const CLES_PLAN = ['src', 'de', 'a', 'vit', 'trans', 'mise', 'm', 'fige', 'zoomFixe'] as const;
/** Noms que les IA utilisent souvent à la place des nôtres. */
const ALIAS_PLAN: Record<string, (typeof CLES_PLAN)[number]> = {
  debut: 'de', start: 'de', from: 'de', in: 'de',
  fin: 'a', end: 'a', to: 'a', out: 'a',
  vitesse: 'vit', speed: 'vit',
  transition: 'trans',
  source: 'src',
  moment: 'm',
  freeze: 'fige', arret: 'fige', gel: 'fige',
};

/** Applique les alias connus (« start » → « de ») en le signalant. */
export function appliquerAlias(obj: Objet, alias: Record<string, string>, chemin: string, journal: Journal): Objet {
  const res: Objet = { ...obj };
  for (const [ancien, nouveau] of Object.entries(alias)) {
    if (ancien in res && !(nouveau in res)) {
      res[nouveau] = res[ancien];
      delete res[ancien];
      journal.corrige(`${chemin}.${ancien}`, `La clé "${ancien}" a été lue comme "${nouveau}".`);
    }
  }
  return res;
}

/** Normalise la liste des plans. `videos` = sources vidéo connues. */
export function normaliserPlans(brut: unknown, videos: Source[], journal: Journal): Plan[] {
  if (brut === undefined) return [];
  const liste = Array.isArray(brut) ? brut : estObjet(brut) ? [brut] : null;
  if (!liste) {
    journal.corrige('plans', '"plans" doit être une liste : ignoré.');
    return [];
  }
  const plans: Plan[] = [];
  liste.forEach((p, i) => {
    const plan = normaliserPlan(p, `plans[${i}]`, videos, journal);
    if (plan) plans.push(plan);
  });
  // Une transition sur le premier plan n'a pas de sens : on la retire.
  if (plans[0]?.trans !== undefined) {
    delete plans[0].trans;
    journal.ignore('plans[0].trans', 'Le premier plan ne peut pas avoir de transition d\'entrée : retirée.');
  }
  return plans;
}

function normaliserPlan(brut: unknown, chemin: string, videos: Source[], journal: Journal): Plan | null {
  if (!estObjet(brut)) {
    journal.corrige(chemin, 'Ce plan n\'est pas un objet : supprimé.');
    return null;
  }
  const p = appliquerAlias(brut, ALIAS_PLAN, chemin, journal);
  verifierCles(p, CLES_PLAN, chemin, journal);

  // Source du plan.
  let src: string | undefined;
  if (p.src !== undefined) {
    const id = String(p.src);
    if (videos.length === 0 || videos.some((s) => s.id === id)) src = id;
    else if (videos.length === 1) {
      journal.corrige(`${chemin}.src`, `La source "${id}" n'existe pas : remplacée par "${videos[0]!.id}".`);
      src = videos[0]!.id;
    } else if (videos.length > 1) {
      journal.corrige(`${chemin}.src`, `La source "${id}" n'existe pas : plan supprimé.`);
      return null;
    }
  }
  const source = src ? videos.find((s) => s.id === src) : videos[0];

  let de = lireTemps(p.de);
  let a = lireTemps(p.a);
  if (de === null || a === null) {
    journal.corrige(chemin, 'Ce plan n\'a pas de début ("de") ou de fin ("a") lisible : supprimé.');
    return null;
  }
  if (de < 0) {
    journal.corrige(`${chemin}.de`, `Le début (${formaterSecondes(de)}) était négatif : ramené à 0.`);
    de = 0;
  }
  if (a < 0) {
    journal.corrige(`${chemin}.a`, `La fin (${formaterSecondes(a)}) était négative : ramenée à 0.`);
    a = 0;
  }
  de = arrondir(de);
  a = arrondir(a);
  if (a < de) {
    journal.corrige(chemin, `La fin (${formaterSecondes(a)}) était avant le début (${formaterSecondes(de)}) : je les ai inversées.`);
    [de, a] = [a, de];
  }
  if (source && source.duree > 0) {
    const max = arrondir(source.duree);
    if (a > max) {
      journal.corrige(`${chemin}.a`, `La fin (${formaterSecondes(a)}) dépassait la durée de la vidéo (${formaterSecondes(max)}) : ramenée à ${formaterSecondes(max)}.`);
      a = max;
    }
    if (de > max) de = max;
  }
  if (a - de < DUREE_MIN_PLAN - 1e-9) {
    journal.corrige(chemin, `Ce plan durait moins de 0,10 s : supprimé.`);
    return null;
  }

  const plan: Plan = { de, a };
  if (src !== undefined) plan.src = src;
  const vit = lireNombre(p.vit, `${chemin}.vit`, journal, { ...VITESSE, nom: 'la vitesse' });
  if (vit !== 1) plan.vit = vit;
  const fige = normaliserFige(p.fige, `${chemin}.fige`, journal);
  if (fige !== undefined) plan.fige = fige;
  const trans = normaliserTransition(p.trans, `${chemin}.trans`, journal);
  if (trans !== undefined) plan.trans = trans;
  if (p.mise !== undefined) {
    const mise = normaliserMise(p.mise, `${chemin}.mise`, journal, true);
    if (mise) plan.mise = mise;
  }
  if (p.m !== undefined) plan.m = String(p.m);
  const zoomFixe = normaliserZoomFixe(p.zoomFixe, `${chemin}.zoomFixe`, journal); // Montage auto (C)
  if (zoomFixe) plan.zoomFixe = zoomFixe;
  return plan;
}

/** Arrêt sur image : 0,3 à 5 s ; absent, 0, null ou false = pas d'arrêt. */
function normaliserFige(brut: unknown, chemin: string, journal: Journal): number | undefined {
  if (brut === undefined || brut === null || brut === false || brut === 0) return undefined;
  const x = lireTemps(brut);
  if (x === null || x < 0) {
    journal.corrige(chemin, `L'arrêt sur image (${JSON.stringify(brut)}) n'est pas une durée lisible : retiré.`);
    return undefined;
  }
  const b = arrondir(Math.min(Math.max(x, FIGE.min), FIGE.max));
  if (b !== arrondir(x)) {
    journal.corrige(chemin, `L'arrêt sur image (${formaterSecondes(x)}) doit durer de 0,30 s à 5,00 s : ramené à ${formaterSecondes(b)}.`);
  }
  return b;
}

/** Transition : type inconnu → coupe franche ; dur dans [0,1 ; 0,6]. Coupe franche = pas de champ. */
export function normaliserTransition(brut: unknown, chemin: string, journal: Journal): string | Transition | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  const obj: Objet = typeof brut === 'string' ? { type: brut } : estObjet(brut) ? brut : { type: String(brut) };
  if (typeof brut !== 'string') verifierCles(obj, ['type', 'dur', 'son'], chemin, journal);
  let type = String(obj.type ?? '').trim().toLowerCase();
  // Anciens noms (« whoosh », « fondu ») : on les traduit vers la transition actuelle.
  const alias = ALIAS_TRANSITION[type];
  if (alias) {
    journal.corrige(chemin, `La transition "${type}" s'appelle maintenant "${alias}" : corrigée.`);
    type = alias;
  }
  if (!(TYPES_TRANSITION as readonly string[]).includes(type)) {
    journal.corrige(chemin, `La transition "${type}" n'existe pas : remplacée par une coupe franche.`);
    return undefined;
  }
  if (type === 'coupe') return undefined;
  if (typeof brut === 'string') return type;
  const t: Transition = { type };
  t.dur = lireNombre(obj.dur, `${chemin}.dur`, journal, {
    defaut: TRANSITION.dur, min: TRANSITION.durMin, max: TRANSITION.durMax, nom: 'la durée de la transition',
  });
  if (obj.son === false) t.son = false;
  else if (typeof obj.son === 'string') t.son = obj.son;
  return t;
}

type MisePartielle = Partial<MiseEnPage> & { type: MiseEnPage['type'] };

/** Normalise une mise en page. `partielle` = mise d'un plan (pas de valeurs par défaut ajoutées). */
export function normaliserMise(brut: unknown, chemin: string, journal: Journal, partielle: true): MisePartielle | null;
export function normaliserMise(brut: unknown, chemin: string, journal: Journal, partielle?: false): MiseEnPage;
export function normaliserMise(brut: unknown, chemin: string, journal: Journal, partielle = false): MiseEnPage | MisePartielle | null {
  const obj: Objet = typeof brut === 'string' ? { type: brut } : estObjet(brut) ? brut : {};
  if (!estObjet(brut) && typeof brut !== 'string') {
    if (partielle) {
      journal.corrige(chemin, 'Mise en page illisible : retirée.');
      return null;
    }
    if (brut !== undefined) journal.corrige(chemin, 'Mise en page illisible : fond flou choisi.');
    return { ...MISE_DEFAUT };
  }
  let type = obj.type as MiseEnPage['type'];
  if (!TYPES_MISE.includes(type)) {
    journal.corrige(`${chemin}.type`, `La mise en page "${String(obj.type)}" n'existe pas : fond flou choisi.`);
    type = 'flou';
  }
  const nb = (cle: string, defaut: number, min: number, max: number, nom: string) =>
    obj[cle] === undefined && partielle ? undefined : lireNombre(obj[cle], `${chemin}.${cle}`, journal, { defaut, min, max, nom });

  if (type === 'flou') {
    verifierCles(obj, ['type', 'y'], chemin, journal);
    const y = nb('y', 0.5, 0, 1, 'la position verticale');
    return y === undefined ? { type } : { type, y };
  }
  if (type === 'recadre') {
    verifierCles(obj, ['type', 'x'], chemin, journal);
    const x = nb('x', 0.5, 0, 1, 'le centre du cadrage');
    return x === undefined ? { type } : { type, x };
  }
  verifierCles(obj, ['type', 'cam', 'x', 'camEnHaut', 'partCam'], chemin, journal);
  const m: MisePartielle = { type: 'jeuCam' };
  if (obj.cam !== undefined || !partielle) m.cam = normaliserCadre(obj.cam, `${chemin}.cam`, journal);
  const x = nb('x', 0.5, 0, 1, 'le centre du jeu');
  if (x !== undefined) m.x = x;
  if (obj.camEnHaut !== undefined || !partielle) m.camEnHaut = obj.camEnHaut === undefined ? true : Boolean(obj.camEnHaut);
  const part = nb('partCam', JEU_CAM.partCam, JEU_CAM.partCamMin, JEU_CAM.partCamMax, 'la part de la webcam');
  if (part !== undefined) m.partCam = part;
  return m;
}

/** Cadre webcam : coordonnées dans [0, 1], largeur et hauteur au moins 0,05, sans sortir de l'image. */
function normaliserCadre(brut: unknown, chemin: string, journal: Journal): Cadre {
  if (!estObjet(brut)) {
    journal.corrige(chemin, 'Le cadre de la webcam manquait : placé en bas à gauche.');
    return { ...JEU_CAM.cam };
  }
  verifierCles(brut, ['x', 'y', 'l', 'h'], chemin, journal);
  const lire = (cle: 'x' | 'y' | 'l' | 'h', min: number) =>
    lireNombre(brut[cle], `${chemin}.${cle}`, journal, { defaut: JEU_CAM.cam[cle], min, max: 1, nom: `la valeur ${cle} du cadre` });
  const l = lire('l', JEU_CAM.cadreMin);
  const h = lire('h', JEU_CAM.cadreMin);
  const x = arrondir(borner(lire('x', 0), 0, 1 - l));
  const y = arrondir(borner(lire('y', 0), 0, 1 - h));
  return { x, y, l, h };
}
