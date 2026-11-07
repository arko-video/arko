// Panneau d'un élément inséré (B, dev 2), dans Couper et Habiller → Couper quand on touche l'élément sur la frise :
// durée, texte, couleurs, émotion ; « Déplacer ici » (à la tête de lecture) et « Retirer » (la suite est recollée).
// Chaque réglage validé = une opération (un Annuler). Remplace le panneau Vitesse / Arrêt sur image (sans vidéo).

import { dureePlan } from '../../../recette/operations';
import type { Plan } from '../../../recette/types';
import { CARTON } from '../../../moteur/inserts/carton';
import { TV } from '../../../textes-v3';
import { IconePoubelle } from '../../composants/Icones';
import { deplacerInsere, reglerInsere, retirerInsere } from './actions-insertion';
import { ChampCouleur, ChampDuree, ChampEmotion } from './ChampsInsertion';
import './insertion.css';

const TI = TV.insertion;

/** Texte validé quand on quitte le champ (ou Entrée) : un seul Annuler par changement. */
function TexteValide(p: {
  label: string;
  valeur: string;
  valider: (v: string) => void;
  testid: string;
  max: number;
}) {
  return (
    <label class="ins-champ">
      <span>{p.label}</span>
      <input
        type="text"
        value={p.valeur}
        maxLength={p.max}
        onChange={(e) => p.valider((e.target as HTMLInputElement).value.trim())}
        data-testid={p.testid}
      />
    </label>
  );
}

export function PanneauInsere({ i, plan }: { i: number; plan: Plan }) {
  const el = plan.ins;
  if (!el) return null;
  const dur = Math.round(dureePlan(plan) * 100) / 100;
  return (
    <section class="panneau-plan ins-panneau" aria-label={TI.inseres[el.type]} data-testid="panneau-insere">
      <h3 class="panneau-plan-titre">{TI.inseres[el.type]}</h3>
      {el.type === 'carton' && (
        <>
          <TexteValide
            label={TI.texte}
            valeur={el.txt}
            max={120}
            valider={(txt) => txt && reglerInsere(i, { txt })}
            testid="ins-p-texte"
          />
          <div class="ins-ligne">
            <ChampCouleur
              label={TI.fond}
              valeur={el.fond ?? CARTON.fond}
              changer={(fond) => reglerInsere(i, { fond })}
              testid="ins-p-fond"
            />
            <ChampCouleur
              label={TI.couleur}
              valeur={el.couleur ?? CARTON.couleur}
              changer={(couleur) => reglerInsere(i, { couleur })}
              testid="ins-p-couleur"
            />
          </div>
        </>
      )}
      {el.type === 'chibi' && (
        <>
          <ChampEmotion valeur={el.emo} changer={(emo) => reglerInsere(i, { emo })} testid="ins-p-emotion" />
          <TexteValide
            label={TI.texteChibi}
            valeur={el.txt ?? ''}
            max={60}
            valider={(txt) => reglerInsere(i, { txt: txt || undefined })}
            testid="ins-p-texte"
          />
          <ChampCouleur
            label={TI.fond}
            valeur={el.fond ?? CARTON.chibi.fond}
            changer={(fond) => reglerInsere(i, { fond })}
            testid="ins-p-fond"
          />
        </>
      )}
      {el.type !== 'clip' && (
        <ChampDuree valeur={dur} changer={(d) => reglerInsere(i, {}, d)} testid="ins-p-duree" />
      )}
      <p class="petit doux">{TI.deplacerAide}</p>
      <div class="grille-2">
        <button type="button" class="btn" onClick={() => deplacerInsere(i)} data-testid="ins-deplacer">
          {TI.deplacer}
        </button>
        <button type="button" class="btn" onClick={() => retirerInsere(i)} data-testid="ins-retirer">
          <IconePoubelle taille={18} />
          {TI.retirer}
        </button>
      </div>
    </section>
  );
}
