// Worker d'export : ouvre les sources, choisit l'encodeur (cascade), enregistre l'AAC de secours si besoin,
// lance la boucle d'export et renvoie le fichier MP4 (écrit dans l'OPFS) à la page.

/// <reference lib="webworker" />
import { canEncodeAudio, Quality } from 'mediabunny';
import { ErreurArko } from '../erreurs';
import { fermerMedia, ouvrirMedia, type MediaOuvert } from '../media';
import { policesPretes } from '../polices';
import { gabaritDe } from '../../recette/destination';
import { annonceOk, cascadePour, choisirEncodage, essaiPermis, type EssaiEncodage } from './cascade';
import { erreurEncodeur, erreurReserve, exporterUneFois } from './exporter';
import type { DemandeExport, DepuisWorker, VersWorker } from './messages';

declare const self: DedicatedWorkerGlobalScope;

const SON_ILLISIBLE = 'Le son de cette vidéo n\'a pas pu être lu : ta vidéo est muette.';

let annule = false;
let occupe = false;

function envoyer(m: DepuisWorker) {
  self.postMessage(m);
}

self.onmessage = (ev: MessageEvent<VersWorker>) => {
  const m = ev.data;
  if (m.type === 'annuler') {
    annule = true;
    return;
  }
  if (m.type === 'exporter' && !occupe) {
    occupe = true;
    annule = false;
    exporter(m)
      .catch((e: unknown) => {
        if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
        else {
          console.error('[Arko] export', e);
          const memoire = /memory|allocation|quota/i.test(String(e));
          envoyer(
            memoire
              ? { type: 'erreur', code: 'memoire', message: 'Plus assez de mémoire ou de place pour cet export. Ferme d\'autres applis ou raccourcis la vidéo.' }
              : { type: 'erreur', code: 'export', message: 'L\'export a échoué. Réessaie ; si ça recommence, redémarre Chrome.' },
          );
        }
      })
      .finally(() => (occupe = false));
  }
};

/** Enregistre l'encodeur AAC de secours (WebAssembly) si le navigateur n'en a pas. */
async function preparerAac() {
  if (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 })) return;
  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();
}

/**
 * Débit du son. YouTube conseille 384 kb/s en AAC-LC stéréo (https://support.google.com/youtube/answer/1722171) :
 * en 16:9 on prend le plus haut que l'encodeur de l'appareil accepte (384, puis 320, 256, 192 kb/s).
 * TikTok et Short : 128 kb/s, comme avant.
 */
export const DEBITS_AUDIO_YOUTUBE = [384_000, 320_000, 256_000, 192_000] as const;
async function debitAudio(paysage: boolean): Promise<number> {
  if (!paysage) return 128_000;
  for (const d of DEBITS_AUDIO_YOUTUBE) {
    try {
      if (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, quality: new Quality({ bitrate: d }) })) return d;
    } catch {
      /* débit refusé : on essaie le suivant */
    }
  }
  return 128_000;
}

async function choisir(rangConnu: number | null, seul720: boolean, cascade: readonly EssaiEncodage[], haute: boolean): Promise<EssaiEncodage> {
  if (rangConnu !== null) {
    const connu = cascade[rangConnu];
    // Qualité haute demandée : on retente le 1440p même si l'appareil s'était arrêté au 1080p.
    const garder = connu && essaiPermis(connu, seul720, haute) && (!haute || connu.qualite === '1440p');
    if (connu && garder && (await annonceOk(connu))) return connu;
  }
  const e = await choisirEncodage(0, seul720, cascade, haute);
  if (!e) {
    throw new ErreurArko(
      'Ton téléphone n\'arrive pas à encoder la vidéo (H.264 indisponible). Mets Chrome à jour, redémarre le téléphone puis réessaie.',
      'codec_export',
    );
  }
  return e;
}

/** true si une source utilisée a une piste audio que ce navigateur ne sait pas décoder (export muet). */
function sonIllisible(d: DemandeExport, medias: ReadonlyMap<string, MediaOuvert>): boolean {
  const premiere = d.recette.sources.find((s) => s.type === 'video')?.id;
  const utilisees = new Set(d.recette.plans.map((p) => p.src ?? premiere));
  return [...utilisees].some((id) => {
    const m = id ? medias.get(id) : undefined;
    return !!m && !!m.audio && !m.sinkAudio;
  });
}

async function exporter(d: DemandeExport) {
  const medias = new Map<string, MediaOuvert>();
  try {
    for (const [id, fichier] of Object.entries(d.fichiers)) {
      const source = d.recette.sources.find((s) => s.id === id);
      // Le son guide n'est jamais exporté : inutile d'ouvrir son fichier (sauf s'il sert aussi d'effet sonore).
      if (id === d.recette.guide?.src && !d.recette.sons.some((s) => s.id === id)) continue;
      medias.set(id, await ouvrirMedia(fichier, source?.type === 'audio' ? 'audio' : 'video'));
    }
    await Promise.all([preparerAac(), policesPretes()]); // polices prêtes avant la 1re image
    const seul720 = d.recette.export.h === 1280;
    // YouTube 16:9 : cascade 16:9 ; « qualité haute » = 1440p si l'appareil sait l'encoder.
    const paysage = gabaritDe(d.recette).paysage;
    const cascade = cascadePour(paysage);
    const haute = paysage && d.recette.export.qualite === 'haute';
    let essai = await choisir(d.rangConnu, seul720, cascade, haute);
    const debit = await debitAudio(paysage);
    envoyer({ type: 'encodage', rang: essai.rang });

    let fastStart: 'reserve' | false = 'reserve';
    let encoreUnEssai = true;
    for (;;) {
      try {
        const r = await exporterUneFois({
          recette: d.recette,
          medias,
          essai,
          debitAudio: debit,
          nom: d.nom,
          fastStart,
          annule: () => annule,
          surProgression: (p, resteS) => envoyer({ type: 'progression', p, resteS }),
        });
        const fini: Extract<DepuisWorker, { type: 'fini' }> = { type: 'fini', fichier: r.fichier, largeur: r.largeur, hauteur: r.hauteur, qualite: essai.qualite, rang: essai.rang };
        if (sonIllisible(d, medias)) fini.avertissement = SON_ILLISIBLE;
        envoyer(fini);
        return;
      } catch (e) {
        if (e instanceof ErreurArko || annule) throw e instanceof ErreurArko ? e : new ErreurArko('Export annulé.', 'annule');
        if (fastStart === 'reserve' && erreurReserve(e)) {
          fastStart = false; // repli : métadonnées en fin de fichier
          continue;
        }
        if (encoreUnEssai && erreurEncodeur(e)) {
          // Échec d'un vrai export → une fois l'essai suivant de la cascade.
          encoreUnEssai = false;
          const suivant = await choisirEncodage(essai.rang + 1, seul720, cascade, haute);
          if (suivant) {
            essai = suivant;
            envoyer({ type: 'encodage', rang: essai.rang });
            envoyer({ type: 'progression', p: 0, resteS: null });
            continue;
          }
        }
        throw e;
      }
    }
  } finally {
    for (const m of medias.values()) fermerMedia(m);
  }
}
