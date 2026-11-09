// Écran de revue des « Bruitages auto » (E, dev 3), dans Habiller → Sons : la liste des propositions (moment,
// pourquoi, son choisi), avec « Écouter dans la vidéo » (2 s avant, 2 s après), Écouter le son seul, Changer,
// Retirer, et une case « Garder » DÉCOCHÉE d'office : seuls les bruitages cochés sont posés (un seul Annuler).
// En bas : les mots qui déclenchent (liste éditable, gardée sur l'appareil) et « Retirer les bruitages auto ».

import { ideesPlan, pourquoisPlan } from '../express/monteur-ia';
import { gouts, oublierGouts } from '../../apprentissage';
import { resumeGouts } from '../../../auto/apprentissage/gouts';
import { useState } from 'preact/hooks';
import { sonsPossibles, type ChoixSon } from '../../../auto/son/choix-son';
import { NOMS_CATEGORIES } from '../../../auto/son/declencheurs';
import { catalogueSons, estBruitage } from '../../../moteur/api';
import { TA } from '../../../textes-auto';
import { recetteAffichee } from '../../etat';
import { arreterLecture, ecouter, enChargement } from '../../ecoute-sons';
import { ecouterMonSon, mesSons } from '../../mes-sons';
import { IconeLecture, IconePoubelle, IconeRetour } from '../../composants/Icones';
import { Declencheurs } from './Declencheurs';
import {
  attenteSon,
  basculerGarde,
  changerSonRevue,
  contexteEnCours,
  ecouterContexte,
  nomChoix,
  ouvrirBruitages,
  panneauSonAuto,
  retirerDeLaRevue,
  retirerTousLesBruitages,
  revue,
  toutPoser,
  type LigneRevue,
} from './etat-son';

const TX = TA.son.bruitages;

export function PanneauBruitages() {
  const [motsOuverts, setMotsOuverts] = useState(false);
  const lignes = revue.value;
  const r = recetteAffichee.value;
  const sansMots = !r?.sousTitres || !Array.isArray(r.sousTitres.mots) || r.sousTitres.mots.length === 0;
  const dejaPoses = r?.sons.some((s) => s.role === 'bruitage') ?? false;
  return (
    <div class="outil" data-testid="panneau-bruitages">
      <div class="panneau-mot-entete">
        <button type="button" class="btn btn-discret" onClick={() => fermer()} data-testid="bruitages-retour">
          <IconeRetour taille={18} />
          {TX.fermer}
        </button>
      </div>
      <h3 class="reglages-titre">{TX.titre}</h3>
      <p class="petit doux">{TX.aide}</p>
      <CeQueArkoAAppris />
      <PourquoiMonteurIA />
      {attenteSon.value && (
        <p class="petit" aria-live="polite" data-testid="bruitages-attente">
          <span class="rond-chargement" /> {attenteSon.value}
        </p>
      )}
      {sansMots && <p class="petit" data-testid="bruitages-sans-mots">{TX.sansMots}</p>}
      {!sansMots && lignes && lignes.length === 0 && !attenteSon.value && <p class="petit" data-testid="bruitages-aucun">{TX.aucun}</p>}
      {lignes && lignes.length > 0 && (
        <>
          <p class="petit doux" data-testid="bruitages-nombre">
            {TX.nombre(lignes.length)} · {TX.limite}
          </p>
          <ul class="liste-sons" data-testid="liste-bruitages">
            {lignes.map((l, i) => (
              <Ligne key={`${l.ts}-${l.categorie}`} l={l} i={i} />
            ))}
          </ul>
          <button type="button" class="btn btn-principal" disabled={!!attenteSon.value || !lignes.some((l) => l.garde)} onClick={() => void toutPoser()} data-testid="bruitages-tout-poser">
            {TX.poserCoches(lignes.filter((l) => l.garde).length)}
          </button>
        </>
      )}
      <button type="button" class="btn btn-discret" onClick={() => setMotsOuverts(!motsOuverts)} aria-expanded={motsOuverts} data-testid="bruitages-mots">
        {TX.ouvrirDeclencheurs}
      </button>
      {motsOuverts && <Declencheurs apresChangement={() => void ouvrirBruitages()} />}
      {dejaPoses && (
        <button type="button" class="btn outil-supprimer" onClick={retirerTousLesBruitages} data-testid="bruitages-retirer-tous">
          <IconePoubelle taille={18} />
          {TX.retirerTous}
        </button>
      )}
    </div>
  );
}

function fermer() {
  arreterLecture();
  revue.value = null;
  panneauSonAuto.value = null;
}

