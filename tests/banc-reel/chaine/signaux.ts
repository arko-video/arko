// Banc réel — les mesures du son de la session, faites par les accumulateurs d'Arko eux-mêmes sur le son décodé à
// 48 kHz (comme le navigateur les reçoit de Mediabunny), puis gardées dans le cache (hors dépôt) :
// - enveloppe (RMS toutes les 20 ms) : la passe son du Worker d'analyse du monteur IA (ia/lecture-analyse.ts
//   passeSon + ia/signaux.ts Enveloppe), lue ensuite par lireSignauxSource ;
// - énergie de la voix (bande 300–3400 Hz) : la boucle de auto/coupes/worker-voix.ts + AccumulateurVoix ;
// - empreintes de voix (niveau + 8 bandes) : la boucle de auto/voix/worker-voix.ts + AccumulateurEmpreintes.
// Les boucles des deux Workers « voix » sont recopiées ici (elles ne sont pas exportées, et elles ouvrent le fichier
// avec Mediabunny) : elles ne font que passer chaque morceau décodé (mono) à l'accumulateur.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AccumulateurVoix, type EnergieVoix } from '../../../src/auto/coupes/voix';
import type { EmpreintesVoix } from '../../../src/auto/types-v3';
import { AccumulateurEmpreintes } from '../../../src/auto/voix/empreintes';
import { passeSon } from '../../../src/ia/lecture-analyse';
import { Enveloppe, PAS_ENVELOPPE } from '../../../src/ia/signaux';
import type { AudioSampleSink } from 'mediabunny';
import { DOSSIER_CACHE, fauxSink, FREQUENCE_PCM, IMAGES_PAR_MORCEAU, SonPcm } from './son';

export const DOSSIER_SIGNAUX = FREQUENCE_PCM === 48000 ? `${DOSSIER_CACHE}/signaux` : `${DOSSIER_CACHE}/signaux-${FREQUENCE_PCM / 1000}k`;
/** Version des caches : à augmenter si le calcul change (le banc refait alors les mesures). */
const VERSION = 1;

export interface MesuresSon {
  duree: number;
  /** Enveloppe RMS (0 à 1) toutes les 20 ms, comme le point de reprise de l'analyse. */
  enveloppe: Float32Array;
  voix: EnergieVoix;
  empreintes: EmpreintesVoix;
}

interface Meta {
  version: number;
  duree: number;
  frequence: number;
  imagesParMorceau: number;
  ecrit: string;
  secondes: { enveloppe: number; voix: number; empreintes: number };
}

function ecrireF32(nom: string, x: Float32Array) {
  writeFileSync(`${DOSSIER_SIGNAUX}/${nom}`, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
}

function lireF32(nom: string): Float32Array {
  const b = readFileSync(`${DOSSIER_SIGNAUX}/${nom}`);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/** Passe son du Worker d'analyse (la vraie fonction d'Arko) : enveloppe de toute la source. */
export async function mesurerEnveloppe(son: SonPcm, duree: number): Promise<Float32Array> {
  const env = new Enveloppe(duree, PAS_ENVELOPPE);
  await passeSon(fauxSink(son) as unknown as AudioSampleSink, env, 0, duree, { auPoint() {}, avance() {} });
  return env.valeurs();
}

/** Boucle de auto/coupes/worker-voix.ts (son mono) : énergie de la bande voix sur [de, a]. */
export async function mesurerEnergieVoix(son: SonPcm, duree: number, de = 0, a = duree): Promise<EnergieVoix> {
  const acc = new AccumulateurVoix(duree);
  for await (const s of fauxSink(son).samples(de, a)) {
    const m = new Float32Array(s.numberOfFrames);
    s.copyTo(m, { planeIndex: 0, format: 'f32-planar' });
    acc.ajouter(m, s.sampleRate, s.timestamp);
  }
  return acc.resultat();
}

/** Boucle de auto/voix/worker-voix.ts (piste principale, son mono) : empreintes sur [de, a]. */
export async function mesurerEmpreintesVoix(son: SonPcm, duree: number, de = 0, a = duree): Promise<EmpreintesVoix> {
  const acc = new AccumulateurEmpreintes(duree);
  for await (const s of fauxSink(son).samples(de, a)) {
    const m = new Float32Array(s.numberOfFrames);
    s.copyTo(m, { planeIndex: 0, format: 'f32-planar' });
    acc.ajouter(m, s.sampleRate, s.timestamp);
  }
  return acc.resultat();
}

let enMemoire: MesuresSon | null = null;

/** Mesures du son de toute la source : depuis le cache, sinon calculées (≈ 1 à 2 min) puis gardées. */
export async function mesuresSon(duree: number, o: { refaire?: boolean; journal?: (m: string) => void } = {}): Promise<MesuresSon> {
  const journal = o.journal ?? console.log;
  if (enMemoire && !o.refaire && enMemoire.duree === duree) return enMemoire;
  const metaChemin = `${DOSSIER_SIGNAUX}/meta.json`;
  if (!o.refaire && existsSync(metaChemin)) {
    const meta = JSON.parse(readFileSync(metaChemin, 'utf8')) as Meta;
    if (meta.version === VERSION && meta.duree === duree && meta.frequence === FREQUENCE_PCM && meta.imagesParMorceau === IMAGES_PAR_MORCEAU) {
      enMemoire = {
        duree,
        enveloppe: lireF32('enveloppe.f32'),
        voix: { pas: 0.02, db: lireF32('energie-voix.f32') },
        empreintes: { pas: 0.02, duree, db: lireF32('empreintes-db.f32'), bandes: lireF32('empreintes-bandes.f32') },
      };
      return enMemoire;
    }
  }
  mkdirSync(DOSSIER_SIGNAUX, { recursive: true });
  const son = new SonPcm();
  journal(`Mesures du son (${son.frequence / 1000} kHz, ${Math.round(son.duree)} s) : enveloppe, énergie de la voix, empreintes…`);
  let t = performance.now();
  const enveloppe = await mesurerEnveloppe(son, duree);
  const sEnv = (performance.now() - t) / 1000;
  t = performance.now();
  const voix = await mesurerEnergieVoix(son, duree);
  const sVoix = (performance.now() - t) / 1000;
  t = performance.now();
  const empreintes = await mesurerEmpreintesVoix(son, duree);
  const sEmp = (performance.now() - t) / 1000;
  son.fermer();
  ecrireF32('enveloppe.f32', enveloppe);
  ecrireF32('energie-voix.f32', voix.db);
  ecrireF32('empreintes-db.f32', empreintes.db);
  ecrireF32('empreintes-bandes.f32', empreintes.bandes);
  const meta: Meta = { version: VERSION, duree, frequence: FREQUENCE_PCM, imagesParMorceau: IMAGES_PAR_MORCEAU, ecrit: new Date().toISOString(), secondes: { enveloppe: sEnv, voix: sVoix, empreintes: sEmp } };
  writeFileSync(metaChemin, JSON.stringify(meta, null, 1));
  journal(`  enveloppe ${sEnv.toFixed(1)} s, voix ${sVoix.toFixed(1)} s, empreintes ${sEmp.toFixed(1)} s (gardées dans ${DOSSIER_SIGNAUX}).`);
  enMemoire = { duree, enveloppe, voix, empreintes };
  return enMemoire;
}
