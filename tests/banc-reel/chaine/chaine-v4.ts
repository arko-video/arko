// Banc réel — la chaîne v4 « Best-of serré » (src/auto/express/chaine-best-of.ts) sur la vraie session, dans Node.
//
// Exactement le chemin de l'appli : mesurerPourBestOf (le code de la page, avec les faux Workers : signaux, passe du
// son = empreintes + VAD depuis les caches, Whisper = mots gardés des zones demandées) → analyserChaine →
// revueParDefaut → recetteDeDepart → monterSansMusique → musique automatique (fonctions pures de dev-musique :
// sequencesDuMontage, planifierMusique, morceauxDuPlan, pisteAuto ; une Source par morceau) → poserMusique.
// RIEN de la logique de l'interface n'est recopié ici : seuls l'état des modules (accord donné ou non) et l'ouverture
// des fichiers de musique (le navigateur) sont simulés.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyserChaine, dureeEstimee, etapesAvec, monterSansMusique, NOMS_ETAPES, poserMusique, recetteDeDepart, reglagesBestOfV4, revueParDefaut, type OptionsChaine } from '../../../src/auto/express/chaine-best-of';
import { mesurerPourBestOf } from '../../../src/auto/express/mesures-best-of';
import { candidatsArko, candidatsBibliotheque, candidatsKevin, lireIdArko, MORCEAUX_KEVIN, morceauxDuPlan, nomFichierKevin, nomMusiqueArko, pisteAuto, planifierMusique, remplacerParArko, sequencesDuMontage } from '../../../src/auto/son/musique-auto';
import type { PlageTemps } from '../../../src/auto/types';
import type { AnalyseV4, EtatModule, ModulesBestOf, MusiquePrete, NomEtape } from '../../../src/auto/types-v4';
import { compiler } from '../../../src/recette/chronologie';
import type { Recette, Source } from '../../../src/recette/types';
import { brancherContexte, installerFauxWorker, type ContexteBanc } from './adaptateurs/faux-worker';
import { apercuDefauts, DOSSIER_SORTIE, sourceSession } from './chaine';
import { mesuresSon } from './signaux';
import { cacheVad, type VarianteVad } from './vad';
import { DUREE_SOURCE, lireTranchesFaites, moteurChaine } from './whisper';

export type ModeV4 = 'mots' | 'voix';

export interface OptionsV4 {
  mode: ModeV4;
  /** Étapes reprises d'avant (« --ancien voix,coupes » ; « --seul coupes » = toutes sauf coupes). */
  anciennes: NomEtape[];
  /** « --reglages avant » : Serré, sans musique (le Best-of du 7/11 au matin). */
  reglagesAvant: boolean;
  modules: ModulesBestOf;
  plage: PlageTemps | null;
  dureeVisee?: { min: number; max: number };
  whisperStrict: boolean;
  /** Variante du cache VAD servi par la passe du son. */
  vad: VarianteVad;
  /** Donner la VAD à la chaîne même si la passe du son d'Arko ne la demande pas encore (défaut : oui). */
  injecterVad: boolean;
  /** Dossier de sortie (un par combinaison d'options : plusieurs devs lancent le banc en même temps). */
  dossier: string;
}

const ETATS: readonly EtatModule[] = ['present', 'absent', 'refuse', 'horsLigne', 'erreur'];

/** « --modules whisper,vad » (présents ; les autres absents) ou « whisper=present,vad=refuse,empreinte=absent ». */
export function lireModules(v: string | true | undefined, empreinteForcee: boolean): ModulesBestOf {
  const m: ModulesBestOf = { whisper: 'present', vad: 'present', empreinte: empreinteForcee ? 'present' : 'absent' };
  if (typeof v !== 'string') return m;
  const liste = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (liste.every((x) => !x.includes('='))) {
    const presents = new Set(liste);
    for (const k of ['whisper', 'vad', 'empreinte'] as const) m[k] = presents.has(k) ? 'present' : 'absent';
    if (empreinteForcee) m.empreinte = 'present';
    return m;
  }
  for (const x of liste) {
    const [k, e] = x.split('=') as [string, string];
    if (!['whisper', 'vad', 'empreinte'].includes(k) || !ETATS.includes(e as EtatModule)) throw new Error(`--modules : « ${x} » ? (whisper|vad|empreinte = ${ETATS.join('|')})`);
    m[k as keyof ModulesBestOf] = e as EtatModule;
  }
  return m;
}

