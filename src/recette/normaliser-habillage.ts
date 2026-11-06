// Normalisation de l'habillage : textes, sous-titres, sons, zooms, son guide, repères.
// Textes et sous-titres sont rendus depuis la phase 2 ; sons, zooms et son guide à partir de la phase 3.

import { GUIDE, SON, SOUS_TITRES, STYLES_SOUS_TITRES, STYLES_SOUS_TITRES_AUTO, STYLES_TEXTE, STYLES_TEXTE_AUTO, TEXTE, ZOOM } from './defauts';
import { CLES_SOUS_TITRES_AUTO, normaliserSousTitresAuto } from './normaliser-auto-habillage';
import { CLES_SON_AUTO, normaliserSonAuto } from './normaliser-auto-son';
import { borner, estObjet, Journal, lireNombre, proches, verifierCles, type Objet } from './normaliser-outils';
import { arrondir, formaterNombre, formaterSecondes, lireTemps } from './temps';
import type { Marqueur, Mot, Sec, Son, SonGuide, Source, SousTitres, Texte, Zoom } from './types';

/** Lit une liste ; un objet seul est accepté comme liste d'un élément. */
function lireListe(brut: unknown, chemin: string, journal: Journal): unknown[] {
  if (brut === undefined || brut === null) return [];
  if (Array.isArray(brut)) return brut;
  if (estObjet(brut)) return [brut];
  journal.corrige(chemin, `"${chemin}" doit être une liste : ignoré.`);
  return [];
}

/** Lit un temps positif arrondi (null si absent ou illisible). */
function lireT(v: unknown, chemin: string, journal: Journal): Sec | null {
  if (v === undefined || v === null) return null;
  const t = lireTemps(v);
  if (t === null) {
    journal.corrige(chemin, `Le temps ${JSON.stringify(v)} est illisible : ignoré.`);
    return null;
  }
  if (t < 0) {
    journal.corrige(chemin, `Le temps (${formaterSecondes(t)}) était négatif : ramené à 0.`);
    return 0;
  }
  return arrondir(t);
}

/** Bornes verticales de la zone visible, selon la destination (TikTok par défaut). */
export interface BornesY {
  yMin: number;
  yMax: number;
  plateforme: string;
}
const BORNES_TEXTE: BornesY = { yMin: TEXTE.yMin, yMax: TEXTE.yMax, plateforme: 'TikTok' };
const BORNES_ST: BornesY = { yMin: SOUS_TITRES.yMin, yMax: SOUS_TITRES.yMax, plateforme: 'TikTok' };

export function normaliserTextes(brut: unknown, dureeFinale: Sec, journal: Journal, bornes: BornesY = BORNES_TEXTE): Texte[] {
  const res: Texte[] = [];
  lireListe(brut, 'textes', journal).forEach((b, i) => {
    const ch = `textes[${i}]`;
    const o: Objet = typeof b === 'string' ? { txt: b } : estObjet(b) ? b : {};
    if ('texte' in o && !('txt' in o)) o.txt = o.texte;
    if ('text' in o && !('txt' in o)) o.txt = o.text;
    delete o.texte;
    delete o.text;
    verifierCles(o, ['txt', 'role', 'style', 't', 'dur', 'x', 'y'], ch, journal);
    let txt = typeof o.txt === 'string' ? o.txt.trim() : '';
    if (!txt) {
      journal.corrige(ch, 'Texte vide : supprimé.');
      return;
    }
    if (txt.length > TEXTE.longueurMax) {
      journal.corrige(`${ch}.txt`, `Le texte dépassait ${TEXTE.longueurMax} caractères : raccourci.`);
      txt = txt.slice(0, TEXTE.longueurMax).trimEnd();
    }
    let t = lireT(o.t, `${ch}.t`, journal) ?? 0;
    if (dureeFinale > 0 && t > dureeFinale) {
      journal.corrige(`${ch}.t`, `Le texte commençait après la fin de la vidéo (${formaterSecondes(t)}) : placé au début.`);
      t = 0;
    }
    const dur = lireNombre(o.dur, `${ch}.dur`, journal, { defaut: TEXTE.dur, min: TEXTE.durMin, max: Infinity, nom: 'la durée du texte' });
    const x = lireNombre(o.x, `${ch}.x`, journal, { defaut: TEXTE.x, min: 0, max: 1, nom: 'la position horizontale' });
    let y = lireTemps(o.y) ?? TEXTE.y;
    if (y < bornes.yMin || y > bornes.yMax) {
      const yb = borner(y, bornes.yMin, bornes.yMax);
      const sens = y > bornes.yMax ? 'remonté' : 'descendu';
      journal.corrige(`${ch}.y`, `Le texte sortait de la zone visible sur ${bornes.plateforme} (y = ${formaterNombre(y)}) : ${sens} à ${formaterNombre(yb)}.`);
      y = yb;
    }
    const style = lireStyle(o.style, [...STYLES_TEXTE, ...STYLES_TEXTE_AUTO], `${ch}.style`, 'de texte', journal);
    const texte: Texte = { txt, style, t, dur, x, y: arrondir(y) };
    if (o.role === 'accroche' || o.role === 'top3' || o.role === 'section') texte.role = o.role;
    else if (o.role !== undefined) journal.ignore(`${ch}.role`, `Le rôle "${String(o.role)}" est inconnu : ignoré.`);
    res.push(texte);
  });
  return res;
}

