// Monteur IA (docs/monteur-ia/etapes.md, A3 + A4) : le dossier de la vidéo analysée (Montage express ou Best-of),
// construit depuis l'analyse en cours, et son téléchargement (« Envoyer au monteur IA »). Rien n'est envoyé sur un
// serveur : le fichier reste sur l'appareil, Romain l'ouvre dans Mon Hub.

import { signal } from '@preact/signals';
import { construireDossier, type Dossier, type FichierDossier } from '../../../auto/monteur-ia/dossier';
import { validerPlan, type EffetPlan, type PlanValide } from '../../../auto/monteur-ia/plan';
import { cleNom } from '../../../auto/apprentissage/gouts';
import { placeMeme } from '../../../auto/insertion/memes-auto';
import { compiler, sortiesDe } from '../../../recette/chronologie';
import { gabaritDe } from '../../../recette/destination';
import { ajouterIncrustation } from '../../../recette/operations-bibliotheque';
import { ajouterSon, ajouterSource } from '../../../recette/operations-effets';
import type { Incrustation, Son, Source } from '../../../recette/types';
import { cleParDefaut, sourceDuClip } from '../../clips-montage';
import { modifier, recette } from '../../etat';
import { copierMonSon } from '../son/etat-son';
import { listerClips } from '../../../moteur/api';
import { gouts, lireExemples } from '../../apprentissage';
import { afficherToast } from '../../etat';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { nomsVoix } from './etat-best-of';
import { analyseExpress, chaineYoutube, destinationExpress, reglagesExpress, scenesExpress, sourceExpress } from './etat-express';
import { regardActif } from './regard-ui';
import { ecouteActive } from '../son/ecoute-ui';

/** A3. Le dossier de l'analyse en cours (null s'il n'y a rien d'analysé). */
export async function dossierDepuisAnalyse(): Promise<Dossier | null> {
  const a = analyseExpress.peek();
  const source = sourceExpress.peek();
  if (!a || !source) return null;
  await chargerMesSons().catch(() => undefined);
  const clips = await listerClips().catch(() => []);
  const bibliotheque: FichierDossier[] = [
    ...mesSons.peek().map((s) => ({ nom: s.nom, duree: s.duree, rayon: s.rayon === 'musiques' ? ('musiques' as const) : ('bruitages' as const), ...(s.ecoute ? { ecoute: s.ecoute } : {}) })),
    ...clips.map((c) => ({ nom: c.nom, duree: c.duree, rayon: c.rayon })),
  ];
  const voix = a.voix ?? null;
  const noms = nomsVoix.peek();
  return construireDossier({
    da: destinationExpress.peek() === 'youtube' ? 'youtube' : 'tiktok',
    duree: source.infos.duree,
    dureeVisee: reglagesExpress.peek().dureeVisee,
    mots: a.transcription?.mots ?? [],
    tours: voix?.tours ?? [],
    personnes: (voix?.voix ?? []).map((v, k) => ({ id: v.id, nom: noms[v.id] ?? `Voix ${k + 1}` })),
    signaux: a.signaux ?? null,
    // Le dérush d'Arko tel que Romain le voit sur la revue (scènes cochées) : Mon Hub part de lui et l'améliore.
    scenes: scenesExpress.peek().length > 0 ? scenesExpress.peek() : (a.scenes ?? []),
    bibliotheque,
    gouts: gouts.peek(),
    exemples: lireExemples(),
    reglages: (() => {
      const r = reglagesExpress.peek();
      const chaine = chaineYoutube.peek().trim();
      return {
        ...(chaine ? { chaine } : {}),
        accroche: r.accroche,
        punchlines: r.punchlines,
        bruitages: r.bruitages,
        zooms: r.zooms,
        sections: r.sections,
        musiqueAuto: r.musiqueAuto === true,
        persos: r.persos !== false,
        regard: regardActif.peek(),
        ecoute: ecouteActive.peek(),
      };
    })(),
  });
}

/** A4. « Envoyer au monteur IA » : télécharge `dossier-monteur.json`. */
export async function telechargerDossier(): Promise<void> {
  const d = await dossierDepuisAnalyse();
  if (!d) return afficherToast('Analyse d\'abord une vidéo.', 4000);
  const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = 'dossier-monteur.json';
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  afficherToast(`Dossier prêt (${d.phrases.length} phrases, ${Math.round(blob.size / 1024)} Ko) : ouvre-le dans Mon Hub → Monteur IA.`, 8000);
}

