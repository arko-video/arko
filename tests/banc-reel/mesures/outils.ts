// Banc réel — commandes des mesures (lancées par tests/banc-reel/mesures/lancer-mesures.ts, dans le module runner
// de Vite, hors `npm test`) :
//   plafond [--ecrire]     la vérité contre elle-même (doit donner ~100 %) ; --ecrire garde la recette dans le cache
//   mesurer <dossier>      mesure une sortie de banc-chaine (recette.json, analyse.json, activite.json)
//   calibrer               seuils de coupe / voix forte / silences vus sur les coupes de la VÉRITÉ (activite.json requis)
// Les résultats vont dans $BANC_CACHE/resultats/ (hors dépôt).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afficher, mesurer, mesurerDossier, plagesTranscrites, REGLAGES, type Activite, type Iv, type Verite } from './mesurer';
import { recetteParfaite } from './plafond';
import { bordsDeCoupe, bruitDeFond, dansUnMot, intervallesMots, lireMontage, voixDesDeuxCotes } from './temps';

const ICI = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_VERITE = resolve(ICI, '../verite');
const CACHE = process.env.BANC_CACHE ?? '/home/claude/banc-cache';

const lire = <T>(ch: string): T => JSON.parse(readFileSync(ch, 'utf8')) as T;

/**
 * Niveau de la voix : activite.json du cache ou d'une sortie de banc-chaine, sinon directement le cache des signaux de
 * banc-chaine (signaux/energie-voix.f32 : énergie de la bande voix 300–3400 Hz en dB, toutes les 20 ms).
 */
export function trouverActivite(): { chemin: string; act: Activite } | null {
  const candidats = [join(CACHE, 'activite.json')];
  const sortie = join(CACHE, 'sortie');
  if (existsSync(sortie)) for (const d of readdirSync(sortie)) candidats.push(join(sortie, d, 'activite.json'));
  for (const ch of candidats) if (existsSync(ch)) return { chemin: ch, act: lire<Activite>(ch) };
  const f32 = join(CACHE, 'signaux', 'energie-voix.f32');
  if (existsSync(f32)) {
    const b = readFileSync(f32);
    return { chemin: f32, act: { pas: 0.02, db: new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)) } };
  }
  return null;
}

export function trouverMots(): { chemin: string; mots: Iv[]; plages: Iv[] | null } | null {
  const ch = join(CACHE, 'mots-arko.json');
  if (!existsSync(ch)) return null;
  const brut = lire<unknown>(ch);
  return { chemin: ch, mots: intervallesMots(brut), plages: plagesTranscrites(brut) };
}

function ecrire(nom: string, contenu: unknown) {
  const d = join(CACHE, 'resultats');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, nom), JSON.stringify(contenu, null, 1));
  return join(d, nom);
}

function plafond(ecrireRecette: boolean): number {
  const v = lire<Verite>(join(DOSSIER_VERITE, 'verite.json'));
  const { recette, analyse, mots: motsVerite } = recetteParfaite(v);
  const whisper = trouverMots();
  const act = trouverActivite();
  const res = mesurer({
    verite: v, recette, analyse, activite: act?.act ?? null,
    mots: whisper?.mots ?? motsVerite,
    plagesMots: whisper?.plages ?? null,
    origineMots: whisper ? whisper.chemin : 'bouches de la vérité (pas de mots de Whisper)',
    dossier: 'plafond (vérité contre elle-même)',
  });
  console.log(afficher(res));
  console.log(`→ ${ecrire('plafond.json', res)}`);
  if (ecrireRecette) {
    const d = join(CACHE, 'sortie', 'plafond');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'recette.json'), JSON.stringify(recette));
    writeFileSync(join(d, 'analyse.json'), JSON.stringify(analyse));
    console.log(`→ recette du plafond : ${d}`);
  }
  return 0;
}

async function mesurerSortie(dossier: string): Promise<number> {
  const res = await mesurerDossier(resolve(dossier), DOSSIER_VERITE);
  console.log(afficher(res));
  console.log(`→ ${ecrire(`${basename(resolve(dossier))}.json`, res)}`);
  return 0;
}

