// Monteur IA, A6 : appliquer un plan VALIDÉ (plan.ts) — séquences du plan = scènes gardées (dans l'ordre du plan),
// accroche au temps choisi par le monteur (sinon le meilleur moment, comme d'habitude), puis toute la chaîne du
// Montage express (jump cuts, punchlines, zooms, musique, volume, persos). Pur. Les effets viennent en A7 / A8.

import { construireMontageExpress, type AnalyseExpress, type ReglagesExpress, type RessourcesExpress } from '../express/express';
import { dureeApresCoupe, motsDans, type SceneProposee } from '../express/scenes';
import { compiler, sortiesDe } from '../../recette/chronologie';
import { TYPES_TRANSITION } from '../../recette/defauts';
import { ajouterTexte } from '../../recette/operations-habillage';
import { ajouterZoom, choisirTransition } from '../../recette/operations-effets';
import type { Recette, Sec } from '../../recette/types';
import type { EffetPlan, PlanMonteur } from './plan';

/** Les séquences du plan, prêtes pour le montage (toutes gardées, durée après coupes estimée). */
export function scenesDuPlan(plan: PlanMonteur, a: Pick<AnalyseExpress, 'transcription' | 'signaux'>): SceneProposee[] {
  const mots = a.transcription?.mots ?? [];
  return plan.sequences.map((s, i) => ({
    de: s.de,
    a: s.a,
    titre: s.titre || `Partie ${i + 1}`,
    raison: s.pourquoi || 'Choisie par le monteur IA',
    score: 100,
    garde: true,
    duree: Math.round(dureeApresCoupe(motsDans(mots, s), a.signaux ?? null, s) * 10) / 10,
  }));
}

export interface ResultatPlan {
  recette: Recette;
  journal: string[];
}

export function appliquerPlan(recette: Recette, analyse: AnalyseExpress, plan: PlanMonteur, reglages: ReglagesExpress, ressources: RessourcesExpress): ResultatPlan {
  const journal: string[] = [];
  const scenes = scenesDuPlan(plan, analyse);
  if (scenes.length === 0) return { recette, journal: ['Le plan n\'a aucune séquence : rien n\'est monté.'] };
  const ac = plan.accroche;
  const dansUneSequence = ac !== null && plan.sequences.some((s) => ac.de >= s.de && ac.de < s.a);
  if (ac && !dansUneSequence) journal.push('L\'accroche du plan n\'est dans aucune séquence gardée : Arko prend le meilleur moment.');
  const r = construireMontageExpress(recette, analyse, scenes, { ...reglages, accroche: reglages.accroche || ac !== null }, ressources, {
    ...(ac && dansUneSequence ? { accrocheSource: ac.de, dureeAccroche: Math.max(2, ac.a - ac.de), texteAccroche: ac.texte || null } : {}),
  });
  const src = r.sources.find((x) => x.type === 'video')?.id;
  if (!src || r === recette) return { recette: r, journal };
  const e = poserEffetsSimples(r, plan.effets, src);
  return { recette: e.recette, journal: [...journal, ...e.journal] };
}

/**
 * A7. Zooms, textes et transitions du plan (temps SOURCE, comme les phrases du dossier). Un effet dont le moment a
 * été coupé du montage est sauté (noté). Zoom : suit les coupes (ts) ; texte : en temps de sortie, 2,2 s ;
 * transition : à l'entrée du plan qui commence le plus près du moment. Pur.
 */
export function poserEffetsSimples(r0: Recette, effets: readonly EffetPlan[], src: string): ResultatPlan {
  const sc = compiler(r0);
  let r = r0;
  let hors = 0;
  for (const e of effets) {
    if (e.type !== 'zoom' && e.type !== 'texte' && e.type !== 'transition') continue;
    // Le moment tombe dans un blanc coupé juste avant un plan (moins d'1 s) : on prend le début de ce plan.
    const t = sortiesDe(sc, src, e.t)[0] ?? sc.plans.find((p) => p.src === src && p.de >= e.t && p.de - e.t < 1)?.t0;
    if (t === undefined) {
      hors++;
      continue;
    }
    if (e.type === 'zoom') r = ajouterZoom(r, { ts: e.t, src, force: Number(e.quoi) || 1.3, style: 'punch', dur: 0.8 }).recette;
    else if (e.type === 'texte') r = ajouterTexte(r, { txt: e.quoi.toUpperCase(), t, dur: 2.2, style: 'alerte' }).recette;
    else {
      let i = -1;
      let ecart = Infinity;
      sc.plans.forEach((p, k) => {
        if (k > 0 && !p.ins && Math.abs(p.t0 - t) < ecart) {
          ecart = Math.abs(p.t0 - t);
          i = p.i;
        }
      });
      const type = (TYPES_TRANSITION as readonly string[]).includes(e.quoi) ? e.quoi : 'glisse';
      if (i > 0 && ecart < 3) r = choisirTransition(r, i, { type, son: false });
    }
  }
  return { recette: r, journal: hors > 0 ? [`${hors} effet${hors > 1 ? 's' : ''} sur un moment coupé du montage : sauté${hors > 1 ? 's' : ''}.`] : [] };
}

/**
 * 11/11/2026 (Romain : « Arko fait un bon dérush, place bien les persos et la musique ; l'autre fout le bordel ») :
 * le plan du monteur IA ne REMPLACE plus le montage d'Arko. Ses séquences deviennent des SUGGESTIONS : celles qui ne
 * touchent aucun morceau du montage d'Arko (à ajouter), et les morceaux d'Arko qu'aucune séquence du plan ne couvre (à
 * retirer, selon lui). Temps source. Pure.
 */
export function suggestionsSequences(plan: Pick<PlanMonteur, 'sequences'>, montage: readonly { de: Sec; a: Sec }[]): { ajouter: PlanMonteur['sequences']; retirer: { de: Sec; a: Sec }[] } {
  const recouvre = (x: { de: Sec; a: Sec }, y: { de: Sec; a: Sec }) => x.de < y.a && x.a > y.de;
  // Morceaux contigus du montage regroupés (Couper les blancs découpe une séquence en dizaines de petits plans).
  const blocs: { de: Sec; a: Sec }[] = [];
  for (const p of [...montage].sort((x, y) => x.de - y.de)) {
    const der = blocs[blocs.length - 1];
    if (der && p.de - der.a < 5) der.a = Math.max(der.a, p.a);
    else blocs.push({ de: p.de, a: p.a });
  }
  if (plan.sequences.length === 0) return { ajouter: [], retirer: [] };
  return {
    ajouter: plan.sequences.filter((s) => !blocs.some((b) => recouvre(s, b))),
    retirer: blocs.filter((b) => b.a - b.de >= 5 && !plan.sequences.some((s) => recouvre(s, b))),
  };
}