/** Style connu, sinon le premier de la liste (avec un message). */
function lireStyle(brut: unknown, styles: readonly string[], chemin: string, quoi: string, journal: Journal): string {
  const style = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
  if (styles.includes(style)) return style;
  if (brut !== undefined && brut !== null && style !== '') journal.corrige(chemin, `Le style ${quoi} "${String(brut)}" n'existe pas : « ${styles[0]} » choisi.`);
  return styles[0]!;
}

/** Position verticale des sous-titres, gardée dans [0,15 ; 0,72] (zone visible sur TikTok). */
function lireYSousTitres(brut: unknown, yDefaut: number, journal: Journal, bornes: BornesY): number {
  const y = brut === undefined || brut === null ? null : lireTemps(brut);
  if (y === null) {
    if (brut !== undefined && brut !== null) journal.corrige('sousTitres.y', `La position des sous-titres ${JSON.stringify(brut)} est illisible : ${formaterNombre(yDefaut)} choisi.`);
    return arrondir(yDefaut);
  }
  if (y >= bornes.yMin && y <= bornes.yMax) return arrondir(y);
  const yb = borner(y, bornes.yMin, bornes.yMax);
  const sens = y > bornes.yMax ? 'remontés' : 'descendus';
  journal.corrige('sousTitres.y', `Les sous-titres sortaient de la zone visible sur ${bornes.plateforme} (y = ${formaterNombre(y)}) : ${sens} à ${formaterNombre(yb)}.`);
  return yb;
}

/** `yDefaut` = hauteur par défaut selon la mise en page (ySousTitres dans defauts.ts). */
export function normaliserSousTitres(brut: unknown, journal: Journal, yDefaut: number = SOUS_TITRES.y, bornes: BornesY = BORNES_ST): SousTitres | null {
  if (brut === undefined || brut === null || brut === false) return null;
  if (brut === 'auto' || brut === true) brut = { mots: 'auto' };
  if (!estObjet(brut)) {
    journal.corrige('sousTitres', 'Sous-titres illisibles : retirés.');
    return null;
  }
  verifierCles(brut, ['style', 'y', 'src', 'parLigne', 'mots', ...CLES_SOUS_TITRES_AUTO], 'sousTitres', journal);
  const st: SousTitres = {
    style: lireStyle(brut.style, [...STYLES_SOUS_TITRES, ...STYLES_SOUS_TITRES_AUTO], 'sousTitres.style', 'de sous-titres', journal),
    y: lireYSousTitres(brut.y, yDefaut, journal, bornes),
    parLigne: Math.round(lireNombre(brut.parLigne, 'sousTitres.parLigne', journal, { defaut: SOUS_TITRES.parLigne, min: 1, max: 8, nom: 'le nombre de mots par ligne' })),
    mots: 'auto',
  };
  if (typeof brut.src === 'string') st.src = brut.src;
  Object.assign(st, normaliserSousTitresAuto(brut, journal)); // Montage auto (B) : punchlines
  if (brut.mots === 'auto' || brut.mots === undefined) return st;
  const mots: Mot[] = [];
  lireListe(brut.mots, 'sousTitres.mots', journal).forEach((m, i) => {
    const mot = lireMot(m);
    if (!mot) journal.corrige(`sousTitres.mots[${i}]`, 'Mot illisible : supprimé.');
    else mots.push(mot);
  });
  const tries = [...mots].sort((a, b) => a[1] - b[1]);
  if (tries.some((m, i) => m !== mots[i])) journal.corrige('sousTitres.mots', 'Les mots n\'étaient pas dans l\'ordre : triés.');
  st.mots = tries.map((m, i) => {
    let fin = m[2];
    if (fin < m[1] + SOUS_TITRES.ecartMin) fin = m[1] + SOUS_TITRES.ecartMin;
    if (fin > m[1] + SOUS_TITRES.motMax) fin = m[1] + SOUS_TITRES.motMax;
    if (arrondir(fin) !== m[2]) journal.corrige(`sousTitres.mots[${i}]`, `La fin du mot "${m[0]}" a été corrigée (${formaterSecondes(arrondir(fin))}).`);
    const res: Mot = [m[0], m[1], arrondir(fin)];
    if (m[3] === 1) res.push(1);
    return res;
  });
  return st;
}

