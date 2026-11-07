// Banc réel — cache de la VAD Silero v5 sur TOUTE la session (onnxruntime-node, 1 fil, une trame à la fois).
// Sortie (hors dépôt) : /home/claude/banc-cache/vad-v5.u8 (p × 255 par trame de 32 ms) + vad-v5.json (pas, plages
// passées dans le modèle, modèle, entrée, temps).
//
// Règles du contrat (§1.1) : trames de 512 échantillons à 16 kHz + 64 de contexte (les 64 derniers de la trame
// d'avant), état [2, 1, 128], sr = 16000 ; une trame de silence numérique (RMS < −60 dBFS) ne passe pas dans le
// modèle (p = 0) ; après ≥ 1 s sautée, état et contexte repartent de zéro.
// Entrée : `son-16k.f32` (ffmpeg, comme /home/claude/modeles/essais/vad.cjs et probas-vad-v5.f32, le contrôle).
// Quand dev-vad aura écrit src/auto/vad/silero.ts (MoteurVad), le faux Worker pourra le faire tourner lui-même.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AccumulateurHauteur } from '../../../src/auto/moments/hauteur';
import type { PlageTemps } from '../../../src/auto/types';
import type { HauteurVoix, ProbasVad, SessionOnnx } from '../../../src/auto/types-v4';
import { FileSon16k } from '../../../src/auto/vad/file-son';
import { Vers16k } from '../../../src/auto/vad/reechantillonnage';
import { MoteurVad } from '../../../src/auto/vad/silero';
import { ouvrirSessionNode } from './adaptateurs/onnx-node';
import { DOSSIER_CACHE, IMAGES_PAR_MORCEAU, SonPcm } from './son';

export const MODELE_VAD = process.env.BANC_MODELE_VAD ?? '/home/claude/modeles/silero-vad-v5/model.onnx';
/** Le modèle RANGÉ DANS L'APPLI (même fichier, SHA-256 vérifié par dev-vad) : la variante « appli » le prend. */
export const MODELE_VAD_APPLI = new URL('../../../public/modeles/silero-vad-v5.onnx', import.meta.url).pathname;
/**
 * Variante : 'appli' (défaut, intégrateur) = le flux EXACT du Worker « Qui parle » de l'appli (48 kHz par morceaux de
 * 1024 → Vers16k → MoteurVad aux réglages d'office → FileSon16k → AccumulateurHauteur), avec la hauteur ; 'saut'
 * (ancienne règle du contrat : trames < −60 dBFS sautées, état remis à zéro) ; 'continu' (toutes les trames).
 */
export type VarianteVad = 'appli' | 'saut' | 'continu';
export function fichiersVad(v: VarianteVad): { u8: string; json: string; hauteur?: string } {
  if (v === 'appli') return { u8: `${DOSSIER_CACHE}/vad-appli.u8`, json: `${DOSSIER_CACHE}/vad-appli.json`, hauteur: `${DOSSIER_CACHE}/hauteur-appli.f32` };
  const base = v === 'saut' ? `${DOSSIER_CACHE}/vad-v5` : `${DOSSIER_CACHE}/vad-v5-continu`;
  return { u8: `${base}.u8`, json: `${base}.json` };
}
const CONTROLE = '/home/claude/modeles/essais/probas-vad-v5.f32';

const FEN = 512;
const CTX = 64;
export const PAS_VAD = FEN / 16000;
const SEUIL_SILENCE = 10 ** (-60 / 20);
/** Trames sautées d'affilée au-delà desquelles l'état repart de zéro (≥ 1 s). */
const SAUT_RAZ = Math.ceil(1 / PAS_VAD);

export interface MetaVad {
  format: 'arko.banc-vad/1';
  pas: number;
  plages: PlageTemps[];
  modele: string;
  fichierModele: string;
  entree: string;
  duree: number;
  trames: number;
  tramesCalculees: number;
  secondes: number;
  ecrit: string;
  controle?: string;
}

