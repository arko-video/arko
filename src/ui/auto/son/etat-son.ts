// État et actions du Montage auto « Son » dans Habiller → Sons (dev 3) : panneau ouvert (bruitages ou musique),
// propositions de bruitages (revue : écouter / changer / retirer, puis « Tout poser »), liste des déclencheurs gardée
// sur l'appareil, morceaux de la musique. La recette ne change QUE par recette/operations-son-auto.ts (un seul Annuler).

import { signal } from '@preact/signals';
import { BRUITAGES, dureeBruitage, proposerBruitages, type PropositionBruitage } from '../../../auto/son/bruitages';
import { choisirSon, type ChoixSon } from '../../../auto/son/choix-son';
import { DECLENCHEURS_DEFAUT, lireDeclencheurs, type Declencheur } from '../../../auto/son/declencheurs';
import { lireSignauxSource } from '../../../auto/signaux-source';
import type { SignauxSource } from '../../../auto/types';
import { catalogueSons, ErreurArko, estBruitage, importerSon, lireMonSon, type MonSon, type SourceOuverte } from '../../../moteur/api';
import { MUSIQUE, VOLUME_FINAL } from '../../../recette/normaliser-auto-son';
import { choisirVolumeFinal, definirMusique, poserBruitages, retirerBruitagesAuto, type BruitagePose } from '../../../recette/operations-son-auto';
import type { MorceauMusique, PisteMusique, Recette, Source } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { afficherToast, ajouterSourceOuverte, idsPris, modifier, quandProjetQuitte, recette, recetteTemporaire, sources, teteLecture } from '../../etat';
import { lireExtrait } from '../../lecture';
import { compiler, sortiesDe } from '../../../recette/chronologie';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { garderFichier } from '../../sons-gardes';

export const CLE_DECLENCHEURS = 'arko.declencheurs';

/** Panneau du Montage auto ouvert dans l'outil Sons (null = la liste habituelle). */
export const panneauSonAuto = signal<'bruitages' | 'musique' | null>(null);
/** Une proposition de la revue, avec le son choisi. */
export interface LigneRevue extends PropositionBruitage {
  choix: ChoixSon;
  /** Cochée par l'utilisateur après écoute (jamais d'office : rien n'est posé sans validation). */
  garde?: boolean;
}
export const revue = signal<LigneRevue[] | null>(null);
/** Message d'attente (« J'écoute le son… »), ou null. */
export const attenteSon = signal<string | null>(null);
/** Proposition écoutée dans la vidéo en ce moment (indice), ou null. */
export const contexteEnCours = signal<number | null>(null);
export const declencheurs = signal<Declencheur[]>(lireDeclencheursGardes());

function lireDeclencheursGardes(): Declencheur[] {
  try {
    return lireDeclencheurs(localStorage.getItem(CLE_DECLENCHEURS));
  } catch {
    return lireDeclencheurs(null);
  }
}

/** Change les mots d'une catégorie (liste éditable gardée sur l'appareil). `null` = liste de départ. */
export function changerDeclencheurs(liste: Declencheur[] | null) {
  declencheurs.value = liste ?? DECLENCHEURS_DEFAUT.map((d) => ({ ...d, mots: [...d.mots] }));
  try {
    if (liste) localStorage.setItem(CLE_DECLENCHEURS, JSON.stringify(liste.map((d) => ({ categorie: d.categorie, mots: d.mots }))));
    else localStorage.removeItem(CLE_DECLENCHEURS);
  } catch {
    /* stockage bloqué : la liste vaut pour cette session */
  }
}

/** Source vidéo des mots transcrits, ouverte. */
function sourceDesMots(r: Recette): SourceOuverte | undefined {
  const src = r.sousTitres?.src ?? r.sources.find((s) => s.type === 'video')?.id;
  return sources.peek().find((s) => s.infos.id === src);
}

