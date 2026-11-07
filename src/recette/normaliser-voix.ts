// Normalisation des champs « Qui parle » et « derush » de la v3 (dev 1) : personnes, tours de parole, passages
// notés. FACULTATIFS : jamais ajoutés s'ils sont absents (un ancien montage s'ouvre pareil).
// Le chibi, la place, l'émotion et la bouche (dev 3) sont lus par normaliser-chibis.ts.
// Contrat : conception/contrat-wankil.md §3.

import { estCouleur } from '../chibis/catalogue';
import { normaliserChibi, normaliserEmotion, normaliserPlaceAvatar, normaliserSituation } from './normaliser-chibis';
import { borner, estObjet, lireNombre, verifierCles, type Journal } from './normaliser-outils';
import { arrondir, lireTemps } from './temps';
import type { PassageNote, Personne, ReglagesDerush, Source, TourDeParole } from './types';

export const VOIX = { personnesMax: 8, nomMax: 24, toursMax: 20000, tourMin: 0.1, pisteMax: 15, pasBouche: 0.04 } as const;
export const DERUSH = { passagesMax: 100, raisonMax: 80, titreMax: 60 } as const;

const CLES_PERSONNE = ['id', 'nom', 'couleur', 'piste', 'niveauDb', 'chibi', 'bib', 'place', 'avatar'] as const;
const CLES_TOUR = ['ts', 'fin', 'p', 'src', 'emo', 'sit', 'b', 'sur'] as const;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function liste(brut: unknown, ch: string, journal: Journal): unknown[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (Array.isArray(brut)) return brut;
  journal.corrige(ch, `"${ch}" doit être une liste : ignoré.`);
  return undefined;
}

/** Personnes : id unique (12 caractères au plus), nom (24 au plus, « Voix n » si vide), 8 au plus. */
export function normaliserPersonnes(brut: unknown, journal: Journal): Personne[] | undefined {
  const l = liste(brut, 'personnes', journal);
  if (!l) return undefined;
  if (l.length > VOIX.personnesMax) journal.corrige('personnes', `Au plus ${VOIX.personnesMax} personnes : les suivantes sont retirées.`);
  const res: Personne[] = [];
  l.slice(0, VOIX.personnesMax).forEach((b, i) => {
    const ch = `personnes[${i}]`;
    if (!estObjet(b) || typeof b.id !== 'string' || !b.id.trim()) return journal.corrige(ch, 'Personne sans identifiant : retirée.');
    const id = b.id.trim().slice(0, 12);
    if (res.some((x) => x.id === id)) return journal.corrige(ch, `La personne "${id}" apparaît deux fois : doublon retiré.`);
    verifierCles(b, CLES_PERSONNE, ch, journal);
    const nom = typeof b.nom === 'string' && b.nom.trim() ? b.nom.trim().slice(0, VOIX.nomMax) : `Voix ${res.length + 1}`;
    const p: Personne = { id, nom };
    if (estCouleur(b.couleur)) p.couleur = b.couleur.toUpperCase();
    if (typeof b.piste === 'number' && Number.isInteger(b.piste) && b.piste >= 0 && b.piste <= VOIX.pisteMax) p.piste = b.piste;
    else if (b.piste !== undefined) journal.corrige(`${ch}.piste`, 'Le numéro de piste est illisible : retiré.');
    if (typeof b.niveauDb === 'number' && Number.isFinite(b.niveauDb)) p.niveauDb = arrondir(borner(b.niveauDb, -100, 0));
    const chibi = normaliserChibi(b.chibi, `${ch}.chibi`, journal);
    if (chibi) p.chibi = chibi;
    if (typeof b.bib === 'string' && b.bib) p.bib = b.bib.slice(0, 80);
    const place = normaliserPlaceAvatar(b.place, `${ch}.place`, journal);
    if (place) p.place = place;
    if (b.avatar === false) p.avatar = false;
    res.push(p);
  });
  return res;
}

/**
 * Tours de parole : personne connue, source vidéo connue (ou absente), début < fin (inversés sinon), 0,1 s au moins,
 * triés par début. La bouche `b` doit être du base64 de la bonne longueur, sinon elle est retirée.
 */
