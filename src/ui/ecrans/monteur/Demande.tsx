// Monteur IA, écran 1 : la Demande. Nombre de clips, durée visée, consigne libre, transcription,
// mode Sans IA (par défaut) ou Avec l'IA. Puis « Lancer » : on revient aux brouillons finis.

import { useEffect, useState } from 'preact/hooks';
import { moduleSousTitres, NOMBRE } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { EnteteMonteur } from '../../composants/monteur/EnteteMonteur';
import { ReglagesIA } from '../../composants/monteur/ReglagesIA';
import { cleGardee, garderCle, saisie } from '../../monteur/cles-monteur';
import { IconeMoins, IconePlus } from '../../composants/Icones';
import { afficherToast } from '../../etat';
import { formatDuree } from '../../format';
import { analyseInterrompue, lancerAnalyse } from '../../monteur/analyse-monteur';
import { demande, regler, revue, sourceMonteur } from '../../monteur/etat-monteur';
import { allerMonteur } from '../../monteur/navigation-monteur';
import { tailleArrondie } from '../../sous-titres-ui';
import { reglerTitre, titreSurClips } from '../../monteur/reglage-titre';
import { persosSurClips, reglerPersos } from '../../monteur/persos-monteur';
import { TV } from '../../../textes-v3';

/** L'utilisateur a touché à « Transcrire les voix » : on ne le recoche plus tout seul. */
let transcrireTouche = false;

