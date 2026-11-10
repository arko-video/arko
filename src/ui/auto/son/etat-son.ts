// État et actions du Montage auto « Son » dans Habiller → Sons (dev 3) : panneau ouvert (bruitages ou musique),
// propositions de bruitages (revue : écouter / changer / retirer, puis « Tout poser »), liste des déclencheurs gardée
// sur l'appareil, morceaux de la musique. La recette ne change QUE par recette/operations-son-auto.ts (un seul Annuler).

import { signal } from '@preact/signals';
import { BRUITAGES, dureeBruitage, proposerBruitages, type PropositionBruitage } from '../../../auto/son/bruitages';
import { choisirSon, type ChoixSon } from '../../../auto/son/choix-son';
import { proposerEchos } from '../../../auto/son/echos';
import { rejete } from '../../../auto/apprentissage/gouts';
import { gouts, memoriserMontageAuto } from '../../apprentissage';
import { ACCENTS, proposerAccents, sonsAccent, type FamilleAccent } from '../../../auto/son/accents';
import { ajouterSon, ajouterSource } from '../../../recette/operations-effets';
import { DECLENCHEURS_DEFAUT, lireDeclencheurs, type Declencheur } from '../../../auto/son/declencheurs';
import { fichierPropose, kevinGardes } from '../../../auto/son/musiques-arko';
import { lireSignauxSource } from '../../../auto/signaux-source';
import type { SignauxSource } from '../../../auto/types';
import { catalogueSons, ErreurArko, estBruitage, importerSon, lireMonSon, type MonSon, type SourceOuverte } from '../../../moteur/api';
import { MUSIQUE, VOLUME_FINAL } from '../../../recette/normaliser-auto-son';
import { choisirVolumeFinal, definirMusique, poserBruitages, remplacerMorceauMusique, retirerBruitagesAuto, type BruitagePose } from '../../../recette/operations-son-auto';
import type { MorceauMusique, PisteMusique, Recette, Source } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { afficherToast, ajouterSourceOuverte, idsPris, modifier, quandProjetQuitte, recette, recetteTemporaire, sources, teteLecture } from '../../etat';
import { lireExtrait } from '../../lecture';
import { compiler, sortiesDe } from '../../../recette/chronologie';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { ecouterFichier } from '../../ecoute-sons';
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
export async function ouvrirBruitages(o: { bibliothequeSeule?: boolean } = {}) {
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
  // Plus dense qu'avant (1 toutes les 2 min, trop peu : « ça enlève du dynamisme ») : 2 par minute, après la phrase.
  const src = source?.infos.id ?? r.sources[0]?.id ?? '';
  const sc = compiler(r);
  const occupes = [...(r.incrustations ?? []).map((i) => i.t), ...sc.sons.map((x) => x.t)];
  // Goûts appris (exports précédents) : densité, et jamais un son que l'utilisateur retire toujours.
  const g = gouts.peek();
  const parMinute = Math.max(0.5, Math.round(2 * g.densite.bruitages * 2) / 2);
  const permis = mesSons.peek().filter((x) => estBruitage(x) && !rejete(g, x.nom));
  const props = proposerBruitages(mots, src, signaux, declencheurs.peek(), { parMinute, seuilSurete: 3, placement: 'reaction' }).filter((p) => {
    const t = sortiesDe(sc, p.src, p.ts)[0];
    return t !== undefined && !occupes.some((o) => Math.abs(o - t) < 1.5);
  });
  // Échos : la réplique de Mes sons dont le NOM reprend ce qu'on vient de dire (« FBI », « John Cena »…), prioritaires.
  const echos = proposerEchos(mots, src, signaux, permis, { parMinute }).filter((p) => {
    const t = sortiesDe(sc, p.src, p.ts)[0];
    return t !== undefined && !occupes.some((o) => Math.abs(o - t) < 1.5);
  });
  const lignesEchos: LigneRevue[] = echos.map((e) => ({ ...e, choix: { type: 'mesSons', id: e.son, nom: e.nomSon }, garde: true }));
  const pris = new Set<string>(echos.map((e) => e.son));
  const lignes = props.filter((p) => !echos.some((e) => Math.abs(e.ts - p.ts) < 4)).map((p) => {
    // Un son retiré pour ce genre de moment n'est plus proposé pour lui (il reste permis ailleurs).
    const choix = choisirSon(p.categorie, permis.filter((x) => !rejete(g, x.nom, p.categorie)), { eviter: pris });
    pris.add(choix.id);
    // Cochés d'office quand le son vient de TA bibliothèque (presque tout en auto) ; décocher reste possible.
    return { ...p, choix, garde: choix.type === 'mesSons' };
  });
  const tout = [...lignesEchos, ...lignes].sort((a, b) => a.ts - b.ts);
  // Romain (10/11) : jamais les sons d'Arko, seulement ceux de sa bibliothèque (quelle que soit l'option).
  const seule = o.bibliothequeSeule ?? true;
  const gardees = seule ? tout.filter((l) => l.choix.type === 'mesSons') : tout;
  if (seule && gardees.length === 0) {
    // YouTube sans sons à toi qui conviennent : on ne montre pas une revue vide.
    revue.value = null;
    panneauSonAuto.value = null;
    return;
  }
  revue.value = gardees;
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
  return { pose: { id, ts: l.ts, src: l.src, vol: l.vol, dur: Math.min(dureeBruitage(duree), l.dur), fondu: l.fondu, pour: l.categorie }, source };
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
export async function copierMonSon(id: string): Promise<SourceOuverte> {
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
    if (modifier((r) => poserBruitages(r, poses, [...infos.values()]))) {
      afficherToast(TA.son.bruitages.poses(poses.length), 3000);
      memoriserMontageAuto(recette.peek());
    }
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

/**
 * Morceaux posés à la main au plus (avant : 6). Une vidéo de 25 à 30 min en a ~8 en musique automatique ; la recette
 * en accepte 20.
 */
export const MORCEAUX_MAX_PANNEAU = 12;

/** Morceau à remplacer (indice) : les listes « Ajouter » deviennent « Remplacer » ; null = ajouter. */
export const morceauARemplacer = signal<number | null>(null);
/** Morceaux de Kevin MacLeod déjà gardés sur l'appareil (ids). */
export const kevinSurAppareil = signal<ReadonlySet<string>>(new Set());

/** D'où vient un morceau : Mes sons, un fichier, ou une musique proposée par Arko (« kevin:… », « arko:… »). */
export type DepuisMorceau = { monSon: MonSon } | { fichier: File } | { propose: string };

/** Relit quels morceaux de Kevin MacLeod sont sur l'appareil (onglet « Musiques d'Arko »). */
export async function chargerMusiquesArko() {
  kevinSurAppareil.value = await kevinGardes();
}

async function ouvrirMorceau(depuis: DepuisMorceau): Promise<SourceOuverte> {
  if ('monSon' in depuis) return copierMonSon(depuis.monSon.id);
  const f = 'fichier' in depuis ? depuis.fichier : await fichierPropose(depuis.propose);
  if (!f) throw new ErreurArko(TA.son.bruitages.introuvable, 'introuvable');
  const source = await importerSon(f, idsPris());
  ajouterSourceOuverte(source);
  garderFichier(source);
  return source;
}

/**
 * Ajoute un morceau : au début s'il n'y a pas de musique, sinon à la tête de lecture. En mode « Remplacer »
 * (`morceauARemplacer`), le morceau choisi prend la place du morceau remplacé (même début, même fin). Un seul Annuler.
 */
export async function ajouterMorceau(depuis: DepuisMorceau) {
  const morceaux = morceauxActuels();
  const remplace = morceauARemplacer.peek();
  if ((remplace === null || !morceaux[remplace]) && morceaux.length >= MORCEAUX_MAX_PANNEAU) return afficherToast(TA.son.musique.maxMorceaux);
  attenteSon.value = TA.son.musique.chargement;
  try {
    const source = await ouvrirMorceau(depuis);
    if ('propose' in depuis && depuis.propose.startsWith('kevin:')) void chargerMusiquesArko();
    if (remplace !== null && morceaux[remplace]) {
      // Même place ; le nouveau morceau se lit depuis son début. Un seul Annuler.
      modifier((r) => remplacerMorceauMusique(r, remplace, source.infos));
      morceauARemplacer.value = null;
      return;
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

/** Écoute une musique proposée par Arko (télécharge le morceau de Kevin MacLeod s'il n'est pas encore là). */
export async function ecouterPropose(id: string) {
  attenteSon.value = TA.son.musique.chargement;
  try {
    const f = await fichierPropose(id);
    if (f) await ecouterFichier(f, id);
    if (id.startsWith('kevin:')) void chargerMusiquesArko();
  } catch {
    afficherToast(TA.son.musique.telechargementRate, 5000);
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

export function reglerMusique(partiel: { vol?: number; baisse?: boolean; baisseSur?: 'parole' | undefined }) {
  changerPiste(partiel);
}

/** Volume affiché en dB (0,14 → « −17 »). */
export function volEnDb(vol = MUSIQUE.vol): number {
  return Math.round(20 * Math.log10(Math.max(0.001, vol)));
}

/**
 * Accents du Montage auto (TikTok) : whoosh sur les transitions, pop sur les punchlines, impact sur les gros zooms,
 * pris dans Mes sons d'abord (auto/son/accents.ts), en UNE opération (un Annuler les retire). Renvoie le nombre posé.
 */
export async function poserAccentsAuto(apres = 0, o: { bibliothequeSeule?: boolean; silencieux?: boolean } = {}): Promise<number> {
  const r0 = recette.peek();
  if (!r0) return 0;
  await chargerMesSons();
  const g = gouts.peek();
  const accents = proposerAccents(r0, { apres, facteur: g.densite.accents });
  if (accents.length === 0) return 0;
  const mes = mesSons.peek().filter((x) => estBruitage(x) && !rejete(g, x.nom));
  const parFamille = new Map<FamilleAccent, MonSon[]>();
  const n = new Map<FamilleAccent, number>();
  const prets: { id: string; t: number; dur: number; source: SourceOuverte | null; pour: string }[] = [];
  for (const a of accents) {
    if (!parFamille.has(a.famille)) parFamille.set(a.famille, sonsAccent(a.famille, mes.filter((x) => !rejete(g, x.nom, a.famille))).slice(0, 3) as MonSon[]);
    const liste = parFamille.get(a.famille)!;
    const k = n.get(a.famille) ?? 0;
    n.set(a.famille, k + 1);
    const mien = liste.length > 0 ? liste[k % liste.length]! : null;
    if (mien) {
      const source = copiesRevue.get(mien.id) ?? (await copierMonSon(mien.id).catch(() => null));
      if (!source) continue;
      copiesRevue.set(mien.id, source);
      prets.push({ id: source.infos.id, t: a.t, dur: Math.min(ACCENTS.durMax, source.infos.duree), source, pour: a.famille });
    }
    // Pas de son à toi pour cette famille : rien (Romain, 10/11 : jamais les sons d'Arko).
  }
  const vol = Math.round(10 ** (ACCENTS.gainDb / 20) * 1000) / 1000;
  let poses = 0;
  const ok = modifier((r) => {
    let res = r;
    for (const p of prets) {
      if (p.source) res = ajouterSource(res, p.source.infos);
      const x = ajouterSon(res, { id: p.id, t: p.t, vol, role: 'accent', dur: p.dur, fondu: ACCENTS.fondu, pour: p.pour });
      if (x.i >= 0) {
        res = x.recette;
        poses++;
      }
    }
    return res;
  });
  if (ok && poses > 0 && !o.silencieux) afficherToast(`${poses} effets de rythme posés (whoosh, pop, impact).`, 6000);
  return ok ? poses : 0;
}