/** Ce que les seuils donnent sur les coupes de la vérité (elle doit avoir 0 coupe en plein mot / pendant la voix forte). */
function calibrer(): number {
  const v = lire<Verite>(join(DOSSIER_VERITE, 'verite.json'));
  const { recette } = recetteParfaite(v);
  const m = lireMontage(recette);
  const bords = bordsDeCoupe(m);
  console.log(`Vérité : ${bords.length} bords de coupe (${m.plans.length} plans).`);
  const whisper = trouverMots();
  if (whisper) {
    const dans = (t: number) => !whisper.plages || whisper.plages.some(([x, y]) => t >= x && t < y);
    const transcrits = bords.filter((b) => dans(b.ts));
    console.log(`  mots : ${whisper.mots.length} (${whisper.plages ? whisper.plages.map(([x, y]) => `${x}–${y} s`).join(', ') : 'toute la source'}) ; ${transcrits.length} bords dans la partie transcrite`);
    for (const tol of [0, 0.03, 0.05, 0.1, 0.15]) {
      const n = transcrits.filter((b) => dansUnMot(whisper.mots, b.ts, tol)).length;
      console.log(`  en plein mot (Whisper, tolérance ${tol * 1000} ms) : ${n}`);
    }
  } else console.log('  pas de mots de Whisper (mots-arko.json) : en plein mot non calibré');
  const a = trouverActivite();
  if (!a) {
    console.log('  pas d’activite.json : voix forte non calibrée');
    return 0;
  }
  console.log(`  activité : ${a.chemin} (pas ${a.act.pas} s, ${a.act.db.length} valeurs)`);
  const bruit = bruitDeFond(a.act, REGLAGES.fenetreBruit, REGLAGES.centileBruit);
  // Points où une coupe serait fautive : le milieu de la parole de la vérité (fenêtres de plus de 0,3 s).
  const milieux = (P: 'R' | 'G') => v.parole[P].filter(([x, y]) => y - x > 0.3).map(([x, y]) => (x + y) / 2);
  for (const min of [-100, -50, -45, -40, -35]) {
    const f = (t: number) => voixDesDeuxCotes(a.act, bruit, t, REGLAGES.fenetreVoix, REGLAGES.margeVoixDb, min).forte;
    const n = bords.filter((b) => f(b.ts)).length;
    const det = (P: 'R' | 'G') => {
      const l = milieux(P);
      return `${Math.round((100 * l.filter(f).length) / Math.max(1, l.length))} %`;
    };
    console.log(`  voix forte des 2 côtés, ≥ max(fond + ${REGLAGES.margeVoixDb}, ${min} dB) : vérité ${n}/${bords.length} (${((100 * n) / bords.length).toFixed(1)} %) · repère au milieu de la parole : Romain ${det('R')}, Guts ${det('G')}`);
  }
  // Silences du montage de la vérité selon le seuil « actif » (sans mots, puis avec les bouches de la vérité comme mots).
  const { recette: rp, analyse: ap, mots: bouches } = recetteParfaite(v);
  for (const actifMinDb of [-45, -55, -60, -65, -70, -75]) {
    const sans = mesurer({ verite: v, recette: rp, analyse: ap, activite: a.act, mots: null, reglages: { actifMinDb } });
    const avec = mesurer({ verite: v, recette: rp, analyse: ap, activite: a.act, mots: bouches, reglages: { actifMinDb } });
    const t = (r: typeof sans) => r.mesures.find((x) => x.cle === 'cuts.silences')!.texte;
    const w = whisper ? mesurer({ verite: v, recette: rp, analyse: ap, activite: a.act, mots: whisper.mots, plagesMots: whisper.plages, reglages: { actifMinDb } }) : null;
    console.log(`  silences > 0,5 s de la vérité, actif ≥ ${actifMinDb} dB : activité seule ${t(sans)} ; + bouches ${t(avec)}${w ? ` ; + Whisper ${t(w)}` : ''}`);
    if (actifMinDb === REGLAGES.actifMinDb) {
      const l = ((avec.details.cuts as { silences: [number, number][] | null }).silences ?? []).map(([x, y]) => y - x);
      const classes = [0.7, 1, 1.5, 2, Infinity].map((h, i, t) => `${i === 0 ? 0.5 : t[i - 1]}–${h} s : ${l.filter((d) => d > (i === 0 ? 0.5 : t[i - 1]!) && d <= h).length}`);
      console.log(`    durées (60 premiers) : ${classes.join(' · ')}`);
      const sc = (avec.details.cuts as { silences: [number, number][] | null }).silences ?? [];
      const m = lireMontage(rp);
      const pres = sc.map(([x, y]) => {
        const c = bords.filter((b) => b.t >= x - 0.05 && b.t <= y + 0.05).length;
        return c;
      });
      console.log(`    silences qui contiennent une coupe : ${pres.filter((c) => c > 0).length}/${sc.length} ; dans l'accroche : ${sc.filter(([x]) => x < m.finAccroche).length}`);
    }
  }
  return 0;
}

export async function commande(argv: readonly string[]): Promise<number> {
  const [cmd, ...reste] = argv;
  switch (cmd) {
    case 'plafond':
      return plafond(reste.includes('--ecrire'));
    case 'mesurer':
      if (!reste[0]) throw new Error('mesurer <dossier de sortie>');
      return mesurerSortie(reste[0]);
    case 'calibrer':
      return calibrer();
    default:
      console.log('Commandes : plafond [--ecrire] | mesurer <dossier> | calibrer');
      return 1;
  }
}
