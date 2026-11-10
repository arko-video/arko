// Opérations du Montage auto « Son » (dev 3) : E (bruitages auto) et F (musique, volume final).
// Mêmes règles que operations.ts : NOUVELLE recette normalisée, la recette d'origine si sans effet ;
// une opération = un seul Annuler. Réexportées par operations.ts.

import { normaliser } from './normaliser';
import { arrondir } from './temps';
import type { MorceauMusique, PisteMusique, Recette, Sec, Son, Source, VolumeFinal } from './types';

/** Un bruitage prêt à poser : `id` = son d'Arko (« impact.boom ») ou source audio de la recette (« a3 »). */
export interface BruitagePose {
  id: string;
  ts: Sec;
  src: string;
  vol: number;
  dur: Sec;
  fondu: Sec;
  /** Genre de moment (catégorie du bruitage : rire, rate…), pour apprendre quel son va où. */
  pour?: string;
}

/** Normalise ; la recette d'origine si rien n'a changé. `nettoyer` retire les sources audio devenues inutiles. */
function finir(origine: Recette, modifiee: Recette, nettoyer = false): Recette {
  const r = normaliser(modifiee, { sources: modifiee.sources }, { retirerSourcesAudioInutiles: nettoyer }).recette;
  return JSON.stringify(r) === JSON.stringify(origine) ? origine : r;
}

/** Ajoute les sources qui manquent (par id). */
function avecSources(recette: Recette, sources: readonly Source[]): Source[] {
  const res = [...recette.sources];
  for (const s of sources) if (s?.id && !res.some((x) => x.id === s.id)) res.push({ ...s });
  return res;
}

/**
 * « Tout poser » : ajoute les sources audio manquantes (`sources`, sons venus de Mes sons) puis les sons,
 * de rôle « bruitage ». Un seul Annuler.
 */
export function poserBruitages(recette: Recette, poses: readonly BruitagePose[], sources: readonly Source[]): Recette {
  if (poses.length === 0) return recette;
  const sons: Son[] = poses.map((p) => ({
    id: p.id,
    ts: arrondir(p.ts),
    src: p.src,
    vol: Math.round(p.vol * 1000) / 1000,
    role: 'bruitage',
    dur: arrondir(p.dur),
    fondu: arrondir(p.fondu),
    ...(p.pour ? { pour: p.pour } : {}),
  }));
  return finir(recette, { ...recette, sources: avecSources(recette, sources), sons: [...recette.sons, ...sons] });
}

/** Retire tous les sons de rôle « bruitage » (et leurs sources audio devenues inutiles). */
export function retirerBruitagesAuto(recette: Recette): Recette {
  const auto = (s: { role?: string }) => s.role === 'bruitage' || s.role === 'accent';
  if (!recette.sons.some(auto)) return recette;
  return finir(recette, { ...recette, sons: recette.sons.filter((s) => !auto(s)) }, true);
}

/** Met (ou retire, null) la musique ; `sources` = sources audio des morceaux, ajoutées si elles manquent. */
export function definirMusique(recette: Recette, piste: PisteMusique | null, sources: readonly Source[]): Recette {
  if (!piste || piste.morceaux.length === 0) {
    if (!recette.musique) return recette;
    const sans: Recette = { ...recette };
    delete sans.musique;
    return finir(recette, sans, true);
  }
  const musique: PisteMusique = { ...piste, morceaux: piste.morceaux.map((m) => ({ ...m })) };
  return finir(recette, { ...recette, sources: avecSources(recette, sources), musique });
}

/**
 * Habiller → Sons → Musique, « Remplacer » : le morceau `i` prend le son `source` (ajoutée si elle manque), à la MÊME
 * place (début, fin, boucle) ; il se lit depuis son début. Les réglages de la piste (volume, baisse) restent.
 * Un seul Annuler. La recette d'origine si `i` n'existe pas.
 */
export function remplacerMorceauMusique(recette: Recette, i: number, source: Source): Recette {
  const piste = recette.musique;
  const ancien = piste?.morceaux[i];
  if (!piste || !ancien) return recette;
  const nouveau: MorceauMusique = { src: source.id, t: ancien.t };
  if (ancien.fin !== undefined) nouveau.fin = ancien.fin;
  if (ancien.boucle === false) nouveau.boucle = false;
  const morceaux = piste.morceaux.map((m, k) => (k === i ? nouveau : { ...m }));
  return finir(recette, { ...recette, sources: avecSources(recette, [source]), musique: { ...piste, morceaux } });
}

/** Règle (ou retire, null) le volume final de l'export. */
export function choisirVolumeFinal(recette: Recette, v: VolumeFinal | null): Recette {
  const res: Recette = { ...recette };
  if (v) res.volumeFinal = { ...v };
  else delete res.volumeFinal;
  return finir(recette, res);
}
