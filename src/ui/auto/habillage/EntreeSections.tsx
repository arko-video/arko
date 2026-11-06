// « Titres de section » (G, dev 2) : dans Habiller → Chapitres (16:9 : un titre par chapitre, mis à jour quand
// les chapitres changent) et dans Habiller → Texte (un titre posé à la main à la tête de lecture, à renommer).
// Le titre s'affiche 2,2 s dans un bandeau gras avec un « pop » et un whoosh. Chaque action = un seul Annuler.

import { useState } from 'preact/hooks';
import { titresDesChapitres } from '../../../auto/habillage/sections';
import { ajouterTitreDeSection, compterTitresDeSection, retirerTitresDeSection, titresDeSection } from '../../../recette/operations';
import type { Recette } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { afficherToast, modifier, recetteAffichee, teteLecture } from '../../etat';
import { texteChoisi, validerSaisie } from '../../habillage';
import { mettreEnPause } from '../../lecture';
import { BoutonAuto } from '../BoutonAuto';
import { visible } from '../drapeaux';

const PRETE = true;
const S = TA.habillage.sections;

/** Après un changement de chapitres : les titres de section « depuis les chapitres » suivent (même Annuler). */
export function suivreChapitres(r: Recette): Recette {
  return r.sections?.source === 'chapitres' ? titresDeSection(r, r.sections) : r;
}

export function EntreeSections({ lieu }: { lieu: 'chapitres' | 'texte' }) {
  const r = recetteAffichee.value;
  const [son, setSon] = useState(r?.sections?.son !== false);
  if (!r || !visible('sections', PRETE)) return null;

  if (lieu === 'texte') {
    return (
      <BoutonAuto
        drapeau="sections"
        prete={PRETE}
        label={S.ajouterIci}
        testid="auto-sections-texte"
        agir={() => {
          mettreEnPause();
          validerSaisie();
          let i = -1;
          modifier((x) => {
            const res = ajouterTitreDeSection(x, teteLecture.peek(), S.nomParDefaut);
            i = res.i;
            return res.recette;
          });
          if (i >= 0) texteChoisi.value = i; // le champ du texte s'ouvre : on renomme le titre
        }}
      />
    );
  }

  const n = compterTitresDeSection(r);
  const depuisChapitres = r.sections?.source === 'chapitres';
  return (
    <section class="outil-auto" data-testid="auto-sections-panneau">
      <h3 class="outil-sous-titre">{S.bouton}</h3>
      <p class="petit doux outil-aide">{S.aide}</p>
      <label class="case">
        <input type="checkbox" checked={son} onChange={(e) => setSon((e.currentTarget as HTMLInputElement).checked)} data-testid="sections-son" />
        <span>
          <strong>{S.son}</strong>
        </span>
      </label>
      <BoutonAuto
        drapeau="sections"
        prete={PRETE}
        label={S.depuisChapitres}
        testid="auto-sections-chapitres"
        agir={() => {
          if (titresDesChapitres(r).length === 0) return afficherToast(S.aucunChapitre);
          let poses = 0;
          modifier((x) => {
            const res = titresDeSection(x, { source: 'chapitres', son });
            poses = compterTitresDeSection(res);
            return res;
          });
          afficherToast(S.poses(poses));
        }}
      />
      {(n > 0 || depuisChapitres) && (
        <button
          type="button"
          class="btn"
          onClick={() => {
            if (modifier(retirerTitresDeSection)) afficherToast(S.retires);
          }}
          data-testid="sections-retirer"
        >
          {S.retirer}
        </button>
      )}
    </section>
  );
}
