// Outil Accroche : le texte de 0 à 2,5 s, visible dès la 1re image. Un champ et des idées à toucher.

import { contientEmoji } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { recetteAffichee } from '../../etat';
import { clavierOuvert, ecrireAccroche, indiceAccroche, validerSaisie } from '../../habillage';
import { chercher } from '../../lecture';
import { IconePoubelle } from '../Icones';
import { AlerteEmoji, ChampSaisie } from './Commun';

export function OutilAccroche() {
  const r = recetteAffichee.value;
  if (!r) return null;
  const i = indiceAccroche(r);
  const txt = i >= 0 ? r.textes[i].txt : '';

  function choisir(s: string) {
    ecrireAccroche(s, true);
    chercher(0);
  }

  return (
    <div class="outil" data-testid="outil-accroche">
      <ChampSaisie
        label={T.accroche.champ}
        placeholder={T.accroche.placeholder}
        valeur={txt}
        onSaisie={(v) => ecrireAccroche(v)}
        onValider={validerSaisie}
        onFocus={() => chercher(0)}
        testid="champ-accroche"
      />
      {contientEmoji(txt) && <AlerteEmoji />}
      {!clavierOuvert.value && (
        <>
          <p class="petit doux outil-aide">{T.accroche.aide}</p>
          <h3 class="outil-sous-titre">{T.accroche.idees}</h3>
          <div class="suggestions" role="group" aria-label={T.accroche.idees}>
            {T.accroche.suggestions.map((s, k) => (
              <button
                type="button"
                key={s}
                class="pastille suggestion"
                data-actif={s === txt ? '1' : '0'}
                onClick={() => choisir(s)}
                data-testid={`suggestion-${k}`}
              >
                {s}
              </button>
            ))}
          </div>
          {i >= 0 && (
            <button type="button" class="btn btn-discret outil-supprimer" onClick={() => ecrireAccroche('', true)} data-testid="retirer-accroche">
              <IconePoubelle taille={18} />
              {T.accroche.retirer}
            </button>
          )}
        </>
      )}
    </div>
  );
}
