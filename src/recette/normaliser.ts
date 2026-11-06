// Le normaliseur : prend une recette écrite par l'interface ou par une IA (même mal écrite)
// et renvoie une recette propre, avec la liste des problèmes trouvés (messages en français).
// Il CORRIGE au lieu de rejeter ; seuls quelques cas sont bloquants (aucun plan, vidéo > 10 min, format /2+).

import { catalogueIds } from '../sons/catalogue';
import { EXPORT_DEFAUT, ySousTitres } from './defauts';
import { gabarit } from './destination';
import { migrer, VERSION_ACTUELLE, versionDuFormat } from './migrations';
import { ajouterChampsAuto, CLES_RECETTE_AUTO, sourcesAudioAuto } from './normaliser-auto';
import { normaliserAmelioration } from '../moteur/amelioration/normaliser-amelioration'; // Améliorer l'image
import { CLES_RECETTE_BIBLIOTHEQUE, normaliserIncrustations } from './normaliser-bibliotheque'; // Ma bibliothèque
import {
  normaliserGuide,
  normaliserMarqueurs,
  normaliserSons,
  normaliserSousTitres,
  normaliserTextes,
  normaliserZooms,
} from './normaliser-habillage';
import { estObjet, Journal, nettoyerTexteJson, verifierCles, type Objet } from './normaliser-outils';
import { normaliserMise, normaliserPlans } from './normaliser-plans';
import { normaliserChapitres, normaliserDestination, normaliserGenerique } from './normaliser-youtube';
import { arrondir, dureePlan, formaterNombre, lireTemps } from './temps';
import { FORMAT_RECETTE, type InfosSources, type Probleme, type Recette, type ReglagesExport, type Source } from './types';

export interface ResultatNormalisation {
  recette: Recette;
  problemes: Probleme[];
  /** true si au moins un problème est bloquant (la recette ne peut pas être exportée telle quelle). */
  bloquant: boolean;
}

export interface OptionsNormalisation {
  /** Identifiants des sons disponibles (par défaut : le catalogue d'Arko). */
  sonsConnus?: readonly string[];
  /**
   * true : retire (sans message) les sources audio que rien n'utilise (ni un son, ni le son guide).
   * À activer quand on RETIRE un son ou le guide, et au chargement d'un projet. Pas dans ajouterSource :
   * la source y est ajoutée juste AVANT le son qui l'utilise.
   */
  retirerSourcesAudioInutiles?: boolean;
}

const CLES_RECETTE = [
  'format', 'titre', 'sources', 'plans', 'mise', 'textes', 'sousTitres', 'sons', 'zooms', 'guide',
  'boucle', 'marqueurs', 'statut', 'export', 'destination', 'chapitres', 'intro', 'outro',
  ...CLES_RECETTE_AUTO,
  'amelioration', // Améliorer l'image
  ...CLES_RECETTE_BIBLIOTHEQUE, // Ma bibliothèque
] as const;

/**
 * Normalise une recette. `brut` peut être un objet ou du texte JSON (même entouré de ```json).
 * `infos` = ce que le moteur sait des sources réellement ouvertes (durées, dimensions) : prioritaire.
 */
