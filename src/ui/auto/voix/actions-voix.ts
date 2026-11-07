// « Qui parle ? » (dev 1) : état et actions de l'écran. On écoute les voix de la vidéo (une fois : le résultat est
// gardé par empreinte), on prépare un BROUILLON de recette (definirQuiParle), on le corrige (noms, chibis, phrases),
// puis Valider le pose en une seule opération (un seul Annuler).

import { signal } from '@preact/signals';
import { estPasEncoreFait } from '../../../auto/pas-encore-fait';
import type { PlageTemps } from '../../../auto/types';
import type { VoixDetectees } from '../../../auto/types-v3';
import { analyserQuiParle, type EmpreintesNommees } from '../../../auto/voix/mesures-voix';
import { ErreurArko, type SourceOuverte } from '../../../moteur/api';
import { donnerChibi } from '../../../recette/operations-chibis';
import type { Situation } from '../../../chibis/catalogue';
import { situationDuPassage } from '../../../recette/operations-chibis';
import { definirQuiParle, personneSuivante, renommerPersonne, retirerQuiParle } from '../../../recette/operations-voix';
import type { DefinitionChibi, Mot, Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { afficherToast, modifier, recette, sources } from '../../etat';
import { arreterEcoute } from './ecoute';
import { fermerQuiParle } from './etat-voix';
import { garderVoix, relireVoix } from './memoire-voix';

export type EtatQuiParle =
  | { phase: 'attente' }
  | { phase: 'analyse'; p: number; message: string }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; detectees: VoixDetectees; source: SourceOuverte; brouillon: Recette; chibis: Record<string, DefinitionChibi | null> };

export const etatQuiParle = signal<EtatQuiParle>({ phase: 'attente' });

let controleur: AbortController | null = null;

/** Mots des sous-titres (s'il y en a). */
export function motsDe(r: Recette): Mot[] {
  return Array.isArray(r.sousTitres?.mots) ? r.sousTitres.mots : [];
}

/** La 1re vidéo du montage, ouverte. */
function videoOuverte(r: Recette): SourceOuverte | null {
  const id = r.sources.find((s) => s.type === 'video' && !s.bib)?.id;
  return sources.peek().find((s) => s.infos.id === id) ?? null;
}

/** Pistes à écouter : celles gardées dans la recette (pistesAudio), sinon toutes celles du fichier (≥ 2). */
export function pistesPour(r: Recette, s: SourceOuverte): number[] {
  const gardees = r.pistesAudio?.find((x) => x.src === s.infos.id)?.pistes.map((p) => p.n) ?? [];
  if (gardees.length > 0) return gardees;
  const nb = s.infos.pistes ?? 0;
  return nb >= 2 ? Array.from({ length: nb }, (_, i) => i) : [];
}

/** Passage de la source couvert par le montage (on n'écoute que lui). */
export function plagePour(r: Recette, s: SourceOuverte): PlageTemps {
  const premiere = r.sources.find((x) => x.type === 'video')?.id;
  const siens = r.plans.filter((p) => (p.src ?? premiere) === s.infos.id && !p.ins);
  if (siens.length === 0) return { de: 0, a: s.infos.duree };
  return { de: Math.max(0, Math.min(...siens.map((p) => p.de)) - 1), a: Math.min(s.infos.duree, Math.max(...siens.map((p) => p.a)) + 1) };
}

/** Voix déjà posées dans la recette (pour rouvrir l'écran sans réécouter). */
export function voixDepuisRecette(r: Recette, src: string): VoixDetectees {
  const personnes = r.personnes ?? [];
  const tours = r.paroles ?? [];
  const total = tours.reduce((t, x) => t + (x.fin - x.ts), 0) || 1;
  const sures = tours.filter((x) => x.sur !== false).reduce((t, x) => t + (x.fin - x.ts), 0);
  return {
    src,
    methode: personnes.some((p) => p.piste !== undefined) ? 'pistes' : personnes.length > 1 ? 'niveau+timbre' : 'une',
    voix: personnes.map((p) => ({
      id: p.id,
      niveauDb: p.niveauDb ?? -30,
      part: tours.filter((x) => x.p === p.id).reduce((t, x) => t + (x.fin - x.ts), 0) / total,
      ...(p.piste !== undefined ? { piste: p.piste } : {}),
    })),
    tours,
    sure: sures / total,
  };
}

/** Pistes séparées : le nom de chaque piste (réglé à l'import, sinon celui du fichier : « Micro ») devient le nom proposé. */
function nomsDesPistes(r: Recette, s: SourceOuverte, res: { detectees: VoixDetectees; empreintes: readonly EmpreintesNommees[] }): Record<string, string> {
  const reglees = r.pistesAudio?.find((x) => x.src === s.infos.id)?.pistes ?? [];
  const noms: Record<string, string> = {};
  for (const v of res.detectees.voix) {
    if (v.piste === undefined) continue;
    const nom = reglees.find((p) => p.n === v.piste)?.nom ?? res.empreintes.find((e) => e.piste === v.piste)?.nom;
    if (nom) noms[v.id] = nom;
  }
  return noms;
}

