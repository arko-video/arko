// Racine de l'interface : affiche l'écran courant, le message temporaire et l'invitation à recharger.

// Styles de la phase 3 (après ceux de main.tsx dans la cascade).
import './styles/effets.css';
import './styles/transitions.css';
// Styles de la phase 4.
import './styles/rythme.css';
import './styles/montages.css';
// Styles de la phase 6 (monteur IA).
import './styles/monteur.css';
import './styles/revue.css';
// Aide (phase 5).
import './styles/aide.css';
import { useEffect } from 'preact/hooks';
import { T } from '../textes-fr';
import { Couper } from './ecrans/Couper';
import { Exporter } from './ecrans/Exporter';
import { Habiller } from './ecrans/Habiller';
import { aideOuverte } from './aide';
import { Aide } from './ecrans/Aide';
import { Importer } from './ecrans/Importer';
import { Analyse } from './ecrans/monteur/Analyse';
import { Demande } from './ecrans/monteur/Demande';
import { Revue } from './ecrans/monteur/Revue';
import { Vertical } from './ecrans/Vertical';
import { ecran, historique, majDisponible, toast, toastAction } from './etat';
import { outilOuvert } from './habillage';
import { ecranMonteur } from './monteur/etat-monteur';
import { suivrePics } from './rythme';

export function App() {
  useEffect(() => suivrePics(), []);
  // Monteur IA (phase 6) et Aide : leurs écrans passent devant Importer.
  const m = ecranMonteur.value;
  const aide = !m && aideOuverte.value;
  const e = m || aide ? 'sous-ecran' : historique.value ? ecran.value : 'importer';
  return (
    <>
      {m === 'demande' && <Demande />}
      {m === 'analyse' && <Analyse />}
      {m === 'revue' && <Revue />}
      {aide && <Aide />}
      {e === 'importer' && <Importer />}
      {e === 'couper' && <Couper />}
      {e === 'vertical' && <Vertical />}
      {e === 'habiller' && <Habiller />}
      {e === 'exporter' && <Exporter />}
      {toast.value && (
        // Un outil ouvert dans Habiller occupe le bas : le message passe en haut (sans cacher les combos).
        <div
          class="toast"
          role="status"
          aria-live="polite"
          data-haut={e === 'habiller' && outilOuvert.value ? '1' : '0'}
          data-testid="toast"
        >
          <span>{toast.value}</span>
          {toastAction.value && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                const a = toastAction.peek();
                toast.value = null;
                toastAction.value = null;
                a?.agir();
              }}
              data-testid="toast-action"
            >
              {toastAction.value.label}
            </button>
          )}
        </div>
      )}
      <BandeauMaj />
    </>
  );
}

function BandeauMaj() {
  const recharger = majDisponible.value;
  if (!recharger) return null;
  return (
    <div class="bandeau-maj" role="alert">
      <span>{T.maj.message}</span>
      <button type="button" class="btn btn-discret" onClick={() => (majDisponible.value = null)}>
        {T.maj.plusTard}
      </button>
      <button type="button" class="btn btn-principal" style={{ width: 'auto' }} onClick={recharger}>
        {T.maj.recharger}
      </button>
    </div>
  );
}