export function normaliser(brut: unknown, infos?: InfosSources, options: OptionsNormalisation = {}): ResultatNormalisation {
  const journal = new Journal();
  let obj = lireEntree(brut, journal);

  // Format et version.
  const version = versionDuFormat(obj.format);
  if (obj.format === undefined) {
    journal.conseil('format', `Le champ "format" manquait : je suppose "${FORMAT_RECETTE}".`);
  } else if (version === null) {
    journal.corrige('format', `Le format "${String(obj.format)}" est inconnu : je suppose "${FORMAT_RECETTE}".`);
  } else if (version > VERSION_ACTUELLE) {
    journal.bloquant('format', `Cette recette utilise la version ${version} du format, plus récente que cette version d'Arko. Mets Arko à jour.`);
  } else if (version < VERSION_ACTUELLE) {
    obj = migrer(obj, version);
  }
  verifierCles(obj, CLES_RECETTE, '', journal);

  const sources = normaliserSources(obj.sources, infos, journal);
  const videos = sources.filter((s) => s.type === 'video');
  const plans = normaliserPlans(obj.plans, videos, journal);
  const duree = arrondir(plans.reduce((s, p) => s + dureePlan(p), 0));
  const mise = normaliserMise(obj.mise, 'mise', journal);
  const destination = normaliserDestination(obj.destination, journal);
  const gab = gabarit(destination);
  const plateforme = gab.plateforme;

  const recette: Recette = {
    format: FORMAT_RECETTE,
    sources,
    plans,
    mise,
    textes: normaliserTextes(obj.textes, duree, journal, { yMin: gab.texteY[0], yMax: gab.texteY[1], plateforme }),
    sousTitres: normaliserSousTitres(obj.sousTitres, journal, ySousTitres(mise, gab), { yMin: gab.sousTitresY[0], yMax: gab.sousTitresY[1], plateforme }),
    sons: normaliserSons(obj.sons, options.sonsConnus ?? catalogueIds(), journal, sources.filter((s) => s.type === 'audio').map((s) => s.id)),
    zooms: normaliserZooms(obj.zooms, journal, mise.type === 'jeuCam' ? 'cam' : 'tout'),
    guide: normaliserGuide(obj.guide, sources, journal),
    boucle: obj.boucle === true,
    export: normaliserExport(obj.export, journal),
  };
  // Montage auto (champs facultatifs) : avant le retrait des sources audio inutiles (la musique en utilise).
  ajouterChampsAuto(recette, obj, sources, duree, journal);
  // Améliorer l'image (facultatif : jamais ajouté s'il est absent).
  const amelioration = normaliserAmelioration(obj.amelioration, journal);
  if (amelioration) recette.amelioration = amelioration;
  // Ma bibliothèque (facultatif) : fonds verts et mèmes posés par-dessus la vidéo.
  const incrustations = normaliserIncrustations(obj.incrustations, videos, duree, journal);
  if (incrustations) recette.incrustations = incrustations;
  if (options.retirerSourcesAudioInutiles) recette.sources = sourcesUtilisees(recette);
  if (typeof obj.titre === 'string' && obj.titre.trim()) recette.titre = obj.titre.trim().slice(0, 120);
  const marqueurs = normaliserMarqueurs(obj.marqueurs, journal);
  if (marqueurs) recette.marqueurs = marqueurs;
  if (obj.statut === 'brouillon' || obj.statut === 'garde' || obj.statut === 'jete') recette.statut = obj.statut;
  else if (obj.statut !== undefined) journal.ignore('statut', `Le statut "${String(obj.statut)}" est inconnu : ignoré.`);
  // Champs YouTube : seulement s'ils sont là (un ancien projet n'en reçoit aucun).
  if (destination) recette.destination = destination;
  const chapitres = normaliserChapitres(obj.chapitres, duree, journal);
  if (chapitres) recette.chapitres = chapitres;
  const intro = normaliserGenerique(obj.intro, 'intro', sources, journal);
  const outro = normaliserGenerique(obj.outro, 'outro', sources, journal);
  if (intro) recette.intro = intro;
  if (outro) recette.outro = outro;

  // Durée totale (les limites dépendent de la destination).
  const max = gab.dureeMax;
  if (plans.length === 0) {
    journal.bloquant('plans', 'La recette ne garde aucun plan : il n\'y a rien à exporter.');
  } else if (duree > max) {
    journal.bloquant('plans', `La vidéo finale dure ${formaterNombre(duree / 60, 1)} min : c'est plus que la limite de ${Math.round(max / 60)} min. Coupe des passages.`);
  } else if (gab.dureeLimite !== null && duree > gab.dureeLimite) {
    journal.conseil('plans', `La vidéo finale dure ${Math.round(duree)} s : un Short YouTube dure 3 min au plus. Au-delà, YouTube la publie comme une vidéo normale.`);
  } else if (gab.dureeConseil !== null && duree > gab.dureeConseil) {
    journal.conseil('plans', `La vidéo finale dure ${Math.round(duree)} s : sur TikTok, les clips de 15 à 30 s marchent mieux.`);
  }

  const problemes = journal.problemes;
  return { recette, problemes, bloquant: problemes.some((p) => p.niveau === 'bloquant') };
}

