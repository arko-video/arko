// Banc réel — « npm run banc-reel -- --v4 … » : la chaîne v4 de l'appli (chaine-v4.ts), puis les mesures.
//
//   --mode mots|voix            un seul mode (défaut : les deux ; mots = Transcrire coché, voix = décoché)
//   --seul <étape[,étape]>      seulement ces étapes en v4, les autres comme avant (tes chiffres ne bougent pas
//                               quand un autre dev enregistre son fichier)
//   --ancien <étapes|tout>      ces étapes comme avant, les autres en v4
//   --reglages avant            Serré, sans musique (le Best-of du 7/11 au matin)
//   --modules whisper,vad       modules présents (les autres absents), ou whisper=refuse,vad=horsLigne,…
//   --empreinte forcee          l'empreinte de voix est « présente »
//   --etape <étape>             mesures de l'étape (mesures/etapes.ts) en plus du tableau
//   --plage de-a  --duree min-max  --whisper-strict  --vad appli|saut|continu  --sans-injection  --nom <dossier>
//   (--vad appli, d'office : VAD + hauteur par le flux exact du Worker « Qui parle » de l'appli, MoteurVad)
//
// Étapes : parole, mots, voix, moments, coupes, sequences, habillage, persos.

import { mkdirSync, writeFileSync } from 'node:fs';
import { NOMS_ETAPES } from '../../../src/auto/express/chaine-best-of';
import type { NomEtape } from '../../../src/auto/types-v4';
import { DOSSIER_RESULTATS, DOSSIER_VERITE } from './chaine';
import { chaineV4, dossierV4, lireEtapes, lireModules, type ModeV4 } from './chaine-v4';
import { motsNettoyesBanc } from './mots-nettoyes';
import { lirePlage } from './principal';
import { DUREE_SOURCE } from './whisper';

const MESURES = '/tests/banc-reel/mesures/mesurer.ts';
const ETAPES = '/tests/banc-reel/mesures/etapes.ts';

