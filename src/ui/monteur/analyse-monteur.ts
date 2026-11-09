// Analyse du monteur IA : analyse de la longue vidéo (Worker), puis propositions de clips,
// sans IA (clipsSansIA) ou avec l'IA (proposerClips). Écran gardé allumé, annulation, reprise.

import { signalerFinTravail } from '../fin-travail';
import { del, get, set } from 'idb-keyval';
import {
  analyserSource,
  clipsSansIA,
  construireRequete,
  ErreurArko,
  proposerClips,
  trouverFournisseur,
  type DemandeAgent,
  type Moment,
  type PropositionAgent,
  type ResultatAnalyse,
} from '../../moteur/api';
import { normaliser } from '../../recette/normaliser';
import type { Mot, Recette } from '../../recette/types';
import { destinationChoisie } from '../destination';
import { T } from '../../textes-fr';
import {
  demande,
  DUREES,
  etatAnalyse,
  regler,
  requeteEnvoyee,
  resultat,
  sourceMonteur,
  type Brouillon,
  type DemandeMonteur,
  nouvelUid,
} from './etat-monteur';
import { cleGardee } from './cles-monteur';
import { garderAllume } from './ecran-allume';
import { avecMotsGardes, persosDesClips } from './persos-monteur';
import { titreSurClips } from './reglage-titre';
import { commencerRevue } from './revue-monteur';
import { lireSignauxSource } from '../../auto/signaux-source';
import type { SignauxSource } from '../../auto/types';

/** Analyse interrompue (pour proposer « Reprendre l'analyse » même après un rechargement). */
const CLE_INTERROMPUE = 'arko.monteur.interrompue';
export interface AnalyseInterrompue {
  emp: string;
  p: number;
}

export async function analyseInterrompue(emp: string): Promise<AnalyseInterrompue | null> {
  try {
    const a = await get<AnalyseInterrompue>(CLE_INTERROMPUE);
    return a && a.emp === emp ? a : null;
  } catch {
    return null;
  }
}

function noter(a: AnalyseInterrompue | null) {
  const ecrit = a ? set(CLE_INTERROMPUE, a) : del(CLE_INTERROMPUE);
  ecrit.catch(() => {});
}

/* ------------------------------------------------------------------ analyse */

let controleur: AbortController | null = null;

function estAnnule(e: unknown) {
  return (
    (e instanceof ErreurArko && e.code === 'annule') || (e instanceof DOMException && e.name === 'AbortError')
  );
}

function message(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return T.erreurInconnue;
}

/** « Lancer » ou « Reprendre l'analyse » : analyse (en reprenant le dernier point gardé), puis propositions. */
export async function lancerAnalyse() {
  const source = sourceMonteur.peek();
  if (!source) return;
  controleur?.abort();
  const c = new AbortController();
  controleur = c;
  const d = demande.peek();
  resultat.value = null;
  requeteEnvoyee.value = null;
  const debut = Date.now();
  let dernier = 0;
  etatAnalyse.value = { phase: 'encours', p: 0, message: T.monteur.demarrage, debut };
  noter({ emp: source.infos.emp, p: 0 });
  garderAllume(true);
  try {
    const res = await analyserSource(source, {
      transcrire: d.transcrire,
      langue: 'fr',
      reprendre: true,
      signal: c.signal,
      surProgression: (p, m) => {
        if (c.signal.aborted) return;
        dernier = p;
        etatAnalyse.value = { phase: 'encours', p, message: m, debut };
      },
    });
    noter(null);
    resultat.value = res;
    await proposer(res, d, c.signal);
  } catch (e) {
    if (controleur !== c) return;
    if (estAnnule(e)) {
      etatAnalyse.value = { phase: 'interrompue', p: Math.round(dernier * 100) };
      noter({ emp: source.infos.emp, p: Math.round(dernier * 100) });
    } else etatAnalyse.value = { phase: 'erreur', message: message(e) };
  } finally {
    if (controleur === c) {
      controleur = null;
      garderAllume(false);
    }
  }
}

export function annulerAnalyse() {
  controleur?.abort();
}

/** Mots des moments couverts par les plans (temps source), sans doublon, dans l'ordre. */
export function motsCouverts(r: Recette, moments: Moment[]): Mot[] {
  const vus = new Set<string>();
  const mots: Mot[] = [];
  for (const m of moments)
    for (const w of m.mots ?? []) {
      const cle = `${w[1]}|${w[0]}`;
      if (vus.has(cle) || !r.plans.some((p) => w[1] >= p.de && w[1] < p.a)) continue;
      vus.add(cle);
      mots.push([...w] as Mot);
    }
  return mots.sort((a, b) => a[1] - b[1]);
}

/** Sous-titres « auto » : remplis avec les mots de l'analyse ; sans mots, retirés. */
export function remplirSousTitres(r: Recette, moments: Moment[]): Recette {
  const st = r.sousTitres;
  if (!st || st.mots !== 'auto') return r;
  const mots = motsCouverts(r, moments);
  return { ...r, sousTitres: mots.length > 0 ? { ...st, mots } : null };
}

