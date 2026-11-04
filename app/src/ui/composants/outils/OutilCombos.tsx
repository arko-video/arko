// Outil Combos : 3 gros boutons utilisables PENDANT la lecture. Au relâché, on recule de 0,15 s, on s'aimante
// au pic sonore le plus proche (pics calculés une fois à l'ouverture), on pose le combo, puis vibration et
// message « Boom ajouté ! » avec Annuler.

import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Combo } from '../../../recette/operations-rythme';
import { T } from '../../../textes-fr';
import { calculerPics, poserCombo } from '../../rythme';
import { IconeBoom, IconeFige, IconeRate } from '../IconesRythme';

const COMBOS: { id: Combo; Icone: ComponentType<{ taille?: number }> }[] = [
  { id: 'boom', Icone: IconeBoom },
  { id: 'fige', Icone: IconeFige },
  { id: 'rate', Icone: IconeRate },
];

export function OutilCombos() {
  const [pret, setPret] = useState(false);
  useEffect(() => {
    let vivant = true;
    void calculerPics().then(() => vivant && setPret(true));
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div class="outil" data-testid="panneau-combos">
      <p class="petit doux outil-aide">{T.combos.aide}</p>
      <div class="combos">
        {COMBOS.map(({ id, Icone }) => (
          <button
            type="button"
            key={id}
            class="combo"
            data-combo={id}
            // Au relâché (clic), pas au toucher : un doigt posé pour faire défiler le panneau ne pose rien (M-2).
            onClick={() => poserCombo(id)}
            data-testid={`combo-${id}`}
          >
            <span class="combo-icone" aria-hidden="true">
              <Icone taille={28} />
            </span>
            <span class="combo-textes">
              <strong>{T.combos.noms[id]}</strong>
              <span class="petit doux">{T.combos.phrases[id]}</span>
            </span>
          </button>
        ))}
      </div>
      <p class="petit doux combos-etat" role="status" data-testid="combos-etat" data-pret={pret ? '1' : '0'}>
        {!pret && <span class="spinner spinner-petit" aria-hidden="true" />}
        {pret ? T.combos.pret : T.combos.ecoute}
      </p>
    </div>
  );
}
