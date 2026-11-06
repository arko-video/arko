// Côté page : lance l'export dans le Worker, relaie progression / temps restant / annulation,
// mémorise l'encodeur qui marche sur cet appareil, et estime la taille et la place libre avant l'export.

import { gabaritDe } from '../../recette/destination';
import { dureeTotale } from '../../recette/generiques';
import type { Recette } from '../../recette/types';
import type { EstimationExport, ExportEnCours, ResultatExport, SourceOuverte } from '../api';
import { ErreurArko } from '../erreurs';
import { cascadePour } from './cascade';
import type { DepuisWorker, VersWorker } from './messages';
import { effacerExport, nomExport } from './sortie-opfs';

const CLE_ENCODAGE = 'arko.encodage';
const DEBIT_AUDIO = 128_000;

/** Version de Chrome (le résultat de la cascade n'est valable que pour cette version). */
function versionNavigateur(): string {
  const m = typeof navigator !== 'undefined' ? navigator.userAgent.match(/Chrom(?:e|ium)\/([\d.]+)/) : null;
  return m?.[1] ?? 'inconnue';
}

/** Clé de l'encodeur mémorisé : une pour le vertical (inchangée), une pour le 16:9. */
const cleEncodage = (paysage: boolean) => (paysage ? `${CLE_ENCODAGE}.169` : CLE_ENCODAGE);

export function lireEncodageConnu(paysage = false): number | null {
  try {
    const brut = localStorage.getItem(cleEncodage(paysage));
    if (!brut) return null;
    const v = JSON.parse(brut) as { rang?: unknown; navigateur?: unknown };
    return typeof v.rang === 'number' && v.navigateur === versionNavigateur() && cascadePour(paysage)[v.rang] ? v.rang : null;
  } catch {
    return null;
  }
}

function memoriserEncodage(rang: number, paysage: boolean) {
  try {
    localStorage.setItem(cleEncodage(paysage), JSON.stringify({ rang, navigateur: versionNavigateur() }));
  } catch {
    /* stockage indisponible : on refera la cascade la prochaine fois */
  }
}

/** Taille estimée du MP4 : (débit vidéo + audio) × durée, + 1 % de conteneur. YouTube 16:9 : 8 Mb/s (16 en 1440p). */
export function tailleEstimee(duree: number, hauteur: 1920 | 1280 = 1920, paysage = false, haute = false): number {
  const debitVideo = paysage
    ? hauteur === 1280 ? 5_000_000 : haute ? 16_000_000 : 8_000_000
    : hauteur === 1280 ? 6_000_000 : 10_000_000;
  return Math.round((((debitVideo + (paysage ? 384_000 : DEBIT_AUDIO)) / 8) * duree) * 1.01);
}

export async function estimerExport(recette: Recette): Promise<EstimationExport> {
  // Durée de la vidéo exportée : intro et outro comprises.
  const duree = dureeTotale(recette);
  const paysage = gabaritDe(recette).paysage;
  const tailleOctets = tailleEstimee(duree, recette.export.h ?? 1920, paysage, recette.export.qualite === 'haute');
  let placeLibreOctets: number | null = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e && typeof e.quota === 'number') placeLibreOctets = Math.max(0, e.quota - (e.usage ?? 0));
  } catch {
    placeLibreOctets = null;
  }
  const manqueDePlace = placeLibreOctets !== null && placeLibreOctets < tailleOctets * 1.3;
  return { duree, tailleOctets, placeLibreOctets, manqueDePlace };
}

/** Arrêt des Workers précédents (fichier inachevé à effacer) : un nouvel export attend qu'il soit fini. */
let arretsEnCours: Promise<void> = Promise.resolve();
/** Arrête net l'export actif, s'il y en a un : jamais deux encodeurs en même temps. */
let arreterActif: (() => void) | null = null;