export function Demande() {
  const d = demande.value;
  const source = sourceMonteur.value;
  const [module, setModule] = useState<{ present: boolean; taille: string } | null>(null);
  const [explication, setExplication] = useState(false);
  const [interrompue, setInterrompue] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    moduleSousTitres()
      .then((m) => {
        if (!vivant) return;
        setModule({ present: m.present, taille: tailleArrondie(m.tailleOctets) });
        // Coché par défaut quand le module est là (tant qu'on n'y a pas touché) ; impossible sinon.
        if (!m.present || !transcrireTouche) regler({ transcrire: m.present });
      })
      .catch(() => vivant && setModule({ present: false, taille: tailleArrondie(9e7) }));
    if (source)
      void analyseInterrompue(source.infos.emp).then((a) => vivant && setInterrompue(a ? a.p : null));
    return () => {
      vivant = false;
    };
  }, [source]);

  if (!source) return null;
  const nombre = (n: number) => regler({ nombre: Math.min(NOMBRE.max, Math.max(1, Math.round(n))) });
  const aTrier = revue.value?.source.emp === source.infos.emp ? revue.value.restants.length : 0;

  async function lancer() {
    const { mode, fournisseur } = demande.peek();
    if (mode === 'ia' && !(await cleGardee(fournisseur))) {
      // Le champ n'est visible que sans clé gardée : seule la clé tapée pour CE fournisseur est gardée (I-1).
      const tapee = saisie(fournisseur);
      if (!tapee) {
        afficherToast(T.monteur.cleManque, 5000);
        return;
      }
      await garderCle(fournisseur, tapee);
    }
    allerMonteur('analyse');
    void lancerAnalyse();
  }

  return (
    <div class="ecran monteur" data-testid="monteur-demande">
      <EnteteMonteur n={1} />
      <main class="ecran-corps">
        <div class="importer-titres">
          <h2 class="titre">{T.monteur.demandeTitre}</h2>
          <p class="intro petit doux">
            {source.infos.nom} · {formatDuree(source.infos.duree)}
          </p>
        </div>

        {interrompue !== null && (
          <div class="message message-info" data-testid="reprise-dispo">
            <span>{T.monteur.repriseDispo(interrompue)}</span>
          </div>
        )}
        {aTrier > 0 && (
          <button
            type="button"
            class="btn btn-contour"
            onClick={() => allerMonteur('revue')}
            data-testid="demande-revue"
          >
            {T.monteur.revueEnCours(aTrier)}
          </button>
        )}

        <section class="champ">
          <span class="champ-titre" id="nombre-titre">
            {T.monteur.nombre}
          </span>
          <div class="compteur-clips">
            <button
              type="button"
              class="btn btn-icone encadre"
              aria-label={T.monteur.moins}
              disabled={d.nombre <= 1}
              onClick={() => nombre(d.nombre - 1)}
              data-testid="nombre-moins"
            >
              <IconeMoins taille={22} />
            </button>
            <input
              type="range"
              class="curseur"
              min={1}
              max={NOMBRE.max}
              value={d.nombre}
              aria-labelledby="nombre-titre"
              aria-valuetext={T.monteur.clips(d.nombre)}
              onInput={(e) => nombre(Number((e.currentTarget as HTMLInputElement).value))}
              data-testid="nombre"
            />
            <button
              type="button"
              class="btn btn-icone encadre"
              aria-label={T.monteur.plus}
              disabled={d.nombre >= NOMBRE.max}
              onClick={() => nombre(d.nombre + 1)}
              data-testid="nombre-plus"
            >
              <IconePlus taille={22} />
            </button>
          </div>
          <strong class="compteur-valeur chiffres" data-testid="nombre-valeur">
            {T.monteur.clips(d.nombre)}
          </strong>
        </section>

        <section class="champ">
          <span class="champ-titre">{T.monteur.duree}</span>
          <div class="segments" role="radiogroup" aria-label={T.monteur.duree}>
            {(['court', 'long'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={d.duree === k}
                data-actif={d.duree === k ? '1' : '0'}
                onClick={() => regler({ duree: k })}
                data-testid={`duree-${k}`}
              >
                {T.monteur.durees[k]}
              </button>
            ))}
          </div>
        </section>

        <label class="champ">
          <span class="champ-titre">{T.monteur.consigne}</span>
          <input
            class="champ-saisie"
            type="text"
            maxLength={200}
            placeholder={T.monteur.consigneExemple}
            value={d.consigne}
            onInput={(e) => regler({ consigne: (e.currentTarget as HTMLInputElement).value })}
            data-testid="consigne"
          />
        </label>

        <div class="champ">
          <label class="interrupteur" data-desactive={module?.present ? '0' : '1'}>
            <span>
              <strong>{T.monteur.transcrire}</strong>
              <span class="petit doux">{T.monteur.transcrireAide}</span>
            </span>
            <input
              type="checkbox"
              checked={d.transcrire}
              disabled={!module?.present}
              onChange={(e) => {
                transcrireTouche = true;
                regler({ transcrire: (e.currentTarget as HTMLInputElement).checked });
              }}
              data-testid="transcrire"
            />
          </label>
          {module && !module.present && (
            <>
              <button
                type="button"
                class="lien"
                aria-expanded={explication}
                onClick={() => setExplication(!explication)}
                data-testid="module-pourquoi"
              >
                {T.monteur.moduleManque}
              </button>
              {explication && <p class="petit doux">{T.monteur.moduleExplication(module.taille)}</p>}
            </>
          )}
        </div>

        <div class="champ">
          <label class="interrupteur">
            <span>
              <strong>{TV.derush.titres.reglage}</strong>
              <span class="petit doux">{TV.derush.titres.reglageAide}</span>
            </span>
            <input
              type="checkbox"
              checked={titreSurClips.value}
              onChange={(e) => reglerTitre((e.currentTarget as HTMLInputElement).checked)}
              data-testid="titre-clips"
            />
          </label>
          {d.mode === 'sansIA' && (
            <label class="interrupteur">
              <span>
                <strong>{TV.bestOf.avatars}</strong>
                <span class="petit doux">{TV.bestOf.avatarsAide}</span>
              </span>
              <input
                type="checkbox"
                checked={persosSurClips.value}
                onChange={(e) => reglerPersos((e.currentTarget as HTMLInputElement).checked)}
                data-testid="persos-clips"
              />
            </label>
          )}
        </div>

        <section class="champ">
          <span class="champ-titre">{T.monteur.mode}</span>
          <div class="modes" role="radiogroup" aria-label={T.monteur.mode}>
            {(['sansIA', 'ia'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                class="mode"
                aria-checked={d.mode === m}
                data-actif={d.mode === m ? '1' : '0'}
                onClick={() => regler({ mode: m })}
                data-testid={`mode-${m}`}
              >
                <strong>{m === 'ia' ? T.monteur.avecIA : T.monteur.sansIA}</strong>
                <span class="petit doux">{m === 'ia' ? T.monteur.avecIAAide : T.monteur.sansIAAide}</span>
              </button>
            ))}
          </div>
        </section>

        {d.mode === 'ia' && <ReglagesIA />}
      </main>
      <footer class="ecran-pied">
        <button type="button" class="btn btn-principal" onClick={() => void lancer()} data-testid="lancer">
          {interrompue !== null ? T.monteur.reprendreAnalyse : T.monteur.lancer}
        </button>
      </footer>
    </div>
  );
}
