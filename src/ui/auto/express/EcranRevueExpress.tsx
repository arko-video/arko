// Montage express, écran 3 : la Revue des séquences proposées (titre, durée, raison), cocher / décocher, changer
// l'ordre, durée totale mise à jour ; les avertissements (passage AFK non proposé…) ; puis « Monter la vidéo ».
// Best-of (v4, dev-ui) : tout se change au pouce ou à la souris, sans réanalyse : durée visée (séquences choisies à
// nouveau), ★ de la note, Écouter, Régler (une phrase de plus / de moins au début ou à la fin), durée APRÈS coupes
// = celle du montage (dureeEstimee), bandeaux des modules qui manquent, voix (RevueBestOf). Un seul Annuler ensuite.

import { useState } from 'preact/hooks';
import { horodatage } from '../../../auto/express/scenes';
import type { SequenceV4 } from '../../../auto/types-v4';
import { MEILLEUR } from '../../../recette/modeles';
import { TA } from '../../../textes-auto';
import { IconeAlerte } from '../../composants/Icones';
import { formatDuree } from '../../format';
import type { SceneBestOf } from '../../../auto/express/best-of';
import { arreterEcoute, ecouteEnCours, ecouterPassage } from '../voix/ecoute';
import { BoutonApercu, MiniApercu } from '../voix/MiniApercu';
import { parcoursV4 } from './best-of-v4';
import { BRANCHEMENTS } from './branchements-v4';
import { CarteModules } from './CarteModules';
import { EnteteExpress, fourchette, Segments } from './EcranReglagesExpress';
import { EtiquetteResserree, RevueBestOf } from './RevueBestOf';
import { AvancementPrecis } from './SousTitresPrecis';
import {
  analyseExpress,
  basculerScene,
  deplacerScene,
  destinationExpress,
  dureeMaxExpress,
  DUREES_EXPRESS,
  envoiIA,
  messageIA,
  montageEnCours,
  monterExpress,
  reglagesExpress,
  scenesExpress,
  sourceExpress,
  totalExpress,
} from './etat-express';
import { avertissementsRevue, dureeSequence, estV4, etoiles, refaireSansPrecision } from './etat-v4';
import { TEXTES_V4 } from './textes-v4';
import { demanderPlanMonHub, etatMonHub, ouvrirPlan, planMonteur, telechargerDossier } from './monteur-ia';

const TX = TA.express;
const TR = TEXTES_V4.revue;

