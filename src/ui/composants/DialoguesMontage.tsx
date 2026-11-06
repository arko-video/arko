// Dialogues de « Mes montages » : la feuille d'actions (menu ⋮) et le renommage. <dialog> modal : focus piégé,
// Échap ou Retour = fermer.

import { useEffect, useRef, useState } from 'preact/hooks';
import { T } from '../../textes-fr';
import { TA } from '../../textes-auto';
import { IconeCopie, IconeCrayon } from './IconesRythme';
import { IconePoubelle } from './Icones';

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return ref;
}

export type ActionMontage = 'renommer' | 'dupliquer' | 'supprimer' | 'express';

export function FeuilleActions({ titre, onAction, onFermer }: { titre: string; onAction(a: ActionMontage): void; onFermer(): void }) {
  const ref = useModal();
  return (
    <dialog
      ref={ref}
      class="dialogue feuille-actions"
      aria-labelledby="feuille-titre"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => e.target === ref.current && onFermer()}
      data-testid="menu-montage"
    >
      <h2 id="feuille-titre" class="feuille-titre">
        {titre}
      </h2>
      <div class="pile">
        <button type="button" class="btn feuille-action" onClick={() => onAction('renommer')} data-testid="action-renommer">
          <IconeCrayon taille={18} />
          {T.montages.renommer}
        </button>
        <button type="button" class="btn feuille-action" onClick={() => onAction('dupliquer')} data-testid="action-dupliquer">
          <IconeCopie taille={18} />
          {T.montages.dupliquer}
        </button>
        <button type="button" class="btn feuille-action" onClick={() => onAction('express')} data-testid="action-express">
          <span class="monteur-etoile" aria-hidden="true" />
          {TA.express.bouton}
        </button>
        <button type="button" class="btn feuille-action feuille-danger" onClick={() => onAction('supprimer')} data-testid="action-supprimer">
          <IconePoubelle taille={18} />
          {T.montages.supprimer}
        </button>
        <button type="button" class="btn btn-discret" autoFocus onClick={onFermer} data-testid="menu-fermer">
          {T.montages.fermer}
        </button>
      </div>
    </dialog>
  );
}

export function DialogueRenommer({ titre, onValider, onFermer }: { titre: string; onValider(t: string): void; onFermer(): void }) {
  const ref = useModal();
  const [v, setV] = useState(titre);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => champ.current?.select(), []);
  return (
    <dialog
      ref={ref}
      class="dialogue"
      aria-labelledby="renommer-titre"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      data-testid="dialogue-renommer"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onValider(v.trim());
        }}
      >
        <h2 id="renommer-titre">{T.montages.renommer}</h2>
        <label class="champ-saisie">
          <span class="sr-only">{T.montages.nouveauTitre}</span>
          <input
            ref={champ}
            type="text"
            maxLength={120}
            autoComplete="off"
            enterKeyHint="done"
            value={v}
            onInput={(e) => setV((e.currentTarget as HTMLInputElement).value)}
            data-testid="champ-titre"
          />
        </label>
        <div class="dialogue-boutons">
          <button type="submit" class="btn btn-principal" disabled={!v.trim()} data-testid="renommer-valider">
            {T.montages.valider}
          </button>
          <button type="button" class="btn" onClick={onFermer} data-testid="renommer-annuler">
            {T.annuler}
          </button>
        </div>
      </form>
    </dialog>
  );
}
