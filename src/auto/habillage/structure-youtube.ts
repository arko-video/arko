// Structure d'un best-of YouTube (10/11/2026, d'après la vidéo modèle de Romain) : APRÈS l'accroche (le « cold
// open »), un générique (carton au nom de la chaîne puis les persos qui défilent), des cartons « Quelques minutes plus
// tard » quand le montage saute un long passage, et une fin « Abonne-toi ». Tout est un élément inséré ordinaire :
// Romain peut retirer chaque morceau. Rien de copié : textes et persos sont les siens. 16:9 seulement. Pure.

import { chibiDe, placerAvatars, placesDeReaction } from '../../moteur/couches/avatars';
import { compiler } from '../../recette/chronologie';
import { gabaritDe } from '../../recette/destination';
import { insererElement } from '../../recette/operations-insertion';
import { normaliser } from '../../recette/normaliser';
import { choisirGenerique } from '../../recette/operations-youtube';
import type { Recette, Sec } from '../../recette/types';

export const STRUCTURE = {
  /** Un saut de plus de 3 min dans la vidéo source → carton d'ellipse (4 au plus, les plus grands sauts). */
  sautMin: 180,
  ellipsesMax: 4,
  texteEllipse: 'QUELQUES MINUTES PLUS TARD',
  dureeEllipse: 1.6,
  dureeTitre: 2,
  /** Chaque perso du générique : 0,7 s (4 persos au plus). */
  dureePerso: 0.7,
  persosMax: 4,
  fondsGenerique: ['#1E6BFF', '#FF8A00', '#12B76A', '#E0245E'],
  dureeFin: 5,
  /** Carte « nom » à la 1re apparition de chaque perso après le générique (seulement les vrais prénoms). */
  dureeNom: 2,
  yNom: 0.56,
  /** Générique : chaque perso déguisé (comme les génériques des best-of), une tenue + un accessoire par perso. */
  costumes: [
    { tenue: 'pirate', accessoire: 'bandeau' },
    { tenue: 'cowboy', accessoire: 'lunettesSoleil' },
    { tenue: 'astronaute', accessoire: 'aucun' },
    { tenue: 'sorcier', accessoire: 'barbe' },
  ],
} as const;

/** Un nom choisi par l'utilisateur (pas « Voix 1 », « Voix 2 »…). */
export const vraiNom = (nom: string) => !/^voix\s*\d+$/i.test(nom.trim());

/** Fin de l'accroche (temps de sortie), 0 s'il n'y en a pas. */
export function finAccrocheDe(r: Recette): Sec {
  const a = (r.textes ?? []).find((t) => t.role === 'accroche');
  return a ? a.t + a.dur : 0;
}

/** Temps de sortie des cartons d'ellipse (pure) : début du plan qui suit un saut ≥ 3 min, après l'accroche. */
export function pointsEllipse(r: Recette): Sec[] {
  const sc = compiler(r);
  const src = r.sources.find((s) => s.type === 'video')?.id;
  const apres = finAccrocheDe(r);
  const sauts: { t: Sec; saut: Sec }[] = [];
  let prec: { a: Sec } | null = null;
  for (const p of sc.plans) {
    if (p.ins || p.src !== src) continue;
    if (prec && p.t0 > apres + 0.01 && p.de - prec.a >= STRUCTURE.sautMin) sauts.push({ t: p.t0, saut: p.de - prec.a });
    if (p.t0 >= apres - 0.01) prec = p;
  }
  return sauts
    .sort((x, y) => y.saut - x.saut)
    .slice(0, STRUCTURE.ellipsesMax)
    .map((x) => x.t)
    .sort((x, y) => x - y);
}

export interface OptionsStructure {
  /** Nom de la chaîne (vide : pas de carton titre ni de fin, seulement les persos et les ellipses). */
  chaine?: string;
}

export function poserStructureYoutube(recette: Recette, o: OptionsStructure = {}): Recette {
  if (!gabaritDe(recette).paysage || recette.plans.length === 0) return recette;
  let r = recette;
  // 1. Ellipses, de la dernière à la première (les temps d'avant ne bougent pas).
  for (const t of [...pointsEllipse(r)].reverse()) {
    const x = insererElement(r, t, { type: 'carton', txt: STRUCTURE.texteEllipse }, { dur: STRUCTURE.dureeEllipse });
    if (x.i >= 0) r = x.recette;
  }
  // 2. Générique juste après l'accroche : persos (insérés à l'envers) puis le carton titre devant eux.
  const t = finAccrocheDe(r);
  const chaine = o.chaine?.trim() ?? '';
  const persos = (r.personnes ?? []).filter((p) => p.avatar !== false).slice(0, STRUCTURE.persosMax);
  if (chaine || persos.length > 0) {
    for (let k = persos.length - 1; k >= 0; k--) {
      const p = persos[k]!;
      const costume = STRUCTURE.costumes[k % STRUCTURE.costumes.length]!;
      const chibi = { ...chibiDe(p, r.avatars?.style), ...costume };
      const x = insererElement(r, t, { type: 'chibi', emo: 'frime', p: p.id, chibi, ...(vraiNom(p.nom) ? { txt: p.nom.toUpperCase() } : {}), fond: STRUCTURE.fondsGenerique[k % STRUCTURE.fondsGenerique.length]! }, { dur: STRUCTURE.dureePerso });
      if (x.i >= 0) r = x.recette;
    }
    if (chaine) {
      const x = insererElement(r, t, { type: 'carton', txt: chaine.toUpperCase(), fond: STRUCTURE.fondsGenerique[0] }, { dur: STRUCTURE.dureeTitre });
      if (x.i >= 0) r = x.recette;
    }
  }
  // 3. Carte « nom » à côté du perso, à sa 1re apparition après le générique (comme la carte d'un invité).
  r = cartesNoms(r);
  // 4. Fin « Abonne-toi » (si le montage n'en a pas déjà une).
  if (chaine && !r.outro) r = choisirGenerique(r, 'outro', { modele: 'abonne', chaine, texte: 'Abonne-toi !', dur: STRUCTURE.dureeFin });
  return r;
}

/** Ajoute un texte « bandeau » au prénom de chaque perso, à sa 1re apparition après le générique (pure). */
export function cartesNoms(r: Recette): Recette {
  const persos = (r.personnes ?? []).filter((p) => p.avatar !== false);
  if (!r.avatars || persos.length === 0 || !r.paroles?.length) return r;
  const sc = compiler(r);
  const toutes = placerAvatars(r, sc);
  const places = r.avatars.mode === 'reactions' ? placesDeReaction(toutes) : toutes;
  // Après le dernier élément inséré du début (générique), sinon après l'accroche.
  let debut = finAccrocheDe(r);
  for (const p of sc.plans) {
    if (p.t0 > debut + 0.01) break;
    if (p.ins) debut = p.t1;
  }
  const textes = [...(r.textes ?? [])];
  persos.forEach((pers, rang) => {
    if (!vraiNom(pers.nom)) return;
    const pl = places.find((x) => x.p === pers.id && x.t0 >= debut);
    if (!pl) return;
    textes.push({ txt: pers.nom.toUpperCase(), style: 'bandeau', t: Math.round(pl.t0 * 100) / 100, dur: STRUCTURE.dureeNom, x: rang % 2 === 0 ? 0.17 : 0.83, y: STRUCTURE.yNom });
  });
  return textes.length === (r.textes ?? []).length ? r : normaliser({ ...r, textes }, { sources: r.sources }).recette;
}
