// « Ressemble à… » (D, dev 3) : choisir les traits un par un (peau, coiffure en vignettes, cheveux, tenue,
// accessoire, couleur, yeux). Chaque toucher change le brouillon de l'atelier.

import type { ComponentChildren } from 'preact';
import { ACCESSOIRES, CHEVEUX, COIFFURES, COULEURS, PEAUX, TENUES, YEUX } from '../../../chibis/catalogue';
import type { DefinitionChibi } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { ApercuChibi } from './ApercuChibi';
import { brouillon, changerTrait } from './atelier';

function Section({ titre, children }: { titre: string; children: ComponentChildren }) {
  return (
    <div class="chibi-trait">
      <h3 class="outil-sous-titre">{titre}</h3>
      {children}
    </div>
  );
}

function Couleurs({ cle, liste, autre }: { cle: 'peau' | 'cheveux' | 'couleur'; liste: readonly string[]; autre?: boolean }) {
  const actuelle = brouillon.value[cle].toUpperCase();
  return (
    <div class="chibi-couleurs" role="radiogroup" aria-label={TV.chibis[cle]}>
      {liste.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === actuelle}
          aria-label={c}
          class="chibi-couleur"
          data-actif={c === actuelle ? '1' : '0'}
          style={{ background: c }}
          onClick={() => changerTrait({ [cle]: c })}
          data-testid={`chibi-${cle}-${c.slice(1)}`}
        />
      ))}
      {autre && (
        <label class="chibi-couleur chibi-couleur-autre" title={TV.chibis.autreCouleur}>
          <span class="sr-only">{TV.chibis.autreCouleur}</span>
          <input type="color" value={actuelle.toLowerCase()} onChange={(e) => changerTrait({ [cle]: (e.currentTarget as HTMLInputElement).value.toUpperCase() })} />
        </label>
      )}
    </div>
  );
}

function Vignettes<K extends string>({ cle, liste, noms }: { cle: 'coiffure' | 'tenue' | 'accessoire' | 'yeux'; liste: readonly K[]; noms: Record<K, string> }) {
  const def = brouillon.value;
  const actuel = (def[cle] ?? (cle === 'yeux' ? 'ronds' : '')) as string;
  return (
    <div class="chibi-vignettes" role="radiogroup" aria-label={TV.chibis[cle]}>
      {liste.map((k) => {
        const essai: DefinitionChibi = { ...def, [cle]: k };
        return (
          <button key={k} type="button" role="radio" aria-checked={k === actuel} class="chibi-vignette" data-actif={k === actuel ? '1' : '0'} onClick={() => changerTrait({ [cle]: k } as Partial<DefinitionChibi>)} data-testid={`chibi-${cle}-${k}`}>
            <ApercuChibi def={essai} taille={62} />
            <span class="petit">{noms[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TraitsChibi() {
  const t = TV.chibis;
  return (
    <div class="chibi-traits" data-testid="chibi-traits">
      <p class="petit doux">{t.ressembleAide}</p>
      <Section titre={t.peau}>
        <Couleurs cle="peau" liste={PEAUX} />
      </Section>
      <Section titre={t.coiffure}>
        <Vignettes cle="coiffure" liste={COIFFURES} noms={t.coiffures} />
      </Section>
      <Section titre={t.cheveux}>
        <Couleurs cle="cheveux" liste={CHEVEUX} autre />
      </Section>
      <Section titre={t.tenue}>
        <Vignettes cle="tenue" liste={TENUES} noms={t.tenues} />
      </Section>
      <Section titre={t.couleur}>
        <Couleurs cle="couleur" liste={COULEURS} autre />
      </Section>
      <Section titre={t.accessoire}>
        <Vignettes cle="accessoire" liste={ACCESSOIRES} noms={t.accessoires} />
      </Section>
      <Section titre={t.yeux}>
        <Vignettes cle="yeux" liste={YEUX} noms={t.yeuxNoms} />
      </Section>
    </div>
  );
}
