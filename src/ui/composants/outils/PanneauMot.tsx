// Sous-titres : petit panneau d'un mot (corriger, mots identiques, retenir, mettre en valeur, supprimer)
// et dialogue d'accord pour télécharger le module (jamais de confirm() natif).

import { useEffect, useRef, useState } from 'preact/hooks';
import { modifierMot, supprimerMot } from '../../../recette/operations';
import type { Mot } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { modifier } from '../../etat';
import {
  accepterModule,
  corrigerMot,
  correctionsRetenues,
  motsIdentiques,
  oublierMotRetenu,
  refuserModule,
} from '../../sous-titres-ui';
import { IconeCoche, IconePoubelle, IconeRetour, IconeSousTitres } from '../Icones';

export function PanneauMot({ k, mot, mots, onFermer }: { k: number; mot: Mot; mots: Mot[]; onFermer(): void }) {
  const [v, setV] = useState(mot[0]);
  const [identiques, setIdentiques] = useState(false);
  const [retenir, setRetenir] = useState(false);
  const fort = mot[3] === 1;
  const n = motsIdentiques(mots, mot[0]).length;

  function valider() {
    corrigerMot(k, v, { identiques, retenir });
    onFermer();
  }

  return (
    <div class="outil panneau-mot" data-testid="panneau-mot">
      <div class="panneau-mot-entete">
        <button type="button" class="btn btn-icone encadre" aria-label={T.sousTitres.mot.retour} onClick={onFermer} data-testid="mot-retour">
          <IconeRetour taille={20} />
        </button>
        <h3 class="outil-sous-titre">{T.sousTitres.mot.titre(mot[0])}</h3>
      </div>
      <label class="champ-saisie">
        <span class="sr-only">{T.sousTitres.mot.champ}</span>
        <input
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          value={v}
          onInput={(e) => setV((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              valider();
            }
          }}
          data-testid="champ-mot"
        />
      </label>
      <label class="case">
        <input
          type="checkbox"
          checked={identiques}
          disabled={n < 2}
          onChange={(e) => setIdentiques((e.currentTarget as HTMLInputElement).checked)}
          data-testid="corriger-identiques"
        />
        <span>
          <strong>{T.sousTitres.mot.identiques}</strong>
          <span class="petit doux">{T.sousTitres.mot.identiquesAide(n)}</span>
        </span>
      </label>
      <label class="case">
        <input type="checkbox" checked={retenir} onChange={(e) => setRetenir((e.currentTarget as HTMLInputElement).checked)} data-testid="corriger-retenir" />
        <span>
          <strong>{T.sousTitres.mot.retenir}</strong>
          <span class="petit doux">{T.sousTitres.mot.retenirAide}</span>
        </span>
      </label>
      <button type="button" class="btn btn-principal" disabled={!v.trim()} onClick={valider} data-testid="mot-corriger">
        <IconeCoche taille={18} />
        {T.sousTitres.mot.valider}
      </button>
      <div class="grille-2">
        <button
          type="button"
          class="btn"
          aria-pressed={fort}
          data-actif={fort ? '1' : '0'}
          onClick={() => modifier((r) => modifierMot(r, k, { fort: fort ? 0 : 1 }))}
          data-testid="mot-en-valeur"
        >
          {fort ? T.sousTitres.mot.enValeurActif : T.sousTitres.mot.enValeur}
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => {
            modifier((r) => supprimerMot(r, k));
            onFermer();
          }}
          data-testid="mot-supprimer"
        >
          <IconePoubelle taille={18} />
          {T.sousTitres.mot.supprimer}
        </button>
      </div>
    </div>
  );
}

/** Accord avant le seul téléchargement d'Arko : le module sous-titres (environ 90 Mo, une seule fois). */
export function DialogueModule({ taille }: { taille: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class="dialogue"
      aria-labelledby="module-titre"
      aria-describedby="module-texte"
      onCancel={(e) => {
        e.preventDefault();
        refuserModule();
      }}
      data-testid="dialogue-module"
    >
      <h2 id="module-titre">
        <IconeSousTitres taille={22} /> {T.sousTitres.moduleTitre}
      </h2>
      <p id="module-texte">{T.sousTitres.moduleTexte(taille)}</p>
      <div class="dialogue-boutons">
        <button type="button" class="btn btn-principal" autoFocus onClick={accepterModule} data-testid="module-telecharger">
          {T.sousTitres.telecharger}
        </button>
        <button type="button" class="btn" onClick={refuserModule} data-testid="module-refuser">
          {T.sousTitres.pasMaintenant}
        </button>
      </div>
    </dialog>
  );
}

/** « Mots retenus » : les corrections mémorisées pour les prochaines vidéos, avec Oublier. */
export function MotsRetenus() {
  const liste = correctionsRetenues.value;
  if (liste.length === 0) return null;
  return (
    <section class="mots-retenus" aria-labelledby="mots-retenus-titre" data-testid="mots-retenus">
      <h3 id="mots-retenus-titre" class="outil-sous-titre">
        {T.sousTitres.retenus}
      </h3>
      <p class="petit doux outil-aide">{T.sousTitres.retenusAide}</p>
      <ul>
        {liste.map((c) => (
          <li key={c.avant}>
            <span class="mot-retenu">
              {c.avant} → <strong>{c.apres}</strong>
            </span>
            <button
              type="button"
              class="btn btn-discret"
              aria-label={T.sousTitres.oublierAide(c.avant, c.apres)}
              onClick={() => oublierMotRetenu(c.avant)}
              data-testid={`oublier-${c.avant}`}
            >
              {T.sousTitres.oublier}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
