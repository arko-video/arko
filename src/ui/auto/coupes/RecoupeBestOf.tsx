// Habiller → Couper (et l'étape Couper), Best-of v4 (dev-ui) : « Coupes du Best-of : Serré / Normal / Large ».
// Un toucher recoupe TOUT le montage comme le Best-of (mesures gardées sur l'appareil + recouperMontage de dev-coupes,
// branchés dans branchements-v4.ts), sans réécouter la vidéo ; une seule opération = un seul Annuler.
// Visible dès que le montage a été coupé (Best-of, Montage express, Couper les blancs : `recette.blancs`) et que le
// recoupage est branché ; sans mesures gardées ni mots, il le dit au lieu de couper à l'aveugle.

import { useState } from 'preact/hooks';
import { vientDUnBestOf } from '../../../recette/operations';
import type { NiveauBlancs } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { T } from '../../../textes-fr';
import { afficherToast, annulerAction, modifier, recette } from '../../etat';
import { BRANCHEMENTS } from '../express/branchements-v4';
import { TEXTES_V4 } from '../express/textes-v4';

const TH = TEXTES_V4.habiller;
const NIVEAUX: NiveauBlancs[] = ['serre', 'normal', 'large'];

export function RecoupeBestOf({ lieu }: { lieu: 'couper' | 'habiller' }) {
  const r = recette.value;
  const [occupe, setOccupe] = useState(false);
  const recouper = BRANCHEMENTS.recouperBestOf;
  // Seulement un montage fait par un Best-of : jamais sur un montage fait à la main (relecture point 5).
  if (!r || !r.blancs || !recouper || !vientDUnBestOf(r)) return null;
  const actif = r.blancs.niveau;

  async function choisir(n: NiveauBlancs) {
    const r0 = recette.peek();
    if (!r0 || !recouper || occupe || n === r0.blancs?.niveau) return;
    setOccupe(true);
    try {
      const nouvelle = await recouper(r0, n);
      if (!nouvelle) return afficherToast(TH.recoupeImpossible, 5000);
      // La recette a pu changer pendant le calcul : on ne pose que si c'est toujours la même.
      if (recette.peek() !== r0) return;
      if (modifier(() => nouvelle)) afficherToast(TH.recoupeFaite(TA.coupes.blancs.niveaux[n]), 6000, { label: T.annuler, agir: annulerAction });
    } catch (e) {
      console.error(e);
      afficherToast(TH.recoupeImpossible, 5000);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section class="ca-groupe recoupe-best-of" data-testid={`recoupe-best-of-${lieu}`}>
      <span class="ca-label">{TH.recoupe}</span>
      <div class="ca-choix" role="radiogroup" aria-label={TH.recoupe} aria-busy={occupe}>
        {NIVEAUX.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={v === actif} disabled={occupe} onClick={() => void choisir(v)} data-testid={`recoupe-${lieu}-${v}`}>
            {TA.coupes.blancs.niveaux[v]}
          </button>
        ))}
      </div>
      <p class="ca-aide">{TH.recoupeAide}</p>
    </section>
  );
}