function message(e: unknown): string {
  return e instanceof ErreurArko ? e.message : TV.voix.aucuneVoix;
}

/** Ouvre l'écran : voix déjà posées, ou écoute de la vidéo (gardée ensuite). `reecouter` force une nouvelle écoute. */
export async function demarrerQuiParle(reecouter = false) {
  controleur?.abort();
  const r = recette.peek();
  const source = r ? videoOuverte(r) : null;
  if (!r || !source) return void (etatQuiParle.value = { phase: 'erreur', message: TV.voix.pasDeVideo });
  const chibis = Object.fromEntries((r.personnes ?? []).map((p) => [p.id, p.chibi ?? null]));
  if (!reecouter && r.personnes?.length && r.paroles?.length) {
    etatQuiParle.value = { phase: 'pret', detectees: voixDepuisRecette(r, source.infos.id), source, brouillon: r, chibis };
    return;
  }
  const c = new AbortController();
  controleur = c;
  const pistes = pistesPour(r, source);
  const plage = plagePour(r, source);
  etatQuiParle.value = { phase: 'analyse', p: 0, message: TV.voix.analyse };
  try {
    let res = reecouter ? null : await relireVoix(source.infos.emp, pistes, plage);
    if (!res) {
      const zones = motsDe(r).map((m) => ({ de: Math.max(0, m[1] - 0.05), a: m[2] + 0.05 }));
      res = await analyserQuiParle(source, {
        pistes,
        zones,
        plage,
        signal: c.signal,
        surProgression: (p, m) => controleur === c && (etatQuiParle.value = { phase: 'analyse', p, message: m }),
      });
      void garderVoix(source.infos.emp, pistes, plage, res.detectees, res.empreintes);
    }
    if (controleur !== c) return;
    const brouillon = definirQuiParle(r, res.detectees, { empreintes: res.empreintes, mots: motsDe(r), noms: nomsDesPistes(r, source, res) });
    etatQuiParle.value = { phase: 'pret', detectees: res.detectees, source, brouillon, chibis };
  } catch (e) {
    if (controleur !== c) return;
    if (e instanceof ErreurArko && e.code === 'annule') return fermer();
    etatQuiParle.value = { phase: 'erreur', message: message(e) };
  } finally {
    if (controleur === c) controleur = null;
  }
}

/** Change le brouillon (écran prêt seulement). */
function changer(f: (x: Extract<EtatQuiParle, { phase: 'pret' }>) => Partial<Extract<EtatQuiParle, { phase: 'pret' }>>) {
  const e = etatQuiParle.peek();
  if (e.phase === 'pret') etatQuiParle.value = { ...e, ...f(e) };
}

export function nommerVoix(p: string, nom: string) {
  changer((e) => ({ brouillon: renommerPersonne(e.brouillon, p, nom) }));
}

export function choisirChibiVoix(p: string, def: DefinitionChibi, bib?: string) {
  changer((e) => {
    let brouillon = e.brouillon;
    try {
      brouillon = donnerChibi(brouillon, p, def, bib);
    } catch (err) {
      if (!estPasEncoreFait(err)) throw err;
    }
    return { brouillon, chibis: { ...e.chibis, [p]: def } };
  });
}

/** Situation de jeu d'une phrase (menu à côté d'elle) : donnée au tour de parole qui la couvre. */
export function changerSituation(ts: number, fin: number, sit: Situation) {
  changer((e) => ({ brouillon: situationDuPassage(e.brouillon, ts, fin, sit, e.detectees.src) }));
}

/** Un toucher sur une phrase : elle passe à la personne suivante. */
export function corrigerPhrase(ts: number, fin: number) {
  changer((e) => ({ brouillon: personneSuivante(e.brouillon, ts, fin, e.detectees.src) }));
}

function fermer() {
  controleur?.abort();
  controleur = null;
  arreterEcoute();
  etatQuiParle.value = { phase: 'attente' };
  fermerQuiParle();
}

export function annulerQuiParle() {
  fermer();
}

/** Valider : le brouillon devient la recette (un seul Annuler). */
export function validerQuiParle() {
  const e = etatQuiParle.peek();
  if (e.phase === 'pret') {
    modifier(() => e.brouillon);
    afficherToast(TV.voix.valide);
  }
  fermer();
}

export function oublierQuiParle() {
  modifier((r) => retirerQuiParle(r));
  afficherToast(TV.voix.oubliees);
  fermer();
}
