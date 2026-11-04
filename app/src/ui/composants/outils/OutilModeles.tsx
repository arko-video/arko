// Outil Modèles : « Top 3 » (grisé avec une explication s'il y a moins de 3 passages) et « Le meilleur d'abord »
// (depuis la tête de lecture, ou le moment le plus fort). Chaque modèle se décrit en une phrase et s'annule.

import { useMemo, useState } from 'preact/hooks';
import { modeleTop3 } from '../../../recette/operations-rythme';
import { T } from '../../../textes-fr';
import { recette, teteLecture } from '../../etat';
import { formatTemps } from '../../format';
import { appliquerMeilleur, appliquerTop3, trouverMeilleurMoment } from '../../rythme';

export function OutilModeles() {
  const r = recette.value;
  const [cherche, setCherche] = useState(false);
  const top3Possible = useMemo(() => {
    if (!r) return false;
    try {
      return modeleTop3(r) !== null;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [r]);
  if (!r) return null;

  return (
    <div class="outil" data-testid="outil-modeles">
      <p class="petit doux outil-aide">{T.modeles.aide}</p>

      <article class="modele" data-possible={top3Possible ? '1' : '0'} data-testid="modele-top3">
        <h3 class="modele-titre">{T.modeles.top3}</h3>
        <p class="petit doux">{T.modeles.top3Phrase}</p>
        {!top3Possible && (
          <p class="petit modele-impossible" id="top3-impossible" data-testid="top3-impossible">
            {T.modeles.top3Impossible}
          </p>
        )}
        <button
          type="button"
          class={top3Possible ? 'btn btn-principal' : 'btn'}
          disabled={!top3Possible}
          aria-describedby={top3Possible ? undefined : 'top3-impossible'}
          onClick={appliquerTop3}
          data-testid="appliquer-top3"
        >
          {T.modeles.appliquer}
        </button>
      </article>

      <article class="modele" data-possible="1" data-testid="modele-meilleur">
        <h3 class="modele-titre">{T.modeles.meilleur}</h3>
        <p class="petit doux">{T.modeles.meilleurPhrase}</p>
        <div class="pile">
          <button type="button" class="btn btn-contour" onClick={() => appliquerMeilleur(teteLecture.peek())} data-testid="meilleur-tete">
            {T.modeles.depuisTete(formatTemps(teteLecture.value))}
          </button>
          <button
            type="button"
            class="btn btn-contour"
            disabled={cherche}
            aria-busy={cherche}
            onClick={() => {
              setCherche(true);
              void trouverMeilleurMoment().finally(() => setCherche(false));
            }}
            data-testid="meilleur-trouver"
          >
            {cherche && <span class="spinner spinner-petit" aria-hidden="true" />}
            {cherche ? T.combos.ecoute : T.modeles.trouver}
          </button>
        </div>
      </article>
    </div>
  );
}
