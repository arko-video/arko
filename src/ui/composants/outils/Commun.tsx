// Petits éléments partagés par les outils de Habiller : champ de saisie, alerte émoji, rangée de pastilles.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TEXTE } from '../../../recette/defauts';
import { T } from '../../../textes-fr';
import { IconeAlerte } from '../Icones';

interface PropsChamp {
  label: string;
  placeholder: string;
  valeur: string;
  onSaisie(v: string): void;
  onValider(): void;
  onFocus?(): void;
  autoFocus?: boolean;
  testid: string;
}

/**
 * Champ de saisie : garde sa propre valeur pendant la frappe (la recette suit en direct),
 * et se recale sur la recette quand il n'a pas le focus (Annuler, autre texte choisi).
 */
export function ChampSaisie({ label, placeholder, valeur, onSaisie, onValider, onFocus, autoFocus, testid }: PropsChamp) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(valeur);
  useEffect(() => {
    if (document.activeElement !== ref.current) setV(valeur);
  }, [valeur]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, []);
  return (
    <label class="champ-saisie">
      <span class="sr-only">{label}</span>
      <input
        ref={ref}
        type="text"
        enterKeyHint="done"
        autoComplete="off"
        maxLength={TEXTE.longueurMax}
        placeholder={placeholder}
        value={v}
        onInput={(e) => {
          const x = (e.currentTarget as HTMLInputElement).value;
          setV(x);
          onSaisie(x);
        }}
        onFocus={onFocus}
        onBlur={onValider}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onValider();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        data-testid={testid}
      />
    </label>
  );
}

export function AlerteEmoji() {
  return (
    <div class="message message-alerte message-court" role="status" data-testid="alerte-emoji">
      <IconeAlerte taille={18} />
      <span>{T.habiller.emoji}</span>
    </div>
  );
}

/** Rangée de pastilles à choix unique (styles), qui défile à l'horizontale. */
export function Pastilles<K extends string>({
  label,
  choix,
  actif,
  onChoisir,
  rendu,
  prefixe,
}: {
  label: string;
  choix: readonly K[];
  actif: string | undefined;
  onChoisir(k: K): void;
  rendu(k: K): ComponentChildren;
  prefixe: string;
}) {
  return (
    <div class="pastilles" role="radiogroup" aria-label={label}>
      {choix.map((k) => (
        <button
          type="button"
          role="radio"
          key={k}
          aria-checked={k === actif}
          class="pastille pastille-style"
          data-actif={k === actif ? '1' : '0'}
          onClick={() => onChoisir(k)}
          data-testid={`${prefixe}-${k}`}
        >
          {rendu(k)}
        </button>
      ))}
    </div>
  );
}