/** ★★★☆☆ (centile de la séquence dans la session). */
function Etoiles({ centile }: { centile: number }) {
  const n = etoiles(centile);
  return (
    <span class="express-etoiles" aria-label={TR.note(centile)} title={TR.note(centile)} data-testid="express-etoiles" data-n={n}>
      {'★'.repeat(n)}
      <span class="express-etoiles-vides">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** Écouter / Régler sous une séquence du Best-of v4. */
function OutilsSequence({ s, i, ouvert, basculer }: { s: SequenceV4; i: number; ouvert: boolean; basculer: () => void }) {
  const source = sourceExpress.value;
  const cle = `sequence:${s.de}:${s.a}`;
  const enCours = ecouteEnCours.value === cle;
  const reglable = BRANCHEMENTS.ajusterSequence !== null;
  return (
    <div class="express-scene-outils">
      <div class="express-scene-boutons">
        <button type="button" class="btn express-mini" aria-pressed={enCours} disabled={!source} onClick={() => source && void ecouterPassage(source.fichier, s.de, s.a, cle)} data-testid={`express-ecouter-${i}`}>
          {enCours ? TR.arreter : TR.ecouter}
        </button>
        <BoutonApercu cle={cle} actif={!!source} classe="btn express-mini" testid={`express-voir-${i}`} />
        {reglable && (
          <button type="button" class="btn express-mini" aria-expanded={ouvert} onClick={basculer} data-testid={`express-regler-${i}`}>
            {ouvert ? TR.fermerReglage : TR.regler}
          </button>
        )}
      </div>
      {source && <MiniApercu fichier={source.fichier} de={s.de} a={s.a} cle={cle} />}
      {reglable && ouvert && (
        <div class="express-regler" data-testid={`express-reglage-${i}`}>
          {(['debut', 'fin'] as const).map((cote) => (
            <div key={cote} class="express-regler-ligne" role="group" aria-label={cote === 'debut' ? TR.debut : TR.fin}>
              <span class="petit">{cote === 'debut' ? TR.debut : TR.fin}</span>
              <button
                type="button"
                class="btn express-mini"
                aria-label={cote === 'debut' ? TR.debutApres : TR.finAvant}
                onClick={() => parcoursV4.ajuster(i, cote, -1)}
                data-testid={`express-${cote}-moins-${i}`}
              >
                {TR.moins}
              </button>
              <button
                type="button"
                class="btn express-mini"
                aria-label={cote === 'debut' ? TR.debutAvant : TR.finApres}
                onClick={() => parcoursV4.ajuster(i, cote, 1)}
                data-testid={`express-${cote}-plus-${i}`}
              >
                {TR.plus}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bandeaux de la revue : ce qui manque (module sous-titres refusé, détecteur de voix illisible). */
function Bandeaux() {
  const a = analyseExpress.value;
  if (!estV4(a)) return null;
  const sansTextes = a.modules.whisper !== 'present' && reglagesExpress.value.transcrire;
  const sansPrecision = a.modules.vad !== 'present';
  return (
    <>
      {sansTextes && (
        <div class="message message-alerte express-bandeau" role="status" data-testid="express-bandeau-textes">
          <IconeAlerte />
          <span>{TR.sansTextes}</span>
          <button type="button" class="btn express-mini" onClick={() => void parcoursV4.telechargerEtRefaire()} data-testid="express-bandeau-telecharger">
            {TR.sansTextesBouton}
          </button>
        </div>
      )}
      {sansPrecision && (
        <div class="petit message message-info express-bandeau" role="status" data-testid="express-bandeau-precision">
          <span>{TR.sansPrecision}</span>
          {refaireSansPrecision(a) && (
            <button type="button" class="btn express-mini" onClick={() => void parcoursV4.reessayer()} data-testid="express-bandeau-refaire">
              {TR.refaire}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function EcranRevueExpress() {
  const a = analyseExpress.value;
  const scenes = scenesExpress.value;
  const [envoi, setEnvoi] = useState(false);
  const [ouverte, setOuverte] = useState<number | null>(null);
  if (!a) return null;
  const r = reglagesExpress.value;
  const v4 = estV4(a);
  const possible = parcoursV4.possible.value;
  const total = v4 ? (parcoursV4.total.value ?? 0) : totalExpress.value + (r.accroche ? MEILLEUR.dureeExpress : 0);
  const max = v4 && possible ? possible.max : dureeMaxExpress();
  const gardees = scenes.filter((s) => s.garde).length;
  const occupe = montageEnCours.value;
  const etape = parcoursV4.etapeMontage.value;
  const durees = DUREES_EXPRESS[destinationExpress.value];
  const iDuree = Math.max(0, durees.findIndex((x) => x.min === r.dureeVisee.min && x.max === r.dureeVisee.max));
  // Le bandeau dit déjà « sans module sous-titres » : la ligne d'avertissement d'avant ferait doublon.
  // Les bandeaux disent déjà « sans module sous-titres » / « moins précis » : pas de doublon (relecture point 16).
  const autres = messageIA.value ? [messageIA.value] : [];
  const avertissements = v4 ? avertissementsRevue(a, autres) : [...a.avertissements, ...autres];
  const peutMonter = v4 && possible ? possible.possible : gardees > 0 && total <= max;

  return (
    <div class="ecran monteur express" data-testid="express-revue" data-v4={v4 ? '1' : '0'}>
      <EnteteExpress n={3} />
      <main class="ecran-corps">
        <div class="importer-titres">
          <h2 class="titre">{TX.revueTitre}</h2>
          <p class="intro petit doux">{v4 ? TR.aide : TX.revueAide}</p>
        </div>
        <p class="express-total chiffres" data-testid="express-total" data-trop={total > max ? '1' : '0'} data-secondes={total}>
          <strong>{v4 ? TR.total(formatDuree(total)) : TX.total(formatDuree(total))}</strong>
          <span class="petit doux">
            {v4 && r.accroche && gardees > 0 ? ` · ${TR.accrocheComprise}` : ''} · {TX.vise(fourchette(r.dureeVisee))}
          </span>
        </p>
        {total > max && (
          <div class="message message-alerte" role="status" data-testid="express-trop-long">
            <IconeAlerte />
            <span>{TX.tropLong(formatDuree(max))}</span>
          </div>
        )}
        {v4 && (
          <Segments
            titre={TR.dureeVisee}
            id="revue-duree"
            valeurs={['0', '1', '2']}
            actif={String(iDuree)}
            nom={(v) => fourchette(durees[Number(v)]!)}
            choisir={(v) => {
              const dv = durees[Number(v)]!;
              setOuverte(null);
              parcoursV4.changerDuree(dv, fourchette(dv));
            }}
          />
        )}
        <Bandeaux />
        {avertissements.map((m) => (
          <p key={m} class="petit message message-info" data-testid="express-avertissement">
            {m}
          </p>
        ))}
        {envoiIA.value && (
          <details class="panneau-envoi" open={envoi} onToggle={(e) => setEnvoi((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{TX.voirEnvoi}</summary>
            <pre class="envoi-texte">{envoiIA.value}</pre>
          </details>
        )}
        <RevueBestOf partie="haut" />
        <div class="express-revue-colonnes">
          <div class="express-revue-sequences">
            {scenes.length === 0 && <p data-testid="express-aucune">{TX.aucune}</p>}
            <ol class="express-scenes">
              {scenes.map((s, i) => {
                const seq = v4 ? (s as SequenceV4) : null;
                const duree = seq && v4 ? dureeSequence(a, seq, r) : s.duree;
                return (
                  <li key={`${i}-${s.de}-${s.a}`} class="express-scene" data-garde={s.garde ? '1' : '0'} data-testid={`express-scene-${i}`}>
                    <div class="express-scene-haut">
                      <button type="button" class="express-cocher" role="checkbox" aria-checked={s.garde} aria-label={`${TX.garde} : ${s.titre}`} onClick={() => basculerScene(i)} data-testid={`express-cocher-${i}`}>
                        <span class="express-case" aria-hidden="true" />
                        <span class="express-scene-textes">
                          <strong>{s.titre}</strong>
                          <span class="petit doux chiffres">
                            {v4 ? TR.sequence(horodatage(s.de), horodatage(s.a), formatDuree(duree)) : TX.sequence(horodatage(s.de), horodatage(s.a), formatDuree(duree))}
                          </span>
                          <span class="petit">
                            {seq && <Etoiles centile={seq.centile ?? s.score} />} {s.raison}
                          </span>
                          {!v4 && <EtiquetteResserree scene={s as SceneBestOf} />}
                        </span>
                      </button>
                      <span class="express-ordre">
                        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={TX.monterHaut} disabled={i === 0} onClick={() => deplacerScene(i, -1)} data-testid={`express-haut-${i}`}>
                          ↑
                        </button>
                        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={TX.descendre} disabled={i === scenes.length - 1} onClick={() => deplacerScene(i, 1)} data-testid={`express-bas-${i}`}>
                          ↓
                        </button>
                      </span>
                    </div>
                    {seq && <OutilsSequence s={seq} i={i} ouvert={ouverte === i} basculer={() => setOuverte(ouverte === i ? null : i)} />}
                  </li>
                );
              })}
            </ol>
          </div>
          <div class="express-revue-voix">
            <RevueBestOf partie="bas" />
            <p class="petit doux">
              <button type="button" class="btn btn-principal express-mini" onClick={() => void demanderPlanMonHub()} data-testid="express-demander-monteur-ia">
                Demander au monteur IA{etatMonHub.value === 'absent' ? ' (Mon Hub absent)' : etatMonHub.value === 'occupe' ? ' (Mon Hub occupé)' : etatMonHub.value === 'bloque' ? ' (bloqué par le navigateur)' : ''}
              </button>{' '}
              <button type="button" class="btn express-mini" onClick={() => void telechargerDossier()} data-testid="express-envoyer-monteur-ia">
                Envoyer au monteur IA
              </button>{' '}
              Pour Mon Hub → Monteur IA (le fichier reste sur ton appareil).{' '}
              <label class="btn express-mini" data-testid="express-ouvrir-plan">
                Ouvrir un plan
                <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void ouvrirPlan(f); }} />
              </label>
            </p>
            <JournalPlan />
          </div>
        </div>
      </main>
      <footer class="ecran-pied">
        {v4 && <AvancementPrecis />}
        <button
          type="button"
          class="btn btn-principal"
          disabled={!peutMonter || occupe}
          aria-busy={occupe}
          onClick={() => {
            arreterEcoute();
            void monterExpress();
          }}
          data-testid="express-monter"
        >
          {occupe ? (etape === 'musique' ? TEXTES_V4.montage.musique : TX.preparation) : `${TX.monterVideo} · ${TX.monter(gardees)}`}
        </button>
      </footer>
      {v4 && <CarteModules />}
    </div>
  );
}

/** A5. Ce que le plan du monteur IA contient, et les corrections faites par Arko. */
function JournalPlan() {
  const v = planMonteur.value;
  if (!v) return null;
  return (
    <div class="petit message message-info" data-testid="express-journal-plan">
      <strong>Plan du monteur IA :</strong> {v.plan.sequences.length} séquences, {v.plan.effets.length} effets{v.plan.titres[0] ? `, titre « ${v.plan.titres[0]} »` : ''}.{' '}
      {v.plan.sequences.length > 0 ? '« Monter » utilisera ce plan.' : 'Ce plan n\'a aucune séquence : « Monter » fera comme d\'habitude.'}{' '}
      <button type="button" class="btn btn-discret express-mini" onClick={() => (planMonteur.value = null)} data-testid="express-plan-oublier">
        Ne pas l'utiliser
      </button>
      {v.journal.length > 0 && (
        <ul>
          {v.journal.slice(0, 8).map((j, k) => (
            <li key={k}>{j}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
