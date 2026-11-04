// Outil Sous-titres : accord pour le module, progression annulable, puis la liste des lignes.
// Toucher un mot ouvre un petit panneau (corriger, partout, mettre en valeur, supprimer).

import { useEffect, useState } from 'preact/hooks';
import { definirSousTitres } from '../../../recette/operations';
import { STYLES_SOUS_TITRES, SOUS_TITRES } from '../../../recette/defauts';
import { T } from '../../../textes-fr';
import { afficherToast, modifier, recetteAffichee, teteLecture } from '../../etat';
import { formatTemps } from '../../format';
import { lignesDe } from '../../habillage';
import { chercher } from '../../lecture';
import { annulerSousTitres, lancerSousTitres, rafraichirCorrections, travailSousTitres } from '../../sous-titres-ui';
import { IconeAlerte, IconePoubelle, IconeSousTitres } from '../Icones';
import { Pastilles } from './Commun';
import { DialogueModule, MotsRetenus, PanneauMot } from './PanneauMot';

export function OutilSousTitres() {
  const [mot, setMot] = useState<number | null>(null);
  useEffect(rafraichirCorrections, []);
  const r = recetteAffichee.value;
  const travail = travailSousTitres.value;
  if (!r) return null;
  const st = r.sousTitres;
  const aDesMots = !!st && Array.isArray(st.mots) && st.mots.length > 0;
  const lignes = lignesDe(r);

  if (travail.phase === 'encours') {
    return (
      <div class="outil" data-testid="outil-sous-titres">
        <p class="outil-progression-texte" aria-live="polite" data-testid="sous-titres-etape">
          <strong class="chiffres">{T.sousTitres.enCours(travail.p)}</strong> {travail.etape}
        </p>
        <div class="progression" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={travail.p} data-testid="sous-titres-progression">
          <span style={{ width: `${travail.p}%` }} />
        </div>
        <button type="button" class="btn" onClick={annulerSousTitres} data-testid="sous-titres-annuler">
          {T.sousTitres.annuler}
        </button>
      </div>
    );
  }

  if (mot !== null && aDesMots && Array.isArray(st.mots) && st.mots[mot]) {
    return <PanneauMot k={mot} mot={st.mots[mot]} mots={st.mots} onFermer={() => setMot(null)} />;
  }

  const erreur =
    travail.phase === 'erreur' ? (
      <div class="message message-erreur message-court" role="alert" data-testid="sous-titres-erreur">
        <IconeAlerte taille={18} />
        <span>{travail.message}</span>
      </div>
    ) : null;
  const accord = travail.phase === 'accord' ? <DialogueModule taille={travail.taille} /> : null;

  if (!aDesMots) {
    return (
      <div class="outil" data-testid="outil-sous-titres">
        {accord}
        <p class="petit doux outil-aide">{T.sousTitres.intro}</p>
        {erreur}
        <button
          type="button"
          class="btn btn-principal"
          disabled={travail.phase === 'verif'}
          onClick={() => void lancerSousTitres()}
          data-testid="creer-sous-titres"
        >
          <IconeSousTitres taille={20} />
          {travail.phase === 'erreur' ? T.sousTitres.reessayer : T.sousTitres.creer}
        </button>
        <MotsRetenus />
      </div>
    );
  }

  const tete = teteLecture.value;
  return (
    <div class="outil" data-testid="outil-sous-titres">
      {accord}
      {erreur}
      <Pastilles
        label={T.sousTitres.style}
        choix={STYLES_SOUS_TITRES}
        actif={st.style ?? SOUS_TITRES.style}
        onChoisir={(style) => modifier((x) => (x.sousTitres ? definirSousTitres(x, { ...x.sousTitres, style }) : x))}
        prefixe="style-sous-titres"
        rendu={(k) => (
          <>
            <span class="echantillon" data-style={`st-${k}`} aria-hidden="true">
              Aa
            </span>
            <span>{T.sousTitres.styles[k] ?? k}</span>
          </>
        )}
      />
      <p class="petit doux outil-aide">{T.sousTitres.aideMots}</p>
      <ol class="lignes" data-testid="lignes-sous-titres">
        {lignes.map((l, n) => (
          <li key={l.k0} class="ligne" data-actuelle={tete >= l.t0 && tete < l.t1 ? '1' : '0'} data-testid={`ligne-${n}`}>
            <button type="button" class="ligne-temps chiffres" aria-label={T.sousTitres.ligne(formatTemps(l.t0))} onClick={() => chercher(l.t0)}>
              {formatTemps(l.t0)}
            </button>
            <span class="ligne-mots">
              {l.mots.map((m, j) => (
                <button
                  type="button"
                  key={l.k0 + j}
                  class="mot"
                  data-fort={m[3] ? '1' : '0'}
                  onClick={() => {
                    chercher(l.t0);
                    setMot(l.k0 + j);
                  }}
                  data-testid={`mot-${l.k0 + j}`}
                >
                  {m[0]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div class="grille-2">
        <button type="button" class="btn" onClick={() => void lancerSousTitres()} data-testid="sous-titres-refaire">
          {T.sousTitres.toutRefaire}
        </button>
        <button type="button" class="btn" onClick={retirer} data-testid="sous-titres-retirer">
          <IconePoubelle taille={18} />
          {T.sousTitres.retirer}
        </button>
      </div>
      <MotsRetenus />
    </div>
  );
}

/** Retire les sous-titres (Annuler dans l'en-tête les remet). */
function retirer() {
  if (modifier((x) => definirSousTitres(x, null))) afficherToast(T.sousTitres.retires);
}