/** A10. Le « pourquoi » de chaque choix du dernier plan appliqué (montré dans Habiller → Sons). */
export const pourquoisPlan = signal<{ quand: string; quoi: string; pourquoi: string }[]>([]);

/** D3a. Titres, miniature et intro proposés par le dernier plan appliqué (écran Miniature, panneau « Pourquoi »). */
export const ideesPlan = signal<{ titres: string[]; miniature: string | null; intro: string | null }>({ titres: [], miniature: null, intro: null });

/** A10. Garde les raisons du plan au moment de l'appliquer. */
export function retenirPourquois(p: PlanValide['plan']) {
  ideesPlan.value = { titres: p.titres, miniature: p.miniature?.texte || null, intro: p.intro };
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  pourquoisPlan.value = [
    ...p.sequences.map((s) => ({ quand: mmss(s.de), quoi: `Séquence « ${s.titre || 'sans titre'} »`, pourquoi: s.pourquoi })),
    ...p.effets.map((e) => ({ quand: mmss(e.t), quoi: `${e.type} ${e.quoi}`, pourquoi: e.pourquoi })),
  ].filter((x) => x.pourquoi);
}

/** A5. Le dernier plan ouvert et validé (null : aucun), avec le journal des corrections. */
export const planMonteur = signal<PlanValide | null>(null);

/** A5. « Ouvrir un plan » : lit `plan-monteur.json`, le valide contre le dossier de l'analyse en cours. */
export async function ouvrirPlan(fichier: File): Promise<PlanValide | null> {
  const d = await dossierDepuisAnalyse();
  if (!d) {
    afficherToast('Analyse d\'abord la vidéo du plan.', 4000);
    return null;
  }
  let brut: unknown = null;
  try {
    brut = JSON.parse(await fichier.text());
  } catch {
    afficherToast('Ce fichier n\'est pas un plan lisible.', 5000);
    return null;
  }
  const v = validerPlan(brut, d);
  planMonteur.value = v;
  afficherToast(`Plan ouvert : ${v.plan.sequences.length} séquences, ${v.plan.effets.length} effets${v.journal.length > 0 ? `, ${v.journal.length} correction${v.journal.length > 1 ? 's' : ''}` : ''}.`, 8000);
  return v;
}

/**
 * A8. Les bruitages, accents, mèmes et fonds verts du plan, avec les fichiers de Ma bibliothèque (copiés / ouverts
 * au moment de poser), en UNE opération. Temps du plan = temps SOURCE : un son suit les coupes (ts) ; un clip est
 * posé en temps de sortie (sauté si son moment a été coupé). Renvoie le nombre posé.
 */
export async function poserEffetsBibliotheque(effets: readonly EffetPlan[]): Promise<number> {
  const r0 = recette.peek();
  const src = r0?.sources.find((x) => x.type === 'video')?.id;
  if (!r0 || !src) return 0;
  await chargerMesSons().catch(() => undefined);
  const sons = new Map(mesSons.peek().map((x) => [cleNom(x.nom), x]));
  const clips = new Map((await listerClips().catch(() => [])).map((c) => [cleNom(c.nom), c]));
  const sc = compiler(r0);
  const paysage = gabaritDe(r0).paysage;
  const aPoser: { son?: Son; inc?: Incrustation; source: Source }[] = [];
  for (const e of effets) {
    if (e.type === 'bruitage' || e.type === 'accent') {
      const m = sons.get(cleNom(e.quoi));
      const s = m ? await copierMonSon(m.id).catch(() => null) : null;
      if (!s) continue;
      const accent = e.type === 'accent';
      aPoser.push({ source: s.infos, son: { id: s.infos.id, ts: e.t, src, vol: accent ? 0.4 : 0.63, role: accent ? 'accent' : 'bruitage', dur: Math.min(accent ? 1.2 : 4, s.infos.duree), fondu: accent ? 0.15 : 0.3 } });
    } else if (e.type === 'meme' || e.type === 'fondVert') {
      const c = clips.get(cleNom(e.quoi));
      const t = sortiesDe(sc, src, e.t)[0];
      if (!c || t === undefined) continue;
      const s = await sourceDuClip(c).catch(() => null);
      if (!s) continue;
      const inc: Incrustation = { src: s.infos.id, t, de: 0, a: Math.min(4, c.duree), genre: c.fond ? 'fondVert' : 'meme', ...placeMeme({ fond: c.fond !== null }, paysage) };
      if (c.fond) inc.cle = cleParDefaut(c);
      aPoser.push({ source: s.infos, inc });
    }
  }
  if (aPoser.length === 0) return 0;
  let n = 0;
  modifier((r) => {
    let res = r;
    for (const x of aPoser) {
      if (x.son) {
        res = ajouterSource(res, x.source);
        const y = ajouterSon(res, x.son);
        if (y.i >= 0) (res = y.recette), n++;
      } else if (x.inc) {
        const y = ajouterIncrustation(res, x.inc, x.source);
        if (y.i >= 0) (res = y.recette), n++;
      }
    }
    return res;
  });
  return n;
}

