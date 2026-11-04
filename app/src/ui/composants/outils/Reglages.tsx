// Petits réglages partagés par les outils de la phase 3 (sons, zoom, son guide) :
// curseur avec sa valeur affichée, boutons ±0,1 s, interrupteur, onglets qui défilent.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface PropsCurseur {
  label: string;
  min: number;
  max: number;
  step: number;
  valeur: number;
  /** Texte de la valeur (« 80 % », « ×1,3 »). */
  format(v: number): string;
  /** Appelé en fin de geste (une seule entrée d'annulation). */
  onValider(v: number): void;
  testid: string;
}

/** Curseur : la valeur suit le doigt, la recette n'est écrite qu'au lâcher. */
export function CurseurValeur({ label, min, max, step, valeur, format, onValider, testid }: PropsCurseur) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return (
    <div class="reglage">
      <div class="outil-ligne">
        <h3 class="outil-sous-titre">{label}</h3>
        <span class="chiffres petit" data-testid={`${testid}-valeur`}>
          {format(v)}
        </span>
      </div>
      <input
        type="range"
        class="curseur"
        min={min}
        max={max}
        step={step}
        value={v}
        aria-label={label}
        aria-valuetext={format(v)}
        onInput={(e) => setV(Number((e.currentTarget as HTMLInputElement).value))}
        onChange={(e) => onValider(Number((e.currentTarget as HTMLInputElement).value))}
        data-testid={testid}
      />
    </div>
  );
}

/** Deux boutons « plus tôt / plus tard » (±0,1 s) autour d'une valeur affichée. */
export function Decaler({
  moins,
  plus,
  valeur,
  onDecaler,
  testid,
}: {
  moins: string;
  plus: string;
  valeur: string;
  onDecaler(d: number): void;
  testid: string;
}) {
  return (
    <div class="decaler" role="group">
      <button
        type="button"
        class="btn encadre"
        onClick={() => onDecaler(-0.1)}
        data-testid={`${testid}-moins`}
      >
        −0,1 s<span class="sr-only">{moins}</span>
      </button>
      <span class="chiffres decaler-valeur" data-testid={`${testid}-valeur`}>
        {valeur}
      </span>
      <button type="button" class="btn encadre" onClick={() => onDecaler(0.1)} data-testid={`${testid}-plus`}>
        +0,1 s<span class="sr-only">{plus}</span>
      </button>
    </div>
  );
}

/** Interrupteur (case à cocher stylée) avec un titre et une aide. */
export function Interrupteur({
  titre,
  aide,
  actif,
  onChange,
  testid,
}: {
  titre: string;
  aide?: string;
  actif: boolean;
  onChange(v: boolean): void;
  testid: string;
}) {
  return (
    <label class="interrupteur">
      <span>
        <strong>{titre}</strong>
        {aide && <span class="petit doux">{aide}</span>}
      </span>
      <input
        type="checkbox"
        checked={actif}
        onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
        data-testid={testid}
      />
    </label>
  );
}

/**
 * Onglets à choix unique qui défilent à l'horizontale (familles de sons). Flèches gauche / droite, Début et Fin
 * passent d'un onglet à l'autre (seul l'onglet actif est dans l'ordre de tabulation) ; `panneau` = id du tabpanel.
 */
export function Onglets({
  label,
  onglets,
  actif,
  onChoisir,
  prefixe,
  panneau,
}: {
  label: string;
  onglets: readonly { id: string; nom: ComponentChildren }[];
  actif: string;
  onChoisir(id: string): void;
  prefixe: string;
  panneau?: string;
}) {
  function clavier(e: KeyboardEvent) {
    const n = onglets.length;
    const i = onglets.findIndex((o) => o.id === actif);
    const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
    if (cible === undefined || n === 0) return;
    e.preventDefault();
    const o = onglets[(cible + n) % n]!;
    onChoisir(o.id);
    const liste = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => liste.querySelector<HTMLElement>(`#${prefixe}-onglet-${o.id}`)?.focus());
  }
  return (
    <div class="pastilles onglets" role="tablist" aria-label={label} onKeyDown={clavier}>
      {onglets.map((o) => (
        <button
          type="button"
          role="tab"
          key={o.id}
          id={`${prefixe}-onglet-${o.id}`}
          aria-selected={o.id === actif}
          aria-controls={panneau}
          tabIndex={o.id === actif ? 0 : -1}
          class="pastille"
          data-actif={o.id === actif ? '1' : '0'}
          onClick={() => onChoisir(o.id)}
          data-testid={`${prefixe}-${o.id}`}
        >
          {o.nom}
        </button>
      ))}
    </div>
  );
}