/** Sources de la recette sans les sources AUDIO que ni un son ni le son guide n'utilisent (pure). */
export function sourcesUtilisees(r: Pick<Recette, 'sources' | 'sons' | 'guide' | 'plans' | 'musique'>): Source[] {
  const utilisees = new Set<string>(sourcesAudioAuto(r));
  for (const son of r.sons) {
    utilisees.add(son.id);
    if (son.src) utilisees.add(son.src);
  }
  for (const p of r.plans) if (p.src) utilisees.add(p.src);
  if (r.guide) utilisees.add(r.guide.src);
  return r.sources.filter((s) => s.type !== 'audio' || utilisees.has(s.id));
}

/** Raccourci : la recette normalisée seule. */
export function normaliserRecette(brut: unknown, infos?: InfosSources): Recette {
  return normaliser(brut, infos).recette;
}

function lireEntree(brut: unknown, journal: Journal): Objet {
  if (typeof brut === 'string') {
    try {
      brut = JSON.parse(nettoyerTexteJson(brut));
    } catch {
      journal.bloquant('', 'Ce texte n\'est pas du JSON valide : impossible de lire la recette.');
      return {};
    }
  }
  if (!estObjet(brut)) {
    journal.bloquant('', 'La recette doit être un objet JSON.');
    return {};
  }
  return { ...brut };
}

/** Sources : celles du moteur (infos) font foi ; celles de la recette complètent. */
function normaliserSources(brut: unknown, infos: InfosSources | undefined, journal: Journal): Source[] {
  const ouvertes = infos?.sources ?? [];
  const liste = Array.isArray(brut) ? brut : brut === undefined ? [] : null;
  if (liste === null) journal.corrige('sources', '"sources" doit être une liste : ignoré.');
  const res: Source[] = [];
  (liste ?? []).forEach((b, i) => {
    if (!estObjet(b) || typeof b.id !== 'string' || !b.id) {
      journal.corrige(`sources[${i}]`, 'Source sans identifiant : ignorée.');
      return;
    }
    if (res.some((s) => s.id === b.id)) {
      journal.corrige(`sources[${i}]`, `La source "${b.id}" apparaît deux fois : doublon ignoré.`);
      return;
    }
    verifierCles(b, ['id', 'nom', 'taille', 'emp', 'duree', 'type', 'l', 'h', 'bib'], `sources[${i}]`, journal);
    // Clip de Ma bibliothèque : son identifiant là-bas (gardé même si la source ouverte ne le connaît pas).
    const bib = typeof b.bib === 'string' && b.bib ? b.bib.slice(0, 80) : undefined;
    const vraie = ouvertes.find((s) => s.id === b.id);
    if (vraie) {
      res.push(bib && !vraie.bib ? { ...vraie, bib } : { ...vraie });
      return;
    }
    const s: Source = {
      id: b.id,
      nom: typeof b.nom === 'string' ? b.nom : b.id,
      taille: Math.max(0, Number(b.taille) || 0),
      emp: typeof b.emp === 'string' ? b.emp : '',
      duree: arrondir(Math.max(0, lireTemps(b.duree) ?? 0)),
      type: b.type === 'audio' ? 'audio' : 'video',
    };
    if (typeof b.l === 'number' && b.l > 0) s.l = Math.round(b.l);
    if (typeof b.h === 'number' && b.h > 0) s.h = Math.round(b.h);
    if (bib) s.bib = bib;
    res.push(s);
  });
  // Sources ouvertes absentes de la recette (cas typique d'une recette écrite par une IA) : ajoutées.
  for (const s of ouvertes) if (!res.some((r) => r.id === s.id)) res.push({ ...s });
  return res;
}

function normaliserExport(brut: unknown, journal: Journal): ReglagesExport {
  if (brut === undefined) return { ...EXPORT_DEFAUT };
  if (!estObjet(brut)) {
    journal.corrige('export', 'Réglages d\'export illisibles : valeurs par défaut.');
    return { ...EXPORT_DEFAUT };
  }
  verifierCles(brut, ['h', 'ips', 'qualite'], 'export', journal);
  const res: ReglagesExport = { ...EXPORT_DEFAUT };
  if (brut.h === 1280 || brut.h === 720) res.h = 1280;
  else if (brut.h !== undefined && brut.h !== 1920 && brut.h !== 1080) journal.corrige('export.h', `La hauteur ${String(brut.h)} n'est pas prise en charge : 1920 choisi.`);
  if (brut.ips !== undefined && brut.ips !== 30) journal.corrige('export.ips', 'Arko exporte en 30 images par seconde pour l\'instant.');
  if (brut.qualite === 'haute') res.qualite = 'haute';
  return res;
}
