// C. Qui parle (dev 1), NAVIGATEUR : lit le son de la source (chaque piste si elle en a plusieurs ; Worker conseillé),
// calcule les empreintes et sépare les voix. Rien n'est envoyé. Contrat : conception/contrat-wankil.md §3.3.

import type { SourceOuverte } from '../../moteur/api';
import { ErreurArko } from '../../moteur/erreurs';
import { zonesDeVoix } from '../coupes/voix';
import type { OptionsTache, PlageTemps } from '../types';
import type { EmpreintesVoix, VoixDetectees } from '../types-v3';
import { separerVoix, voixDesPistes } from './qui-parle';
import type { DemandeEmpreintes, DepuisWorkerEmpreintes } from './worker-voix';

function annule() {
  return new ErreurArko('Analyse annulée.', 'annule');
}

function enMinutes(s: number): string {
  return s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min`;
}

/** Empreintes d'une piste, avec le nom de la piste dans le fichier (« Micro », « Discord »…) s'il en a un. */
export type EmpreintesNommees = EmpreintesVoix & { nom?: string };

/** Empreintes de plusieurs pistes (null = principale), dans un Worker neuf, avec progression et annulation. */
export function mesurerPistes(source: SourceOuverte, pistes: readonly (number | null)[], o: OptionsTache & { plage?: PlageTemps } = {}): Promise<EmpreintesNommees[]> {
  const { signal, surProgression } = o;
  const duree = source.infos.duree;
  const demande: DemandeEmpreintes = { fichier: source.fichier, duree, de: Math.max(0, o.plage?.de ?? 0), a: Math.min(duree, o.plage?.a ?? duree), pistes: [...pistes] };
  if (signal?.aborted) return Promise.reject(annule());
  return new Promise((resoudre, rejeter) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker-voix.ts', import.meta.url), { type: 'module', name: 'arko-qui-parle' });
    } catch {
      rejeter(new ErreurArko('Impossible d\'écouter la vidéo dans ce navigateur. Mets Chrome à jour.', 'analyse'));
      return;
    }
    let termine = false;
    const finir = () => {
      termine = true;
      worker.terminate();
      signal?.removeEventListener('abort', arreter);
    };
    const arreter = () => {
      if (termine) return;
      finir();
      rejeter(annule());
    };
    signal?.addEventListener('abort', arreter);
    worker.onerror = (ev) => {
      ev.preventDefault();
      if (termine) return;
      finir();
      rejeter(new ErreurArko('L\'écoute des voix a planté. Réessaie.', 'analyse'));
    };
    worker.onmessage = (ev: MessageEvent<DepuisWorkerEmpreintes>) => {
      const m = ev.data;
      if (termine) return;
      if (m.type === 'progression') {
        const total = (demande.a - demande.de) * pistes.length;
        surProgression?.(m.p, `J'écoute les voix… ${enMinutes(m.fait)} sur ${enMinutes(total)}`);
      } else if (m.type === 'erreur') {
        finir();
        rejeter(new ErreurArko(m.message, m.code));
      } else {
        finir();
        resoudre(m.resultats.map((r) => ({ pas: r.pas, duree: r.duree, db: r.db, bandes: r.bandes, ...(r.piste !== null ? { piste: r.piste } : {}), ...(r.nom ? { nom: r.nom } : {}) })));
      }
    };
    worker.postMessage(demande);
  });
}

/** Empreintes d'une piste (absent = piste principale), sur une plage (absent = toute la source). */
export async function mesurerEmpreintes(source: SourceOuverte, o: OptionsTache & { piste?: number; plage?: PlageTemps } = {}): Promise<EmpreintesVoix> {
  const [e] = await mesurerPistes(source, [o.piste ?? null], o);
  return e!;
}

/**
 * « Qui parle ? » d'une source : pistes séparées si la recette en garde au moins 2 (`pistes` ; à défaut, toutes les
 * pistes du fichier s'il en a au moins 2), sinon niveau + timbre sur la piste principale. `zones` (facultatif) = où
 * quelqu'un parle (les mots) ; sinon trouvées au son. `plage` (facultatif) : n'écouter que ce passage de la source.
 * Renvoie aussi les empreintes (pour la bouche des avatars, dev 3), avec le nom de chaque piste s'il y en a un.
 */
export async function analyserQuiParle(
  source: SourceOuverte,
  o: OptionsTache & { pistes?: readonly number[]; zones?: readonly PlageTemps[]; plage?: PlageTemps } = {},
): Promise<{ detectees: VoixDetectees; empreintes: EmpreintesNommees[] }> {
  const src = source.infos.id;
  const nb = source.infos.pistes ?? 0;
  const pistes = o.pistes ?? (nb >= 2 ? Array.from({ length: nb }, (_, i) => i) : []);
  if (pistes.length >= 2) {
    const empreintes = await mesurerPistes(source, pistes, o);
    return { detectees: voixDesPistes(empreintes, src), empreintes };
  }
  const e = await mesurerEmpreintes(source, { ...o, ...(pistes.length === 1 ? { piste: pistes[0] } : {}) });
  const zones = o.zones && o.zones.length > 0 ? o.zones : zonesDeVoix(e);
  return { detectees: separerVoix(e, zones, src), empreintes: [e] };
}
