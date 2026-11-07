// Banc réel — les mots de RÉFÉRENCE de la cible « coupes en plein mot » (décision de l'orchestrateur, 7/11 au soir) :
// les mots de Whisper gardés (mots-arko.json) NETTOYÉS par nettoyerMotsV4 (le code de l'appli), avec la parole de la
// VAD de l'appli (cache « appli ») et l'énergie de la bande voix. Les mêmes pour Arko ET la vérité, et pour toutes les
// passes (avant / après) : la mesure ne dépend pas de la chaîne mesurée. Les mots bruts restent une mesure indicative.
// Sortie (hors dépôt, temps seulement, aucun texte) : banc-cache/mots-nettoyes-v4.json = { plages, mots: [de, a][] }.

import { existsSync, statSync, writeFileSync } from 'node:fs';
import { nettoyerMotsV4 } from '../../../src/auto/mots/nettoyage-v4';
import { paroleDepuisProbas } from '../../../src/auto/vad/segments';
import { mesuresSon } from './signaux';
import { DOSSIER_CACHE } from './son';
import { cacheVad, fichiersVad } from './vad';
import { DUREE_SOURCE, FICHIER_MOTS, lireMots } from './whisper';

export const FICHIER_MOTS_NETTOYES = `${DOSSIER_CACHE}/mots-nettoyes-v4.json`;

/** Écrit (si besoin) les mots nettoyés de référence ; rend le chemin, ou null s'il manque les mots ou la VAD. */
export async function motsNettoyesBanc(o: { refaire?: boolean; journal?: (m: string) => void } = {}): Promise<string | null> {
  const vadAppli = fichiersVad('appli').u8;
  if (!existsSync(FICHIER_MOTS) || !existsSync(vadAppli)) return null;
  const plusRecent = Math.max(statSync(FICHIER_MOTS).mtimeMs, statSync(vadAppli).mtimeMs);
  if (!o.refaire && existsSync(FICHIER_MOTS_NETTOYES) && statSync(FICHIER_MOTS_NETTOYES).mtimeMs >= plusRecent) return FICHIER_MOTS_NETTOYES;
  const f = lireMots();
  if (!f) return null;
  const { vad } = await cacheVad(DUREE_SOURCE, { variante: 'appli' });
  const son = await mesuresSon(DUREE_SOURCE);
  const parole = paroleDepuisProbas({ src: 's1', ...vad }, DUREE_SOURCE);
  const n = nettoyerMotsV4({ mots: f.mots, plages: f.plages, parole, energie: son.empreintes });
  // Temps seulement : le texte n'est jamais écrit (['', début, fin]).
  const mots = n.mots.filter((m) => m[0].trim()).map((m) => ['', Math.round(m[1] * 1000) / 1000, Math.round(m[2] * 1000) / 1000]);
  writeFileSync(FICHIER_MOTS_NETTOYES, JSON.stringify({ format: 'arko.banc-mots-nettoyes/1', origine: 'mots-arko.json → nettoyerMotsV4 (VAD appli, énergie de la bande voix)', plages: f.plages, mots, bilan: n.bilan }));
  o.journal?.(`Mots de référence nettoyés : ${mots.length} mots (${f.mots.length} avant) → ${FICHIER_MOTS_NETTOYES}`);
  return FICHIER_MOTS_NETTOYES;
}
