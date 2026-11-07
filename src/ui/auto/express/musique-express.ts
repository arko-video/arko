// Musique AUTOMATIQUE du Montage express et du Best-of serré (page) : sur le montage déjà construit (sans musique),
// Arko repère les séquences et leurs ambiances, choisit un morceau par groupe de séquences (auto/son/musique-auto.ts,
// pur), ouvre les fichiers choisis (Ma bibliothèque, Kevin MacLeod téléchargé à la demande ou déjà gardé, ou musique
// fabriquée par Arko), puis donne la piste musique. Un morceau introuvable est remplacé par une musique fabriquée de
// la même ambiance : il y a TOUJOURS de la musique, même sans internet.

import type { AnalyseExpress } from '../../../auto/express/express';
import type { SceneProposee } from '../../../auto/express/scenes';
import { candidatsArko, candidatsBibliotheque, candidatsKevin, morceauxDuPlan, pisteAuto, planifierMusique, remplacerParArko, sequencesDuMontage, type PlanMusique } from '../../../auto/son/musique-auto';
import { fichierPropose, kevinDisponibles } from '../../../auto/son/musiques-arko';
import { fermerSource, importerSon, lireMonSon, type SourceOuverte } from '../../../moteur/api';
import type { PisteMusique, Recette, Source } from '../../../recette/types';
import { ajouterSourceOuverte, idsPris } from '../../etat';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { garderFichier } from '../../sons-gardes';

export interface MusiqueAuto {
  piste: PisteMusique;
  /** Sources audio des morceaux gardés (déjà ouvertes, ajoutées au projet et gardées sur l'appareil). */
  sources: SourceOuverte[];
  plan: PlanMusique;
}

/** Pour `poserMusique` de la chaîne v4 (`MusiquePrete`) : la piste et les infos des sources. */
export function musiquePrete(m: MusiqueAuto | null): { piste: PisteMusique; sources: Source[] } | null {
  return m ? { piste: m.piste, sources: m.sources.map((s) => s.infos) } : null;
}

/** Ouvre le fichier d'un candidat comme source audio du projet (null si impossible). */
async function ouvrir(id: string, signal?: AbortSignal): Promise<SourceOuverte | null> {
  const fichier = id.startsWith('bib:') ? await lireMonSon(id.slice('bib:'.length)) : await fichierPropose(id, signal);
  return fichier ? importerSon(fichier, idsPris()) : null;
}

/**
 * Piste musique automatique pour le montage `sans` (construit SANS musique) ; null s'il n'y a aucune séquence.
 * `scenes` : les séquences gardées sur la revue (temps source). `analyse` : celle du Montage express, ou une
 * `AnalyseV4` (Best-of v4 : ses `signaux` portent les moments v4 ; la piste baisse alors sur la PAROLE,
 * `baisseSur: 'parole'`, car ses tours de parole viennent du détecteur de voix). `o.baisseSur` force le choix.
 */
export async function preparerMusiqueAuto(
  sans: Recette,
  scenes: readonly SceneProposee[],
  analyse: AnalyseExpress & { v?: number },
  signal?: AbortSignal,
  o: { baisseSur?: 'parole' | null } = {},
): Promise<MusiqueAuto | null> {
  const mots = analyse.parole === 'mots' ? analyse.transcription.mots : [];
  const seqs = sequencesDuMontage(sans, scenes, analyse.signaux, mots);
  if (seqs.length === 0) return null;
  await chargerMesSons().catch(() => undefined);
  const candidats = [...candidatsBibliotheque(mesSons.peek()), ...candidatsKevin(await kevinDisponibles()), ...candidatsArko()];
  let plan = planifierMusique(seqs, candidats);
  const ouvertes = new Map<string, SourceOuverte>();
  // Les remplacements sont des musiques fabriquées (toujours possibles) : 3 tours suffisent.
  for (let tour = 0; tour < 3; tour++) {
    const manquants = [...new Set(plan.groupes.map((g) => g.morceau))].filter((id) => !ouvertes.has(id));
    if (manquants.length === 0) break;
    for (const id of manquants) {
      const s = await ouvrir(id, signal).catch((e: unknown) => (console.warn('Musique non ouverte', id, e), null));
      if (s) ouvertes.set(id, s);
      else plan = remplacerParArko(plan, id);
    }
  }
  const morceaux = morceauxDuPlan(plan, (id) => ouvertes.get(id)?.infos.id);
  const sources: SourceOuverte[] = [];
  for (const s of ouvertes.values()) {
    if (morceaux.some((m) => m.src === s.infos.id)) {
      ajouterSourceOuverte(s);
      garderFichier(s);
      sources.push(s);
    } else fermerSource(s);
  }
  return morceaux.length > 0 ? { piste: pisteAuto(morceaux, analyse, o.baisseSur), sources, plan } : null;
}
