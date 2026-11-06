// Signaux du son de la vidéo pour l'habillage auto (punchlines, zooms) : lus UNE fois par source avec
// lireSignauxSource (dev 1), gardés en mémoire. Si la lecture n'est pas encore possible (fonction pas encore
// écrite, vidéo sans son, erreur), on continue SANS signaux : les punchlines viennent du texte, les zooms des
// bruitages posés et du rythme. Rien n'est envoyé : tout reste sur l'appareil.

import { signal } from '@preact/signals';
import { estPasEncoreFait } from '../../../auto/pas-encore-fait';
import { lireSignauxSource } from '../../../auto/signaux-source';
import type { SignauxSource } from '../../../auto/types';
import { sources } from '../../etat';

/** Message de progression pendant la lecture du son (null = rien en cours). */
export const ecouteEnCours = signal<string | null>(null);

const gardes = new Map<string, SignauxSource | null>();

/** Signaux de la source vidéo `src` (la première vidéo si absent), ou null s'ils ne sont pas disponibles. */
export async function signauxDe(src?: string): Promise<SignauxSource | null> {
  const so = sources.peek().find((s) => s.infos.type === 'video' && (src === undefined || s.infos.id === src));
  if (!so) return null;
  const cle = so.infos.emp || so.infos.id;
  if (gardes.has(cle)) return gardes.get(cle) ?? null;
  ecouteEnCours.value = '…';
  try {
    const s = await lireSignauxSource(so, { surProgression: (p, message) => (ecouteEnCours.value = `${message} ${Math.round(p * 100)} %`) });
    gardes.set(cle, s);
    return s;
  } catch (e) {
    if (!estPasEncoreFait(e)) console.warn('[Arko] signaux du son indisponibles', e);
    return null; // pas gardé : on réessaiera la prochaine fois
  } finally {
    ecouteEnCours.value = null;
  }
}
