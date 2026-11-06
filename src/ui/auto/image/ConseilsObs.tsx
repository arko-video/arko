// Conseils OBS (court) : dans le panneau « Améliorer l'image » et dans l'écran Aide.

import { TI } from './textes';
import './image.css';

export function ConseilsObs({ ouvert = false }: { ouvert?: boolean }) {
  return (
    <details class="ai-obs" open={ouvert} data-testid="conseils-obs">
      <summary>{TI.obs.titre}</summary>
      <ul>
        {TI.obs.lignes.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}
