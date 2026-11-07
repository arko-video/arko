// Petits champs partagés par « Insérer quoi ? » et le panneau d'un élément inséré (B, dev 2) : texte, couleur,
// durée (0,3 à 30 s), émotion d'un chibi. Au pouce : 48 px de haut.

import { EMOTIONS, SITUATIONS, type Situation } from '../../../chibis/catalogue';
import { DUREE_INSERE } from '../../../recette/types-insertion';
import type { Emotion } from '../../../recette/types';
import { TV } from '../../../textes-v3';

const TI = TV.insertion;

export function ChampTexte(p: {
  label: string;
  valeur: string;
  changer: (v: string) => void;
  placeholder?: string;
  testid: string;
  max?: number;
}) {
  return (
    <label class="ins-champ">
      <span>{p.label}</span>
      <input
        type="text"
        value={p.valeur}
        maxLength={p.max ?? 120}
        placeholder={p.placeholder}
        onInput={(e) => p.changer((e.target as HTMLInputElement).value)}
        data-testid={p.testid}
      />
    </label>
  );
}

export function ChampCouleur(p: {
  label: string;
  valeur: string;
  changer: (v: string) => void;
  testid: string;
}) {
  return (
    <label class="ins-champ ins-champ-couleur">
      <span>{p.label}</span>
      <input
        type="color"
        value={p.valeur}
        onChange={(e) => p.changer((e.target as HTMLInputElement).value.toUpperCase())}
        data-testid={p.testid}
      />
    </label>
  );
}

/** Durée en secondes (virgule ou point acceptés), bornée 0,3 à 30 s quand on quitte le champ. */
export function ChampDuree(p: {
  valeur: number;
  changer: (v: number) => void;
  testid: string;
  label?: string;
  min?: number;
  max?: number;
}) {
  const min = p.min ?? DUREE_INSERE.min;
  const max = p.max ?? DUREE_INSERE.max;
  const lire = (txt: string) => {
    const x = Number(txt.replace(',', '.'));
    if (Number.isFinite(x)) p.changer(Math.round(Math.min(max, Math.max(min, x)) * 100) / 100);
  };
  return (
    <label class="ins-champ ins-champ-court">
      <span>{p.label ?? TI.duree}</span>
      <input
        type="text"
        inputMode="decimal"
        value={String(p.valeur).replace('.', ',')}
        onChange={(e) => lire((e.target as HTMLInputElement).value)}
        data-testid={p.testid}
      />
    </label>
  );
}

export function ChampEmotion(p: { valeur: Emotion; changer: (v: Emotion) => void; testid: string }) {
  return (
    <label class="ins-champ">
      <span>{TI.emotion}</span>
      <select
        value={p.valeur}
        onChange={(e) => p.changer((e.target as HTMLSelectElement).value as Emotion)}
        data-testid={p.testid}
      >
        {EMOTIONS.map((e) => (
          <option key={e} value={e}>
            {TV.chibis.emotions[e]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Situation de jeu du perso plein écran (persos en papier découpé). */
export function ChampSituation(p: { valeur: Situation; changer: (v: Situation) => void; testid: string }) {
  return (
    <label class="ins-champ">
      <span>{TV.situations.situation}</span>
      <select value={p.valeur} onChange={(e) => p.changer((e.target as HTMLSelectElement).value as Situation)} data-testid={p.testid}>
        {SITUATIONS.map((s) => (
          <option key={s} value={s}>
            {TV.situations.noms[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
