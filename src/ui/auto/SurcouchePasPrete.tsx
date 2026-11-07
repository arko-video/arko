// Surcouche d'échafaudage de la v3 : un écran plein (par-dessus l'écran en cours) qui dit « Bientôt disponible » et
// se ferme. Les devs la remplacent par leur vrai écran. Fichier GELÉ (intégrateur).

import type { ComponentChildren } from 'preact';
import { TV } from '../../textes-v3';
import { IconeRetour } from '../composants/Icones';

export function SurcouchePasPrete({ titre, testid, fermer, children }: { titre: string; testid: string; fermer: () => void; children?: ComponentChildren }) {
  return (
    <div class="bibliotheque-fond" data-testid={testid}>
      <div class="ecran bibliotheque">
        <header class="entete">
          <button type="button" class="btn btn-icone" aria-label={titre} onClick={fermer} data-testid={`${testid}-fermer`}>
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{titre}</h1>
        </header>
        <main class="ecran-corps">
          <p class="petit doux">{TV.commun.bientot}</p>
          {children}
        </main>
      </div>
    </div>
  );
}
