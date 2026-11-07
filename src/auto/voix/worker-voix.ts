// Worker « Qui parle » (dev 1 ; passe du son v4 : dev-vad) : lit le son de la source (une ou plusieurs pistes audio,
// ouvertes ici avec mediabunny : getAudioTracks()[n]) morceau par morceau et calcule, en UNE lecture :
//  - les empreintes de voix (empreintes.ts), comme avant ;
//  - v4, si demandé : la VAD Silero (vad/silero.ts, onnxruntime-web WASM 1 fil, modèle lu ici par lireModele) sur le
//    son ramené à 16 kHz (vad/reechantillonnage.ts), et la hauteur de la voix (moments/hauteur.ts) sur la parole.
// Une ancienne demande (sans `vad` ni `hauteur`) donne EXACTEMENT l'ancienne réponse. Rien n'est gardé en mémoire à
// part ces mesures (une trame de son à la fois) ; rien n'est envoyé. La page l'arrête net (terminate) pour annuler.
// Plusieurs pistes (OBS micro + Discord) : la VAD passe sur chacune, p = le maximum (quelqu'un parle sur l'une des
// pistes) ; la hauteur, sur la 1ʳᵉ piste mesurée seulement.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { ErreurArko } from '../../moteur/erreurs';
import { AccumulateurHauteur } from '../moments/hauteur';
import { SILERO } from '../modeles/catalogue';
import { lireModele } from '../modeles/modeles';
import { ouvrirSessionWeb } from '../modeles/onnx-web';
import type { PlageTemps } from '../types';
import type { DemandePasseSonV4, HauteurVoix, ProbasVad, ResultatPasseSonV4, SessionOnnx } from '../types-v4';
import { FileSon16k } from '../vad/file-son';
import { Vers16k } from '../vad/reechantillonnage';
import { MODELE_VAD, MoteurVad } from '../vad/silero';
import { TEXTES_VAD } from '../vad/textes-vad';
import { fusionnerPlages } from '../vad/segments';
import { AccumulateurEmpreintes } from './empreintes';

export interface DemandeEmpreintes extends DemandePasseSonV4 {
  fichier: Blob;
  duree: number;
  de: number;
  a: number;
  /** Pistes à mesurer (null = la piste principale). */
  pistes: (number | null)[];
}

export type ResultatEmpreintesPiste = { piste: number | null; nom: string | null; pas: number; duree: number; db: Float32Array; bandes: Float32Array };

export type DepuisWorkerEmpreintes =
  | { type: 'progression'; p: number; fait: number }
  | ({ type: 'fini'; resultats: ResultatEmpreintesPiste[] } & ResultatPasseSonV4)
  | { type: 'erreur'; message: string; code: string };

function envoyer(m: DepuisWorkerEmpreintes, transfert: Transferable[] = []) {
  (self as unknown as Worker).postMessage(m, transfert);
}

/** La session de Silero (une seule, pour toutes les pistes), ou la raison de son absence. */
async function ouvrirVad(): Promise<{ session: SessionOnnx | null; avertissement?: string }> {
  try {
    const octets = await lireModele('vad');
    if (!octets) return { session: null, avertissement: TEXTES_VAD.pasCharge };
    return { session: await ouvrirSessionWeb(octets) };
  } catch (e) {
    console.warn('[Arko] détecteur de voix : démarrage impossible', e);
    return { session: null, avertissement: TEXTES_VAD.pasDemarre };
  }
}

