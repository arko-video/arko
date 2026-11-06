// Outil Texte : un texte posé à la tête de lecture. Champ, 5 styles en pastilles, durée, Supprimer.
// On le déplace en le faisant glisser sur l'aperçu (CalqueTextes).

import { contientEmoji } from '../../../moteur/api';
import { dureeFinale } from '../../../recette/operations';
import { STYLES_TEXTE, TEXTE } from '../../../recette/defauts';
import { T } from '../../../textes-fr';
import { recetteAffichee, teteLecture } from '../../etat';
import { auCentieme, formatDuree, formatTemps } from '../../format';
import {
  clavierOuvert,
  ecrireTexte,
  jusquALaFin,
  reglerTexte,
  supprimerTexteChoisi,
  texteChoisi,
  validerSaisie,
} from '../../habillage';
import { chercher } from '../../lecture';
import { IconePlus, IconePoubelle } from '../Icones';
import { AlerteEmoji, ChampSaisie, Pastilles } from './Commun';
import { EntreeSections } from '../../auto/habillage/EntreeSections';
import { TA } from '../../../textes-auto';

const DUREE_MIN = 1;
const DUREE_MAX = 10;

export function OutilTexte() {
  const r = recetteAffichee.value;
  if (!r) return null;
  const i = texteChoisi.value;
  const x = i !== null ? r.textes[i] : undefined;
  const total = dureeFinale(r);

  function duree(d: number) {
    if (!x) return;
    reglerTexte({ dur: auCentieme(Math.min(d, Math.max(TEXTE.durMin, total - x.t))) });
  }

  return (
    <div class="outil" data-testid="outil-texte">
      <ChampSaisie
        key={i ?? 'nouveau'}
        label={T.texte.champ}
        placeholder={T.texte.placeholder}
        valeur={x?.txt ?? ''}
        onSaisie={ecrireTexte}
        onValider={validerSaisie}
        onFocus={() => x && chercher(x.t)}
        autoFocus={!x}
        testid="champ-texte"
      />
      {x && contientEmoji(x.txt) && <AlerteEmoji />}
      {!clavierOuvert.value && !x && <p class="petit doux outil-aide">{T.texte.aideAjout(formatTemps(teteLecture.value))}</p>}
      {!clavierOuvert.value && !x && <EntreeSections lieu="texte" />}
      {!clavierOuvert.value && x && (
        <>
          <h3 class="outil-sous-titre">{T.texte.style}</h3>
          <Pastilles
            label={T.texte.style}
            choix={x.style === 'bandeau' ? [...STYLES_TEXTE, 'bandeau'] : STYLES_TEXTE}
            actif={x.style ?? TEXTE.style}
            onChoisir={(style) => reglerTexte({ style })}
            prefixe="style-texte"
            rendu={(k) => (
              <>
                <span class="echantillon" data-style={k} aria-hidden="true">
                  Aa
                </span>
                <span>{k === 'bandeau' ? TA.habillage.sections.style : (T.texte.styles[k] ?? k)}</span>
              </>
            )}
          />

          <div class="outil-ligne">
            <h3 class="outil-sous-titre">{T.texte.duree}</h3>
            <span class="chiffres petit" data-testid="duree-texte">
              {jusquALaFin(r, x) ? T.texte.jusquALaFin : formatDuree(x.dur ?? TEXTE.dur)}
            </span>
          </div>
          <div class="outil-ligne">
            <input
              type="range"
              class="curseur"
              min={DUREE_MIN}
              max={DUREE_MAX}
              step={0.5}
              value={Math.min(DUREE_MAX, x.dur ?? TEXTE.dur)}
              aria-label={T.texte.duree}
              onChange={(e) => duree(Number((e.currentTarget as HTMLInputElement).value))}
              data-testid="curseur-duree-texte"
            />
            <button
              type="button"
              class="pastille"
              aria-pressed={jusquALaFin(r, x)}
              data-actif={jusquALaFin(r, x) ? '1' : '0'}
              onClick={() => reglerTexte({ dur: auCentieme(Math.max(TEXTE.durMin, total - x.t)) })}
              data-testid="jusqu-a-la-fin"
            >
              {T.texte.jusquALaFin}
            </button>
          </div>
          <p class="petit doux outil-aide">{T.texte.glisser}</p>

          <div class="grille-2">
            <button type="button" class="btn" onClick={() => (texteChoisi.value = null)} data-testid="nouveau-texte">
              <IconePlus taille={18} />
              {T.texte.nouveau}
            </button>
            <button type="button" class="btn" onClick={supprimerTexteChoisi} data-testid="supprimer-texte">
              <IconePoubelle taille={18} />
              {T.habiller.supprimer}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