/** Accepte ["mot", 1.2, 1.5, 1] ou { txt, ts, fin, fort }. */
function lireMot(m: unknown): Mot | null {
  let txt: unknown, ts: unknown, fin: unknown, fort: unknown;
  if (Array.isArray(m)) [txt, ts, fin, fort] = m;
  else if (estObjet(m)) {
    txt = m.txt ?? m.mot ?? m.texte;
    ts = m.ts ?? m.debut ?? m.de;
    fin = m.fin ?? m.a;
    fort = m.fort;
  } else return null;
  const d = lireTemps(ts);
  if (typeof txt !== 'string' || !txt.trim() || d === null) return null;
  const debut = arrondir(Math.max(0, d));
  const f = lireTemps(fin) ?? debut + SOUS_TITRES.ecartMin;
  return [txt.trim(), debut, arrondir(f), fort ? 1 : 0];
}

/**
 * Sons : id inconnu supprimé (avec 3 ids proches), vol [0 ; 1,5], ni t ni ts → supprimé, les deux → ts.
 * Son importé : son `id` est celui de sa source audio (ex. « a1 »). Une IA peut aussi écrire `src: "a1"` :
 * on le range alors dans `id` (et `src` redevient la source vidéo de `ts`, par défaut la première).
 */
export function normaliserSons(brut: unknown, sonsConnus: readonly string[], journal: Journal, sourcesAudio: readonly string[] = []): Son[] {
  const res: Son[] = [];
  lireListe(brut, 'sons', journal).forEach((brutSon, i) => {
    const ch = `sons[${i}]`;
    if (!estObjet(brutSon)) {
      journal.corrige(ch, 'Son illisible : supprimé.');
      return;
    }
    verifierCles(brutSon, ['id', 't', 'ts', 'src', 'vol', ...CLES_SON_AUTO], ch, journal);
    const b: Objet = { ...brutSon };
    if (typeof b.src === 'string' && sourcesAudio.includes(b.src)) {
      b.id = b.src;
      delete b.src;
    }
    const id = String(b.id ?? '').trim();
    if (!sonsConnus.includes(id) && !sourcesAudio.includes(id)) {
      const p = proches(id, sonsConnus, 3);
      const suggestion = p.length ? ` Sons proches : ${p.join(', ')}.` : '';
      journal.corrige(ch, `Le son "${id}" n'existe pas.${suggestion} Son retiré.`);
      return;
    }
    const pose = lirePose(b, ch, journal, 'Ce son');
    if (!pose) return;
    const son: Son = { id, ...pose, vol: lireNombre(b.vol, `${ch}.vol`, journal, { defaut: SON.vol, min: SON.volMin, max: SON.volMax, nom: 'le volume' }) };
    Object.assign(son, normaliserSonAuto(b, ch, journal)); // Montage auto (E) : rôle, durée, fondu
    res.push(son);
  });
  return res;
}

/** Position d'un élément posé sur la vidéo : `ts` (temps source, prioritaire) ou `t` (temps de sortie). */
function lirePose(b: Objet, ch: string, journal: Journal, quoi: string): { t?: Sec; ts?: Sec; src?: string } | null {
  const t = lireT(b.t, `${ch}.t`, journal);
  const ts = lireT(b.ts, `${ch}.ts`, journal);
  if (t === null && ts === null) {
    journal.corrige(ch, `${quoi} n'a ni "t" ni "ts" : supprimé.`);
    return null;
  }
  if (ts !== null) {
    if (t !== null) journal.corrige(ch, `${quoi} avait "t" et "ts" : seul "ts" (temps de la vidéo source) est gardé.`);
    return typeof b.src === 'string' ? { ts, src: b.src } : { ts };
  }
  return { t: t! };
}

const ZONES_ZOOM: readonly NonNullable<Zoom['zone']>[] = ['tout', 'cam', 'jeu'];

