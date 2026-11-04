// Normalisation des champs YouTube (tous FACULTATIFS : un ancien projet n'en a aucun et s'ouvre pareil) :
// destination, chapitres, intro et outro.

import { CHAPITRES } from './chapitres';
import { estDestination, type Destination } from './destination';
import { CHAINE_MAX, DUREES_GENERIQUE, MODELES_GENERIQUE, TEXTE_GENERIQUE_MAX, type ModeleGenerique, type Place } from './generiques';
import { borner, estObjet, verifierCles, type Journal } from './normaliser-outils';
import { arrondir, lireTemps } from './temps';
import type { Chapitre, Generique, Sec, Source } from './types';

/** Destination lue (undefined si absente : l'ancien projet reste TikTok, sans champ ajouté). */
export function normaliserDestination(brut: unknown, journal: Journal): Destination | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (estDestination(brut)) return brut;
  journal.corrige('destination', `La destination "${String(brut)}" est inconnue : TikTok choisi.`);
  return undefined;
}

/** Chapitres : triés, dans la vidéo, noms nettoyés, doublons de temps retirés. */
export function normaliserChapitres(brut: unknown, duree: Sec, journal: Journal): Chapitre[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('chapitres', '"chapitres" doit être une liste : ignoré.');
    return undefined;
  }
  const res: Chapitre[] = [];
  brut.slice(0, CHAPITRES.max).forEach((b, i) => {
    const ch = `chapitres[${i}]`;
    if (!estObjet(b)) return journal.corrige(ch, 'Chapitre illisible : ignoré.');
    verifierCles(b, ['t', 'nom'], ch, journal);
    const t = lireTemps(b.t);
    if (t === null) return journal.corrige(`${ch}.t`, 'Chapitre sans temps : ignoré.');
    const tb = arrondir(borner(t, 0, Math.max(0, duree)));
    if (tb !== arrondir(t)) journal.corrige(`${ch}.t`, 'Le chapitre était hors de la vidéo : ramené dedans.');
    const nom = (typeof b.nom === 'string' ? b.nom : '').replace(/\s+/g, ' ').trim().slice(0, CHAPITRES.nomMax);
    if (res.some((c) => c.t === tb)) return journal.corrige(ch, 'Deux chapitres au même moment : doublon ignoré.');
    res.push({ t: tb, nom });
  });
  return res.sort((a, b) => a.t - b.t);
}

/** Intro ou outro : un modèle connu (avec la chaîne) ou une source vidéo de la recette. */
export function normaliserGenerique(brut: unknown, place: Place, sources: Source[], journal: Journal): Generique | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (!estObjet(brut)) {
    journal.corrige(place, `L'${place} est illisible : retirée.`);
    return undefined;
  }
  verifierCles(brut, ['modele', 'chaine', 'texte', 'src', 'dur'], place, journal);
  const bornes = DUREES_GENERIQUE[place];
  const d = lireTemps(brut.dur);
  let dur = arrondir(borner(d ?? bornes.defaut, bornes.min, bornes.max));
  if (d !== null && dur !== arrondir(d)) journal.corrige(`${place}.dur`, `La durée de l'${place} doit aller de ${bornes.min} à ${bornes.max} s : ramenée à ${dur} s.`);
  if (typeof brut.src === 'string' && brut.src) {
    const source = sources.find((s) => s.id === brut.src && s.type === 'video');
    if (!source) {
      journal.corrige(`${place}.src`, `La vidéo de l'${place} n'est plus là : ${place} retirée.`);
      return undefined;
    }
    if (source.duree > 0) dur = arrondir(Math.min(dur, source.duree));
    return { src: source.id, dur };
  }
  const modele = MODELES_GENERIQUE.includes(brut.modele as ModeleGenerique) ? (brut.modele as ModeleGenerique) : null;
  if (!modele) {
    journal.corrige(`${place}.modele`, `Le modèle d'${place} "${String(brut.modele)}" est inconnu : ${place} retirée.`);
    return undefined;
  }
  const res: Generique = { modele, dur };
  const chaine = typeof brut.chaine === 'string' ? brut.chaine.replace(/\s+/g, ' ').trim().slice(0, CHAINE_MAX) : '';
  const texte = typeof brut.texte === 'string' ? brut.texte.replace(/\s+/g, ' ').trim().slice(0, TEXTE_GENERIQUE_MAX) : '';
  if (chaine) res.chaine = chaine;
  if (texte) res.texte = texte;
  return res;
}
