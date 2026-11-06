// Intro et outro sur les frises (Couper, Habiller) : une tuile dans la marge de gauche (intro) et de droite (outro).
// Elles ne se coupent pas : un toucher lit l'intro / l'outro dans l'aperçu, « × » la retire (Annuler la remet).

import { dureesGeneriques } from '../../recette/generiques';
import { TY } from '../../textes-youtube';
import { recetteAffichee } from '../etat';
import { retirer } from '../generiques';
import { lireGenerique } from '../lecture';

/** Largeur d'une tuile (elle tient dans la marge de 56 px de la frise). */
export const L_TUILE = 50;

/** Position de la tête : dans la tuile pendant l'intro (t < 0) ou l'outro (t > fin), sinon sur le montage. */
export function xTete(t: number, xDe: (t: number) => number, duree: number): number {
  const g = dureesGeneriques(recetteAffichee.value ?? {});
  if (t < 0 && g.intro > 0) return xDe(0) + Math.max(-1, t / g.intro) * L_TUILE;
  if (t > duree && g.outro > 0) return xDe(duree) + Math.min(1, (t - duree) / g.outro) * L_TUILE;
  return xDe(Math.min(Math.max(0, t), duree));
}

export function TuilesGeneriques({ xDe, duree }: { xDe: (t: number) => number; duree: number }) {
  const r = recetteAffichee.value;
  if (!r || (!r.intro && !r.outro)) return null;
  const tuiles = (['intro', 'outro'] as const).filter((p) => r[p]);
  return (
    <>
      {tuiles.map((p) => {
        const nom = p === 'intro' ? TY.generiques.intro : 'Outro';
        const left = p === 'intro' ? xDe(0) - L_TUILE - 2 : xDe(duree) + 2;
        return (
          <div key={p} class="tuile-generique" style={{ left: `${left}px`, width: `${L_TUILE}px` }} onPointerDown={(e) => e.stopPropagation()} data-testid={`frise-${p}`}>
            <button type="button" class="tuile-lire" aria-label={`${nom} : lire`} onClick={() => lireGenerique(p)} data-testid={`frise-${p}-lire`}>
              {nom}
            </button>
            <button type="button" class="tuile-retirer" aria-label={TY.generiques.retirer(nom)} onClick={() => retirer(p)} data-testid={`frise-${p}-retirer`}>
              ×
            </button>
          </div>
        );
      })}
    </>
  );
}