/** `zoneDefaut` = « cam » quand la mise en page globale est Jeu + webcam, sinon « tout ». */
export function normaliserZooms(brut: unknown, journal: Journal, zoneDefaut: 'tout' | 'cam' = 'tout'): Zoom[] {
  const res: Zoom[] = [];
  lireListe(brut, 'zooms', journal).forEach((b, i) => {
    const ch = `zooms[${i}]`;
    if (!estObjet(b)) {
      journal.corrige(ch, 'Zoom illisible : supprimé.');
      return;
    }
    verifierCles(b, ['t', 'ts', 'src', 'dur', 'x', 'y', 'force', 'style', 'zone'], ch, journal);
    const pose = lirePose(b, ch, journal, 'Ce zoom');
    if (!pose) return;
    const style = b.style === 'doux' ? 'doux' : ZOOM.style;
    if (b.style !== undefined && b.style !== 'doux' && b.style !== 'punch') journal.corrige(`${ch}.style`, `Le style de zoom "${String(b.style)}" n'existe pas : "punch" choisi.`);
    res.push({
      ...pose,
      dur: lireNombre(b.dur, `${ch}.dur`, journal, { defaut: ZOOM.dur, min: ZOOM.durMin, max: ZOOM.durMax, nom: 'la durée du zoom' }),
      x: lireNombre(b.x, `${ch}.x`, journal, { defaut: ZOOM.x, min: 0, max: 1, nom: 'le centre du zoom (x)' }),
      y: lireNombre(b.y, `${ch}.y`, journal, { defaut: ZOOM.y, min: 0, max: 1, nom: 'le centre du zoom (y)' }),
      force: lireNombre(b.force, `${ch}.force`, journal, { defaut: ZOOM.force, min: ZOOM.forceMin, max: ZOOM.forceMax, nom: 'la force du zoom' }),
      style,
      zone: lireZone(b.zone, `${ch}.zone`, zoneDefaut, journal),
    });
  });
  return res;
}

function lireZone(brut: unknown, chemin: string, defaut: 'tout' | 'cam', journal: Journal): NonNullable<Zoom['zone']> {
  if (brut === undefined || brut === null) return defaut;
  const z = String(brut).trim().toLowerCase() as NonNullable<Zoom['zone']>;
  if (ZONES_ZOOM.includes(z)) return z;
  journal.corrige(chemin, `La zone de zoom "${String(brut)}" n'existe pas : « ${defaut} » choisie.`);
  return defaut;
}

export function normaliserGuide(brut: unknown, sources: Source[], journal: Journal): SonGuide | null {
  if (brut === undefined || brut === null || brut === false) return null;
  if (!estObjet(brut) || typeof brut.src !== 'string') {
    journal.corrige('guide', 'Le son guide n\'indique pas sa source ("src") : retiré.');
    return null;
  }
  verifierCles(brut, ['src', 't', 'debut', 'vol'], 'guide', journal);
  if (sources.length > 0 && !sources.some((s) => s.id === brut.src)) {
    journal.corrige('guide.src', `La source "${brut.src}" du son guide n'existe pas : son guide retiré.`);
    return null;
  }
  return {
    src: brut.src,
    t: lireT(brut.t, 'guide.t', journal) ?? 0,
    debut: lireT(brut.debut, 'guide.debut', journal) ?? 0,
    vol: lireNombre(brut.vol, 'guide.vol', journal, { defaut: GUIDE.vol, min: GUIDE.volMin, max: GUIDE.volMax, nom: 'le volume du son guide' }),
  };
}

export function normaliserMarqueurs(brut: unknown, journal: Journal): Marqueur[] | undefined {
  if (brut === undefined) return undefined;
  const res: Marqueur[] = [];
  lireListe(brut, 'marqueurs', journal).forEach((b, i) => {
    const ch = `marqueurs[${i}]`;
    const ts = estObjet(b) ? lireT(b.ts, `${ch}.ts`, journal) : null;
    if (!estObjet(b) || ts === null) {
      journal.corrige(ch, 'Repère sans temps "ts" : supprimé.');
      return;
    }
    verifierCles(b, ['ts', 'src', 'type', 'label'], ch, journal);
    const m: Marqueur = { ts, type: typeof b.type === 'string' && b.type ? b.type : 'pic' };
    if (typeof b.src === 'string') m.src = b.src;
    if (typeof b.label === 'string') m.label = b.label;
    res.push(m);
  });
  return res.sort((a, b) => a.ts - b.ts);
}
