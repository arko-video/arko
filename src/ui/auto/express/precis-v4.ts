// Best-of v4 — réglage « Sous-titres précis » (dev-mots-2, 7/11/2026). Sur la revue : coché d'office si le meilleur
// modèle (Whisper small, ≈ 226 Mo) est déjà sur l'appareil ; sinon PROPOSÉ (cocher = accord pour le télécharger, une
// seule fois). Au moment de monter, AVANT d'ouvrir le nouveau projet : Whisper small réécoute les tours de la voix
// sous-titrée dans les séquences gardées (auto/mots/passe-precise.ts), chaque tour remonté et les tours collés ; ses
// mots remplacent ceux de Whisper base, et le montage refait punchlines, sous-titres et émotions avec eux.
// Décochée (refus), hors ligne sans le modèle, « Passer » ou une erreur : les mots de base, jamais d'erreur (un message
// court seulement). Rien ne touche la recette ici : le montage reste UN seul modifier() (un seul Annuler).
// (Mesuré aussi : Whisper base réécoutant les mêmes tours n'aide pas assez — +30 % de mots justes mais +58 % de mots
// faux sur toute la session — : pas de repli sur lui.)

import { signal } from '@preact/signals';
import { avecMotsPrecis, bilanPrecis, plagesPrecises } from '../../../auto/mots/passe-precise';
import type { OptionsTache, PlageTemps } from '../../../auto/types';
import type { AnalyseV4, RevueV4 } from '../../../auto/types-v4';
import type { SourceOuverte } from '../../../moteur/api';
import { ErreurArko } from '../../../moteur/erreurs';
import type { Mot } from '../../../recette/types';
import { OCTETS_PRECIS } from '../../../sous-titres/config-precis';
import { TEXTES_PRECIS } from './textes-precis';

/** Secondes de calcul par seconde réécoutée (mesuré : WASM 1 fil, VM à 2 cœurs chargée : 920 s pour 505 s). */
export const CALCUL_PAR_SECONDE = 1.8;

export type EtatPrecis = { phase: 'rien' } | { phase: 'ecoute'; p: number; etape: string };

/** Ce qui touche le navigateur (best-of-v4.ts ; de faux services dans les tests). */
export interface ServicesPrecis {
  /** Le modèle est-il là ? `octets` = ce qu'il reste à télécharger. Peut lever (traité comme « absent »). */
  lire(): Promise<{ present: boolean; octets: number }>;
  enLigne(): boolean;
  /** Réécoute les plages (télécharge le modèle d'abord s'il manque : appelé SEULEMENT si la case est cochée). */
  transcrire(source: SourceOuverte, plages: readonly PlageTemps[], o: OptionsTache): Promise<Mot[]>;
}

export function creerSousTitresPrecis(s: ServicesPrecis) {
  /** La case « Sous-titres précis ». */
  const coche = signal(false);
  /** Modèle sur l'appareil ? null = pas encore lu. */
  const present = signal<boolean | null>(null);
  /** Ce qu'il faudrait télécharger (octets). */
  const octets = signal(OCTETS_PRECIS);
  const etat = signal<EtatPrecis>({ phase: 'rien' });
  let controleur: AbortController | null = null;

  /** À l'arrivée sur la revue : l'état du modèle ; la case est cochée d'office s'il est là, décochée sinon. */
  async function lire(): Promise<void> {
    const m = await s.lire().catch(() => ({ present: false, octets: OCTETS_PRECIS }));
    present.value = m.present;
    octets.value = m.present ? 0 : m.octets || OCTETS_PRECIS;
    coche.value = m.present;
  }

  /** Minutes de calcul en plus, à peu près (au moins 1). */
  function minutes(a: AnalyseV4, revue: Pick<RevueV4, 'scenes' | 'sousTitresPour'>): number {
    const sec = plagesPrecises(a, revue).reduce((t, p) => t + p.a - p.de, 0);
    return Math.max(1, Math.round((sec * CALCUL_PAR_SECONDE) / 60));
  }

  /**
   * Avant le montage : l'analyse avec les mots précis, ou `a` telle quelle (case décochée, rien à réécouter, hors
   * ligne sans le modèle, « Passer », erreur). Ne lève JAMAIS. `message` : à montrer en passant (null = rien à dire).
   */
  async function appliquer(source: SourceOuverte, a: AnalyseV4, revue: Pick<RevueV4, 'scenes' | 'sousTitresPour'>): Promise<{ analyse: AnalyseV4; message: string | null }> {
    const T = TEXTES_PRECIS;
    if (!coche.peek() || a.parole !== 'mots') return { analyse: a, message: null };
    const plages = plagesPrecises(a, revue);
    if (plages.length === 0) return { analyse: a, message: null };
    if (present.peek() !== true && !s.enLigne()) return { analyse: a, message: T.horsLigne };
    controleur = new AbortController();
    etat.value = { phase: 'ecoute', p: 0, etape: T.ecoute };
    try {
      const mots = await s.transcrire(source, plages, {
        signal: controleur.signal,
        surProgression: (p, etape) => (etat.value = { phase: 'ecoute', p, etape: etape || T.ecoute }),
      });
      present.value = true;
      octets.value = 0;
      const analyse = avecMotsPrecis(a, plages, mots);
      const b = bilanPrecis(a, analyse, plages);
      console.info(`[Arko] Sous-titres précis : ${b.secondes} s réécoutées, ${b.avant} → ${b.apres} mots.`);
      return { analyse, message: null };
    } catch (e) {
      if (e instanceof ErreurArko && e.code === 'annule') return { analyse: a, message: T.passe };
      console.warn('[Arko] Sous-titres précis :', e);
      return { analyse: a, message: e instanceof ErreurArko && e.code === 'place' ? `${e.message} ${T.garde}` : T.echec };
    } finally {
      controleur = null;
      etat.value = { phase: 'rien' };
    }
  }

  /** « Passer » : arrête la réécoute, le montage se fait avec les mots de base. */
  function passer(): void {
    controleur?.abort();
  }

  return { coche, present, octets, etat, lire, minutes, appliquer, passer };
}

export type SousTitresPrecis = ReturnType<typeof creerSousTitresPrecis>;
