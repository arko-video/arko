// « Arko écoute tes sons » (10/11/2026) : interrupteur dans les réglages du montage. Coché la 1re fois : Arko
// télécharge l'écoute (CLAP, 34 Mo, une seule fois) puis écoute chaque son de Ma bibliothèque (Bruitages) encore jamais
// écouté, et retient ce qu'il a entendu (whoosh, pop, impact, rire, fail…) dans la fiche du son. Les montages s'en
// servent quand le NOM du son ne dit rien (auto/son/choix-son.ts, accents.ts). Un nouveau son est écouté au montage suivant.

import { signal } from '@preact/signals';
import { MODELES } from '../../../auto/modeles/catalogue';
import { etatModele, telechargerModele } from '../../../auto/modeles/modeles';
import type { DemandeEcoute, DepuisWorkerEcoute } from '../../../auto/son/worker-ecoute';
import { estBruitage, lireMonSon, noterEcoute, type MonSon } from '../../../moteur/api';
import { chargerMesSons, mesSons } from '../../mes-sons';

const CLE = 'arko.ecoute.actif';
/** On n'écoute que les sons courts (un effet), pas les musiques. */
const DUREE_MAX = 15;
const PAQUET = 8;

export const TEXTES_ECOUTE = {
  titre: 'Arko écoute mes sons',
  aide: 'Arko écoute chaque son de ta bibliothèque pour savoir lequel mettre où (whoosh, pop, boom, rire, fail…), même si son nom ne dit rien.',
  aTelecharger: (mo: number) => `D'abord un téléchargement de ≈ ${mo} Mo (une seule fois, puis sans internet). Rien n'est envoyé.`,
  telechargement: (p: number) => `Téléchargement de l'écoute… ${p} %`,
  ecoute: (n: number, total: number) => `J'écoute tes sons… ${n} / ${total}`,
  pret: (n: number) => `Prêt : ${n} sons écoutés.`,
  erreur: 'L\'écoute a raté. Décoche et recoche pour réessayer.',
};

function lireActif(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

export const ecouteActive = signal(lireActif());
export const etatEcoute = signal<{ phase: 'repos' | 'erreur' } | { phase: 'telechargement'; p: number } | { phase: 'ecoute'; n: number; total: number } | { phase: 'pret'; n: number }>({ phase: 'repos' });
export const tailleEcouteMo = Math.round(MODELES.ecoute.octets / 1e6);

/** Son mono 48 kHz d'un fichier (la page décode, le navigateur ré-échantillonne). */
async function decoder(f: File, duree: number): Promise<Float32Array | null> {
  try {
    const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(Math.min(duree, 10) * 48000)), 48000);
    const b = await ctx.decodeAudioData(await f.arrayBuffer());
    const n = Math.min(b.length, 480000);
    const res = new Float32Array(n);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) res[i]! += d[i]! / b.numberOfChannels;
    }
    return res;
  } catch {
    return null;
  }
}

function lancerWorker(d: DemandeEcoute, surUn: (id: string, genre: string | null) => void): Promise<void> {
  return new Promise((ok, ko) => {
    const w = new Worker(new URL('../../../auto/son/worker-ecoute.ts', import.meta.url), { type: 'module', name: 'arko-ecoute' });
    w.onerror = (e) => {
      e.preventDefault();
      w.terminate();
      ko(new Error('worker'));
    };
    w.onmessage = (ev: MessageEvent<DepuisWorkerEcoute>) => {
      const m = ev.data;
      if (m.type === 'un') surUn(m.id, m.genre);
      else {
        w.terminate();
        if (m.type === 'fini') ok();
        else ko(new Error(m.message));
      }
    };
    w.postMessage(d, d.sons.map((s) => s.pcm.buffer));
  });
}

/** Écoute les sons pas encore écoutés (si l'écoute est cochée et le modèle présent). Ne lève jamais. */
export async function ecouterMesSons(): Promise<number> {
  if (!ecouteActive.peek()) return 0;
  try {
    if (!(await etatModele('ecoute')).present) return 0;
    await chargerMesSons();
    const a: MonSon[] = mesSons.peek().filter((s) => estBruitage(s) && s.ecoute === undefined && s.duree > 0 && s.duree <= DUREE_MAX);
    let n = 0;
    for (let k = 0; k < a.length; k += PAQUET) {
      const sons: DemandeEcoute['sons'] = [];
      for (const s of a.slice(k, k + PAQUET)) {
        const f = await lireMonSon(s.id);
        const pcm = f ? await decoder(f, s.duree) : null;
        if (pcm) sons.push({ id: s.id, pcm });
        else await noterEcoute(s.id, null);
      }
      if (sons.length > 0) {
        await lancerWorker({ sons }, (id, genre) => {
          void noterEcoute(id, genre);
          n++;
          etatEcoute.value = { phase: 'ecoute', n, total: a.length };
        });
      }
    }
    await chargerMesSons();
    etatEcoute.value = { phase: 'pret', n: mesSons.peek().filter((s) => s.ecoute).length };
    return n;
  } catch (e) {
    console.warn('[Arko] écoute des sons impossible', e);
    etatEcoute.value = { phase: 'erreur' };
    return 0;
  }
}

/** Geste de l'utilisateur : cocher télécharge l'écoute s'il le faut, puis écoute la bibliothèque. */
export async function basculerEcoute(v: boolean): Promise<void> {
  ecouteActive.value = v;
  try {
    localStorage.setItem(CLE, v ? '1' : '0');
  } catch {
    /* rien */
  }
  if (!v) return;
  try {
    if (!(await etatModele('ecoute')).present) {
      etatEcoute.value = { phase: 'telechargement', p: 0 };
      await telechargerModele('ecoute', { surProgression: (p) => (etatEcoute.value = { phase: 'telechargement', p: Math.round(p * 100) }) });
    }
  } catch (e) {
    console.warn('[Arko] écoute non téléchargée', e);
    etatEcoute.value = { phase: 'erreur' };
    return;
  }
  await ecouterMesSons();
}