async function mesurer(d: DemandeEmpreintes) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(d.fichier, { maxCacheSize: 16 * 1024 * 1024 }) });
  const v4 = d.vad === true || d.hauteur === true;
  let session: SessionOnnx | null = null;
  let avertissement: string | undefined;
  if (d.vad) ({ session, avertissement } = await ouvrirVad());
  let vadMax: Uint8Array | null = null;
  let plagesVad: PlageTemps[] = [];
  let hauteur: HauteurVoix | null = null;
  try {
    const toutes = await input.getAudioTracks();
    const resultats: ResultatEmpreintesPiste[] = [];
    const longueur = Math.max(0.01, d.a - d.de) * d.pistes.length;
    let dernier = 0;
    for (const [j, piste] of d.pistes.entries()) {
      const piste0 = piste === null ? await input.getPrimaryAudioTrack() : toutes[piste];
      if (!piste0) throw new ErreurArko('Cette piste de son n\'existe pas dans la vidéo.', 'piste');
      if (!(await piste0.canDecode())) throw new ErreurArko('Ton navigateur ne sait pas lire le son de cette piste.', 'codec_audio');
      const acc = new AccumulateurEmpreintes(d.duree);
      // v4 : son à 16 kHz pour la VAD et la hauteur (même lecture).
      const vers = v4 ? new Vers16k() : null;
      let moteur = session ? new MoteurVad(session, d.duree) : null;
      const accHauteur = d.hauteur && j === 0 ? new AccumulateurHauteur(d.duree) : null;
      const file = accHauteur && moteur ? new FileSon16k() : null;
      const probas = () => (moteur ? { pas: moteur.pas, p: moteur.p } : undefined);
      const sink = new AudioSampleSink(piste0);
      let canal = new Float32Array(4096);
      let mono = new Float32Array(4096);
      for await (const s of sink.samples(d.de, d.a)) {
        try {
          const n = s.numberOfFrames;
          if (canal.length < n) {
            canal = new Float32Array(n);
            mono = new Float32Array(n);
          }
          const m = mono.subarray(0, n);
          const nc = s.numberOfChannels;
          s.copyTo(m, { planeIndex: 0, format: 'f32-planar' });
          for (let c = 1; c < nc; c++) {
            s.copyTo(canal.subarray(0, n), { planeIndex: c, format: 'f32-planar' });
            for (let i = 0; i < n; i++) m[i]! += canal[i]!;
          }
          if (nc > 1) for (let i = 0; i < n; i++) m[i]! /= nc;
          acc.ajouter(m, s.sampleRate, s.timestamp);
          const r16 = vers?.ajouter(m, s.sampleRate, s.timestamp) ?? null;
          if (r16) {
            if (moteur) {
              try {
                await moteur.ajouter(r16.pcm, r16.t0);
              } catch (e) {
                // Le modèle plante en route : on continue sans lui (les empreintes ne sont pas perdues).
                console.warn('[Arko] détecteur de voix : arrêt en route', e);
                if (file && accHauteur) for (const x of file.vider()) accHauteur.ajouter(x.pcm, x.t0, probas());
                moteur = null;
                session = null;
                avertissement = TEXTES_VAD.pasDemarre;
              }
            }
            if (accHauteur) {
              if (file && moteur) {
                file.pousser(r16.pcm, r16.t0);
                for (const x of file.prendreJusqua(moteur.fait)) accHauteur.ajouter(x.pcm, x.t0, probas());
              } else accHauteur.ajouter(r16.pcm, r16.t0, probas());
            }
          }
          const maintenant = performance.now();
          if (maintenant - dernier > 200) {
            dernier = maintenant;
            const fait = j * (d.a - d.de) + Math.max(0, s.timestamp - d.de);
            envoyer({ type: 'progression', p: Math.min(1, fait / longueur), fait });
          }
        } finally {
          s.close();
        }
      }
      if (moteur) {
        try {
          await moteur.finir();
        } catch {
          /* la dernière trame seulement */
        }
        if (!vadMax) vadMax = moteur.p;
        else for (let k = 0; k < vadMax.length; k++) vadMax[k] = Math.max(vadMax[k]!, moteur.p[k]!);
        plagesVad = fusionnerPlages([...plagesVad, ...moteur.plages()], 0);
      }
      if (accHauteur) {
        if (file) for (const x of file.vider()) accHauteur.ajouter(x.pcm, x.t0, probas());
        hauteur = accHauteur.resultat();
      }
      const r = acc.resultat(piste ?? undefined);
      const nom = ((await piste0.getName().catch(() => null)) ?? '').trim().slice(0, 24) || null;
      resultats.push({ piste, nom, pas: r.pas, duree: r.duree, db: r.db, bandes: r.bandes });
    }
    const transfert: Transferable[] = resultats.flatMap((r) => [r.db.buffer, r.bandes.buffer]);
    if (!v4) {
      envoyer({ type: 'fini', resultats }, transfert);
      return;
    }
    const plus: ResultatPasseSonV4 = {};
    if (d.vad) {
      const vad: Omit<ProbasVad, 'src'> | null = session && vadMax ? { pas: SILERO.pas, p: vadMax, plages: plagesVad, modele: MODELE_VAD } : null;
      plus.vad = vad;
      if (vad) transfert.push(vad.p.buffer);
      if (!vad && !avertissement) avertissement = TEXTES_VAD.pasDemarre;
    }
    if (d.hauteur) {
      plus.hauteur = hauteur;
      if (hauteur) transfert.push(hauteur.f0.buffer);
    }
    if (avertissement) plus.avertissement = avertissement;
    envoyer({ type: 'fini', resultats, ...plus }, transfert);
  } finally {
    input.dispose();
    void session?.release?.().catch(() => undefined);
  }
}

self.onmessage = (ev: MessageEvent<DemandeEmpreintes>) => {
  mesurer(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'Je n\'ai pas pu écouter les voix de ta vidéo. Réessaie.', code: 'analyse' });
    }
  });
};