/** Ouvre la revue : propositions sur les mots transcrits (+ rires, jurons criés, blancs si le son a été écouté). */
export async function ouvrirBruitages() {
  panneauSonAuto.value = 'bruitages';
  const r = recette.peek();
  const mots = r?.sousTitres && Array.isArray(r.sousTitres.mots) ? r.sousTitres.mots : [];
  if (!r || mots.length === 0) {
    revue.value = [];
    return;
  }
  const source = sourceDesMots(r);
  let signaux: SignauxSource | null = null;
  if (source) {
    attenteSon.value = TA.son.bruitages.ecoute;
    try {
      signaux = await lireSignauxSource(source, { surProgression: (p) => (attenteSon.value = TA.son.bruitages.ecouteP(Math.round(p * 100))) });
    } catch (e) {
      console.warn('[Arko] signaux indisponibles : bruitages sur les mots seuls', e);
    } finally {
      attenteSon.value = null;
    }
  }
  await chargerMesSons();
  const props = proposerBruitages(mots, source?.infos.id ?? r.sources[0]?.id ?? '', signaux, declencheurs.peek());
  const pris = new Set<string>();
  revue.value = props.map((p) => {
    const choix = choisirSon(p.categorie, mesSons.peek().filter(estBruitage), { eviter: pris });
    pris.add(choix.id);
    return { ...p, choix };
  });
}

export function basculerGarde(i: number) {
  revue.value = (revue.peek() ?? []).map((l, k) => (k === i ? { ...l, garde: !l.garde } : l));
}

export function retirerDeLaRevue(i: number) {
  revue.value = (revue.peek() ?? []).filter((_, k) => k !== i);
}

export function changerSonRevue(i: number, choix: ChoixSon) {
  revue.value = (revue.peek() ?? []).map((l, k) => (k === i ? { ...l, choix } : l));
}

/** Nom affiché d'un choix. */
export function nomChoix(c: ChoixSon): string {
  return c.type === 'mesSons' ? c.nom : `${TA.son.bruitages.sonArko} · ${catalogueSons.find((s) => s.id === c.id)?.nom ?? c.id}`;
}

/** Sons de Mes sons déjà copiés dans le projet pendant la revue (écoute dans la vidéo, puis pose). */
const copiesRevue = new Map<string, SourceOuverte>();
quandProjetQuitte(() => copiesRevue.clear());

/** Le bruitage d'une ligne, prêt à poser (copie le son de Mes sons dans le projet si besoin) ; null si introuvable. */
async function poseDe(l: LigneRevue): Promise<{ pose: BruitagePose; source: SourceOuverte | null } | null> {
  let id = l.choix.id;
  let duree = catalogueSons.find((s) => s.id === id)?.duree ?? BRUITAGES.durMax;
  let source: SourceOuverte | null = null;
  if (l.choix.type === 'mesSons') {
    source = copiesRevue.get(l.choix.id) ?? (await copierMonSon(l.choix.id).catch(() => null));
    if (!source) return null;
    copiesRevue.set(l.choix.id, source);
    id = source.infos.id;
    duree = source.infos.duree;
  }
  // Jamais plus long que la place laissée avant que quelqu'un reparle (l.dur).
  return { pose: { id, ts: l.ts, src: l.src, vol: l.vol, dur: Math.min(dureeBruitage(duree), l.dur), fondu: l.fondu }, source };
}

/** « Écouter dans la vidéo » : l'aperçu joue 2 s avant le bruitage jusqu'à 2 s après sa fin, sans rien poser. */
export async function ecouterContexte(i: number) {
  const l = revue.peek()?.[i];
  const r = recette.peek();
  if (!l || !r) return;
  const p = await poseDe(l);
  if (!p) return afficherToast(TA.son.bruitages.introuvable);
  const essai = poserBruitages(r, [p.pose], p.source ? [p.source.infos] : []);
  const t = sortiesDe(compiler(essai), l.src, l.ts)[0];
  if (t === undefined) return afficherToast(TA.son.bruitages.horsMontage);
  recetteTemporaire.value = essai;
  contexteEnCours.value = i;
  lireExtrait(t - 2, t + p.pose.dur + 2, () => {
    if (recetteTemporaire.peek() === essai) recetteTemporaire.value = null;
    if (contexteEnCours.peek() === i) contexteEnCours.value = null;
  });
}

