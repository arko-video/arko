// Outil « Couper » de Habiller : on coupe sans revenir à l'étape Couper. Mêmes actions que l'étape Couper
// (src/ui/coupes.ts → opérations de la recette), donc même historique et mêmes règles pour ce qui suit les coupes.
// Sur la mini-frise, les plans s'affichent côte à côte (leurs limites se voient) ; un toucher choisit un plan.

import { bornesDesPlans, dureeFinale } from '../../../recette/operations';
import type { Recette } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { planVise, teteDansPlan } from '../../coupe-tete';
import { rognerDebutIci, rognerFinIci, scinderIci, supprimerPlan } from '../../coupes';
import { afficherToast, annulerAction, recetteAffichee, selection, teteLecture } from '../../etat';
import { formatDuree } from '../../format';
import { IconeCiseaux, IconeDebutIci, IconeFinIci, IconePoubelle } from '../Icones';
import type { Calque } from '../MiniFrise';
import { EntreeBlancs } from '../../auto/coupes/EntreeBlancs';
import { EntreeInsertion } from '../../auto/insertion/EntreeInsertion'; // v3 (dev 2)
import { EntreePassages } from '../../auto/derush/EntreePassages'; // v3 (dev 1)
import { SequencesMontage } from '../../auto/derush/SequencesMontage'; // Best-of v4 (intégrateur)
import { PanneauInsere } from '../../auto/insertion/PanneauInsere'; // v3 (dev 2)
import { etiquetteInsere } from '../../auto/insertion/actions-insertion';

/** Calques de la mini-frise : un par plan, en temps de sortie. `vise` = plan surligné. */
export function calquesPlans(r: Recette, vise: number | null): Calque[] {
  const b = bornesDesPlans(r);
  return r.plans.map((p, i) => ({
    id: i,
    t0: b[i]!,
    t1: b[i + 1]!,
    // v3 (B) : un élément inséré a sa propre tuile (« Carton », « Image »…).
    genre: p.ins ? 'insere' : 'plan',
    label: p.ins ? etiquetteInsere(p.ins) : T.coupe.planCourt(i + 1, formatDuree(b[i + 1]! - b[i]!)),
    choisi: vise === i,
  }));
}

function impossible() {
  afficherToast(T.coupe.impossible, 2500);
}

function surScinder() {
  if (!scinderIci()) impossible();
}

function surSupprimer(i: number) {
  if (supprimerPlan(i, true)) afficherToast(T.coupe.supprime(i + 1), 3500, { label: T.annuler, agir: annulerAction });
}

function surRogner(debut: boolean, i: number) {
  if (!(debut ? rognerDebutIci(i) : rognerFinIci(i))) impossible();
}

export function OutilCouper() {
  const r = recetteAffichee.value;
  if (!r) return null;
  const tete = teteLecture.value;
  const i = planVise(r, tete, selection.value);
  const n = r.plans.length;
  const b = bornesDesPlans(r);
  const dansPlan = i !== null && teteDansPlan(r, i, tete);
  const aide = n <= 1 ? T.coupe.unSeul : dansPlan ? T.coupe.aide : T.coupe.teteAilleurs;

  return (
    <div class="outil outil-couper" data-testid="outil-couper">
      <p class="coupe-etat">
        <strong data-testid="coupe-plan">{i !== null ? T.coupe.plan(i + 1, n, formatDuree(b[i + 1]! - b[i]!)) : ''}</strong>
        <span class="chiffres doux" data-testid="coupe-duree">
          {T.coupe.dureeFinale(formatDuree(dureeFinale(r)))}
        </span>
      </p>
      <div class="grille-2 coupe-actions" role="group" aria-label={T.coupe.actions}>
        <button type="button" class="btn" onClick={surScinder} data-testid="coupe-scinder">
          <IconeCiseaux taille={18} />
          {T.coupe.scinder}
        </button>
        <button
          type="button"
          class="btn"
          disabled={i === null || n <= 1}
          onClick={() => i !== null && surSupprimer(i)}
          data-testid="coupe-supprimer"
        >
          <IconePoubelle taille={18} />
          {T.coupe.supprimer}
        </button>
        <button type="button" class="btn" disabled={!dansPlan} onClick={() => i !== null && surRogner(true, i)} data-testid="coupe-debut">
          <IconeDebutIci taille={18} />
          {T.coupe.debut}
        </button>
        <button type="button" class="btn" disabled={!dansPlan} onClick={() => i !== null && surRogner(false, i)} data-testid="coupe-fin">
          <IconeFinIci taille={18} />
          {T.coupe.fin}
        </button>
      </div>
      <EntreeBlancs lieu="habiller" />
      <EntreeInsertion lieu="habiller" />
      <SequencesMontage />
      <EntreePassages lieu="habiller" />
      {i !== null && r.plans[i]?.ins && <PanneauInsere i={i} plan={r.plans[i]!} />}
      <p class="petit doux outil-aide" data-testid="coupe-aide">
        {aide}
      </p>
      <p class="petit doux outil-aide">{T.coupe.suivent}</p>
    </div>
  );
}
