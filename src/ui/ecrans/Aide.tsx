// Écran « Aide » (phase 5) : 5 cartes courtes (une par étape, plus le monteur IA) et le lien vers le code source.
// Ouvert par « ? » sur Importer ; le bouton Retour (ou celui du téléphone) y ramène.

import { useEffect, useRef } from 'preact/hooks';
import { T } from '../../textes-fr';
import { DEPOT_CODE } from '../aide';
import { IconeCiseaux, IconeFleche, IconeRetour, IconeSon, IconeTelecharger } from '../composants/Icones';
import { retour } from '../navigation';

const ICONES = [
  <IconeCiseaux key="c" taille={22} />,
  <span key="v" class="aide-vertical" aria-hidden="true" />,
  <IconeSon key="h" taille={22} />,
  <IconeTelecharger key="e" taille={22} />,
  <span key="m" class="monteur-etoile" aria-hidden="true" />,
];

export function Aide() {
  const titre = useRef<HTMLHeadingElement>(null);
  // À l'ouverture, le focus va sur le titre (lecteur d'écran, clavier) : M-9.
  useEffect(() => titre.current?.focus(), []);
  return (
    <div class="ecran aide" data-testid="aide">
      <header class="entete">
        <button
          type="button"
          class="btn btn-icone"
          aria-label={T.retour}
          onClick={retour}
          data-testid="retour"
        >
          <IconeRetour taille={22} />
        </button>
        <h1 ref={titre} class="entete-titre" tabIndex={-1} data-testid="aide-titre">
          {T.aide.ouvrir}
        </h1>
      </header>
      <main class="ecran-corps">
        <div class="importer-titres">
          <h2 class="titre">{T.aide.titre}</h2>
          <p class="intro">{T.aide.intro}</p>
        </div>
        <ol class="aide-cartes">
          {T.aide.cartes.map((c, i) => (
            <li key={c.titre} class="aide-carte" data-testid={`aide-carte-${i}`}>
              <span class="aide-icone">{ICONES[i]}</span>
              <span class="aide-textes">
                <strong>{c.titre}</strong>
                <span>{c.texte}</span>
              </span>
            </li>
          ))}
        </ol>
        <a
          class="btn aide-code"
          href={DEPOT_CODE}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="code-source"
        >
          {T.aide.code}
          <span class="sr-only"> {T.aide.nouvelOnglet}</span>
          <IconeFleche />
        </a>
        <p class="petit doux aide-licence">{T.aide.codeAide}</p>
      </main>
    </div>
  );
}