/* ------------------------------------------------------------------ C2 / C3 : lien direct avec Mon Hub */

/** Adresse du monteur IA de Mon Hub sur CET appareil (docs/monteur-ia/plan.md §4 ; protocole en bas de plan.md). */
export const MON_HUB = { url: 'http://127.0.0.1:47321', attenteEtat: 5000, attentePlan: 15 * 60 * 1000 } as const;

export const etatMonHub = signal<'inconnu' | 'connecte' | 'absent' | 'occupe' | 'bloque'>('inconnu');

/**
 * 10/11/2026 : Chrome / Edge récents (« accès au réseau local ») bloquent une page web qui parle à Mon Hub
 * (127.0.0.1) tant que l'utilisateur ne l'a pas permis. Mon Hub répondait bien, mais Arko voyait « absent ».
 * Rend vrai si le navigateur dit que c'est refusé.
 */
async function reseauLocalRefuse(): Promise<boolean> {
  for (const name of ['loopback-network', 'local-network-access', 'local-network']) {
    try {
      const p = await navigator.permissions.query({ name: name as PermissionName });
      if (p.state === 'denied') return true;
      if (p.state === 'granted') return false;
    } catch {
      /* nom inconnu de ce navigateur */
    }
  }
  return false;
}

async function avecDelai(url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

/** C2. Mon Hub est-il lancé sur cet appareil ? (GET /etat → { monteur: true }) */
export async function verifierMonHub(): Promise<boolean> {
  try {
    const r = await avecDelai(`${MON_HUB.url}/etat`, { method: 'GET' }, MON_HUB.attenteEtat);
    const e = r.ok ? ((await r.json().catch(() => null)) as { monteur?: boolean; occupe?: boolean } | null) : null;
    const ok = e?.monteur === true;
    // Mon Hub prépare déjà un plan (son bouton « Créer le plan ») : il est là, mais il faut attendre.
    etatMonHub.value = ok ? (e?.occupe ? 'occupe' : 'connecte') : 'absent';
    return ok && !e?.occupe;
  } catch {
    etatMonHub.value = (await reseauLocalRefuse()) ? 'bloque' : 'absent';
    return false;
  }
}

/**
 * C2. « Demander au monteur IA » : envoie le dossier à Mon Hub (POST /plan), valide le plan reçu. C3 : Mon Hub
 * absent ou en erreur → un message, et « Monter » fait comme d'habitude (règles d'Arko). Rien ne sort de l'appareil.
 */
export async function demanderPlanMonHub(): Promise<PlanValide | null> {
  const d = await dossierDepuisAnalyse();
  if (!d) {
    afficherToast('Analyse d\'abord une vidéo.', 4000);
    return null;
  }
  if (!(await verifierMonHub())) {
    if (etatMonHub.peek() === 'bloque') {
      afficherToast('Ton navigateur empêche Arko de parler à Mon Hub. Clique sur le cadenas à gauche de l\'adresse → Autorisations → « Accès au réseau local » (ou « Appareils locaux ») → Autoriser, puis recharge la page.', 15000);
      return null;
    }
    if (etatMonHub.peek() === 'occupe') {
      afficherToast('Mon Hub prépare déjà un plan : attends qu\'il ait fini, puis redemande.', 8000);
      return null;
    }
    afficherToast('Mon Hub n\'est pas lancé sur cet appareil : « Monter » utilisera les règles d\'Arko (ou passe par « Envoyer au monteur IA »).', 8000);
    return null;
  }
  afficherToast('Le monteur IA de Mon Hub réfléchit… (quelques minutes pour une longue session)', 8000);
  try {
    const r = await avecDelai(`${MON_HUB.url}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }, MON_HUB.attentePlan);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = validerPlan(await r.json(), d);
    planMonteur.value = v;
    afficherToast(`Plan reçu : ${v.plan.sequences.length} séquences, ${v.plan.effets.length} effets. « Monter » va l'utiliser.`, 8000);
    return v;
  } catch (e) {
    console.warn('[Arko] monteur IA', e);
    afficherToast('Le monteur IA n\'a pas répondu : « Monter » utilisera les règles d\'Arko.', 8000);
    return null;
  }
}