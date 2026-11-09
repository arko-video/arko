// Petit aperçu VIDÉO d'un passage de la source, à côté de « Écouter » : un seul ouvert à la fois, joue [de, a] avec
// le son puis s'arrête. Le fichier reste sur l'appareil (adresse blob:, libérée à la fermeture).

import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { arreterEcoute } from './ecoute';

/** Clé du passage dont l'aperçu est ouvert (null : aucun). */
export const apercuOuvert = signal<string | null>(null);

export function basculerApercu(cle: string): void {
  arreterEcoute();
  apercuOuvert.value = apercuOuvert.peek() === cle ? null : cle;
}

export function BoutonApercu({ cle, actif, testid, classe = 'btn' }: { cle: string; actif: boolean; testid: string; classe?: string }) {
  const ouvert = apercuOuvert.value === cle;
  return (
    <button type="button" class={classe} aria-pressed={ouvert} disabled={!actif} onClick={() => basculerApercu(cle)} data-testid={testid}>
      {ouvert ? 'Fermer' : 'Voir'}
    </button>
  );
}

export function MiniApercu({ fichier, de, a, cle }: { fichier: Blob; de: number; a: number; cle: string }) {
  return apercuOuvert.value === cle ? <Lecteur fichier={fichier} de={de} a={a} /> : null;
}

function Lecteur({ fichier, de, a }: { fichier: Blob; de: number; a: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const url = URL.createObjectURL(fichier);
    v.src = url;
    const debut = () => {
      v.currentTime = Math.max(0, de);
      void v.play().catch(() => undefined);
    };
    const temps = () => {
      if (v.currentTime >= a) {
        v.pause();
        v.currentTime = Math.max(0, de);
      }
    };
    v.addEventListener('loadedmetadata', debut, { once: true });
    v.addEventListener('timeupdate', temps);
    return () => {
      v.removeEventListener('timeupdate', temps);
      v.pause();
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
    };
  }, [fichier, de, a]);
  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      style={{ width: '100%', maxWidth: '260px', maxHeight: '220px', borderRadius: '8px', background: '#000', display: 'block', marginTop: '6px' }}
      data-testid="mini-apercu"
    />
  );
}
