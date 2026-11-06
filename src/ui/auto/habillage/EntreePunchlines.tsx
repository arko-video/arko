// « Punchlines seulement » (B, dev 2), dans Habiller → Sous-titres (une fois les mots transcrits) :
// choix « Tout / Punchlines seulement », couleur du mot clé, gros mots masqués, « Choisir à nouveau ».
// Ajouter / retirer une phrase d'un toucher : l'étoile devant chaque phrase de la liste (OutilSousTitres) ou le
// panneau d'un mot (PanneauMot). Chaque action = un seul Annuler.

import { trouverPunchlines } from '../../../auto/habillage/punchlines';
import { ErreurArko } from '../../../moteur/api';
import { choisirModeSousTitres, definirPunchlines, definirSousTitres } from '../../../recette/operations';
import { COULEURS_CLE } from '../../../recette/sous-titres-places';
import type { ModeSousTitres, Recette } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { afficherToast, modifier, recetteAffichee } from '../../etat';
import { lignesDe } from '../../habillage';
import { Pastilles } from '../../composants/outils/Commun';
import { visible } from '../drapeaux';
import { ecouteEnCours, signauxDe } from './signaux';

const PRETE = true;
const P = TA.habillage.punchlines;
const MODES: readonly ModeSousTitres[] = ['tout', 'punchlines'];
const COULEURS = ['jaune', 'rouge'] as const;

/** (Re)choisit les punchlines avec les signaux du son (s'ils sont là), puis passe en mode punchlines. */
async function choisirPunchlines(): Promise<number> {
  const s = await signauxDe(recetteAffichee.peek()?.sousTitres?.src);
  let n = 0;
  modifier((x: Recette) => {
    const mots = x.sousTitres?.mots;
    if (!Array.isArray(mots)) return x;
    const p = trouverPunchlines(mots, s);
    n = p.length;
    return choisirModeSousTitres(definirPunchlines(x, p), 'punchlines');
  });
  return n;
}

async function choisirMode(mode: ModeSousTitres) {
  try {
    const st = recetteAffichee.peek()?.sousTitres;
    if (mode === 'punchlines' && !st?.punchlines) await choisirPunchlines();
    else modifier((x) => choisirModeSousTitres(x, mode));
  } catch (e) {
    afficherToast(e instanceof ErreurArko ? e.message : TA.commun.erreur, 5000);
  }
}

export function EntreePunchlines() {
  const r = recetteAffichee.value;
  const st = r?.sousTitres;
  if (!r || !st || !Array.isArray(st.mots) || !visible('punchlines', PRETE)) return null;
  const mode: ModeSousTitres = st.mode === 'punchlines' ? 'punchlines' : 'tout';
  const n = mode === 'punchlines' ? lignesDe(r).length : 0;
  const ecoute = ecouteEnCours.value;
  return (
    <section class="outil-auto" data-testid="auto-punchlines">
      <h3 class="outil-sous-titre">{P.afficher}</h3>
      <Pastilles
        label={P.afficher}
        choix={MODES}
        actif={mode}
        onChoisir={(m) => void choisirMode(m)}
        prefixe="mode-sous-titres"
        rendu={(k) => <span>{k === 'tout' ? P.tout : P.seulement}</span>}
      />
      {ecoute && (
        <p class="petit doux outil-aide" aria-live="polite" data-testid="punchlines-ecoute">
          {TA.habillage.ecoute}
        </p>
      )}
      {mode === 'punchlines' && (
        <>
          <p class="petit doux outil-aide" aria-live="polite" data-testid="punchlines-compte">
            {n === 0 ? P.aucune : `${P.compte(n)}. ${P.aide}`}
          </p>
          <h3 class="outil-sous-titre">{P.couleur}</h3>
          <Pastilles
            label={P.couleur}
            choix={COULEURS}
            actif={st.couleurCle ?? 'jaune'}
            onChoisir={(couleurCle) => modifier((x) => (x.sousTitres ? definirSousTitres(x, { ...x.sousTitres, couleurCle }) : x))}
            prefixe="couleur-cle"
            rendu={(k) => (
              <>
                <span aria-hidden="true" style={{ display: 'inline-block', width: '0.9em', height: '0.9em', borderRadius: '50%', background: COULEURS_CLE[k] }} />
                <span>{P[k]}</span>
              </>
            )}
          />
          <label class="case">
            <input
              type="checkbox"
              checked={st.jurons !== 'visibles'}
              onChange={(e) => {
                const jurons = (e.currentTarget as HTMLInputElement).checked ? 'masques' : 'visibles';
                modifier((x) => (x.sousTitres ? definirSousTitres(x, { ...x.sousTitres, jurons }) : x));
              }}
              data-testid="masquer-jurons"
            />
            <span>
              <strong>{P.jurons}</strong>
              <span class="petit doux">{P.jurAide}</span>
            </span>
          </label>
          <button
            type="button"
            class="btn"
            disabled={ecoute !== null}
            onClick={() => void choisirPunchlines().then((k) => afficherToast(P.rechoisies(k)), () => afficherToast(TA.commun.erreur))}
            data-testid="punchlines-rechoisir"
          >
            {P.choisirANouveau}
          </button>
        </>
      )}
    </section>
  );
}
