// Liste éditable des « mots qui déclenchent » les bruitages auto (E, dev 3) : une ligne par catégorie, mots séparés
// par des virgules. Gardée sur l'appareil (localStorage `arko.declencheurs`) ; « Remettre la liste de départ ».

import { CATEGORIES, NOMS_CATEGORIES, motsDepuisTexte } from '../../../auto/son/declencheurs';
import { TA } from '../../../textes-auto';
import { changerDeclencheurs, declencheurs } from './etat-son';

const TX = TA.son.bruitages;

export function Declencheurs({ apresChangement }: { apresChangement: () => void }) {
  const liste = declencheurs.value;
  const changer = (categorie: string, texte: string) => {
    changerDeclencheurs(liste.map((d) => (d.categorie === categorie ? { ...d, mots: motsDepuisTexte(texte) } : d)));
    apresChangement();
  };
  return (
    <div class="declencheurs" data-testid="declencheurs">
      <h3 class="outil-sous-titre">{TX.declencheurs}</h3>
      <p class="petit doux">{TX.declencheursAide}</p>
      {CATEGORIES.map((c) => {
        const d = liste.find((x) => x.categorie === c);
        if (!d || (d.signal && d.signal !== 'juron-fort')) return null;
        return (
          <label key={c} class="champ-saisie">
            <span class="petit doux">{NOMS_CATEGORIES[c]}</span>
            <input
              type="text"
              autoComplete="off"
              value={d.mots.join(', ')}
              onChange={(e) => changer(c, (e.currentTarget as HTMLInputElement).value)}
              data-testid={`declencheur-${c}`}
            />
          </label>
        );
      })}
      <button
        type="button"
        class="btn"
        onClick={() => {
          changerDeclencheurs(null);
          apresChangement();
        }}
        data-testid="declencheurs-remettre"
      >
        {TX.remettre}
      </button>
    </div>
  );
}
