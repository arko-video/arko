// « Zooms automatiques » (C, dev 2), dans Habiller → Zoom : réglage Doux / Normal / Fort, puis un toucher pose
// un zoom tenu sur chaque passage (×1,32 sur un moment fort, ×1,12 un passage sur trois). Un seul Annuler.
// Les moments forts viennent du son (si Arko a pu l'écouter) et des bruitages déjà posés.

import { useState } from 'preact/hooks';
import type { ForceZoomsAuto } from '../../../auto/habillage/zooms-auto';
import { compterZoomsAuto, retirerZoomsAuto, zoomsAutomatiques } from '../../../recette/operations';
import { TA } from '../../../textes-auto';
import { afficherToast, modifier, recetteAffichee } from '../../etat';
import { IconeZoom } from '../../composants/Icones';
import { Pastilles } from '../../composants/outils/Commun';
import { BoutonAuto } from '../BoutonAuto';
import { visible } from '../drapeaux';
import { ecouteEnCours, signauxDe } from './signaux';

const PRETE = true;
const Z = TA.habillage.zoomsAuto;
const FORCES: readonly ForceZoomsAuto[] = ['doux', 'normal', 'fort'];

export function EntreeZoomsAuto() {
  const [force, setForce] = useState<ForceZoomsAuto>('normal');
  const r = recetteAffichee.value;
  if (!r || !visible('zoomsAuto', PRETE)) return null;
  const n = compterZoomsAuto(r);

  async function poser() {
    if (ecouteEnCours.peek()) return;
    const s = await signauxDe();
    let poses = 0;
    modifier((x) => {
      const res = zoomsAutomatiques(x, s, force);
      poses = compterZoomsAuto(res);
      return res;
    });
    afficherToast(Z.poses(poses));
  }

  return (
    <section class="outil-auto" data-testid="auto-zooms-panneau">
      <h3 class="outil-sous-titre">{Z.bouton}</h3>
      <p class="petit doux outil-aide">{Z.aide}</p>
      <Pastilles<ForceZoomsAuto> label={Z.force} choix={FORCES} actif={force} onChoisir={(k) => setForce(k)} prefixe="force-zooms-auto" rendu={(k) => <span>{Z.forces[k]}</span>} />
      {r.plans.length < 2 && <p class="petit doux outil-aide">{Z.unSeulPlan}</p>}
      {ecouteEnCours.value && (
        <p class="petit doux outil-aide" aria-live="polite">
          {TA.habillage.ecoute}
        </p>
      )}
      <BoutonAuto drapeau="zoomsAuto" prete={PRETE} label={Z.bouton} testid="auto-zooms" icone={<IconeZoom taille={18} />} agir={poser} />
      {n > 0 && (
        <>
          <p class="petit doux" aria-live="polite" data-testid="zooms-auto-compte">
            {Z.actuels(n)}
          </p>
          <button
            type="button"
            class="btn"
            onClick={() => {
              if (modifier(retirerZoomsAuto)) afficherToast(Z.retires);
            }}
            data-testid="zooms-auto-retirer"
          >
            {Z.retirer}
          </button>
        </>
      )}
    </section>
  );
}