export function normaliserParoles(brut: unknown, personnes: readonly string[], videos: readonly Source[], journal: Journal): TourDeParole[] | undefined {
  const l = liste(brut, 'paroles', journal);
  if (!l) return undefined;
  if (personnes.length === 0) {
    if (l.length > 0) journal.corrige('paroles', 'Les tours de parole n\'ont pas de personnes : retirés.');
    return undefined;
  }
  if (l.length > VOIX.toursMax) journal.corrige('paroles', `Au plus ${VOIX.toursMax} tours de parole : les suivants sont retirés.`);
  const res: TourDeParole[] = [];
  l.slice(0, VOIX.toursMax).forEach((b, i) => {
    const ch = `paroles[${i}]`;
    if (!estObjet(b)) return journal.corrige(ch, 'Tour de parole illisible : retiré.');
    verifierCles(b, CLES_TOUR, ch, journal);
    if (typeof b.p !== 'string' || !personnes.includes(b.p)) return journal.corrige(`${ch}.p`, `La personne "${String(b.p)}" n'existe pas : tour retiré.`);
    let ts = lireTemps(b.ts);
    let fin = lireTemps(b.fin);
    if (ts === null || fin === null) return journal.corrige(ch, 'Tour de parole sans début ou fin lisible : retiré.');
    if (fin < ts) [ts, fin] = [fin, ts];
    ts = arrondir(Math.max(0, ts));
    fin = arrondir(Math.max(0, fin));
    if (fin - ts < VOIX.tourMin - 1e-9) return journal.ignore(ch, 'Tour de parole de moins de 0,1 s : retiré.');
    const tour: TourDeParole = { ts, fin, p: b.p };
    if (b.src !== undefined) {
      if (typeof b.src === 'string' && videos.some((s) => s.id === b.src)) tour.src = b.src;
      else return journal.corrige(`${ch}.src`, `La vidéo "${String(b.src)}" n'existe pas : tour retiré.`);
    }
    const emo = normaliserEmotion(b.emo, `${ch}.emo`, journal);
    if (emo) tour.emo = emo;
    const sit = normaliserSituation(b.sit, `${ch}.sit`, journal);
    if (sit) tour.sit = sit;
    if (b.b !== undefined) {
      const max = Math.ceil((fin - ts) / VOIX.pasBouche / 6) + 4;
      if (typeof b.b === 'string' && BASE64.test(b.b) && b.b.length <= max) tour.b = b.b;
      else journal.corrige(`${ch}.b`, 'La bouche de l\'avatar est illisible : elle suivra les mots.');
    }
    if (b.sur === false) tour.sur = false;
    res.push(tour);
  });
  return res.sort((x, y) => x.ts - y.ts || x.fin - y.fin);
}

/** Passages notés par le derush : temps lisibles, note 0 à 100, raison et titre courts ; triés par note puis par début. */
export function normaliserDerush(brut: unknown, videos: readonly Source[], journal: Journal): ReglagesDerush | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!estObjet(brut)) {
    journal.corrige('derush', 'Le derush est illisible : ignoré.');
    return undefined;
  }
  verifierCles(brut, ['passages'], 'derush', journal);
  const l = liste(brut.passages, 'derush.passages', journal) ?? [];
  const passages: PassageNote[] = [];
  l.slice(0, DERUSH.passagesMax).forEach((b, i) => {
    const ch = `derush.passages[${i}]`;
    if (!estObjet(b)) return journal.corrige(ch, 'Passage illisible : retiré.');
    verifierCles(b, ['src', 'de', 'a', 'note', 'raison', 'titre'], ch, journal);
    let de = lireTemps(b.de);
    let a = lireTemps(b.a);
    if (de === null || a === null) return journal.corrige(ch, 'Passage sans début ou fin lisible : retiré.');
    if (a < de) [de, a] = [a, de];
    if (a - de < 0.5) return journal.ignore(ch, 'Passage de moins de 0,5 s : retiré.');
    const pa: PassageNote = {
      de: arrondir(Math.max(0, de)),
      a: arrondir(a),
      note: Math.round(lireNombre(b.note, `${ch}.note`, journal, { defaut: 0, min: 0, max: 100, nom: 'la note' })),
      raison: typeof b.raison === 'string' ? b.raison.trim().slice(0, DERUSH.raisonMax) : '',
    };
    if (b.src !== undefined) {
      if (typeof b.src === 'string' && videos.some((s) => s.id === b.src)) pa.src = b.src;
      else return journal.corrige(`${ch}.src`, `La vidéo "${String(b.src)}" n'existe pas : passage retiré.`);
    }
    if (typeof b.titre === 'string' && b.titre.trim()) pa.titre = b.titre.trim().slice(0, DERUSH.titreMax);
    passages.push(pa);
  });
  return { passages: passages.sort((x, y) => y.note - x.note || x.de - y.de) };
}
