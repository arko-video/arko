// Montage express, écran 2 : l'Analyse sur l'appareil (son, transcription par tranches avec reprise, bords de
// l'écran, choix des séquences), puis l'IA si demandée (texte seulement). Annuler garde ce qui est transcrit.
// Best-of (v4, dev-ui) : les 4 étapes à l'écran (son, qui parle, mots, moments) ; « J'écris les mots » est dit
// « sans sous-titres » quand le module n'est pas là (jamais en silence).

import { TA } from '../../../textes-auto';
import { IconeAlerte } from '../../composants/Icones';
import { retour } from '../../navigation';
import { parcoursV4 } from './best-of-v4';
import { enBestOf } from './etat-best-of';
import { EnteteExpress } from './EcranReglagesExpress';
import { annulerExpress, etatExpress, lancerExpress, reglagesExpress } from './etat-express';
import { etapesAnalyse } from './etat-v4';
import { TEXTES_V4 } from './textes-v4';

const TX = TA.express;
const TAn = TEXTES_V4.analyse;

/** Best-of : la liste des étapes (fait ✓, en cours, à venir, sautée). */
function EtapesBestOf({ p }: { p: number }) {
  const m = parcoursV4.modules.value;
  const avecMots = reglagesExpress.value.transcrire && m?.whisper === 'present';
  const etats = etapesAnalyse(p, avecMots);
  return (
    <ol class="express-etapes" data-testid="express-etapes">
      {TAn.etapes.map((nom, i) => (
        <li key={nom} data-etat={etats[i]} data-testid={`express-etape-${i}`}>
          <span class="express-etape-puce" aria-hidden="true" />
          <span>
            {nom}
            {etats[i] === 'saute' && <span class="petit doux"> · {TAn.sansMots}</span>}
            {etats[i] === 'fait' && <span class="sr-only"> · {TAn.fait}</span>}
            {etats[i] === 'encours' && <span class="sr-only"> · {TAn.enCours}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function EcranAnalyseExpress() {
  const e = etatExpress.value;
  const p = e.phase === 'encours' ? Math.round(e.p * 100) : 0;
  const bestOf = enBestOf();
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
            {bestOf && <EtapesBestOf p={e.p} />}
            <p class="analyse-message" data-testid="express-message">
              {e.message || TX.ecoute}
            </p>
            <p class="petit doux">{bestOf ? TAn.fermer : TX.garderOuvert}</p>
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
            <button type="button" class="btn btn-principal" onClick={() => void (bestOf ? parcoursV4.reessayer() : lancerExpress())} data-testid="express-reessayer">
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