/** Copie un son de Mes sons dans le projet (source audio « aN », gardée avec le projet). Même chemin que poserMonSon. */
async function copierMonSon(id: string): Promise<SourceOuverte> {
  const f = await lireMonSon(id);
  if (!f) throw new ErreurArko(TA.son.bruitages.introuvable, 'introuvable');
  const source = await importerSon(f, idsPris());
  ajouterSourceOuverte(source);
  garderFichier(source);
  return source;
}

/** Pose les bruitages COCHÉS (copie les sons de Mes sons dans le projet), d'un coup : un seul Annuler. */
export async function toutPoser() {
  const lignes = (revue.peek() ?? []).filter((l) => l.garde);
  if (lignes.length === 0) return;
  attenteSon.value = TA.son.bruitages.pose;
  try {
    const poses: BruitagePose[] = [];
    const infos = new Map<string, Source>();
    for (const l of lignes) {
      const p = await poseDe(l);
      if (!p) continue;
      poses.push(p.pose);
      if (p.source) infos.set(p.source.infos.id, p.source.infos);
    }
    if (modifier((r) => poserBruitages(r, poses, [...infos.values()]))) afficherToast(TA.son.bruitages.poses(poses.length), 3000);
    revue.value = null;
    panneauSonAuto.value = null;
  } catch (e) {
    afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 5000);
  } finally {
    attenteSon.value = null;
  }
}

export function retirerTousLesBruitages() {
  if (modifier(retirerBruitagesAuto)) afficherToast(TA.son.bruitages.retires);
}

/* ------------------------------------------------------------------ musique */

/** Morceaux de la musique actuelle. */
function morceauxActuels(): MorceauMusique[] {
  return recette.peek()?.musique?.morceaux.map((m) => ({ ...m })) ?? [];
}

function changerPiste(partiel: Partial<PisteMusique>, morceaux = morceauxActuels(), nouvelles: Source[] = [], ensuite = (r: Recette) => r) {
  const piste = recette.peek()?.musique;
  modifier((r) => ensuite(definirMusique(r, morceaux.length > 0 ? { ...piste, ...partiel, morceaux } : null, nouvelles)));
}

/** Ajoute un morceau (son de Mes sons ou fichier) : au début s'il n'y a pas de musique, sinon à la tête de lecture. */
export async function ajouterMorceau(depuis: { monSon: MonSon } | { fichier: File }) {
  const morceaux = morceauxActuels();
  if (morceaux.length >= 6) return afficherToast(TA.son.musique.maxMorceaux);
  attenteSon.value = TA.son.musique.chargement;
  try {
    let source: SourceOuverte;
    if ('monSon' in depuis) source = await copierMonSon(depuis.monSon.id);
    else {
      source = await importerSon(depuis.fichier, idsPris());
      ajouterSourceOuverte(source);
      garderFichier(source);
    }
    const t = morceaux.length === 0 ? 0 : Math.round(teteLecture.peek() * 100) / 100;
    const liste = [...morceaux.filter((m) => m.t !== t), { src: source.infos.id, t }].sort((a, b) => a.t - b.t);
    // Le volume final va avec la musique (YouTube et TikTok) : réglé ici, on peut l'enlever dans Exporter. Un seul Annuler.
    const volume = (r: Recette) => (r.volumeFinal ? r : choisirVolumeFinal(r, { lufs: VOLUME_FINAL.lufs, crete: VOLUME_FINAL.crete }));
    changerPiste({}, liste, [source.infos], morceaux.length === 0 ? volume : undefined);
  } catch (e) {
    afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 5000);
  } finally {
    attenteSon.value = null;
  }
}

export function retirerMorceau(i: number) {
  changerPiste({}, morceauxActuels().filter((_, k) => k !== i));
}

export function retirerMusique() {
  modifier((r) => definirMusique(r, null, []));
}

export function reglerMusique(partiel: { vol?: number; baisse?: boolean }) {
  changerPiste(partiel);
}

/** Volume affiché en dB (0,14 → « −17 »). */
export function volEnDb(vol = MUSIQUE.vol): number {
  return Math.round(20 * Math.log10(Math.max(0.001, vol)));
}
