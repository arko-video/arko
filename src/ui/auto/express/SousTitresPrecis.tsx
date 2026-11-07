// Best-of v4 — « Sous-titres précis » (dev-mots-2) : la case sur la revue (sous « Sous-titres pour ») et l'avancement
// de la réécoute au moment de monter, avec « Passer ». L'état est dans precis-v4.ts (instance : best-of-v4.ts).

import { useEffect } from 'preact/hooks';
import { sousTitresPrecis as st } from './best-of-v4';
import { Interrupteur } from './EcranReglagesExpress';
import type { SequenceV4 } from '../../../auto/types-v4';
import { analyseExpress, scenesExpress } from './etat-express';
import { sousTitresPourVoix } from './etat-best-of';
import { estV4 } from './etat-v4';
import { TEXTES_PRECIS } from './textes-precis';

const T = TEXTES_PRECIS;

/** La case : seulement en Best-of v4 avec des mots, quand une voix est sous-titrée. */
export function ReglagePrecis() {
  const a = analyseExpress.value;
  const pour = sousTitresPourVoix.value;
  const avecMots = estV4(a) && a.parole === 'mots';
  // Chaque nouvelle analyse : l'état du modèle est relu (coché d'office s'il est déjà là, proposé sinon).
  useEffect(() => {
    if (avecMots) void st.lire();
  }, [a]);
  if (!estV4(a) || a.parole !== 'mots' || pour === null || st.present.value === null) return null;
  const min = st.minutes(a, { scenes: scenesExpress.value as SequenceV4[], sousTitresPour: pour });
  const aide = st.present.value ? T.aidePresent(min) : T.aideAbsent(Math.round(st.octets.value / 1e6), min);
  return <Interrupteur titre={T.titre} aide={aide} coche={st.coche.value} changer={(v) => (st.coche.value = v)} id="st-precis" />;
}

/** Pendant la réécoute (avant d'ouvrir le montage) : message, barre, « Passer ». */
export function AvancementPrecis() {
  const e = st.etat.value;
  if (e.phase !== 'ecoute') return null;
  return (
    <div class="message message-info express-empreinte" data-testid="express-st-precis-ecoute">
      <span role="status">{e.etape}</span>
      <div class="ca-progression" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.p * 100)}>
        <span style={{ width: `${Math.round(e.p * 100)}%` }} />
      </div>
      <button type="button" class="btn express-mini" title={T.passerAide} onClick={() => st.passer()} data-testid="express-st-precis-passer">
        {T.passer}
      </button>
    </div>
  );
}