/** Une proposition : catégorie et moment, son choisi (écouter, changer), retirer. */
function Ligne({ l, i }: { l: LigneRevue; i: number }) {
  const cle = `revue-${i}`;
  const jouer = () => {
    if (l.choix.type === 'arko') return void ecouter(l.choix.id, cle);
    const s = mesSons.peek().find((x) => x.id === l.choix.id);
    if (s) void ecouterMonSon(s);
  };
  return (
    <li class="son-ligne bruitage-ligne" data-testid={`bruitage-${i}`}>
      <button type="button" class="son-ecouter" aria-label={`${TX.ecouter} ${nomChoix(l.choix)}`} aria-busy={enChargement.value === cle} onClick={jouer} data-testid={`bruitage-ecouter-${i}`}>
        <span class="son-lecture" aria-hidden="true">
          <IconeLecture taille={16} />
        </span>
        <span class="son-nom">
          {NOMS_CATEGORIES[l.categorie]}
          <span class="son-etiquette">{l.pourquoi}</span>
          <span class="petit doux"> {nomChoix(l.choix)}</span>
        </span>
      </button>
      <button type="button" class="btn btn-petit" aria-busy={contexteEnCours.value === i} onClick={() => void ecouterContexte(i)} data-testid={`bruitage-contexte-${i}`}>
        {contexteEnCours.value === i ? TX.contexteEnCours : TX.contexte}
      </button>
      <label class="bruitage-garder">
        <input type="checkbox" checked={!!l.garde} onChange={() => basculerGarde(i)} data-testid={`bruitage-garder-${i}`} />
        {TX.garder}
      </label>
      <ChoixDuSon l={l} i={i} />
      <button type="button" class="btn btn-icone son-secondaire" aria-label={`${TX.retirer} ${NOMS_CATEGORIES[l.categorie]}`} onClick={() => retirerDeLaRevue(i)} data-testid={`bruitage-retirer-${i}`}>
        <IconePoubelle taille={18} />
      </button>
    </li>
  );
}

/** « Changer » : les sons de Mes sons qui vont à cette catégorie, puis tous les sons d'Arko. */
function ChoixDuSon({ l, i }: { l: LigneRevue; i: number }) {
  const possibles = sonsPossibles(l.categorie, mesSons.value.filter(estBruitage)).slice(0, 12);
  const valeur = `${l.choix.type === 'arko' ? 'a' : 'm'}:${l.choix.id}`;
  const choisir = (v: string) => {
    const [type, id] = [v.slice(0, 1), v.slice(2)];
    const s = mesSons.peek().find((x) => x.id === id);
    const choix: ChoixSon = type === 'm' && s ? { type: 'mesSons', id, nom: s.nom } : { type: 'arko', id };
    changerSonRevue(i, choix);
  };
  return (
    <label class="bruitage-changer">
      <span class="sr-only">{TX.changer}</span>
      <select value={valeur} onChange={(e) => choisir((e.currentTarget as HTMLSelectElement).value)} data-testid={`bruitage-changer-${i}`}>
        {possibles.length > 0 && (
          <optgroup label={TX.mesSons}>
            {possibles.map((s) => (
              <option key={s.id} value={`m:${s.id}`}>
                {s.nom}
              </option>
            ))}
          </optgroup>
        )}
        {l.choix.type === 'mesSons' && !possibles.some((s) => s.id === l.choix.id) && <option value={valeur}>{l.choix.nom}</option>}
        <optgroup label={TX.sonsArko}>
          {catalogueSons.map((s) => (
            <option key={s.id} value={`a:${s.id}`}>
              {s.nom}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

/** Ce qu'Arko a appris des retouches de l'utilisateur (à chaque export), avec « Oublier ». */
function CeQueArkoAAppris() {
  const g = gouts.value;
  if (g.n === 0) return null;
  const lignes = resumeGouts(g);
  return (
    <div class="petit message message-info" data-testid="gouts-appris">
      <strong>Appris de tes {g.n} montage{g.n > 1 ? 's' : ''} :</strong> {lignes.length > 0 ? lignes.join(' · ') : 'tu gardes presque tout, rien à changer.'}{' '}
      <button type="button" class="btn btn-discret express-mini" onClick={oublierGouts} data-testid="gouts-oublier">
        Oublier
      </button>
    </div>
  );
}

/** A10. Pourquoi le monteur IA a fait chaque choix (dernier plan appliqué). */
function PourquoiMonteurIA() {
  const l = pourquoisPlan.value;
  const intro = ideesPlan.value.intro;
  if (l.length === 0 && !intro) return null;
  return (
    <details class="petit" data-testid="pourquoi-monteur-ia">
      <summary>Pourquoi le monteur IA a fait ces choix ({l.length})</summary>
      {intro && <p data-testid="intro-monteur-ia"><strong>Intro à enregistrer (après l'accroche) :</strong> « {intro} »</p>}
      <ul>
        {l.slice(0, 40).map((x, k) => (
          <li key={k}>
            <span class="chiffres">{x.quand}</span> · {x.quoi} : {x.pourquoi}
          </li>
        ))}
      </ul>
    </details>
  );
}