/** Le brouillon prend la plateforme choisie (YouTube : sous-titres replacés à la hauteur par défaut du 16:9). */
function pourDestination(r: Recette): Recette {
  const d = destinationChoisie.peek();
  if (!d || d === 'tiktok') return r;
  const sousTitres = r.sousTitres ? { ...r.sousTitres, y: undefined } : null;
  return normaliser({ ...r, destination: d, sousTitres }, { sources: r.sources }).recette;
}

function brouillons(propositions: PropositionAgent[], moments: Moment[]): Brouillon[] {
  return propositions.map((p) => ({
    uid: nouvelUid(),
    recette: pourDestination(remplirSousTitres(p.recette, moments)),
    raison: p.raison,
    problemes: p.problemes,
  }));
}

/** La durée visée n'existe pas dans DemandeAgent : elle part au début de la consigne. */
export function consigneAgent(d: DemandeMonteur): string {
  const { min, max } = DUREES[d.duree];
  const libre = d.consigne.replace(/\s+/g, ' ').trim();
  return `Clips de ${min} à ${max} s.${libre ? ` ${libre}` : ''}`;
}

/** Demande envoyée à l'IA pour ce résumé des moments. */
export function demandeAgent(resume: string, d: DemandeMonteur, signal?: AbortSignal): DemandeAgent {
  const source = sourceMonteur.peek();
  return {
    moments: resume,
    nombre: d.nombre,
    consigne: consigneAgent(d),
    sources: source ? [source.infos] : [],
    signal,
  };
}

async function proposer(res: ResultatAnalyse, d: DemandeMonteur, signal: AbortSignal) {
  const source = sourceMonteur.peek();
  if (!source) return;
  if (d.mode === 'sansIA') {
    const { min, max } = DUREES[d.duree];
    // v3 : les signaux du son (déjà calculés par l'analyse : relus du point de reprise) servent à noter chaque scène.
    let signaux: SignauxSource | null = null;
    try {
      signaux = await lireSignauxSource(source, { signal });
    } catch (e) {
      if (estAnnule(e)) throw e;
    }
    // Mots déjà transcrits sur l'appareil (Montage express…) : sous-titres et qui parle sans 2ᵉ passage de Whisper.
    const moments = await avecMotsGardes(source, res.moments);
    const props = clipsSansIA(moments, source.infos, d.nombre, { dureeMin: min, dureeMax: max, signaux, titre: titreSurClips.peek() });
    // Persos de qui parle (l'étape partagée par tous les montages sans IA).
    const debut = Date.now();
    const p = await persosDesClips(source, brouillons(props, moments), {
      signal,
      signaux,
      surProgression: (x, m) => !signal.aborted && (etatAnalyse.value = { phase: 'encours', p: x, message: m || T.monteur.demarrage, debut }),
    });
    if (p.avertissement) console.warn('[Arko]', p.avertissement);
    await terminer(p.brouillons, 0);
    return;
  }
  const f = trouverFournisseur(d.fournisseur);
  const da = demandeAgent(res.resume, d, signal);
  requeteEnvoyee.value = construireRequete(da);
  etatAnalyse.value = { phase: 'ia', fournisseur: f.nom, debut: Date.now() };
  try {
    const cle = await cleGardee(d.fournisseur);
    if (!cle) throw new ErreurArko(T.monteur.cleManque, 'cle_vide');
    const r = await proposerClips(da, { fournisseur: d.fournisseur, cle, modele: d.modele });
    const corrections = r.problemes.length + r.propositions.reduce((s, p) => s + p.problemes.length, 0);
    // Réponse coupée : on le dit clairement (M-4), avec le nombre de clips récupérés.
    const coupe = r.problemes.some((p) => p.chemin === 'reponse' && /coupée/i.test(p.message));
    const coupee = coupe ? { recuperes: r.propositions.length, demandes: d.nombre } : undefined;
    await terminer(brouillons(r.propositions, res.moments), corrections, coupee);
  } catch (e) {
    if (estAnnule(e)) throw e;
    etatAnalyse.value = { phase: 'erreurIA', message: message(e) };
  }
}

async function terminer(
  b: Brouillon[],
  corrections: number,
  coupee?: { recuperes: number; demandes: number },
) {
  const source = sourceMonteur.peek();
  if (source) await commencerRevue(source.infos, b);
  signalerFinTravail('Arko : l\'analyse est finie');
  etatAnalyse.value = { phase: 'fini', corrections, ...(coupee ? { coupee } : {}) };
}

/** Après une erreur de l'IA : mêmes moments, clips choisis par Arko. */
export async function passerSansIA() {
  const res = resultat.peek();
  regler({ mode: 'sansIA' });
  if (res) await proposer(res, demande.peek(), new AbortController().signal);
}

/** Après une erreur de l'IA : on renvoie la même demande (l'analyse est gardée). */
export async function reessayerIA() {
  const res = resultat.peek();
  if (!res) return void lancerAnalyse();
  const c = new AbortController();
  controleur = c;
  try {
    await proposer(res, demande.peek(), c.signal);
  } catch (e) {
    if (!estAnnule(e)) etatAnalyse.value = { phase: 'erreurIA', message: message(e) };
    else etatAnalyse.value = { phase: 'erreurIA', message: T.monteur.erreurIA };
  } finally {
    if (controleur === c) controleur = null;
  }
}
