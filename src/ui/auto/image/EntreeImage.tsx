// Point d'entrée de « Améliorer l'image » dans l'étape Exporter : un bouton qui dit le réglage du montage
// (Non / Léger / Fort) et ouvre le panneau ; puis, si l'amélioration est active, le conseil d'export (1440p en 16:9).

import { useState } from 'preact/hooks';
import { choisirQualite } from '../../../recette/operations';
import { destinationProjet } from '../../destination';
import { modifier, recette } from '../../etat';
import { mettreEnPause } from '../../lecture';
import { PanneauImage } from './PanneauImage';
import { TI } from './textes';
import './image.css';

export function EntreeImage() {
  const [ouvert, setOuvert] = useState(false);
  const r = recette.value;
  if (!r) return null;
  const niveau = r.amelioration?.niveau ?? 'non';
  return (
    <>
      <button
        type="button"
        class="btn ai-entree"
        onClick={() => {
          mettreEnPause();
          setOuvert(true);
        }}
        data-testid="ouvrir-image"
      >
        <span class="ai-icone" aria-hidden="true" />
        <span>{TI.bouton}</span>
        <span class={`ai-badge${niveau === 'non' ? '' : ' ai-badge-actif'}`} data-testid="image-niveau">
          {TI.etat[niveau]}
        </span>
      </button>
      {ouvert && <PanneauImage fermer={() => setOuvert(false)} />}
    </>
  );
}

/** Conseil d'export quand l'amélioration est active : 1440p en YouTube 16:9 (YouTube compresse moins), 1080 × 1920 en vertical. */
export function ConseilImage() {
  const r = recette.value;
  if (!r?.amelioration) return null;
  if (destinationProjet.value !== 'youtube') return <p class="petit doux" data-testid="image-conseil-vertical">{TI.vertical}</p>;
  if (r.export.qualite === 'haute') {
    return (
      <div class="ai-conseil" data-testid="image-conseil-1440">
        <span class="petit doux">{TI.en1440}</span>
        <button type="button" class="btn btn-discret" onClick={() => modifier((x) => choisirQualite(x, 'normale'))} data-testid="image-revenir-1080">
          {TI.revenir1080}
        </button>
      </div>
    );
  }
  return (
    <div class="message message-info ai-conseil" role="note" data-testid="image-conseil-1440">
      <span>{TI.conseil1440}</span>
      <button type="button" class="btn" onClick={() => modifier((x) => choisirQualite(x, 'haute'))} data-testid="image-passer-1440">
        {TI.passer1440}
      </button>
    </div>
  );
}