/** « --ancien tout » / « --ancien voix,coupes » / « --seul coupes ». */
export function lireEtapes(ancien: string | true | undefined, seul: string | true | undefined): NomEtape[] {
  const verifier = (n: string): NomEtape => {
    if (!(NOMS_ETAPES as readonly string[]).includes(n)) throw new Error(`Étape inconnue « ${n} » (${NOMS_ETAPES.join(', ')}).`);
    return n as NomEtape;
  };
  if (typeof seul === 'string') {
    const gardees = new Set(seul.split(',').map((x) => verifier(x.trim())));
    return NOMS_ETAPES.filter((n) => !gardees.has(n));
  }
  if (ancien === 'tout' || ancien === true) return [...NOMS_ETAPES];
  if (typeof ancien === 'string') return ancien.split(',').filter(Boolean).map((x) => verifier(x.trim()));
  return [];
}

/** Ouvre (simule) le fichier d'un morceau proposé, comme `ouvrir` de musique-express.ts : null s'il manque. */
function sourceDuMorceau(id: string, n: number): Source | null {
  const racine = new URL('../../../public/musiques/kevin-macleod/', import.meta.url).pathname;
  if (id.startsWith('kevin:')) {
    const m = MORCEAUX_KEVIN.find((x) => x.id === id.slice('kevin:'.length));
    const chemin = m ? `${racine}${m.fichier}` : '';
    if (!m || !existsSync(chemin)) return null;
    return { id: `a${n}`, nom: nomFichierKevin(m), taille: statSync(chemin).size, emp: `banc-${basename(chemin)}`, duree: m.duree, type: 'audio' };
  }
  const a = lireIdArko(id);
  if (!a) return null;
  // Musique fabriquée par Arko (toujours possible) : la durée du candidat (boucle de 35 s).
  return { id: `a${n}`, nom: nomMusiqueArko(a.ambiance, a.graine), taille: 0, emp: `banc-${id}`, duree: 35, type: 'audio' };
}

