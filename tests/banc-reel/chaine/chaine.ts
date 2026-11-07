// Banc réel — la chaîne « Montage express → Best-of serré, SANS IA » d'Arko sur la VRAIE session de Romain, dans Node.
//
// Tout le code d'Arko tourne tel quel (analyserPourBestOf → analyserPourExpress → lireSignauxSource,
// transcrireLongue, mesurerVoix, ecouterVoix → analyserQuiParle → scenesBestOf ; puis construireBestOf). Seuls
// sont remplacés : les Workers (faux-worker.ts, branchés sur les caches), IndexedDB (idb-keyval.ts, en mémoire) et
// ce que fait l'interface (interface.ts, recopié à l'identique). La vidéo est « noire » et fictive : 11976 s,
// 1280 × 720, 30 i/s, une piste de son (le son de la session, lu dans le cache).
//
// Sorties (hors dépôt) : /home/claude/banc-cache/sortie/<mode>/{recette,analyse,activite,banc}.json.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AnalyseBestOf, SceneBestOf } from '../../../src/auto/express/best-of';
import { dureeGardee } from '../../../src/auto/express/scenes';
import type { PlageTemps } from '../../../src/auto/types';
import type { SourceOuverte } from '../../../src/moteur/api';
import { recetteInitiale } from '../../../src/moteur/sources';
import { compiler } from '../../../src/recette/chronologie';
import type { Mot, Recette, Source } from '../../../src/recette/types';
import { brancherContexte, installerFauxWorker, type ContexteBanc } from './adaptateurs/faux-worker';
import { analyserCommeLaPage, montagePossible, monterCommeLaPage, reglagesBestOfDefaut, reglagesDe } from './interface';
import { lirePlage } from './principal';
import { mesuresSon } from './signaux';
import { DOSSIER_CACHE } from './son';
import { DUREE_SOURCE, lireTranchesFaites, moteurChaine, tranchesSource } from './whisper';

export const DOSSIER_SORTIE = process.env.BANC_SORTIE ?? `${DOSSIER_CACHE}/sortie`;
export const DOSSIER_RESULTATS = `${DOSSIER_CACHE}/resultats`;
export const DOSSIER_VERITE = new URL('../verite/', import.meta.url).pathname;
const MESURES = '/tests/banc-reel/mesures/mesurer.ts';

export type Mode = 'mots' | 'voix';
export type Etape = 'voix' | 'scenes' | 'coupes';

/** La vidéo de la session telle qu'Arko l'ouvre (ouvrirSource) : une vidéo, une piste de son (pas de `pistes`). */
export function sourceSession(duree = DUREE_SOURCE): SourceOuverte {
  const nom = 'session.mp4';
  const infos: Source = { id: 's1', nom, taille: 4_000_000_000, emp: 'banc-reel-session-romain', duree, type: 'video', l: 1280, h: 720 };
  return { infos, verticale: false, fichier: new File([], nom, { type: 'video/mp4' }) };
}

/** Musique donnée au banc (--musique) : copiée dans le projet comme la 1re source audio (a1). */
function sourceMusique(chemin: string): Source {
  const duree = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', chemin]).toString().trim());
  return { id: 'a1', nom: basename(chemin), taille: statSync(chemin).size, emp: `banc-musique-${basename(chemin)}`, duree: Math.round(duree * 100) / 100, type: 'audio' };
}

const SEUIL_SON = 10 ** (-60 / 20);

/** Fin du son : dernière trame au-dessus de −60 dBFS (comme le seuil des passages muets). */
function finDuSon(enveloppe: Float32Array, pas: number): number {
  for (let k = enveloppe.length - 1; k >= 0; k--) if (enveloppe[k]! >= SEUIL_SON) return (k + 1) * pas;
  return 0;
}

