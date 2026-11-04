// En-tête d'une étape : Retour, titre, indicateur « Enregistré », Annuler / Rétablir. Puis la barre d'étapes.

import { T } from '../../textes-fr';
import { annulerAction, etatSauvegarde, historique, retablirAction, type Ecran } from '../etat';
import { numeroEtape, retour } from '../navigation';
import { IconeAide, IconeAnnuler, IconeCoche, IconeRetablir, IconeRetour } from './Icones';

interface Props {
  titre: string;
  ecran: Ecran;
  avecRetour?: boolean;
  avecHistorique?: boolean;
  retourDesactive?: boolean;
  /** Bouton « ? » qui ouvre l'aide (Importer). */
  onAide?: () => void;
}

export function Entete({
  titre,
  ecran,
  avecRetour = true,
  avecHistorique = false,
  retourDesactive,
  onAide,
}: Props) {
  const h = historique.value;
  return (
    <>
      <header class="entete">
        {avecRetour ? (
          <button
            type="button"
            class="btn btn-icone"
            aria-label={T.retour}
            onClick={retour}
            disabled={retourDesactive}
            data-testid="retour"
          >
            <IconeRetour taille={22} />
          </button>
        ) : (
          <div class="logo" aria-label={T.appli}>
            <span class="logo-carre" aria-hidden="true" />
            <span aria-hidden="true">{T.appli}</span>
          </div>
        )}
        {avecRetour && <h1 class="entete-titre">{titre}</h1>}
        <div class="entete-droite">
          <IndicateurSauvegarde />
          {onAide && (
            <button
              type="button"
              class="btn btn-icone"
              aria-label={T.aide.ouvrir}
              title={T.aide.ouvrir}
              onClick={onAide}
              data-testid="ouvrir-aide"
            >
              <IconeAide taille={24} />
            </button>
          )}
          {avecHistorique && (
            <>
              <button
                type="button"
                class="btn btn-icone"
                aria-label={T.annuler}
                title={T.annuler}
                disabled={!h?.peutAnnuler}
                onClick={annulerAction}
                data-testid="annuler"
              >
                <IconeAnnuler taille={22} />
              </button>
              <button
                type="button"
                class="btn btn-icone"
                aria-label={T.retablir}
                title={T.retablir}
                disabled={!h?.peutRetablir}
                onClick={retablirAction}
                data-testid="retablir"
              >
                <IconeRetablir taille={22} />
              </button>
            </>
          )}
        </div>
      </header>
      <BarreEtapes ecran={ecran} />
    </>
  );
}

function IndicateurSauvegarde() {
  const e = etatSauvegarde.value;
  return (
    <span class="enregistre" data-etat={e} role="status" aria-live="polite" data-testid="enregistre">
      {e === 'enregistre' && (
        <>
          <IconeCoche taille={14} />
          {T.enregistre}
        </>
      )}
      {e === 'erreur' && T.pasEnregistre}
    </span>
  );
}

export function BarreEtapes({ ecran }: { ecran: Ecran }) {
  const n = numeroEtape(ecran);
  return (
    <div class="etapes">
      <span class="etapes-texte" data-testid="etape">
        {T.etape(n)}
        {ecran === 'importer' ? ` · ${T.nomsEtapes[0]}` : ''}
      </span>
      <div class="etapes-barres" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} data-fait={i <= n ? '1' : '0'} />
        ))}
      </div>
    </div>
  );
}
