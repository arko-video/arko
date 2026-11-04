// Effets sonores du rendu (phase 3) : sons posés par l'utilisateur, sons importés et sons des transitions.
// 1. preparerEffets() charge UNE fois le PCM de chaque son utilisé (avant la lecture ou l'export) et le place
//    en temps de sortie ;
// 2. pour chaque bloc mixé, effetsDuBloc() ne garde que les sons qui y tombent.
// Le son guide n'est PAS ici : il est lu à la demande, et seulement dans l'aperçu (voir rendre.ts).

import type { Scenario } from '../../recette/chronologie';
import { SON, TRANSITIONS } from '../../recette/defauts';
import type { Recette } from '../../recette/types';
import { chargerSon, type SonDecode } from '../../sons/chargeur';
import type { SonPose } from './mixeur';
import type { Pcm } from './reechantillonner';

/** Charge un son du catalogue (par défaut : sons/chargeur.ts, du dev sons). */
export type ChargeurCatalogue = (id: string) => Promise<SonDecode>;
/**
 * Lit un morceau d'un son importé (source audio `id`) entre `de` et `a`, en secondes dans son fichier.
 * Le PCM peut commencer un peu avant `de` (voir pcm.debut). Aperçu : pcmSource du dev sons (sons/import.ts) ;
 * export (Worker, sans SourceOuverte) : le LecteurAudio de la source dans le cache de décodage.
 */
export type LireImporte = (id: string, de: number, a: number) => Promise<Pcm | null>;

export interface OptionsEffets {
  chargerSon?: ChargeurCatalogue;
  lireImporte?: LireImporte;
}

/** On cherche le « moment fort » d'un son de transition au plus tard 0,5 s après son début. */
const PIC_MAX_S = 0.5;

/** Sons du catalogue déjà prêts, par chargeur puis par id (gardés d'un rendu à l'autre). */
const deja = new WeakMap<ChargeurCatalogue, Map<string, Promise<Pcm>>>();

function pcmCatalogue(id: string, charger: ChargeurCatalogue): Promise<Pcm> {
  let parId = deja.get(charger);
  if (!parId) deja.set(charger, (parId = new Map()));
  let p = parId.get(id);
  if (!p) {
    // Les canaux du chargeur sont partagés avec son cache : on ne les modifie JAMAIS (le mixeur ne fait que lire).
    p = charger(id).then((s) => ({ frequence: s.frequence, debut: 0, canaux: s.canaux }));
    // Un échec n'est pas gardé : on réessaiera au prochain rendu.
    p.catch(() => parId.delete(id));
    parId.set(id, p);
  }
  return p;
}

/** Instant (s) du moment fort d'un son : là où son enveloppe (fenêtres de 5 ms) est la plus haute. */
export function instantFort(pcm: Pcm): number {
  const c = pcm.canaux[0];
  if (!c) return 0;
  const fenetre = Math.max(1, Math.round(pcm.frequence * 0.005));
  const fin = Math.min(c.length, Math.round(PIC_MAX_S * pcm.frequence));
  let meilleur = 0;
  let ou = 0;
  for (let k = 0; k < fin; k += fenetre) {
    let somme = 0;
    for (let j = k; j < Math.min(fin, k + fenetre); j++) somme += c[j]! * c[j]!;
    if (somme > meilleur) {
      meilleur = somme;
      ou = k;
    }
  }
  return ou / pcm.frequence;
}

/** Son de la transition d'entrée d'un plan : celui donné, celui par défaut, ou aucun (son: false). */
export function sonDeTransition(trans: Scenario['plans'][number]['trans']): string | null {
  if (!trans || trans.son === false) return null;
  if (typeof trans.son === 'string' && trans.son) return trans.son;
  return TRANSITIONS.find((x) => x.id === trans.type)?.son ?? null;
}

/** Ids des sources audio (sons importés) de la recette. */
export function sourcesAudio(recette: Recette): Set<string> {
  return new Set(recette.sources.filter((s) => s.type === 'audio').map((s) => s.id));
}

/**
 * Charge UNE fois le PCM des sons du catalogue (posés par l'utilisateur et sons des transitions) et les place
 * en temps de sortie (triés). Les sons importés n'y sont pas : ils sont lus par morceaux (importesDuBloc).
 * Ne rejette jamais : un son indisponible est simplement sauté.
 */
export async function preparerEffets(scenario: Scenario, recette: Recette, options: OptionsEffets = {}): Promise<SonPose[]> {
  const charger = options.chargerSon ?? chargerSon;
  const audios = sourcesAudio(recette);
  const pcmDe = (id: string): Promise<Pcm | null> =>
    pcmCatalogue(id, charger).catch((e: unknown) => {
      console.warn(`[Arko] son "${id}" indisponible`, e);
      return null;
    });

  const attentes: Promise<SonPose | null>[] = [];
  // Sons posés par l'utilisateur (déjà convertis en temps de sortie par la chronologie).
  for (const pose of scenario.sons) {
    if (audios.has(pose.element.id)) continue;
    const vol = pose.element.vol ?? SON.vol;
    attentes.push(pcmDe(pose.element.id).then((pcm) => (pcm ? { t: pose.t, vol, pcm } : null)));
  }
  // Sons des transitions : le moment fort du son tombe sur la coupe (un whoosh démarre donc un peu avant).
  for (const plan of scenario.plans) {
    const id = sonDeTransition(plan.trans);
    if (!id) continue;
    attentes.push(pcmDe(id).then((pcm) => (pcm ? { t: Math.max(0, plan.t0 - instantFort(pcm)), vol: SON.vol, pcm } : null)));
  }
  const poses = (await Promise.all(attentes)).filter((p): p is SonPose => p !== null);
  return poses.sort((a, b) => a.t - b.t);
}

/** Morceaux des sons importés qui s'entendent dans [t0, t1[ (lus à la demande : jamais tout le fichier). */
export async function importesDuBloc(scenario: Scenario, recette: Recette, t0: number, t1: number, lire: LireImporte): Promise<SonPose[]> {
  const res: SonPose[] = [];
  for (const pose of scenario.sons) {
    const source = recette.sources.find((s) => s.id === pose.element.id && s.type === 'audio');
    if (!source || pose.t >= t1 || pose.t + source.duree <= t0) continue;
    const pcm = await lire(source.id, Math.max(0, t0 - pose.t), t1 - pose.t).catch(() => null);
    // Le temps 0 du fichier se joue à pose.t : le premier échantillon (temps pcm.debut) à pose.t + pcm.debut.
    if (pcm) res.push({ t: pose.t + pcm.debut, vol: pose.element.vol ?? SON.vol, pcm });
  }
  return res;
}

/** Durée (s) d'un son posé. */
export function dureeSon(p: SonPose): number {
  return (p.pcm.canaux[0]?.length ?? 0) / p.pcm.frequence;
}

/** Les sons qui s'entendent dans le bloc [t0, t1[. */
export function effetsDuBloc(poses: readonly SonPose[], t0: number, t1: number): SonPose[] {
  return poses.filter((p) => p.t < t1 && p.t + dureeSon(p) > t0);
}