/** Au moins 1 s de son au-dessus de −60 dBFS entre de et a ? */
function aDuSon(enveloppe: Float32Array, pas: number, de: number, a: number): boolean {
  let n = 0;
  for (let k = Math.max(0, Math.floor(de / pas)); k < Math.min(enveloppe.length, Math.ceil(a / pas)); k++) if (enveloppe[k]! >= SEUIL_SON) n++;
  return n * pas >= 1;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mmss = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Chiffres de ce que la chaîne a produit (pour le tableau, le rapport et banc.json). */
export function resumer(analyse: AnalyseBestOf, scenes: readonly SceneBestOf[], r: Recette | null) {
  const gardees = scenes.filter((s) => s.garde);
  const sc = r ? compiler(r) : null;
  const pour = r?.sousTitres?.pour;
  const lignesPour = sc?.sousTitres?.lignes.filter((l) => l.style !== undefined).length ?? 0;
  return {
    parole: analyse.parole,
    mots: analyse.transcription.mots.length,
    motsAvecTexte: analyse.transcription.mots.filter((m) => m[0].trim()).length,
    voix: analyse.voix
      ? { methode: analyse.voix.methode, sure: r2(analyse.voix.sure), voix: analyse.voix.voix.map((v) => ({ id: v.id, niveauDb: r1(v.niveauDb), part: r2(v.part) })), tours: analyse.voix.tours.length }
      : null,
    scenes: {
      proposees: scenes.length,
      gardees: gardees.length,
      resserrees: gardees.filter((s) => s.morceaux && s.morceaux.length > 0).length,
      dureeGardee: r1(dureeGardee(scenes)),
      liste: gardees.map((s) => ({ de: s.de, a: s.a, duree: s.duree, score: Math.round(s.score), titre: s.titre, raison: s.raison, morceaux: s.morceaux?.length ?? 0 })),
    },
    passages: analyse.passages.length,
    avertissements: analyse.avertissements,
    montage: r && sc
      ? {
          duree: r1(sc.duree),
          plans: sc.plans.length,
          musique: r.musique ? r.musique.morceaux.length : 0,
          volumeFinal: r.volumeFinal ?? null,
          sousTitres: r.sousTitres ? { mode: r.sousTitres.mode ?? 'tout', mots: Array.isArray(r.sousTitres.mots) ? r.sousTitres.mots.length : 0, pour: pour ?? null, lignes: sc.sousTitres?.lignes.length ?? 0, lignesPour } : null,
          punchlines: r.sousTitres?.punchlines?.length ?? 0,
          zooms: r.zooms.length,
          plansZoomes: r.plans.filter((p) => p.zoomFixe).length,
          accroche: sc.plans[0] ? { de: sc.plans[0].de, a: sc.plans[0].a } : null,
          textes: r.textes.length,
          chapitres: r.chapitres?.length ?? 0,
          personnes: (r.personnes ?? []).map((p) => ({ id: p.id, nom: p.nom, niveauDb: p.niveauDb === undefined ? null : r1(p.niveauDb), perso: p.chibi ? 'oui' : 'non' })),
          tours: r.paroles?.length ?? 0,
          avatars: r.avatars ? 'oui' : 'non',
          rognage: (r.rognages ?? []).length,
          sons: r.sons.length,
        }
      : null,
  };
}

/** Aperçu rapide des défauts (en attendant / en plus des mesures de banc-verite) : temps de sortie. */
export function apercuDefauts(r: Recette, mots: readonly Mot[], db: Float32Array, pas: number) {
  const sc = compiler(r);
  const src = r.sources.find((s) => s.type === 'video')?.id ?? 's1';
  const plans = sc.plans.filter((p) => p.src === src && !r.plans[p.i]?.ins);
  // Coupes en plein mot : un bord de plan (temps source) tombe à l'intérieur d'un mot (à 30 ms près).
  const avecTexte = mots.filter((m) => m[0].trim());
  const tries = [...avecTexte].sort((x, y) => x[1] - y[1]);
  const dansMot = (t: number) => {
    let lo = 0;
    let hi = tries.length - 1;
    while (lo <= hi) {
      const mi = (lo + hi) >> 1;
      const m = tries[mi]!;
      if (m[2] - 0.03 <= t) lo = mi + 1;
      else if (m[1] + 0.03 >= t) hi = mi - 1;
      else return true;
    }
    return false;
  };
  let coupesEnPleinMot = 0;
  for (const p of plans) {
    if (dansMot(p.de)) coupesEnPleinMot++;
    if (dansMot(p.a)) coupesEnPleinMot++;
  }
  // Blancs : dans le montage, passages de plus de 0,5 s où la voix (énergie 300–3400 Hz) reste 10 dB sous son
  // niveau médian de parole — mesure grossière, la vraie est dans les mesures de banc-verite.
  const parole: number[] = [];
  // (trames au-dessus de −70 dB seulement : Whisper invente des mots dans les passages muets)
  for (const m of avecTexte) for (let k = Math.floor(m[1] / pas); k < Math.ceil(m[2] / pas); k++) if (db[k] !== undefined && db[k]! > -70) parole.push(db[k]!);
  parole.sort((x, y) => x - y);
  const mediane = parole.length > 0 ? parole[Math.floor(parole.length / 2)]! : -40;
  const seuil = mediane - 10;
  let blancs = 0;
  let dureeBlancs = 0;
  let courant = 0;
  const finir = () => {
    if (courant > 0.5) {
      blancs++;
      dureeBlancs += courant;
    }
    courant = 0;
  };
  for (const p of plans) {
    for (let t = p.de; t < p.a; t += pas) {
      const v = db[Math.floor(t / pas)] ?? -100;
      if (v < seuil) courant += pas;
      else finir();
    }
    finir();
  }
  const dureePlans = plans.reduce((t, p) => t + (p.a - p.de), 0);
  return { plans: plans.length, coupesEnPleinMot, seuilBlancDb: r1(seuil), blancsPlusDe05s: blancs, dureeBlancs: r1(dureeBlancs), partBlancs: r2(dureeBlancs / Math.max(1, dureePlans)) };
}

interface OptionsChaine {
  mode: Mode;
  etape: Etape;
  plage: PlageTemps | null;
  musique: string | null;
  dureeVisee?: { min: number; max: number };
  /** Une erreur de transformers.js arrête l'analyse, comme dans le navigateur. */
  whisperStrict: boolean;
}

/** Une passe de la chaîne pour un mode ; écrit le dossier de sortie et renvoie son résumé. */
export async function chaineUnMode(o: OptionsChaine): Promise<{ dossier: string; resume: ReturnType<typeof resumer>; apercu: ReturnType<typeof apercuDefauts> | null; secondes: number }> {
  const t0 = performance.now();
  const duree = DUREE_SOURCE;
  const mesures = await mesuresSon(duree);
  const fin = finDuSon(mesures.enveloppe, 0.02);
  const moteur = moteurChaine();
  const tranches = lireTranchesFaites(moteur);
  const journal: string[] = [];
  const contexte: ContexteBanc = { duree, mesures, tranches, finDuSon: fin, aDuSon: (de, a) => aDuSon(mesures.enveloppe, 0.02, de, a), plage: o.plage, journal, whisperStrict: o.whisperStrict };
  brancherContexte(contexte);
  installerFauxWorker();

  if (o.mode === 'mots') {
    const voulue = o.plage ?? { de: 0, a: duree };
    const manquantes = tranchesSource(duree).filter(
      (t) => t.de < voulue.a && t.a > voulue.de && !tranches.some((x) => Math.abs(x.tranche.de - t.de) < 0.01) && contexte.aDuSon(Math.max(t.de, voulue.de), Math.min(t.a, voulue.a)),
    );
    if (manquantes.length > 0) {
      throw new Error(
        `Mode « mots » : ${manquantes.length} tranche(s) de 5 min pas encore transcrite(s) (${manquantes.map((t) => `${t.de}–${t.a}`).join(', ')}). ` +
          'Attendre la fin de « npm run banc-reel -- transcrire » (journal : /home/claude/banc-cache/whisper/journal.log), ou utiliser --plage.',
      );
    }
  }

  const source = sourceSession(duree);
  const musiques = o.musique ? [sourceMusique(o.musique)] : [];
  const reg = reglagesDe({ destination: 'youtube', transcrire: o.mode === 'mots', musique: musiques.map((m) => `mes-sons-${m.nom}`), ...(o.dureeVisee ? { dureeVisee: o.dureeVisee } : {}) });
  const bestOf = reglagesBestOfDefaut();
  const recetteImport = recetteInitiale(source, 'youtube');
  // La vidéo est fictive (pas d'images) : « Enlever les bords » échoue comme sur un fichier illisible (rien n'est rogné).
  const warn = console.warn;
  console.warn = (...x: unknown[]) => {
    if (typeof x[0] === 'string' && x[0].startsWith('[Arko] bords de l\'écran non trouvés')) journal.push('Bords de l\'écran : pas d\'images (vidéo fictive) → aucun rognage.');
    else warn(...x);
  };
  let analyseFaite: Awaited<ReturnType<typeof analyserCommeLaPage>>;
  try {
    analyseFaite = await analyserCommeLaPage(source, reg, bestOf, recetteImport);
  } finally {
    console.warn = warn;
  }
  const { analyse, sousTitresPour } = analyseFaite;
  const scenes = analyse.scenes as SceneBestOf[];
  let recette: Recette | null = null;
  const possible = montagePossible(scenes, 'youtube');
  if (o.etape === 'coupes') {
    if (!possible.possible) journal.push(`« Monter la vidéo » serait grisé (${Math.round(possible.total)} s gardées, limite ${possible.max} s).`);
    recette = monterCommeLaPage(source, analyse, scenes, reg, bestOf, 'youtube', musiques, sousTitresPour);
  }

  const dossier = `${DOSSIER_SORTIE}/${o.mode}`;
  mkdirSync(dossier, { recursive: true });
  writeFileSync(
    `${dossier}/analyse.json`,
    JSON.stringify({ parole: analyse.parole, mots: analyse.transcription.mots, scenes, voix: analyse.voix, passages: analyse.passages, avertissements: analyse.avertissements }),
  );
  if (recette) writeFileSync(`${dossier}/recette.json`, JSON.stringify(recette));
  else if (existsSync(`${dossier}/recette.json`)) writeFileSync(`${dossier}/recette.json`, 'null');
  const v = mesures.voix;
  writeFileSync(`${dossier}/activite.json`, JSON.stringify({ pas: v.pas, db: Array.from(v.db, (x) => Math.round(x * 10) / 10) }));
  const resume = resumer(analyse, scenes, recette);
  const apercu = recette ? apercuDefauts(recette, analyse.parole === 'mots' ? analyse.transcription.mots : [], v.db, v.pas) : null;
  const secondes = (performance.now() - t0) / 1000;
  const meta = {
    format: 'arko.banc-chaine/1',
    ecrit: new Date().toISOString(),
    mode: o.mode,
    etape: o.etape,
    plage: o.plage,
    reglages: reg,
    bestOf,
    sousTitresPour,
    musique: musiques.map((m) => m.nom),
    finDuSon: r1(fin),
    tranchesTranscrites: tranches.length,
    whisper: `onnxruntime-${moteur}`,
    secondes: r1(secondes),
    journal,
    resume,
    apercu,
  };
  writeFileSync(`${dossier}/banc.json`, JSON.stringify(meta, null, 1));
  return { dossier, resume, apercu, secondes };
}

function afficherResume(mode: Mode, x: Awaited<ReturnType<typeof chaineUnMode>>): string {
  const r = x.resume;
  const l: string[] = [`── Mode « ${mode} » (${x.secondes.toFixed(1)} s) → ${x.dossier}`];
  l.push(`  parole : ${r.parole} ; ${r.mots} mots (${r.motsAvecTexte} avec texte)`);
  l.push(r.voix ? `  voix : ${r.voix.voix.length} (${r.voix.methode}, sûre ${Math.round(r.voix.sure * 100)} %) : ${r.voix.voix.map((v) => `${v.id} ${v.niveauDb} dB ${Math.round(v.part * 100)} %`).join(' · ')} ; ${r.voix.tours} tours` : '  voix : aucune');
  l.push(`  séquences : ${r.scenes.gardees} gardées / ${r.scenes.proposees} (${r.scenes.resserrees} resserrées), ${mmss(r.scenes.dureeGardee)} ; ${r.passages} passages pas retenus`);
  if (r.montage) {
    const m = r.montage;
    l.push(`  montage : ${mmss(m.duree)}, ${m.plans} plans (${m.plansZoomes} zoomés), musique ${m.musique > 0 ? `oui (${m.musique})` : 'NON'}, ${m.punchlines} punchlines, ${m.chapitres} chapitres, ${m.textes} textes`);
    l.push(`  sous-titres : ${m.sousTitres ? `${m.sousTitres.mode}, pour ${m.sousTitres.pour ?? 'personne'} (${m.sousTitres.lignesPour} lignes)` : 'aucun'} ; persos : ${m.personnes.length} (${m.personnes.map((p) => `${p.id} ${p.niveauDb} dB`).join(', ')}), ${m.tours} tours, avatars ${m.avatars}`);
  }
  if (x.apercu) {
    const a = x.apercu;
    l.push(`  aperçu (grossier) : ${a.coupesEnPleinMot} bords de plan dans un mot ; voix sous ${a.seuilBlancDb} dB plus de 0,5 s : ${Math.round(a.partBlancs * 100)} % du montage (${a.blancsPlusDe05s} fois)`);
  }
  for (const a of r.avertissements) l.push(`  avertissement : ${a}`);
  return l.join('\n');
}

/** npm run banc-reel [-- --mode mots|voix] [--etape voix|scenes|coupes] [--plage de-a] [--musique fichier] [--duree min-max]. */
export async function lancerChaine(options: Map<string, string | true>): Promise<number> {
  if (options.has('v4')) {
    const { lancerV4 } = await import('./lancer-v4');
    return lancerV4(options);
  }
  const t0 = performance.now();
  const m = options.get('mode');
  const modes: Mode[] = m === 'mots' || m === 'voix' ? [m] : ['mots', 'voix'];
  const e = options.get('etape');
  const etape: Etape = e === 'voix' || e === 'scenes' ? e : 'coupes';
  const plage = options.has('plage') ? lirePlage(options.get('plage'), { de: 0, a: DUREE_SOURCE }) : null;
  const musique = typeof options.get('musique') === 'string' ? (options.get('musique') as string) : null;
  let dureeVisee: { min: number; max: number } | undefined;
  const d = options.get('duree');
  if (typeof d === 'string') {
    const p = lirePlage(d, { de: 15, a: 20 });
    dureeVisee = { min: p.de * 60, max: p.a * 60 };
  } else if (plage) {
    // --plage : la durée visée suit la part de la session (Romain : 15–20 min pour ≈ 7380 s de son).
    const part = Math.min(1, (plage.a - plage.de) / 7380);
    dureeVisee = { min: Math.round(900 * part), max: Math.round(1200 * part) };
    console.log(`--plage ${plage.de}–${plage.a} s : durée visée ramenée à ${dureeVisee.min}–${dureeVisee.max} s (--duree min-max pour la choisir).`);
  }
  const dossiers: { mode: Mode; dossier: string }[] = [];
  let erreur = false;
  for (const mode of modes) {
    try {
      const x = await chaineUnMode({ mode, etape, plage, musique, whisperStrict: options.has('whisper-strict'), ...(dureeVisee ? { dureeVisee } : {}) });
      console.log(afficherResume(mode, x));
      dossiers.push({ mode, dossier: x.dossier });
    } catch (err) {
      erreur = true;
      console.error(`── Mode « ${mode} » : ÉCHEC — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Mesures (agent banc-verite) : tests/banc-reel/mesures/mesurer.ts → mesurerDossier, afficher.
  const resultats: Record<string, unknown> = {};
  if (etape !== 'coupes') {
    console.log(`\n(--etape ${etape} : pas de recette, donc pas de mesures ; voir analyse.json et banc.json.)`);
  } else if (existsSync(new URL('../mesures/mesurer.ts', import.meta.url).pathname)) {
    const mes = (await import(/* @vite-ignore */ MESURES)) as {
      mesurerDossier: (dossierSortie: string, dossierVerite: string) => Promise<unknown>;
      afficher: (r: unknown) => string;
    };
    for (const { mode, dossier } of dossiers) {
      try {
        const r = await mes.mesurerDossier(dossier, DOSSIER_VERITE);
        resultats[mode] = r;
        console.log(`\n══ Mesures, mode « ${mode} »\n${mes.afficher(r)}`);
      } catch (err) {
        erreur = true;
        console.error(`Mesures du mode « ${mode} » : ÉCHEC —`, err);
      }
    }
  } else {
    console.log('\n(Mesures pas encore là : tests/banc-reel/mesures/mesurer.ts — écrit par banc-verite. Les sorties sont prêtes.)');
  }
  mkdirSync(DOSSIER_RESULTATS, { recursive: true });
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const fichier = `${DOSSIER_RESULTATS}/${date}.json`;
  writeFileSync(fichier, JSON.stringify({ date: new Date().toISOString(), modes, etape, plage, musique, dossiers, resultats }, null, 1));
  console.log(`\nRésultats : ${fichier} (${((performance.now() - t0) / 1000).toFixed(1)} s en tout)`);
  return erreur ? 1 : 0;
}
