// Banc réel — ce que fait l'INTERFACE du Montage express (style « Best-of serré »), reproduit À L'IDENTIQUE parce
// que cette logique n'existe que dans des fichiers d'état de l'interface (src/ui/auto/express/etat-express.ts et
// etat-best-of.ts, qui importent @preact/signals et tout l'état de l'appli). À déplacer dans une fonction pure
// partagée (voir le rapport banc-chaine) ; en attendant, toute modification de ces fichiers doit être recopiée ici.
//
// Parcours d'un utilisateur : import d'une vidéo de 3 h 20 → « Montage express » → YouTube 16:9 (durée visée
// 15–20 min, choisie d'office) → Style du montage : Best-of serré → Transcrire les voix coché (module présent) ou
// non → aucune musique cochée → Sans IA → Analyser → Revue (séquences proposées gardées telles quelles,
// « Sous-titres pour » choisi d'office) → « Monter la vidéo ».

import { analyserPourBestOf, BEST_OF_DEFAUT, construireBestOf, voixMalEntendue, type AnalyseBestOf, type ReglagesBestOf, type SceneBestOf } from '../../../src/auto/express/best-of';
import type { ReglagesExpress, RessourcesExpress } from '../../../src/auto/express/express';
import { dureeGardee } from '../../../src/auto/express/scenes';
import type { OptionsTache } from '../../../src/auto/types';
import type { SourceOuverte } from '../../../src/moteur/api';
import { recetteInitiale } from '../../../src/moteur/sources';
import { gabarit, type Destination } from '../../../src/recette/destination';
import { pistesGardees } from '../../../src/recette/operations';
import type { Recette, Source } from '../../../src/recette/types';
import { TEXTES_BEST_OF } from '../../../src/ui/auto/express/textes-best-of';

/** etat-express.ts DUREES_EXPRESS (la 2ᵉ est choisie d'office). */
export const DUREES_EXPRESS: Record<Destination, { min: number; max: number }[]> = {
  youtube: [{ min: 480, max: 720 }, { min: 900, max: 1200 }, { min: 1500, max: 1800 }],
  tiktok: [{ min: 45, max: 60 }, { min: 60, max: 120 }, { min: 120, max: 180 }],
  short: [{ min: 30, max: 45 }, { min: 45, max: 60 }, { min: 120, max: 180 }],
};

/** etat-express.ts reglagesParDefaut(d). */
export function reglagesParDefaut(d: Destination): ReglagesExpress {
  return {
    dureeVisee: DUREES_EXPRESS[d][1]!,
    garder: 'parole+forts',
    niveauBlancs: 'normal',
    transcrire: true,
    punchlines: true,
    bruitages: false,
    musique: [],
    bords: true,
    zooms: 'normal',
    sections: d === 'youtube',
    accroche: true,
    avecIA: false,
    persos: true,
  };
}

export interface ChoixUtilisateur {
  destination: Destination;
  /** « Transcrire les voix » : coché d'office si le module Whisper est déjà sur l'appareil. */
  transcrire: boolean;
  /** Ids « Mes sons » des morceaux cochés (Romain : aucun). */
  musique: string[];
  /** Durée visée, si l'utilisateur en choisit une autre que celle d'office. */
  dureeVisee?: { min: number; max: number };
}

/** ouvrirExpress → (choisirDestinationExpress) → choisirStyle('bestOf') → cases cochées. */
export function reglagesDe(c: ChoixUtilisateur): ReglagesExpress {
  // ouvrirExpress : réglages par défaut de la destination, transcrire = module présent.
  let r: ReglagesExpress = { ...reglagesParDefaut(c.destination), transcrire: c.transcrire, musique: [] };
  // choisirStyle('bestOf') : coupe Serrée, jamais de bruitages, sans IA.
  r = { ...r, niveauBlancs: 'serre', bruitages: false, avecIA: false };
  // basculerMorceau(id) pour chaque morceau coché (6 au plus).
  r = { ...r, musique: c.musique.slice(0, 6) };
  if (c.dureeVisee) r = { ...r, dureeVisee: c.dureeVisee };
  return r;
}

/** etat-best-of.ts reglagesBestOf (valeur d'office). */
export function reglagesBestOfDefaut(): ReglagesBestOf {
  return { ...BEST_OF_DEFAUT };
}

/**
 * lancerExpress (style Best-of) : pistes gardées de la recette ouverte (aucune après un import : la recette n'a pas de
 * `pistesAudio`), analyserPourBestOf, puis preparerVoix (« Sous-titres pour : » = la voix qu'on entend mal).
 */
export async function analyserCommeLaPage(
  source: SourceOuverte,
  reg: ReglagesExpress,
  bestOf: ReglagesBestOf,
  recetteOuverte: Recette | null,
  o: OptionsTache = {},
): Promise<{ analyse: AnalyseBestOf; sousTitresPour: string | null }> {
  const pistes = recetteOuverte?.sources.some((x) => x.id === source.infos.id) ? pistesGardees(recetteOuverte, source.infos.id) : [];
  const analyse = await analyserPourBestOf(source, reg, bestOf, { ...o, pistes });
  return { analyse, sousTitresPour: voixMalEntendue(analyse.voix ?? null) };
}

/** EcranRevueExpress : « Monter la vidéo » est grisé si rien n'est gardé ou si c'est plus long que la limite. */
export function montagePossible(scenes: readonly SceneBestOf[], destination: Destination): { possible: boolean; total: number; max: number } {
  const g = gabarit(destination);
  const max = g.dureeLimite ?? g.dureeMax;
  const total = dureeGardee(scenes);
  return { possible: scenes.some((s) => s.garde) && total <= max, total, max };
}

/** preparerRessources : les morceaux de Mes sons copiés dans le projet comme sources audio a1, a2… */
export function ressourcesDe(musiques: readonly Source[]): RessourcesExpress {
  const morceaux = musiques.map((s) => ({ src: s.id, t: 0 }));
  return { sourcesAudio: [...musiques], bruitages: [], musique: morceaux.length > 0 ? { morceaux } : null };
}

/**
 * monterExpress (style Best-of) : nouveau projet = recetteInitiale(source, destination) + titre « Best-of — <nom> »,
 * ressources, puis UNE opération construireBestOf (noms et chibis : rien de choisi sur la revue).
 */
export function monterCommeLaPage(
  source: SourceOuverte,
  analyse: AnalyseBestOf,
  scenes: readonly SceneBestOf[],
  reg: ReglagesExpress,
  bestOf: ReglagesBestOf,
  destination: Destination,
  musiques: readonly Source[],
  sousTitresPour: string | null,
): Recette {
  const nom = source.infos.nom.replace(/\.[^.]+$/, '');
  const depart: Recette = { ...recetteInitiale(source, destination), titre: TEXTES_BEST_OF.titreProjet(nom) };
  const ressources = ressourcesDe(musiques);
  return construireBestOf(depart, analyse, scenes, reg, bestOf, { ...ressources, noms: {}, chibis: {}, sousTitresPour });
}
