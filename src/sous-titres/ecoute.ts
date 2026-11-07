// Côté Worker (et banc) : écoute des plages fenêtre par fenêtre avec Whisper → mots bruts en temps source.
// Sorti de worker.ts (dev-mots, 7/11/2026) pour que le Worker du navigateur et le banc fassent EXACTEMENT la même
// chose, et pour pouvoir le tester sans Whisper (fausse fonction de reconnaissance).
//
// Robustesse (bug de la vraie session, fenêtre 7039–7067 s) : une fenêtre où Whisper plante n'arrête plus l'écoute.
// Elle est réessayée en deux moitiés (coupées au moment le plus calme du milieu) ; une moitié qui plante encore est
// sautée et notée. L'écoute ne lève que si TOUTES les fenêtres ont planté (le module est vraiment cassé).
// Une fenêtre de silence numérique n'est pas donnée à Whisper (il y inventait des phrases en boucle).

import { FREQUENCE } from './config';
import { dureeTotale, motEnSource, type Piece } from './fenetres';
import { remplirFenetre, type SonOuvert } from './lecture-son';
import type { FenetreSautee, MotBrut, Plage } from './messages';
import { dureeActive, niveau, normaliserPieces, pointDeCoupe } from './pcm';

/** La reconnaissance de Whisper (le pipeline de transformers.js), vue comme une simple fonction. */
export type Reconnaissance = (pcm: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

export interface OptionsEcoute {
  /** "fr", "en"… ou "auto" (Whisper détecte la langue). */
  langue: string;
  /** v4 : remonter chaque zone vers −20 dBFS avant Whisper (normaliserPieces). */
  gain?: boolean;
  /** Avant chaque fenêtre : secondes de son déjà écoutées, sur le total. */
  surAvancement?: (fait: number, total: number) => void;
  /** Reçoit les fenêtres (ou moitiés) sautées parce que Whisper y a planté. */
  sautees?: FenetreSautee[];
}

interface MorceauWhisper {
  text: string;
  timestamp: [number, number | null];
}

/** Une fenêtre trop courte n'est pas recoupée en deux (s). */
const FENETRE_MIN_COUPE = 2;
/**
 * Une fenêtre qui n'a pas ce temps de son au-dessus de −60 dBFS est du silence numérique : Whisper n'y entend rien
 * de vrai et y invente des phrases en boucle (vraie session : ≈ 430 mots par tranche de 5 min muette). Pas écoutée.
 */
export const SON_MIN_FENETRE = 0.25;

function optionsWhisper(langue: string): Record<string, unknown> {
  const options = { return_timestamps: 'word' as const, chunk_length_s: 30, stride_length_s: 5 };
  // Langue « auto » : on ne donne pas `language`, Whisper la détecte.
  return langue === 'auto' ? options : { ...options, language: langue };
}

/** Les mots de la sortie de Whisper, remis en temps source. `niveau` = volume de ce que Whisper a entendu (0 à 1). */
export function motsDeLaSortie(sortie: unknown, pcm: Float32Array, pieces: readonly Piece[]): MotBrut[] {
  const s = (Array.isArray(sortie) ? sortie[0] : sortie) as { chunks?: MorceauWhisper[] } | undefined;
  const mots: MotBrut[] = [];
  for (const m of s?.chunks ?? []) {
    const [t0, t1Brut] = m.timestamp;
    const t1 = t1Brut ?? t0 + 0.3;
    const temps = motEnSource(t0, t1, pieces as Piece[]);
    if (temps) mots.push({ txt: m.text, ...temps, niveau: niveau(pcm, t0, t1) });
  }
  return mots;
}

/** Coupe une fenêtre en deux au temps `c` (temps de la fenêtre) : son et table des pièces de chaque moitié. */
export function couperFenetre(pcm: Float32Array, pieces: readonly Piece[], c: number): [{ pcm: Float32Array; pieces: Piece[] }, { pcm: Float32Array; pieces: Piece[] }] {
  const k = Math.max(0, Math.min(pcm.length, Math.round(c * FREQUENCE)));
  const avant: Piece[] = [];
  const apres: Piece[] = [];
  for (const p of pieces) {
    const fin = p.decalage + (p.a - p.de);
    if (p.decalage < c) avant.push({ decalage: p.decalage, de: p.de, a: Math.min(p.a, p.de + (c - p.decalage)) });
    if (fin > c) apres.push({ decalage: Math.max(0, p.decalage - c), de: p.de + Math.max(0, c - p.decalage), a: p.a });
  }
  return [
    { pcm: pcm.slice(0, k), pieces: avant.filter((p) => p.a - p.de > 0.01) },
    { pcm: pcm.slice(k), pieces: apres.filter((p) => p.a - p.de > 0.01) },
  ];
}

function sautee(pieces: readonly Piece[], e: unknown): FenetreSautee {
  return { de: pieces[0]?.de ?? 0, a: pieces[pieces.length - 1]?.a ?? 0, message: e instanceof Error ? e.message : String(e) };
}

/**
 * Écoute UNE fenêtre ; si Whisper plante, la réessaie en deux moitiés. `ok` = au moins une partie a été entendue.
 */
export async function ecouterFenetre(
  pcm: Float32Array,
  pieces: readonly Piece[],
  reconnaitre: Reconnaissance,
  langue: string,
): Promise<{ mots: MotBrut[]; sautees: FenetreSautee[]; ok: boolean; erreur: unknown }> {
  try {
    return { mots: motsDeLaSortie(await reconnaitre(pcm, optionsWhisper(langue)), pcm, pieces), sautees: [], ok: true, erreur: null };
  } catch (e) {
    const duree = pcm.length / FREQUENCE;
    if (duree < FENETRE_MIN_COUPE) return { mots: [], sautees: [sautee(pieces, e)], ok: false, erreur: e };
    const c = pointDeCoupe(pcm, duree / 2 - Math.min(3, duree / 4), duree / 2 + Math.min(3, duree / 4));
    const mots: MotBrut[] = [];
    const sautees: FenetreSautee[] = [];
    let ok = false;
    for (const moitie of couperFenetre(pcm, pieces, c)) {
      if (moitie.pieces.length === 0 || moitie.pcm.length === 0) continue;
      try {
        mots.push(...motsDeLaSortie(await reconnaitre(moitie.pcm, optionsWhisper(langue)), moitie.pcm, moitie.pieces));
        ok = true;
      } catch (e2) {
        sautees.push(sautee(moitie.pieces, e2));
      }
    }
    return { mots, sautees, ok, erreur: e };
  }
}

/**
 * Écoute les plages du fichier, fenêtre de 28 s par fenêtre de 28 s (remplirFenetre), et rend les mots bruts en temps
 * source. Une fenêtre qui plante est réessayée puis sautée (`o.sautees`) ; lève seulement si aucune fenêtre n'a pu être
 * entendue (la 1ʳᵉ erreur de Whisper).
 */
export async function ecouterPlages(son: SonOuvert, plagesDemandees: readonly Plage[], reconnaitre: Reconnaissance, o: OptionsEcoute): Promise<MotBrut[]> {
  const plages = plagesDemandees.map((p) => ({ de: Math.max(0, p.de), a: Math.min(son.duree, p.a) })).filter((p) => p.a - p.de > 0.05);
  const total = dureeTotale(plages);
  if (total <= 0) return [];
  const mots: MotBrut[] = [];
  let fait = 0;
  let i = 0;
  let curseur = plages[0]!.de;
  let fenetres = 0;
  let entendues = 0;
  let premiere: unknown = null;
  while (i < plages.length) {
    o.surAvancement?.(fait, total);
    const fenetre = await remplirFenetre(son, plages, i, curseur);
    i = fenetre.i;
    curseur = fenetre.curseur;
    if (fenetre.pieces.length === 0) break;
    fait += fenetre.pieces.reduce((s, x) => s + (x.a - x.de), 0);
    fenetres++;
    if (dureeActive(fenetre.pcm) < SON_MIN_FENETRE) {
      entendues++;
      continue;
    }
    if (o.gain) normaliserPieces(fenetre.pcm, fenetre.pieces);
    const r = await ecouterFenetre(fenetre.pcm, fenetre.pieces, reconnaitre, o.langue);
    mots.push(...r.mots);
    o.sautees?.push(...r.sautees);
    if (r.ok) entendues++;
    else premiere ??= r.erreur;
  }
  if (fenetres > 0 && entendues === 0 && premiere !== null) throw premiere;
  return mots;
}