export function lancerExport(recette: Recette, sources: SourceOuverte[]): ExportEnCours {
  const abonnes: ((p: number, resteS: number | null) => void)[] = [];
  const nom = nomExport();
  let worker: Worker | null = null;
  let termine = false;
  let resoudre: (r: ResultatExport) => void = () => undefined;
  let rej: (e: ErreurArko) => void = () => undefined;
  const resultat = new Promise<ResultatExport>((ok, ko) => {
    resoudre = ok;
    rej = ko;
  });
  // Évite une « promesse rejetée non gérée » si l'interface n'écoute pas encore.
  resultat.catch(() => undefined);

  /** Arrête le Worker TOUT DE SUITE (terminate) ; le fichier inachevé est effacé depuis la page. */
  function arreter(effacer: boolean) {
    worker?.terminate();
    worker = null;
    if (arreterActif === annulerCeluiCi) arreterActif = null;
    if (effacer) arretsEnCours = arretsEnCours.then(() => effacerExport(nom)).catch(() => undefined);
  }
  function rejeter(e: ErreurArko) {
    if (termine) return;
    termine = true;
    arreter(true);
    rej(e);
  }
  function annulerCeluiCi() {
    rejeter(new ErreurArko('Export annulé.', 'annule'));
  }

  const paysage = gabaritDe(recette).paysage;
  const fichiers: Record<string, File> = {};
  for (const s of sources) fichiers[s.infos.id] = s.fichier;
  const manquante = recette.plans.find((p) => !fichiers[p.src ?? sources[0]?.infos.id ?? '']);
  // Intro / outro importées : leur vidéo doit être rouverte (elle est gardée sur l'appareil).
  const generiqueAbsent = [recette.intro?.src, recette.outro?.src].some((id) => id && !fichiers[id]);
  // Fonds verts et mèmes (Ma bibliothèque) : leur clip doit être ouvert.
  const clipAbsent = (recette.incrustations ?? []).some((x) => !fichiers[x.src]);
  if (sources.length === 0 || manquante) {
    rejeter(new ErreurArko('La vidéo d\'origine n\'est plus ouverte. Choisis-la à nouveau.', 'source'));
  } else if (clipAbsent) {
    rejeter(new ErreurArko('Un fond vert ou un mème n\'est plus dans Ma bibliothèque. Retire-le dans Habiller, puis réessaie.', 'source'));
  } else if (generiqueAbsent) {
    rejeter(new ErreurArko('La vidéo de ton intro ou de ton outro n\'est plus sur l\'appareil. Choisis-la à nouveau dans Habiller → Intro / outro.', 'source'));
  } else {
    arreterActif?.();
    arreterActif = annulerCeluiCi;
    // On attend que les Workers précédents soient vraiment arrêtés (leur fichier effacé) avant d'encoder.
    void arretsEnCours.then(() => {
      if (!termine) demarrer();
    });
  }

  function demarrer() {
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'arko-export' });
    } catch {
      rejeter(new ErreurArko('Impossible de démarrer l\'export dans ce navigateur. Mets Chrome à jour.', 'export'));
      return;
    }
    worker.onerror = (ev) => {
      ev.preventDefault();
      rejeter(new ErreurArko('L\'export a planté. Réessaie ; si ça recommence, redémarre Chrome.', 'export'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorker>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') for (const cb of abonnes) cb(m.p, m.resteS);
      else if (m.type === 'encodage') memoriserEncodage(m.rang, paysage);
      else if (m.type === 'erreur') rejeter(new ErreurArko(m.message, m.code));
      else if (m.type === 'fini') {
        termine = true;
        memoriserEncodage(m.rang, paysage);
        arreter(false);
        const r: ResultatExport = { fichier: m.fichier, qualite: m.qualite, largeur: m.largeur, hauteur: m.hauteur };
        if (m.avertissement) r.avertissement = m.avertissement;
        if (m.sonie) r.sonie = m.sonie;
        resoudre(r);
      }
    };
    const demande: VersWorker = { type: 'exporter', recette, fichiers, rangConnu: lireEncodageConnu(paysage), nom };
    worker.postMessage(demande);
  }

  return {
    surProgression(cb) {
      abonnes.push(cb);
    },
    /** Arrêt immédiat du Worker (et donc de son encodeur) ; le fichier inachevé est effacé ensuite. */
    annuler: annulerCeluiCi,
    resultat,
  };
}
