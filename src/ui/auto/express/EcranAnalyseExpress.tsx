// Montage express, écran 2 : l'Analyse sur l'appareil (son, transcription par tranches avec reprise, bords de
// l'écran, choix des séquences), puis l'IA si demandée (texte seulement). Annuler garde ce qui est transcrit.

import { TA } from '../../../textes-auto';
import { IconeAlerte } from '../../composants/Icones';
import { retour } from '../../navigation';
import { EnteteExpress } from './EcranReglagesExpress';
import { annulerExpress, etatExpress, lancerExpress } from './etat-express';

const TX = TA.express;

export function EcranAnalyseExpress() {
  const e = etatExpress.value;
  const p = e.phase === 'encours' ? Math.round(e.p * 100) : 0;
  return (
    <div class="ecran monteur express" data-testid="express-analyse" data-phase={e.phase}>
      <EnteteExpress n={2} />
      <main class="ecran-corps">
        <h2 class="titre">{TX.analyseTitre}</h2>
        {e.phase === 'encours' && (
          <section class="analyse-carte" aria-live="polite">
            <div class="analyse-pourcent chiffres" data-testid="express-pourcent">
              {p}
              <span>%</span>
            </div>
            <div class="barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={TX.analyseTitre}>
              <span style={{ width: `${p}%` }} />
            </div>
            <p class="analyse-message" data-testid="express-message">
              {e.message}
            </p>
            <p class="petit doux">{TX.garderOuvert}</p>
          </section>
        )}
        {e.phase === 'erreur' && (
          <div class="message message-erreur" role="alert" data-testid="express-erreur">
            <IconeAlerte />
            <span>{e.message}</span>
          </div>
        )}
      </main>
      <footer class="ecran-pied">
        {e.phase === 'erreur' ? (
          <>
            <button type="button" class="btn btn-principal" onClick={() => void lancerExpress()} data-testid="express-reessayer">
              {TX.reessayer}
            </button>
            <button type="button" class="btn btn-discret" onClick={retour}>
              {TA.express.etapes[0]}
            </button>
          </>
        ) : (
          <button type="button" class="btn btn-contour" onClick={annulerExpress} disabled={e.phase !== 'encours'} data-testid="express-annuler">
            {TX.annuler}
          </button>
        )}
      </footer>
    </div>
  );
}