const mmss = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`;

export async function lancerV4(options: Map<string, string | true>): Promise<number> {
  const t0 = performance.now();
  const m = options.get('mode');
  const modes: ModeV4[] = m === 'mots' || m === 'voix' ? [m] : ['mots', 'voix'];
  const seul = typeof options.get('seul') === 'string' ? (options.get('seul') as string) : null;
  const anciennes = lireEtapes(options.get('ancien'), seul ?? undefined);
  const reglagesAvant = options.get('reglages') === 'avant';
  const modules = lireModules(options.get('modules'), options.get('empreinte') === 'forcee');
  const plage = options.has('plage') ? lirePlage(options.get('plage'), { de: 0, a: DUREE_SOURCE }) : null;
  const vad = options.get('vad') === 'continu' ? 'continu' : options.get('vad') === 'saut' ? 'saut' : 'appli';
  const etape = typeof options.get('etape') === 'string' ? (options.get('etape') as string) : null;
  if (etape && !(NOMS_ETAPES as readonly string[]).includes(etape) && etape !== 'musique') throw new Error(`--etape : ${[...NOMS_ETAPES, 'musique'].join(', ')}`);
  let dureeVisee: { min: number; max: number } | undefined;
  const d = options.get('duree');
  if (typeof d === 'string') {
    const p = lirePlage(d, { de: 15, a: 20 });
    dureeVisee = { min: p.de * 60, max: p.a * 60 };
  } else if (plage) {
    const part = Math.min(1, (plage.a - plage.de) / 7380);
    dureeVisee = { min: Math.round(900 * part), max: Math.round(1200 * part) };
    console.log(`--plage ${plage.de}–${plage.a} s : durée visée ramenée à ${dureeVisee.min}–${dureeVisee.max} s.`);
  }
  const nom = typeof options.get('nom') === 'string' ? (options.get('nom') as string) : null;
  const enV4 = NOMS_ETAPES.filter((n) => !anciennes.includes(n));
  console.log(`Best-of v4 — étapes v4 : ${enV4.join(', ') || 'aucune'} ; d'avant : ${anciennes.join(', ') || 'aucune'}${reglagesAvant ? ' ; réglages d\'avant (Serré, sans musique)' : ''} ; modules ${JSON.stringify(modules)}`);

  const dossiers: { mode: ModeV4; dossier: string }[] = [];
  let erreur = false;
  for (const mode of modes) {
    try {
      const x = await chaineV4({ mode, anciennes: anciennes as NomEtape[], reglagesAvant, modules, plage, ...(dureeVisee ? { dureeVisee } : {}), whisperStrict: options.has('whisper-strict'), vad, injecterVad: !options.has('sans-injection'), dossier: dossierV4(mode, anciennes, seul, reglagesAvant, plage, nom) });
      const r = x.resume;
      const l = [`── v4, mode « ${mode} » (${x.secondes.toFixed(1)} s) → ${x.dossier}`];
      l.push(`  parole : ${r.parole.methode}, ${r.parole.segments} segments (${Math.round(r.parole.part * 100)} % de la source) ; mode ${r.parole.mode} ; ${r.mots} mots avec texte ; ${r.moments} moments ; ${r.morceaux} morceaux gardés`);
      l.push(r.voix ? `  voix : ${r.voix.voix.length} (${r.voix.par}) : ${r.voix.voix.map((v) => `${v.id} ${v.niveauDb} dB ${Math.round(v.part * 100)} %`).join(' · ')} ; ${r.voix.tours} tours${r.voix.proposerEmpreinte ? ` ; empreinte proposée (${r.voix.proposerEmpreinte})` : ''}` : '  voix : aucune');
      l.push(`  séquences : ${r.scenes.gardees} gardées / ${r.scenes.proposees}, ${mmss(r.scenes.dureeApresCoupes)} après coupes ; ${r.passages} passages pas retenus`);
      if (r.montage) {
        const mo = r.montage;
        l.push(`  montage : ${mmss(mo.duree)}, ${mo.plans} plans (${mo.plansZoomes} zoomés), musique ${mo.musique ? `${mo.musique.morceaux} morceaux${mo.musique.baisseSur ? `, baisse sur la ${mo.musique.baisseSur}` : ''}` : 'NON'}, ${mo.punchlines} punchlines, ${mo.chapitres} chapitres ; sous-titres pour ${mo.sousTitresPour ?? 'personne'} ; persos ${mo.personnes.map((p) => `${p.id} ${p.niveauDb} dB`).join(', ') || 'aucun'}`);
      }
      for (const j of x.journal) l.push(`  journal : ${j}`);
      console.log(l.join('\n'));
      dossiers.push({ mode, dossier: x.dossier });
    } catch (err) {
      erreur = true;
      console.error(`── v4, mode « ${mode} » : ÉCHEC — ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
  }
  const resultats: Record<string, unknown> = {};
  // Mots de référence de la cible « en plein mot » (nettoyés par nettoyerMotsV4 avec la VAD : mots-nettoyes.ts).
  await motsNettoyesBanc({ journal: (x) => console.log(x) });
  const mes = (await import(/* @vite-ignore */ MESURES)) as { mesurerDossier: (s: string, v: string) => Promise<unknown>; afficher: (r: unknown) => string };
  type ModuleEtapes = { mesurerEtape: (nom: string, dossier: string, verite: string) => Promise<unknown>; afficherEtape: (r: unknown) => string };
  let etapes: ModuleEtapes | null = null;
  if (etape) {
    try {
      etapes = (await import(/* @vite-ignore */ ETAPES)) as ModuleEtapes;
    } catch (e) {
      console.log(`(mesures d'étape pas encore là : ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  for (const { mode, dossier } of dossiers) {
    try {
      const r = await mes.mesurerDossier(dossier, DOSSIER_VERITE);
      resultats[mode] = r;
      console.log(`\n══ Mesures v4, mode « ${mode} »\n${mes.afficher(r)}`);
      if (etapes && etape) {
        const re = await etapes.mesurerEtape(etape, dossier, DOSSIER_VERITE);
        resultats[`${mode}:${etape}`] = re;
        console.log(`\n══ Étape « ${etape} », mode « ${mode} »\n${etapes.afficherEtape(re)}`);
      }
    } catch (err) {
      erreur = true;
      console.error(`Mesures du mode « ${mode} » : ÉCHEC —`, err);
    }
  }
  mkdirSync(DOSSIER_RESULTATS, { recursive: true });
  const fichier = `${DOSSIER_RESULTATS}/${new Date().toISOString().replace(/[:.]/g, '-')}-v4.json`;
  writeFileSync(fichier, JSON.stringify({ date: new Date().toISOString(), v4: true, modes, anciennes, seul, reglagesAvant, modules, plage, etape, dossiers, resultats }, null, 1));
  console.log(`\nRésultats : ${fichier} (${((performance.now() - t0) / 1000).toFixed(1)} s en tout)`);
  return erreur ? 1 : 0;
}
