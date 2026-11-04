// Petits éléments de la frise : règle en secondes, poignées de coupe, tête de lecture.

import { T } from '../../textes-fr';
import { auCentieme, formatTemps } from '../format';
import { etiquetteRegle } from './frise-outils';

export function Regle({ ticks, pas, xDe }: { ticks: number[]; pas: number; xDe: (t: number) => number }) {
  return (
    <div class="frise-regle" data-cible="regle" aria-hidden="true">
      {ticks.map((t) => (
        <span key={t} class="graduation" style={{ left: `${xDe(t)}px` }}>
          {etiquetteRegle(t, pas)}
        </span>
      ))}
    </div>
  );
}

/** Poignée : visuel de 24 px, zone de toucher de 48 px placée à l'extérieur du plan. */
export function Poignee({
  type,
  i,
  x,
  onKeyDown,
}: {
  type: 'debut' | 'fin';
  i: number;
  x: number;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      class={`poignee poignee-${type}`}
      data-cible={type}
      data-i={i}
      aria-label={type === 'debut' ? T.couper.debutPlan : T.couper.finPlan}
      style={{ left: `${type === 'debut' ? x - 48 : x}px` }}
      onKeyDown={onKeyDown}
      data-testid={`poignee-${type}`}
    >
      <span class="poignee-visuel" aria-hidden="true" />
    </button>
  );
}

/** Tête de lecture : ligne blanche + bouton rond, zone de toucher de 48 × 44 px sous la frise. */
export function TeteLecture({
  x,
  tete,
  duree,
  onKeyDown,
}: {
  x: number;
  tete: number;
  duree: number;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <>
      <div class="tete-ligne" aria-hidden="true" style={{ left: `${x}px` }} />
      <div
        class="tete"
        data-cible="tete"
        role="slider"
        tabIndex={0}
        aria-label={T.couper.teteLecture}
        aria-valuemin={0}
        aria-valuemax={auCentieme(duree)}
        aria-valuenow={auCentieme(tete)}
        aria-valuetext={formatTemps(tete)}
        onKeyDown={onKeyDown}
        style={{ left: `${x}px` }}
        data-testid="tete-lecture"
      >
        <span class="tete-bouton" />
      </div>
    </>
  );
}
