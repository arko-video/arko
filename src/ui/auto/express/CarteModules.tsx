// Best-of v4 (dev-ui) — la carte d'accord du module sous-titres (Whisper, ≈ 90 Mo) : affichée au toucher sur
// « Analyser ma vidéo » quand le module manque (ou depuis le bandeau de la revue). Un bouton clair avec la taille,
// « une seule fois, puis sans internet » ; « Pas maintenant » fait le Best-of sans lui ET le dit sur la revue.
// Le détecteur de voix est rangé dans l'appli : il n'est jamais proposé ici.

import { useEffect, useRef } from 'preact/hooks';
import { formatTaille } from '../../format';
import { tailleArrondie } from '../../sous-titres-ui';
import { parcoursV4 } from './best-of-v4';
import { TEXTES_V4 } from './textes-v4';
import '../coupes/coupes-auto.css';

const TC = TEXTES_V4.carte;

export function CarteModules() {
  const c = parcoursV4.carte.value;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (c && d && !d.open) d.showModal?.();
  }, [c !== null]);
  if (!c) return null;
  const taille = 'octets' in c ? `≈${' '}${tailleArrondie(c.octets)}` : '';
  return (
    <dialog
      ref={ref}
      class="ca-panneau express-carte"
      aria-labelledby="carte-modules-titre"
      data-testid="express-carte-modules"
      data-phase={c.phase}
      onCancel={(e) => {
        e.preventDefault();
        // Pendant le téléchargement, seul « Arrêter » l'arrête (pas un Retour par mégarde).
        if (c.phase !== 'telechargement') parcoursV4.fermerCarte();
      }}
    >
      <div class="ca-corps">
        {c.phase === 'proposer' && (
          <>
            <h2 id="carte-modules-titre">{TC.titre}</h2>
            <p class="ca-aide">{TC.texte(taille)}</p>
            <p class="ca-aide">{TC.rienEnvoye}</p>
            <div class="ca-boutons">
              <button type="button" class="btn btn-principal" onClick={() => void parcoursV4.accepterModules()} data-testid="express-carte-telecharger">
                {TC.telecharger(taille)}
              </button>
              <button type="button" class="btn" onClick={() => void parcoursV4.refuserModules()} data-testid="express-carte-pas-maintenant">
                {TC.pasMaintenant}
              </button>
            </div>
            <p class="ca-aide petit">{TC.pasMaintenantAide}</p>
          </>
        )}
        {c.phase === 'telechargement' && (
          <>
            <h2 id="carte-modules-titre">{TC.titre}</h2>
            <p class="ca-aide" role="status" aria-live="polite" data-testid="express-carte-progression">
              {TC.telechargement} {formatTaille(c.p * c.octets)} / {formatTaille(c.octets)}
            </p>
            <div class="ca-progression" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.p * 100)}>
              <span style={{ width: `${Math.round(c.p * 100)}%` }} />
            </div>
            <p class="ca-aide petit">{TC.garderOuvert}</p>
            <div class="ca-boutons">
              <button type="button" class="btn" onClick={() => parcoursV4.fermerCarte()} data-testid="express-carte-arreter">
                {TC.arreter}
              </button>
            </div>
          </>
        )}
        {c.phase === 'horsLigne' && (
          <>
            <h2 id="carte-modules-titre">{TC.horsLigneTitre}</h2>
            <p class="ca-aide">{TC.horsLigne}</p>
            <div class="ca-boutons">
              <button type="button" class="btn btn-principal" onClick={() => void parcoursV4.refuserModules()} data-testid="express-carte-continuer">
                {TC.continuerSans}
              </button>
            </div>
          </>
        )}
        {c.phase === 'erreur' && (
          <>
            <h2 id="carte-modules-titre">{TC.erreurTitre}</h2>
            <p class="ca-erreur" role="alert">
              {c.message}
            </p>
            <div class="ca-boutons">
              <button type="button" class="btn btn-principal" onClick={() => void parcoursV4.accepterModules()} data-testid="express-carte-reessayer">
                {TC.reessayer}
              </button>
              <button type="button" class="btn" onClick={() => void parcoursV4.refuserModules()} data-testid="express-carte-continuer">
                {TC.continuerSans}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
