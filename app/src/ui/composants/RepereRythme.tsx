// Repère orange de l'alerte de rythme (un seul, sur le pire passage), sur la frise de Couper et la mini-frise de Habiller.
// Un toucher amène la tête au passage et affiche le message. Le pointerdown ne remonte pas à la frise (pas de défilement).

import { T } from '../../textes-fr';
import { alerte, allerAuPassage } from '../rythme';

const BULLE = 28;

export function RepereRythme({ xDe, pps, largeurVue }: { xDe(t: number): number; pps: number; largeurVue: number }) {
  const a = alerte.value;
  if (!a) return null;
  const x0 = xDe(a.t0);
  const w = Math.max(6, (a.t1 - a.t0) * pps);
  if (x0 > largeurVue || x0 + w < 0) return null;
  // La bulle « ! » reste visible même si le début du passage est hors de la vue.
  const xBulle = Math.min(Math.max(x0 + w / 2, x0 + BULLE / 2, BULLE / 2), x0 + w, largeurVue - BULLE / 2);
  return (
    <div class="repere-rythme" aria-hidden="false">
      <span class="repere-rythme-barre" style={{ left: `${x0}px`, width: `${w}px` }} aria-hidden="true" />
      <button
        type="button"
        class="repere-rythme-bulle"
        style={{ left: `${xBulle - BULLE / 2}px` }}
        aria-label={T.rythme.repere(a.message)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={allerAuPassage}
        data-testid="repere-rythme"
      >
        !
      </button>
    </div>
  );
}