/** preparerMusiqueAuto (ui/auto/express/musique-express.ts) sans le navigateur : mêmes fonctions pures, même ordre. */
export function musiqueAutoBanc(sans: Recette, a: AnalyseV4, journal: string[]): MusiquePrete | null {
  const gardees = a.scenes.filter((s) => s.garde);
  const mots = a.parole === 'mots' ? a.transcription.mots : [];
  const seqs = sequencesDuMontage(sans, gardees, a.signaux, mots);
  if (seqs.length === 0) return null;
  // Ma bibliothèque : vide dans le banc (Romain n'a rien coché) ; Kevin MacLeod « en ligne » ; musiques d'Arko.
  const candidats = [...candidatsBibliotheque([]), ...candidatsKevin(() => true), ...candidatsArko()];
  let plan = planifierMusique(seqs, candidats);
  const ouvertes = new Map<string, Source>();
  for (let tour = 0; tour < 3; tour++) {
    const manquants = [...new Set(plan.groupes.map((g) => g.morceau))].filter((id) => !ouvertes.has(id));
    if (manquants.length === 0) break;
    for (const id of manquants) {
      const s = sourceDuMorceau(id, ouvertes.size + 1);
      if (s) ouvertes.set(id, s);
      else {
        journal.push(`Musique : ${id} introuvable dans public/musiques → musique fabriquée.`);
        plan = remplacerParArko(plan, id);
      }
    }
  }
  const morceaux = morceauxDuPlan(plan, (id) => ouvertes.get(id)?.id);
  const sources = [...ouvertes.values()].filter((s) => morceaux.some((m) => m.src === s.id));
  return morceaux.length > 0 ? { piste: pisteAuto(morceaux, a), sources } : null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Chiffres de la passe v4 (tableau, banc.json). */
export function resumerV4(a: AnalyseV4, r: Recette | null) {
  const sc = r ? compiler(r) : null;
  const gardees = a.scenes.filter((s) => s.garde);
  return {
    parole: { mode: a.parole, methode: a.paroleDetectee.methode, segments: a.paroleDetectee.segments.length, part: r2(a.paroleDetectee.part) },
    mots: a.transcription.mots.filter((m) => m[0].trim()).length,
    bilanMots: a.bilanMots,
    voix: a.voix ? { par: a.voix.separation.par, methode: a.voix.methode, voix: a.voix.voix.map((v) => ({ id: v.id, niveauDb: r1(v.niveauDb), part: r2(v.part) })), tours: a.voix.tours.length, proposerEmpreinte: a.voix.separation.proposerEmpreinte } : null,
    moments: a.moments.length,
    morceaux: a.morceaux.length,
    scenes: { proposees: a.scenes.length, gardees: gardees.length, dureeApresCoupes: r1(gardees.reduce((t, s) => t + s.duree, 0)), liste: gardees.map((s) => ({ de: s.de, a: s.a, duree: s.duree, centile: s.centile, bloc: s.bloc })) },
    passages: a.passages.length,
    modules: a.modules,
    montage: r && sc
      ? {
          duree: r1(sc.duree),
          plans: sc.plans.length,
          plansZoomes: r.plans.filter((p) => p.zoomFixe).length,
          musique: r.musique ? { morceaux: r.musique.morceaux.length, baisseSur: (r.musique as { baisseSur?: string }).baisseSur ?? null } : null,
          punchlines: r.sousTitres?.punchlines?.length ?? 0,
          sousTitresPour: r.sousTitres?.pour ?? null,
          chapitres: r.chapitres?.length ?? 0,
          personnes: (r.personnes ?? []).map((p) => ({ id: p.id, niveauDb: p.niveauDb === undefined ? null : r1(p.niveauDb) })),
          tours: r.paroles?.length ?? 0,
        }
      : null,
  };
}

/** Une passe v4 : écrit recette / analyse / activite / banc.json dans `o.dossier`. */
export async function chaineV4(o: OptionsV4): Promise<{ dossier: string; resume: ReturnType<typeof resumerV4>; journal: string[]; secondes: number; apercu: ReturnType<typeof apercuDefauts> | null }> {
  const t0 = performance.now();
  const duree = DUREE_SOURCE;
  const journal: string[] = [];
  const mesures = await mesuresSon(duree);
  const { vad, meta: metaVad, hauteur } = await cacheVad(duree, { variante: o.vad });
  const moteur = moteurChaine();
  const tranches = lireTranchesFaites(moteur);
  const seuil = 10 ** (-60 / 20);
  const aDuSon = (de: number, a: number) => {
    let n = 0;
    for (let k = Math.max(0, Math.floor(de / 0.02)); k < Math.min(mesures.enveloppe.length, Math.ceil(a / 0.02)); k++) if (mesures.enveloppe[k]! >= seuil) n++;
    return n * 0.02 >= 1;
  };
  const contexte: ContexteBanc = { duree, mesures, tranches, finDuSon: duree, aDuSon, plage: o.plage, journal, whisperStrict: o.whisperStrict, vad, hauteur: hauteur ?? null };
  brancherContexte(contexte);
  installerFauxWorker();

  const source = sourceSession(duree);
  const base = reglagesBestOfV4('youtube');
  let reg = { ...base.express, transcrire: o.mode === 'mots' };
  if (o.reglagesAvant) reg = { ...reg, niveauBlancs: 'serre', musiqueAuto: false, musique: [] };
  if (o.dureeVisee) reg = { ...reg, dureeVisee: o.dureeVisee };
  const bestOf = { ...base.bestOf };
  const etapes = etapesAvec(o.anciennes);
  const opts: OptionsChaine = { etapes, journal };

  // « Enlever les bords » : la vidéo est fictive, Arko attrape l'erreur (aucun rognage) — on la range au journal.
  const warn = console.warn;
  console.warn = (...x: unknown[]) => {
    if (typeof x[0] === 'string' && x[0].startsWith('[Arko] bords de l\'écran non trouvés')) journal.push('Bords de l\'écran : pas d\'images (vidéo fictive) → aucun rognage.');
    else if (typeof x[0] === 'string' && x[0].startsWith('[Arko] Best-of v4 :')) journal.push(String(x.slice(1).join(' ')));
    else warn(...x);
  };
  let analyse: AnalyseV4;
  let recette: Recette | null = null;
  let temps: Record<string, number> | null = null;
  try {
    let m = await mesurerPourBestOf(source, reg, bestOf, { modules: o.modules, pistes: [] });
    if (o.modules.vad === 'present' && !m.vad && o.injecterVad) {
      // La passe du son d'Arko ne demande pas encore la VAD (vad/passe-son.ts) : sans elle, personne ne pourrait
      // mesurer son étape. Le banc la donne (même cache, même masque de --plage), et le dit.
      const p = Uint8Array.from(vad.p);
      if (o.plage) for (let k = 0; k < p.length; k++) if ((k + 0.5) * vad.pas < o.plage.de || (k + 0.5) * vad.pas >= o.plage.a) p[k] = 0;
      m = { ...m, vad: { src: m.src, pas: vad.pas, p, plages: vad.plages, modele: vad.modele }, modules: { ...m.modules, vad: 'present' } };
      journal.push('VAD INJECTÉE par le banc : la passe du son d\'Arko ne l\'a pas demandée (vad/passe-son.ts) ; --sans-injection pour voir l\'appli telle quelle.');
    } else if (o.modules.vad === 'present' && !m.vad) journal.push('VAD : la passe du son d\'Arko ne l\'a pas rendue (modules.vad = « erreur »).');
    const tA = performance.now();
    analyse = analyserChaine(m, reg, bestOf, opts);
    const revue = revueParDefaut(analyse);
    const tR = performance.now();
    const annoncee = dureeEstimee(analyse, revue.scenes, reg);
    const tM = performance.now();
    const depart = recetteDeDepart(source.infos, 'youtube', `Best-of — ${source.infos.nom.replace(/\.[^.]+$/, '')}`);
    const sans = monterSansMusique(depart, analyse, revue, reg, bestOf, opts);
    const musique = reg.musiqueAuto !== false ? musiqueAutoBanc(sans, analyse, journal) : null;
    recette = sans === depart ? depart : poserMusique(sans, musique);
    const tF = performance.now();
    const duree = compiler(recette).duree;
    temps = { analyse: r2((tR - tA) / 1000), dureeEstimee: r2((tM - tR) / 1000), montage: r2((tF - tM) / 1000), annoncee, montee: r1(duree), ecart: r2(Math.abs(duree - annoncee)) };
    journal.push(`Temps : chaîne pure ${temps.analyse} s, durée annoncée ${temps.dureeEstimee} s, montage + musique ${temps.montage} s ; durée annoncée ${annoncee} s, montée ${r1(duree)} s (écart ${temps.ecart} s).`);
  } finally {
    console.warn = warn;
  }

  mkdirSync(o.dossier, { recursive: true });
  writeFileSync(
    `${o.dossier}/analyse.json`,
    JSON.stringify({
      parole: analyse.parole,
      mots: analyse.transcription.mots,
      scenes: analyse.scenes,
      voix: analyse.voix,
      passages: analyse.passages,
      avertissements: analyse.avertissements,
      // v4 (en plus) : segments de parole, moments, morceaux gardés, bilan des mots, modules.
      v: 4,
      paroleDetectee: { ...analyse.paroleDetectee, probas: null },
      moments: analyse.moments,
      morceaux: analyse.morceaux,
      bilanMots: analyse.bilanMots,
      modules: analyse.modules,
      besoins: analyse.besoins,
    }),
  );
  writeFileSync(`${o.dossier}/recette.json`, JSON.stringify(recette));
  const v = mesures.voix;
  writeFileSync(`${o.dossier}/activite.json`, JSON.stringify({ pas: v.pas, db: Array.from(v.db, (x) => Math.round(x * 10) / 10) }));
  const resume = resumerV4(analyse, recette);
  const apercu = recette ? apercuDefauts(recette, analyse.parole === 'mots' ? analyse.transcription.mots : [], v.db, v.pas) : null;
  const secondes = (performance.now() - t0) / 1000;
  writeFileSync(
    `${o.dossier}/banc.json`,
    JSON.stringify(
      {
        format: 'arko.banc-chaine/2',
        v4: true,
        ecrit: new Date().toISOString(),
        mode: o.mode,
        plage: o.plage,
        anciennes: o.anciennes,
        reglagesAvant: o.reglagesAvant,
        modules: o.modules,
        reglages: reg,
        bestOf,
        whisper: `onnxruntime-${moteur} (mots gardés ; les zones demandées sont servies sans refaire Whisper)`,
        vad: { variante: o.vad, entree: metaVad.entree, modele: metaVad.modele, injectee: journal.some((l) => l.startsWith('VAD INJECTÉE')) },
        secondes: r1(secondes),
        temps,
        journal,
        resume,
        apercu,
      },
      null,
      1,
    ),
  );
  return { dossier: o.dossier, resume, journal, secondes, apercu };
}

/** Nom du dossier de sortie d'une combinaison d'options (les devs lancent leurs bancs en parallèle). */
export function dossierV4(mode: ModeV4, anciennes: readonly NomEtape[], seul: string | null, reglagesAvant: boolean, plage: PlageTemps | null, nom: string | null): string {
  const cle = nom ?? [seul ? `seul-${seul}` : anciennes.length === NOMS_ETAPES.length ? 'ancien-tout' : anciennes.length > 0 ? `ancien-${anciennes.join('+')}` : 'complet', reglagesAvant ? 'reglages-avant' : '', plage ? `plage-${plage.de}-${plage.a}` : ''].filter(Boolean).join('_');
  return `${DOSSIER_SORTIE}/v4/${cle}/${mode}`;
}
