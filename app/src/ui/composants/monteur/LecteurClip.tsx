// Aperçu d'un brouillon dans la Revue : le lecteur du moteur (creerLecteur) sur la recette du brouillon,
// lancé tout seul et rejoué en boucle. Un toucher met en pause ou relance.

import { useEffect, useRef, useState } from 'preact/hooks';
import { creerLecteur, type Lecteur, type SourceOuverte } from '../../../moteur/api';
import { gabaritDe } from '../../../recette/destination';
import type { Recette } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { IconeLecture } from '../Icones';

interface Props {
  recette: Recette;
  source: SourceOuverte;
}

export function LecteurClip({ recette, source }: Props) {
  // YouTube 16:9 : le brouillon s'affiche en paysage.
  const paysage = gabaritDe(recette).paysage;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lecteurRef = useRef<Lecteur | null>(null);
  /** Pause demandée par l'utilisateur (sinon, la fin du clip relance la lecture). */
  const pauseVoulue = useRef(false);
  const [enPause, setEnPause] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let l: Lecteur;
    try {
      l = creerLecteur(canvas);
    } catch (e) {
      console.error('Aperçu indisponible', e);
      return;
    }
    lecteurRef.current = l;
    pauseVoulue.current = false;
    let relance = 0;
    const desabonner = l.surChangement(() => {
      setEnPause(!l.enLecture && pauseVoulue.current);
      // Fin du clip : on repart du début (en boucle).
      if (!l.enLecture && !pauseVoulue.current && l.duree > 0 && l.temps >= l.duree - 0.05) {
        cancelAnimationFrame(relance);
        relance = requestAnimationFrame(() => {
          l.aller(0);
          l.lire();
        });
      }
    });
    l.charger(recette, [source]);
    l.aller(0);
    l.lire();
    return () => {
      cancelAnimationFrame(relance);
      desabonner();
      lecteurRef.current = null;
      l.detruire();
    };
  }, [recette, source]);

  function basculer() {
    const l = lecteurRef.current;
    if (!l) return;
    if (l.enLecture) {
      pauseVoulue.current = true;
      l.pause();
    } else {
      pauseVoulue.current = false;
      l.lire();
    }
  }

  return (
    <button
      type="button"
      class="clip-apercu"
      data-paysage={paysage ? '1' : '0'}
      aria-label={enPause ? T.apercu.lire : T.apercu.pause}
      onClick={basculer}
      data-testid="clip-apercu"
    >
      <canvas ref={canvasRef} width={paysage ? 960 : 540} height={paysage ? 540 : 960} role="img" aria-label={T.apercu.canvas} />
      {enPause && (
        <span class="clip-pause" aria-hidden="true">
          <IconeLecture taille={34} />
        </span>
      )}
    </button>
  );
}
