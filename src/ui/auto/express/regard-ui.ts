// Interrupteur « Couper les menus et chargements » (Montage express et Best-of) : la 1ʳᵉ fois qu'on le coche, Arko
// télécharge le regard sur l'image (CLIP, ≈ 89 Mo, une seule fois, puis sans internet). Coché + modèle présent :
// chaque analyse regarde la vidéo (auto/vision/regarder.ts) et coupe les menus, le bureau et les écrans de chargement.

import { signal } from '@preact/signals';
import { MODELES } from '../../../auto/modeles/catalogue';
import { etatModele, telechargerModele } from '../../../auto/modeles/modeles';
import { regarderVideo } from '../../../auto/vision/client-vision';
import { REGARD, zonesMortes } from '../../../auto/vision/regard';
import { definirRegard } from '../../../auto/vision/regarder';

const CLE = 'arko.regard.actif';

export const TEXTES_REGARD = {
  titre: 'Couper les menus et chargements',
  aide: 'Arko regarde l\'image : le bureau, les menus et les écrans de chargement sont retirés du montage.',
  aTelecharger: (mo: number) => `Arko doit d'abord télécharger le regard sur l'image (≈ ${mo} Mo, une seule fois, puis sans internet). Rien n'est envoyé.`,
  telechargement: (p: number) => `Téléchargement du regard sur l'image… ${p} %`,
  pret: 'Prêt : les menus et chargements seront coupés.',
  erreur: 'Le téléchargement a raté. Décoche et recoche pour réessayer.',
  regarde: 'Je regarde l\'image (menus, chargements)…',
};

function lireActif(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

export const regardActif = signal(lireActif());
/** 'inconnu' tant qu'on n'a pas vérifié ; sinon où en est le modèle. */
export const etatRegard = signal<{ phase: 'inconnu' | 'absent' | 'pret' | 'erreur' } | { phase: 'telechargement'; p: number }>({ phase: 'inconnu' });

export async function verifierRegard(): Promise<void> {
  try {
    const e = await etatModele('vision');
    if (etatRegard.peek().phase !== 'telechargement') etatRegard.value = { phase: e.present ? 'pret' : 'absent' };
  } catch {
    etatRegard.value = { phase: 'absent' };
  }
}

/** Geste de l'utilisateur : coche / décoche ; cocher télécharge le modèle s'il manque. */
export async function basculerRegard(v: boolean): Promise<void> {
  regardActif.value = v;
  try {
    localStorage.setItem(CLE, v ? '1' : '0');
  } catch {
    /* rien */
  }
  if (!v) return;
  await verifierRegard();
  if (etatRegard.peek().phase === 'pret' || etatRegard.peek().phase === 'telechargement') return;
  etatRegard.value = { phase: 'telechargement', p: 0 };
  try {
    await telechargerModele('vision', { surProgression: (p) => (etatRegard.value = { phase: 'telechargement', p: Math.round(p * 100) }) });
    etatRegard.value = { phase: 'pret' };
  } catch (e) {
    console.warn('[Arko] regard sur l\'image non téléchargé', e);
    etatRegard.value = { phase: 'erreur' };
  }
}

export const tailleRegardMo = Math.round(MODELES.vision.octets / 1e6);

definirRegard(async (source, o) => {
  if (!regardActif.peek()) return null;
  const e = await etatModele('vision');
  if (!e.present) return null;
  const images = await regarderVideo(source, source.infos.emp, { ...(o.signal ? { signal: o.signal } : {}), surProgression: (p) => o.surProgression?.(p, TEXTES_REGARD.regarde) });
  return zonesMortes(images, source.infos.duree, { seuil: REGARD.seuilJeu });
});
