// Outil Zoom : « Ajouter un zoom ici » pose un zoom à la tête de lecture (en temps source).
// Le zoom choisi se règle ici (style Punch ou Doux, force, durée, bande en jeu + webcam, Supprimer)
// et sa cible se fait glisser sur l'aperçu (CalqueZoom).

import { ZOOM } from '../../../recette/defauts';
import { T } from '../../../textes-fr';
import { recetteAffichee, teteLecture } from '../../etat';
import { ajouterZoomIci, reglerZoom, supprimerZoomChoisi, zoomChoisi } from '../../effets';
import { formatDuree, formatTemps } from '../../format';
import { IconePlus, IconePoubelle } from '../Icones';
import { Pastilles } from './Commun';
import { CurseurValeur } from './Reglages';
import { EntreeZoomsAuto } from '../../auto/habillage/EntreeZoomsAuto';

const STYLES = ['punch', 'doux'] as const;
const BANDES = ['cam', 'jeu'] as const;
const FORCE_MIN = 1.1;

const virgule = (x: number, d: number) => x.toFixed(d).replace('.', ',');

export function OutilZoom() {
  const r = recetteAffichee.value;
  if (!r) return null;
  const i = zoomChoisi.value;
  const z = i !== null ? r.zooms[i] : undefined;

  return (
    <div class="outil" data-testid="outil-zoom">
      {!z && (
        <>
          <button type="button" class="btn btn-principal" onClick={ajouterZoomIci} data-testid="ajouter-zoom">
            <IconePlus taille={18} />
            {T.zoom.ajouter}
          </button>
          <p class="petit doux outil-aide">{T.zoom.aide(formatTemps(teteLecture.value))}</p>
          <EntreeZoomsAuto />
        </>
      )}
      {z && (
        <>
          <p class="petit doux outil-aide">{T.zoom.viser}</p>
          <h3 class="outil-sous-titre">{T.zoom.style}</h3>
          <Pastilles
            label={T.zoom.style}
            choix={STYLES}
            actif={z.style ?? ZOOM.style}
            onChoisir={(style) => reglerZoom({ style })}
            prefixe="style-zoom"
            rendu={(k) => (
              <>
                <span class="echantillon-zoom" data-style={k} aria-hidden="true" />
                <span>{T.zoom.styles[k]}</span>
              </>
            )}
          />
          {r.mise.type === 'jeuCam' && (
            <>
              <h3 class="outil-sous-titre">{T.zoom.bande}</h3>
              <Pastilles
                label={T.zoom.bande}
                choix={BANDES}
                actif={z.zone === 'jeu' ? 'jeu' : 'cam'}
                onChoisir={(zone) => reglerZoom({ zone })}
                prefixe="bande-zoom"
                rendu={(k) => <span>{T.zoom.bandes[k]}</span>}
              />
            </>
          )}
          <CurseurValeur
            label={T.zoom.force}
            min={FORCE_MIN}
            max={ZOOM.forceMax}
            step={0.1}
            valeur={Math.max(FORCE_MIN, z.force ?? ZOOM.force)}
            format={(v) => T.zoom.forceValeur(virgule(v, 1))}
            onValider={(force) => reglerZoom({ force })}
            testid="force-zoom"
          />
          <CurseurValeur
            label={T.zoom.duree}
            min={ZOOM.durMin}
            max={ZOOM.durMax}
            step={0.1}
            valeur={z.dur ?? ZOOM.dur}
            format={formatDuree}
            onValider={(dur) => reglerZoom({ dur })}
            testid="duree-zoom"
          />
          <div class="grille-2">
            <button type="button" class="btn" onClick={() => (zoomChoisi.value = null)} data-testid="nouveau-zoom">
              <IconePlus taille={18} />
              {T.zoom.nouveau}
            </button>
            <button type="button" class="btn" onClick={supprimerZoomChoisi} data-testid="supprimer-zoom">
              <IconePoubelle taille={18} />
              {T.habiller.supprimer}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
