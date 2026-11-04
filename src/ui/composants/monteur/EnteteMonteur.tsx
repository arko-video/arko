// En-tête des écrans du monteur IA : Retour (comme le bouton Retour du téléphone), titre, « Étape x sur 3 ».

import { T } from '../../../textes-fr';
import { retour } from '../../navigation';
import { IconeRetour } from '../Icones';

export function EnteteMonteur({ n, retourDesactive }: { n: 1 | 2 | 3; retourDesactive?: boolean }) {
  return (
    <>
      <header class="entete">
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
        <h1 class="entete-titre">
          <span class="monteur-etoile" aria-hidden="true" />
          {T.monteur.nom}
        </h1>
      </header>
      <div class="etapes">
        <span class="etapes-texte" data-testid="etape-monteur">
          {T.monteur.etape(n, T.monteur.etapes[n - 1])}
        </span>
        <div class="etapes-barres" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} data-fait={i <= n ? '1' : '0'} />
          ))}
        </div>
      </div>
    </>
  );
}
