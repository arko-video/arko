// Monteur IA, écran 2 : l'Analyse. Progression et message, temps écoulé, Annuler, reprise ;
// puis l'envoi à l'IA (ou les clips sans IA) et les moments trouvés, avant la Revue.

import { useEffect, useState } from 'preact/hooks';
import { NOMBRE } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { IconeAlerte } from '../../composants/Icones';
import { EnteteMonteur } from '../../composants/monteur/EnteteMonteur';
import { nomCourt } from '../../composants/monteur/ReglagesIA';
import { PanneauEnvoi } from '../../composants/monteur/PanneauEnvoi';
import { formatHeure } from '../../format';
import { annulerAnalyse, lancerAnalyse, passerSansIA, reessayerIA } from '../../monteur/analyse-monteur';
import { demande, etatAnalyse, requeteEnvoyee, resultat, revue } from '../../monteur/etat-monteur';
import { allerMonteur, retourMonteur } from '../../monteur/navigation-monteur';

/** « 1 min 05 » ou « 42 s ». */
function ecoule(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/** Re-rend chaque seconde tant que `actif`. */
function useHorloge(actif: boolean): number {
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    if (!actif) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [actif]);
  return maintenant;
}

export function Analyse() {
  const e = etatAnalyse.value;
  const res = resultat.value;
  const enCours = e.phase === 'encours' || e.phase === 'ia';
  const maintenant = useHorloge(enCours);
  const [envoi, setEnvoi] = useState(false);
  const d = demande.value;
  const nbClips = revue.value?.restants.length ?? 0;

  return (
    <div class="ecran monteur" data-testid="monteur-analyse" data-phase={e.phase}>
      <EnteteMonteur n={2} />
      <main class="ecran-corps">
        <h2 class="titre">
          {e.phase === 'fini'
            ? T.monteur.analyseFinie
            : e.phase === 'interrompue'
              ? T.monteur.interrompue
              : e.phase === 'erreurIA'
                ? T.monteur.momentsTitre
                : T.monteur.analyseTitre}
        </h2>

        {e.phase === 'encours' && (
          <section class="analyse-carte" aria-live="polite">
            <div class="analyse-pourcent chiffres" data-testid="analyse-pourcent">
              {Math.round(e.p * 100)}
              <span>%</span>
            </div>
            <div
              class="barre"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(e.p * 100)}
              aria-label={T.monteur.analyseTitre}
            >
              <span style={{ width: `${Math.round(e.p * 100)}%` }} />
            </div>
            <p class="analyse-message" data-testid="analyse-message">
              {e.message}
            </p>
            <p class="petit doux chiffres" data-testid="analyse-ecoule">
              {T.monteur.ecoule(ecoule(maintenant - e.debut))}
            </p>
            <p class="petit doux">{T.monteur.garderOuvert}</p>
          </section>
        )}

        {e.phase === 'ia' && (
          <section class="analyse-carte" aria-live="polite" data-testid="analyse-ia">
            <span class="spinner" aria-hidden="true" />
            <p class="analyse-message">{T.monteur.envoiIA(nomCourt(d.fournisseur))}</p>
            <p class="petit doux">{T.monteur.envoiIAAide}</p>
            <p class="petit doux chiffres">{T.monteur.ecoule(ecoule(maintenant - e.debut))}</p>
          </section>
        )}

        {e.phase === 'interrompue' && (
          <div class="message message-alerte" role="status" data-testid="analyse-interrompue">
            <IconeAlerte />
            <span class="message-corps">
              <strong>{T.monteur.arreteeA(e.p)}</strong>
              <span>{T.monteur.interrompueAide}</span>
            </span>
          </div>
        )}

        {(e.phase === 'erreur' || e.phase === 'erreurIA') && (
          <div class="message message-erreur" role="alert" data-testid="analyse-erreur">
            <IconeAlerte />
            <span class="message-corps">
              <strong>{e.phase === 'erreur' ? T.monteur.erreurAnalyse : T.monteur.erreurIA}</strong>
              <span data-testid="analyse-erreur-message">{e.message}</span>
            </span>
          </div>
        )}

        {res && !enCours && <Moments />}

        {e.phase === 'fini' && e.coupee && (
          <div class="message message-alerte" role="status" data-testid="reponse-coupee">
            <IconeAlerte />
            <span class="message-corps">
              <strong>{T.monteur.coupee(e.coupee.recuperes, e.coupee.demandes)}</strong>
              <span>{T.monteur.coupeeAide}</span>
            </span>
          </div>
        )}
        {e.phase === 'fini' && e.corrections > 0 && (
          <p class="petit doux">{T.monteur.corrections(e.corrections)}</p>
        )}

        {requeteEnvoyee.value && !enCours && (
          <button
            type="button"
            class="btn btn-contour"
            onClick={() => setEnvoi(true)}
            data-testid="voir-envoi"
          >
            {T.monteur.voirEnvoi}
          </button>
        )}
        {envoi && requeteEnvoyee.value && (
          <PanneauEnvoi
            texte={requeteEnvoyee.value}
            exemple={false}
            deuxDemandes={d.nombre > NOMBRE.parRequete}
            onFermer={() => setEnvoi(false)}
          />
        )}
      </main>

      <footer class="ecran-pied pile">
        {enCours && (
          <button type="button" class="btn" onClick={annulerAnalyse} data-testid="annuler-analyse">
            {T.monteur.annuler}
          </button>
        )}
        {(e.phase === 'interrompue' || e.phase === 'erreur') && (
          <>
            <button
              type="button"
              class="btn btn-principal"
              onClick={() => void lancerAnalyse()}
              data-testid="reprendre-analyse"
            >
              {T.monteur.reprendreAnalyse}
            </button>
            <button type="button" class="btn" onClick={retourMonteur} data-testid="retour-reglages">
              {T.monteur.retourReglages}
            </button>
          </>
        )}
        {e.phase === 'erreurIA' && (
          <>
            <button
              type="button"
              class="btn btn-principal"
              onClick={() => void passerSansIA()}
              data-testid="passer-sans-ia"
            >
              {T.monteur.passerSansIA}
            </button>
            <div class="grille-2">
              <button type="button" class="btn" onClick={() => void reessayerIA()} data-testid="reessayer-ia">
                {T.monteur.reessayer}
              </button>
              <button type="button" class="btn" onClick={retourMonteur} data-testid="retour-reglages">
                {T.monteur.retourReglages}
              </button>
            </div>
          </>
        )}
        {e.phase === 'fini' && nbClips > 0 && (
          <button
            type="button"
            class="btn btn-principal"
            onClick={() => allerMonteur('revue')}
            data-testid="voir-clips"
          >
            {T.monteur.clipsPrets(nbClips)}
          </button>
        )}
        {e.phase === 'fini' && nbClips === 0 && (
          <button type="button" class="btn" onClick={retourMonteur} data-testid="retour-reglages">
            {T.monteur.retourReglages}
          </button>
        )}
      </footer>
    </div>
  );
}

/** Les moments trouvés (ils arrivent à la fin de l'analyse), triés par début. */
function Moments() {
  const res = resultat.value;
  if (!res) return null;
  const { moments, stats, avertissements } = res;
  return (
    <section class="moments" data-testid="moments">
      <h3 class="champ-titre">
        {moments.length > 0 ? T.monteur.moments(moments.length) : T.monteur.aucunMoment}
      </h3>
      {stats.repris && stats.reprisA > 0 && (
        <p class="petit doux" data-testid="repris">
          {T.monteur.reprisA(formatHeure(stats.reprisA))}
        </p>
      )}
      {avertissements.map((a) => (
        <p key={a} class="petit message message-alerte">
          {a}
        </p>
      ))}
      <ol class="moments-liste">
        {moments.slice(0, 40).map((m, i) => (
          <li
            key={m.id ?? i}
            class="moment"
            data-testid={`moment-${i}`}
            data-pic={(m.pic ?? (m.debut + m.fin) / 2).toFixed(1)}
          >
            <span class="moment-heure chiffres">{formatHeure(m.pic ?? m.debut)}</span>
            <span class="moment-raison">{m.raison || m.etiquettes.join(', ')}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
