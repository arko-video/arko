// Panneau « Insérer quoi ? » (B, dev 2) : Une vidéo (fichier ou Ma bibliothèque), Un mème, Une image (durée), Un carton
// texte, Un chibi plein écran ; puis les réglages de l'élément et « Insérer » (insererElement : un seul Annuler).
// Écran plein par-dessus Couper / Habiller (monté par SurcouchesV3).

import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import { FormulaireCarton, FormulaireChibi, FormulaireImage } from './FormulairesInsertion';
import { FormulaireClip } from './FormulaireClip';
import { CHOIX_INSERTION, choixInsertion, fermerInsertion, insertionOuverte } from './etat-insertion';
import './insertion.css';

const TI = TV.insertion;

function ChoixType() {
  return (
    <>
      <p class="petit doux">{TI.aide}</p>
      <div class="ins-choix" role="list">
        {CHOIX_INSERTION.map((c) => (
          <button
            type="button"
            key={c}
            class="btn ins-choix-btn"
            onClick={() => (choixInsertion.value = c)}
            data-testid={`ins-choix-${c}`}
          >
            <strong>{TI.types[c]}</strong>
            <small class="doux">{TI.aidesTypes[c]}</small>
          </button>
        ))}
      </div>
    </>
  );
}

export function SurcoucheInsertion() {
  const o = insertionOuverte.value;
  if (!o) return null;
  const choix = choixInsertion.value;
  const fini = (ok: boolean) => ok && fermerInsertion();
  const retour = () => (choix ? (choixInsertion.value = null) : fermerInsertion());
  return (
    <div class="bibliotheque-fond" data-testid="v3-inserer-ecran">
      <div class="ecran bibliotheque ins-ecran">
        <header class="entete">
          <button
            type="button"
            class="btn btn-icone"
            aria-label={TI.retour}
            onClick={retour}
            data-testid="v3-inserer-ecran-fermer"
          >
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{choix ? TI.types[choix] : TI.titre}</h1>
        </header>
        <main class="ecran-corps ins-corps">
          {!choix && <ChoixType />}
          {choix === 'carton' && <FormulaireCarton t={o.t} fini={fini} />}
          {choix === 'chibi' && <FormulaireChibi t={o.t} fini={fini} />}
          {choix === 'image' && <FormulaireImage t={o.t} fini={fini} />}
          {(choix === 'clip' || choix === 'meme') && (
            <FormulaireClip key={choix} meme={choix === 'meme'} t={o.t} fini={fini} />
          )}
        </main>
      </div>
    </div>
  );
}
