// Outil Transitions : chaque coupe est une pastille sur la mini-frise (et ici, en rangée).
// La coupe choisie montre la grille des 7 transitions (icônes animées en CSS), l'interrupteur
// « Avec le son » (son: false quand il est coupé) et « Appliquer à toutes les coupes ».

import { TRANSITIONS } from '../../../recette/defauts';
import { T } from '../../../textes-fr';
import { recetteAffichee } from '../../etat';
import {
  basculerSonTransition,
  choisirTypeTransition,
  coupeChoisie,
  coupes,
  nomSon,
  sonTransitionActif,
  transitionSurToutes,
  typeTransition,
} from '../../effets';
import { formatTemps } from '../../format';
import { chercher, mettreEnPause } from '../../lecture';
import { IconeCiseaux } from '../Icones';
import { Interrupteur } from './Reglages';

/** Petite icône animée : deux images (A puis B) qui passent l'une à l'autre avec l'effet. */
export function IconeTransitionAnimee({ id }: { id: string }) {
  return (
    <span class="trans-icone" data-trans={id} aria-hidden="true">
      <span class="ti-a" />
      <span class="ti-b" />
      <span class="ti-voile" />
    </span>
  );
}

export function OutilTransitions() {
  const r = recetteAffichee.value;
  if (!r) return null;
  const liste = coupes(r);
  if (liste.length === 0) {
    return (
      <div class="outil" data-testid="outil-transitions">
        <div class="message message-info" role="status" data-testid="transitions-un-plan">
          <IconeCiseaux taille={18} />
          <span>{T.transitions.unPlan}</span>
        </div>
      </div>
    );
  }
  const i = coupeChoisie.value;
  const plan = i !== null ? r.plans[i] : undefined;
  const actif = typeTransition(plan);
  const avecSon = sonTransitionActif(plan);
  const sonDefaut = TRANSITIONS.find((x) => x.id === actif)?.son ?? null;

  return (
    <div class="outil" data-testid="outil-transitions">
      <div class="pastilles" role="radiogroup" aria-label={T.transitions.coupes}>
        {liste.map(([k, t]) => (
          <button
            type="button"
            role="radio"
            key={k}
            aria-checked={k === i}
            class="pastille"
            data-actif={k === i ? '1' : '0'}
            onClick={() => {
              mettreEnPause();
              chercher(t);
              coupeChoisie.value = k;
            }}
            data-testid={`coupe-${k}`}
          >
            {T.transitions.coupe(k, formatTemps(t))}
          </button>
        ))}
      </div>

      {!plan && <p class="petit doux outil-aide">{T.transitions.aide}</p>}
      {plan && (
        <>
          <div class="grille-transitions" role="radiogroup" aria-label={T.transitions.grille}>
            {TRANSITIONS.map((x) => (
              <button
                type="button"
                role="radio"
                key={x.id}
                aria-checked={x.id === actif}
                class="tuile-transition"
                data-actif={x.id === actif ? '1' : '0'}
                onClick={() => choisirTypeTransition(x.id)}
                data-testid={`transition-${x.id}`}
              >
                <IconeTransitionAnimee id={x.id} />
                <span>{x.nom}</span>
              </button>
            ))}
          </div>
          {sonDefaut && (
            <Interrupteur
              titre={T.transitions.avecSon}
              aide={`${T.transitions.avecSonAide} (${nomSon(sonDefaut)})`}
              actif={avecSon}
              onChange={basculerSonTransition}
              testid="transition-avec-son"
            />
          )}
          <button type="button" class="btn" onClick={transitionSurToutes} data-testid="transition-partout">
            {T.transitions.partout}
          </button>
        </>
      )}
    </div>
  );
}