/** Probabilités de voix de toute la source (une session, un seul flux, dans l'ordre). */
export async function calculerVad(
  son: SonPcm,
  session: SessionOnnx,
  duree: number,
  sauter = true,
  journal: (m: string) => void = console.log,
): Promise<{ p: Uint8Array; plages: PlageTemps[]; calculees: number }> {
  const n = Math.ceil(duree / PAS_VAD - 1e-9);
  const p = new Uint8Array(n);
  let etat = new Float32Array(2 * 128);
  const contexte = new Float32Array(CTX);
  const sr = { type: 'int64' as const, data: BigInt64Array.from([16000n]), dims: [] as number[] };
  const plages: PlageTemps[] = [];
  let sautees = 0;
  let calculees = 0;
  const bloc = 16000 * 60;
  let suivant = performance.now() + 30_000;
  for (let i0 = 0; i0 < n * FEN; i0 += bloc) {
    const x = son.lireImages(i0, Math.min(n * FEN, i0 + bloc));
    for (let j = 0; j < x.length; j += FEN) {
      const k = (i0 + j) / FEN;
      if (k >= n) break;
      const trame = new Float32Array(FEN);
      trame.set(x.subarray(j, Math.min(x.length, j + FEN)));
      let e = 0;
      for (let i = 0; i < FEN; i++) e += trame[i]! * trame[i]!;
      if (sauter && Math.sqrt(e / FEN) < SEUIL_SILENCE) {
        sautees++;
        if (sautees === SAUT_RAZ) {
          etat = new Float32Array(2 * 128);
          contexte.fill(0);
        }
        continue;
      }
      sautees = 0;
      const entree = new Float32Array(CTX + FEN);
      entree.set(contexte, 0);
      entree.set(trame, CTX);
      contexte.set(trame.subarray(FEN - CTX));
      const r = await session.run({ input: { type: 'float32', data: entree, dims: [1, CTX + FEN] }, state: { type: 'float32', data: etat, dims: [2, 1, 128] }, sr });
      etat = Float32Array.from(r.stateN!.data as Float32Array);
      p[k] = Math.max(0, Math.min(255, Math.round((r.output!.data as Float32Array)[0]! * 255)));
      calculees++;
      const de = k * PAS_VAD;
      const der = plages[plages.length - 1];
      if (der && Math.abs(der.a - de) < 1e-6) der.a = de + PAS_VAD;
      else plages.push({ de, a: de + PAS_VAD });
    }
    if (performance.now() > suivant) {
      suivant = performance.now() + 30_000;
      journal(`  VAD : ${Math.round((i0 + bloc) / 16000)} s sur ${Math.round(duree)}…`);
    }
  }
  return { p, plages: plages.map((x) => ({ de: Math.round(x.de * 1000) / 1000, a: Math.round(x.a * 1000) / 1000 })), calculees };
}

/** Écart avec le contrôle de l'agent « références » (probas-vad-v5.f32, 0–3000 s, sans saut du silence). */
function controler(p: Uint8Array): string | undefined {
  if (!existsSync(CONTROLE)) return undefined;
  const b = readFileSync(CONTROLE);
  const c = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  let n = 0;
  let loin = 0;
  let accord = 0;
  for (let k = 0; k < Math.min(c.length, p.length); k++) {
    n++;
    const d = Math.abs(p[k]! / 255 - c[k]!);
    if (d > 0.1) loin++;
    if (p[k]! / 255 >= 0.5 === c[k]! >= 0.5) accord++;
  }
  return `contrôle 0–${Math.round((n * PAS_VAD))} s : ${((100 * loin) / n).toFixed(2)} % des trames à plus de 0,1 ; même décision (p ≥ 0,5) sur ${((100 * accord) / n).toFixed(2)} %`;
}

/**
 * La passe du son du Worker « Qui parle » (src/auto/voix/worker-voix.ts), VAD + hauteur, telle quelle : même son
 * (48 kHz, morceaux de 1024 comme Mediabunny), mêmes classes de l'appli, même ordre (la hauteur ne reçoit un morceau
 * qu'une fois que la VAD a jugé ses trames). Seule la session ONNX est onnxruntime-node au lieu de -web (dev-vad :
 * écart 0 / 255 sur 60 s).
 */
export async function passeSonAppli(duree: number, journal: (m: string) => void = console.log): Promise<{ vad: Omit<ProbasVad, 'src'>; hauteur: HauteurVoix; bilan: unknown; secondes: number }> {
  const son = new SonPcm();
  const session = await ouvrirSessionNode(MODELE_VAD_APPLI);
  const moteur = new MoteurVad(session, duree);
  const vers = new Vers16k();
  const acc = new AccumulateurHauteur(duree);
  const file = new FileSon16k();
  const probas = () => ({ pas: moteur.pas, p: moteur.p });
  const t0 = performance.now();
  const bloc = son.frequence * 30;
  let suivant = performance.now() + 30_000;
  const fin = Math.min(son.images, Math.round(duree * son.frequence));
  for (let i0 = 0; i0 < fin; i0 += bloc) {
    const x = son.lireImages(i0, Math.min(fin, i0 + bloc));
    for (let j = 0; j < x.length; j += IMAGES_PAR_MORCEAU) {
      const m = x.subarray(j, Math.min(x.length, j + IMAGES_PAR_MORCEAU));
      const r16 = vers.ajouter(m, son.frequence, (i0 + j) / son.frequence);
      if (!r16) continue;
      await moteur.ajouter(r16.pcm, r16.t0);
      file.pousser(r16.pcm, r16.t0);
      for (const y of file.prendreJusqua(moteur.fait)) acc.ajouter(y.pcm, y.t0, probas());
    }
    if (performance.now() > suivant) {
      suivant = performance.now() + 30_000;
      journal(`  passe du son (appli) : ${Math.round((i0 + bloc) / son.frequence)} s sur ${Math.round(duree)}…`);
    }
  }
  await moteur.finir();
  for (const y of file.vider()) acc.ajouter(y.pcm, y.t0, probas());
  const secondes = (performance.now() - t0) / 1000;
  son.fermer();
  await session.release?.();
  return { vad: moteur.resultat(), hauteur: acc.resultat(), bilan: moteur.bilan, secondes };
}

