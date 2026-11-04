// Couper, panneau du plan choisi : vitesse (pastilles) et arrêt sur image à la fin du plan.

import type { Plan } from '../../recette/types';
import { T } from '../../textes-fr';
import { reglerArret, reglerVitesse } from '../rythme';

const VITESSES = [0.25, 0.5, 1, 1.5, 2, 3] as const;
const ARRETS = [null, 0.5, 1, 2] as const;

/** Rangée de pastilles à choix unique, qui passe à la ligne (pas de défilement). */
function Choix<V>({
  label,
  valeurs,
  actif,
  texte,
  onChoisir,
  prefixe,
}: {
  label: string;
  valeurs: readonly V[];
  actif: V;
  texte(v: V): string;
  onChoisir(v: V): void;
  prefixe: string;
}) {
  return (
    <div class="choix-plan" role="radiogroup" aria-label={label}>
      {valeurs.map((v) => (
        <button
          type="button"
          role="radio"
          key={String(v)}
          aria-checked={v === actif}
          class="pastille"
          data-actif={v === actif ? '1' : '0'}
          onClick={() => v !== actif && onChoisir(v)}
          data-testid={`${prefixe}-${v === null ? 'aucun' : String(v).replace('.', '-')}`}
        >
          {texte(v)}
        </button>
      ))}
    </div>
  );
}

/** Arrêt affiché : la valeur proposée la plus proche (un arrêt de 0,7 s venu d'un combo montre 0,5). */
function arretProche(fige: number | undefined): number | null {
  if (!fige) return null;
  let m = 0.5;
  for (const v of [1, 2]) if (Math.abs(v - fige) < Math.abs(m - fige)) m = v;
  return m;
}

export function PanneauPlan({ i, plan }: { i: number; plan: Plan }) {
  const vit = plan.vit ?? 1;
  const vitProche = VITESSES.reduce((m, v) => (Math.abs(v - vit) < Math.abs(m - vit) ? v : m), 1);
  return (
    <section class="panneau-plan" aria-label={T.plan.titre(i + 1)} data-testid="panneau-plan">
      <h3 class="panneau-plan-titre">{T.plan.titre(i + 1)}</h3>
      <div class="panneau-plan-ligne">
        <span class="panneau-plan-label">{T.plan.vitesse}</span>
        <Choix
          label={T.plan.vitesse}
          valeurs={VITESSES}
          actif={vitProche}
          texte={(v) => T.plan.vitesseValeur(v)}
          onChoisir={(v) => reglerVitesse(i, v)}
          prefixe="vitesse"
        />
        <p class="petit doux panneau-plan-note">{T.plan.grave}</p>
      </div>
      <div class="panneau-plan-ligne">
        <span class="panneau-plan-label">{T.plan.arret}</span>
        <Choix
          label={T.plan.arret}
          valeurs={ARRETS}
          actif={arretProche(plan.fige)}
          texte={(v) => (v === null ? T.plan.aucun : T.plan.secondes(v))}
          onChoisir={(v) => reglerArret(i, v)}
          prefixe="arret"
        />
        <p class="petit doux panneau-plan-note">{T.plan.arretAide}</p>
      </div>
    </section>
  );
}
