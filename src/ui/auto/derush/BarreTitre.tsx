// Titre retirable / modifiable (A, dev 1) sur la carte d'un clip de la Revue du monteur : « Changer le titre » et
// « Retirer le titre » (un toucher chacun ; changerTitre / retirerTitres de recette/operations-titres.ts, appliqués
// au brouillon par revue-monteur.ts). Caché derrière le drapeau « titres » tant que PRETE est faux.

import { useState } from 'preact/hooks';
import { changerTitre, indicesTitres, retirerTitres } from '../../../recette/operations-titres';
import type { Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { afficherToast } from '../../etat';
import { modifierBrouillon } from '../../monteur/revue-monteur';
import { BoutonAuto } from '../BoutonAuto';
import { visible } from '../drapeaux';
import './derush.css';

const PRETE = true;

/** Le titre montré et changé : l'accroche s'il y en a une, sinon le premier titre. */
function titrePrincipal(r: Recette): number | undefined {
  const ix = indicesTitres(r);
  return ix.find((i) => r.textes[i]!.role === 'accroche') ?? ix[0];
}

export function BarreTitre({ uid, recette }: { uid: string; recette: Recette }) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const i = titrePrincipal(recette);
  if (i === undefined || !visible('titres', PRETE)) return null;
  // La carte se balaie au doigt : un toucher sur ces boutons ne doit pas lancer le balayage.
  const stop = (e: Event) => e.stopPropagation();

  function valider() {
    const txt = saisie ?? '';
    setSaisie(null);
    void modifierBrouillon(uid, (r) => {
      const j = titrePrincipal(r);
      return j === undefined ? r : changerTitre(r, j, txt);
    });
    if (!txt.trim()) afficherToast(TV.derush.titres.retire);
  }

  if (saisie !== null)
    return (
      <form class="revue-titre-actions" data-uid={uid} onPointerDown={stop} onSubmit={(e) => (e.preventDefault(), valider())}>
        <input
          class="champ-saisie"
          type="text"
          maxLength={60}
          value={saisie}
          placeholder={TV.derush.titres.placeholder}
          aria-label={TV.derush.titres.modifier}
          onInput={(e) => setSaisie((e.currentTarget as HTMLInputElement).value)}
          data-testid="v3-titre-champ"
          ref={(el) => el?.focus()}
        />
        <button type="submit" class="btn btn-principal" data-testid="v3-titre-valider">
          {TV.derush.titres.valider}
        </button>
      </form>
    );
  return (
    <div class="revue-titre-actions" data-uid={uid} onPointerDown={stop} data-testid="v3-titre-actions">
      <span class="revue-titre-texte petit" data-testid="v3-titre-texte">
        « {recette.textes[i]!.txt} »
      </span>
      <BoutonAuto drapeau="titres" prete={PRETE} label={TV.derush.titres.modifier} testid="v3-titre-modifier" agir={() => setSaisie(recette.textes[i]!.txt)} />
      <BoutonAuto
        drapeau="titres"
        prete={PRETE}
        label={TV.derush.titres.retirer}
        testid="v3-titre-retirer"
        agir={async () => {
          await modifierBrouillon(uid, (r) => retirerTitres(r, 'tous'));
          afficherToast(TV.derush.titres.retire);
        }}
      />
    </div>
  );
}
