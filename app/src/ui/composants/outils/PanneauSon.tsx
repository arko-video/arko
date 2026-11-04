// Réglages d'un son posé (ouvert en touchant son repère sur la mini-frise) :
// volume de 0 à 150 %, décalage de ±0,1 s, Supprimer, retour à la liste des sons.

import { reperesEffets } from '../../../recette/operations';
import { SON } from '../../../recette/defauts';
import type { Son } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { recetteAffichee } from '../../etat';
import { decalerSon, nomSon, reglerSon, sonChoisi, supprimerSonChoisi } from '../../effets';
import { formatTemps } from '../../format';
import { IconePoubelle, IconeRetour } from '../Icones';
import { CurseurValeur, Decaler } from './Reglages';

export function PanneauSon({ i, son }: { i: number; son: Son }) {
  const nom = nomSon(son.id);
  // Position affichée en temps de la vidéo finale (1re apparition), sinon le temps enregistré.
  const r = recetteAffichee.value;
  let pose = son.t ?? son.ts ?? 0;
  try {
    pose = (r && reperesEffets(r).sons.find((x) => x.i === i)?.t) ?? pose;
  } catch (e) {
    console.error(e);
  }
  return (
    <div class="outil" data-testid="reglages-son" data-i={i}>
      <div class="panneau-mot-entete">
        <button type="button" class="btn btn-discret" onClick={() => (sonChoisi.value = null)} data-testid="retour-sons">
          <IconeRetour taille={18} />
          {T.sons.retour}
        </button>
      </div>
      <h3 class="reglages-titre">{T.sons.reglages(nom)}</h3>

      <CurseurValeur
        label={T.sons.volume}
        min={SON.volMin * 100}
        max={SON.volMax * 100}
        step={5}
        valeur={Math.round((son.vol ?? SON.vol) * 100)}
        format={(v) => T.sons.volumeValeur(Math.round(v))}
        onValider={(v) => reglerSon({ vol: Math.round(v) / 100 })}
        testid="volume-son"
      />

      <h3 class="outil-sous-titre">{T.sons.decaler}</h3>
      <Decaler moins={T.sons.avant} plus={T.sons.apres} valeur={T.sons.position(formatTemps(pose))} onDecaler={decalerSon} testid="decaler-son" />

      <button type="button" class="btn outil-supprimer" onClick={supprimerSonChoisi} data-testid="supprimer-son">
        <IconePoubelle taille={18} />
        {T.habiller.supprimer}
      </button>
    </div>
  );
}
