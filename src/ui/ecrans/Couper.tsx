// Étape 2 : garder le meilleur. Aperçu, durée finale colorée, frise des plans, outils de coupe.
// Pour une longue vidéo (live…), une barre de navigation dans la vidéo d'origine s'ajoute au-dessus de la frise.

import { useRef } from 'preact/hooks';
import { commencerIci, dureeFinale, finirIci, scinder, supprimer } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { Apercu } from '../composants/Apercu';
import { Entete } from '../composants/Entete';
import { Frise } from '../composants/Frise';
import {
  IconeCiseaux,
  IconeDebutIci,
  IconeFinIci,
  IconeImageMoins,
  IconeImagePlus,
  IconeMoins,
  IconePlus,
  IconePoubelle,
} from '../composants/Icones';
import { NavigationSource, SEUIL_LONGUE_SOURCE } from '../composants/NavigationSource';
import { PanneauPlan } from '../composants/PanneauPlan';
import { SonGuide } from '../composants/SonGuide';
import { modifier, recette, recetteAffichee, selection, sources, teteLecture } from '../etat';
import { formatDuree, niveauDuree, pasImage } from '../format';
import { aimanterRythme, vibrer } from '../guide';
import { chercher, mettreEnPause } from '../lecture';
import { suivant } from '../navigation';

/* ------------------------------------------------------------ actions des boutons */

/** Applique une opération puis place la tête de lecture (par défaut : là où elle était). */
function agir(op: (r: Recette) => Recette, teteApres?: number) {
  mettreEnPause();
  const avant = teteLecture.peek();
  if (modifier(op)) chercher(teteApres ?? avant);
}

function avancerImages(n: number) {
  mettreEnPause();
  chercher(pasImage(teteLecture.peek(), n));
}

// « Commencer ici » : ce qui était à la tête devient le début, donc la tête revient à 0.
const surCommencerIci = () => agir((r) => commencerIci(r, teteLecture.peek()), 0);
const surFinirIci = () => agir((r) => finirIci(r, teteLecture.peek()));

function surScinder() {
  mettreEnPause();
  // « Caler les coupes sur le rythme » : la coupe se pose sur le temps fort le plus proche (±0,12 s).
  const cale = aimanterRythme(teteLecture.peek());
  const t = cale ?? teteLecture.peek();
  if (modifier((r) => scinder(r, t))) {
    selection.value = null;
    if (cale !== null) {
      vibrer();
      chercher(t);
    }
  }
}

function surSupprimer() {
  const i = selection.peek();
  if (i === null) return;
  mettreEnPause();
  if (modifier((r) => supprimer(r, i))) {
    selection.value = null;
    chercher(teteLecture.peek());
  }
}

/* ------------------------------------------------------------ écran */

export function Couper() {
  const zoomRef = useRef<((f: number) => void) | null>(null);
  const r = recetteAffichee.value;
  if (!r) return null;
  const source = sources.value[0];
  const duree = dureeFinale(r);
  const niveau = niveauDuree(duree);
  const sel = selection.value;
  const unSeulPlan = r.plans.length <= 1;
  // Plan réglé (vitesse, arrêt sur image) : le plan choisi, ou le seul plan.
  const iPlan = sel ?? (unSeulPlan ? 0 : null);
  const planChoisi = iPlan !== null ? r.plans[iPlan] : undefined;
  // Le lecteur d'écran n'annonce que la durée validée (pas chaque pas d'un glissé).
  const rv = recette.value;
  const dureeValidee = rv ? dureeFinale(rv) : duree;

  return (
    <div class="ecran">
      <Entete titre={T.couper.nom} ecran="couper" avecHistorique />
      <main class="ecran-corps couper">
        <div class="couper-titres">
          <h2 class="titre titre-etape">{T.couper.titre}</h2>
          <p class="intro petit">{T.couper.intro}</p>
        </div>

        <Apercu />

        <div class="duree" data-niveau={niveau} data-testid="duree-finale">
          <span class="chiffres" aria-hidden="true">
            {T.couper.dureeFinale(formatDuree(duree))}
          </span>
          {niveau === 'long' && (
            <span class="duree-conseil" aria-hidden="true">
              {T.couper.tropLong(formatDuree(duree))}
            </span>
          )}
          <span class="sr-only" role="status" aria-live="polite">
            {T.couper.dureeFinale(formatDuree(dureeValidee))}
            {niveauDuree(dureeValidee) === 'long' ? `. ${T.couper.tropLong(formatDuree(dureeValidee))}` : ''}
          </span>
        </div>

        {source && source.infos.duree > SEUIL_LONGUE_SOURCE && <NavigationSource source={source} />}

        <div class="frise-entete">
          <span class="accroche-legende">
            <span class="accroche-pastille" aria-hidden="true" />
            {T.couper.accroche}
          </span>
          <span class="zoom">
            <button
              type="button"
              class="btn btn-icone encadre petit-btn"
              aria-label={T.couper.zoomMoins}
              onClick={() => zoomRef.current?.(1 / 1.6)}
              data-testid="zoom-moins"
            >
              <IconeMoins taille={18} />
            </button>
            <button
              type="button"
              class="btn btn-icone encadre petit-btn"
              aria-label={T.couper.zoomPlus}
              onClick={() => zoomRef.current?.(1.6)}
              data-testid="zoom-plus"
            >
              <IconePlus taille={18} />
            </button>
          </span>
        </div>

        <Frise zoomRef={zoomRef} />

        <div class="barre-images">
          <button
            type="button"
            class="btn btn-icone encadre"
            aria-label={T.couper.imageMoins}
            onClick={() => avancerImages(-1)}
            data-testid="image-moins"
          >
            <IconeImageMoins />
          </button>
          <span class="petit doux aide-selection">{sel === null && !unSeulPlan ? T.couper.aideSelection : ''}</span>
          <button
            type="button"
            class="btn btn-icone encadre"
            aria-label={T.couper.imagePlus}
            onClick={() => avancerImages(1)}
            data-testid="image-plus"
          >
            <IconeImagePlus />
          </button>
        </div>

        <div class="grille-2 outils-coupe" role="group" aria-label={T.couper.outils}>
          <button type="button" class="btn" onClick={surCommencerIci} data-testid="commencer-ici">
            <IconeDebutIci taille={18} />
            {T.couper.commencerIci}
          </button>
          <button type="button" class="btn" onClick={surFinirIci} data-testid="finir-ici">
            <IconeFinIci taille={18} />
            {T.couper.finirIci}
          </button>
          <button type="button" class="btn" onClick={surScinder} data-testid="scinder">
            <IconeCiseaux taille={18} />
            {T.couper.scinder}
          </button>
          <button
            type="button"
            class="btn"
            disabled={sel === null || unSeulPlan}
            onClick={surSupprimer}
            data-testid="supprimer"
          >
            <IconePoubelle taille={18} />
            {T.couper.supprimer}
          </button>
        </div>

        {iPlan !== null && planChoisi && <PanneauPlan i={iPlan} plan={planChoisi} />}

        <SonGuide />
      </main>
      <footer class="ecran-pied">
        <button
          type="button"
          class="btn btn-principal"
          onClick={() => {
            mettreEnPause();
            suivant();
          }}
          data-testid="suivant"
        >
          {T.suivant}
        </button>
      </footer>
    </div>
  );
}