function lireU8(chemin: string): Uint8Array {
  const b = readFileSync(chemin);
  return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** Calcule (ou relit) le cache VAD de la session (variante « appli » : avec la hauteur de la voix). */
export async function cacheVad(
  duree: number,
  o: { refaire?: boolean; variante?: VarianteVad; journal?: (m: string) => void } = {},
): Promise<{ vad: Omit<ProbasVad, 'src'>; meta: MetaVad; hauteur?: HauteurVoix | null }> {
  const journal = o.journal ?? console.log;
  const variante = o.variante ?? 'appli';
  const f = fichiersVad(variante);
  if (!o.refaire && existsSync(f.u8) && existsSync(f.json) && (!f.hauteur || existsSync(f.hauteur))) {
    const meta = JSON.parse(readFileSync(f.json, 'utf8')) as MetaVad & { pasHauteur?: number };
    let hauteur: HauteurVoix | null = null;
    if (f.hauteur) {
      const b = readFileSync(f.hauteur);
      hauteur = { pas: meta.pasHauteur ?? 0.02, f0: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
    }
    return { vad: { pas: meta.pas, p: lireU8(f.u8), plages: meta.plages, modele: meta.modele }, meta, hauteur };
  }
  if (variante === 'appli') {
    journal(`Passe du son de l'appli (MoteurVad + hauteur, onnxruntime-node 1 fil) sur ${Math.round(duree)} s…`);
    const r = await passeSonAppli(duree, journal);
    const controle = controler(r.vad.p);
    const meta: MetaVad & { pasHauteur: number; bilan: unknown } = {
      format: 'arko.banc-vad/1',
      pas: r.vad.pas,
      plages: r.vad.plages,
      modele: r.vad.modele,
      fichierModele: MODELE_VAD_APPLI,
      entree: 'son-48k.f32 par morceaux de 1024 → Vers16k → MoteurVad (REGLAGES_MOTEUR_VAD d\'office) → FileSon16k → AccumulateurHauteur : le Worker « Qui parle » de l\'appli',
      duree,
      trames: r.vad.p.length,
      tramesCalculees: (r.bilan as { calculees?: number }).calculees ?? 0,
      secondes: Math.round(r.secondes * 10) / 10,
      ecrit: new Date().toISOString(),
      pasHauteur: r.hauteur.pas,
      bilan: r.bilan,
      ...(controle ? { controle } : {}),
    };
    writeFileSync(f.u8, Buffer.from(r.vad.p.buffer, r.vad.p.byteOffset, r.vad.p.byteLength));
    writeFileSync(f.hauteur!, Buffer.from(r.hauteur.f0.buffer, r.hauteur.f0.byteOffset, r.hauteur.f0.byteLength));
    writeFileSync(f.json, JSON.stringify(meta, null, 1));
    journal(`  ${meta.tramesCalculees} trames calculées sur ${meta.trames} en ${r.secondes.toFixed(0)} s → ${f.u8}, ${f.hauteur}${controle ? `\n  ${controle}` : ''}`);
    return { vad: r.vad, meta, hauteur: r.hauteur };
  }
  const son = new SonPcm(`${DOSSIER_CACHE}/son-16k.f32`, 16000);
  const session = await ouvrirSessionNode(MODELE_VAD);
  journal(`VAD Silero v5 (onnxruntime-node, 1 fil, ${variante}) sur ${Math.round(duree)} s…`);
  const t0 = performance.now();
  const { p, plages, calculees } = await calculerVad(son, session, duree, variante === 'saut', journal);
  const secondes = (performance.now() - t0) / 1000;
  son.fermer();
  await session.release?.();
  const controle = controler(p);
  const meta: MetaVad = {
    format: 'arko.banc-vad/1',
    pas: PAS_VAD,
    plages,
    modele: 'silero-vad-v5',
    fichierModele: MODELE_VAD,
    entree:
      variante === 'saut'
        ? 'son-16k.f32 (ffmpeg, Opus 16 kHz de la session) ; trames < −60 dBFS sautées (p = 0), état remis à zéro après ≥ 1 s sautée'
        : 'son-16k.f32 (ffmpeg, Opus 16 kHz de la session) ; toutes les trames, état continu',
    duree,
    trames: p.length,
    tramesCalculees: calculees,
    secondes: Math.round(secondes * 10) / 10,
    ecrit: new Date().toISOString(),
    ...(controle ? { controle } : {}),
  };
  writeFileSync(f.u8, Buffer.from(p.buffer, p.byteOffset, p.byteLength));
  writeFileSync(f.json, JSON.stringify(meta, null, 1));
  journal(`  ${calculees} trames calculées sur ${p.length} en ${secondes.toFixed(0)} s → ${f.u8}${controle ? `\n  ${controle}` : ''}`);
  return { vad: { pas: meta.pas, p, plages, modele: meta.modele }, meta };
}
