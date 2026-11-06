// Montage express, écran 3 : la Revue des séquences proposées (titre, durée, raison), cocher / décocher, changer
// l'ordre, durée totale mise à jour ; les avertissements (passage AFK non proposé…) ; puis « Monter la vidéo ».

import { useState } from 'preact/hooks';
import { horodatage } from '../../../auto/express/scenes';
import { MEILLEUR } from '../../../recette/modeles';
import { TA } from '../../../textes-auto';
import { IconeAlerte } from '../../composants/Icones';
import { formatDuree } from '../../format';
import { EnteteExpress, fourchette } from './EcranReglagesExpress';
import {
  analyseExpress,
  basculerScene,
  deplacerScene,
  dureeMaxExpress,
  envoiIA,
  messageIA,
  montageEnCours,
  monterExpress,
  reglagesExpress,
  scenesExpress,
  totalExpress,
} from './etat-express';

const TX = TA.express;

export function EcranRevueExpress() {
  const a = analyseExpress.value;
  const scenes = scenesExpress.value;
  const [envoi, setEnvoi] = useState(false);
  if (!a) return null;
  const r = reglagesExpress.value;
  const total = totalExpress.value + (r.accroche ? MEILLEUR.dureeExpress : 0);
  const max = dureeMaxExpress();
  const gardees = scenes.filter((s) => s.garde).length;
  const occupe = montageEnCours.value;

  return (
    <div class="ecran monteur express" data-testid="express-revue">
      <EnteteExpress n={3} />
      <main class="ecran-corps">
        <div class="importer-titres">
          <h2 class="titre">{TX.revueTitre}</h2>
          <p class="intro petit doux">{TX.revueAide}</p>
        </div>
        <p class="express-total chiffres" data-testid="express-total" data-trop={total > max ? '1' : '0'}>
          <strong>{TX.total(formatDuree(total))}</strong>
          <span class="petit doux"> · {TX.vise(fourchette(r.dureeVisee))}</span>
        </p>
        {total > max && (
          <div class="message message-alerte" role="status" data-testid="express-trop-long">
            <IconeAlerte />
            <span>{TX.tropLong(formatDuree(max))}</span>
          </div>
        )}
        {[...a.avertissements, ...(messageIA.value ? [messageIA.value] : [])].map((m) => (
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
        {scenes.length === 0 && <p data-testid="express-aucune">{TX.aucune}</p>}
        <ol class="express-scenes">
          {scenes.map((s, i) => (
            <li key={`${s.de}-${s.a}`} class="express-scene" data-garde={s.garde ? '1' : '0'} data-testid={`express-scene-${i}`}>
              <button type="button" class="express-cocher" role="checkbox" aria-checked={s.garde} aria-label={`${TX.garde} : ${s.titre}`} onClick={() => basculerScene(i)} data-testid={`express-cocher-${i}`}>
                <span class="express-case" aria-hidden="true" />
                <span class="express-scene-textes">
                  <strong>{s.titre}</strong>
                  <span class="petit doux chiffres">{TX.sequence(horodatage(s.de), horodatage(s.a), formatDuree(s.duree))}</span>
                  <span class="petit">{s.raison}</span>
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
            </li>
          ))}
        </ol>
      </main>
      <footer class="ecran-pied">
        <button type="button" class="btn btn-principal" disabled={gardees === 0 || total > max || occupe} aria-busy={occupe} onClick={() => void monterExpress()} data-testid="express-monter">
          {occupe ? TX.preparation : `${TX.monterVideo} · ${TX.monter(gardees)}`}
        </button>
      </footer>
    </div>
  );
}
