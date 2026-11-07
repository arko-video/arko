// « Qui parle ? » sur la carte d'un clip de la revue du monteur sans IA (7/11/2026) : un lien qui ouvre les cartes
// des voix (nom, 3 extraits, perso). Un nom ou un perso changé vaut pour TOUS les clips pas encore triés (les voix
// sont celles de la vidéo : mêmes ids dans chaque clip).

import { useState } from 'preact/hooks';
import type { SourceOuverte } from '../../../moteur/api';
import type { Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { revue } from '../../monteur/etat-monteur';
import { nommerDansClip, persoDansClip, voixClips } from '../../monteur/persos-monteur';
import { modifierBrouillon } from '../../monteur/revue-monteur';
import { voixDepuisRecette } from './actions-voix';
import { CartesVoix } from './CartesVoix';
import './voix.css';

/** Applique `op` à tous les brouillons pas encore triés. */
function partout(op: (r: Recette) => Recette) {
  for (const b of revue.peek()?.restants ?? []) void modifierBrouillon(b.uid, op);
}

export function QuiParleClips({ recette, source }: { recette: Recette; source: SourceOuverte }) {
  const [ouvert, setOuvert] = useState(false);
  const personnes = recette.personnes ?? [];
  const ecoute = voixClips.value;
  const detectees = ecoute?.voix ?? (personnes.length > 0 ? voixDepuisRecette(recette, source.infos.id) : null);
  if (!detectees || personnes.length === 0) return null;
  const noms = Object.fromEntries(personnes.map((p) => [p.id, p.nom]));
  const chibis = Object.fromEntries(personnes.map((p) => [p.id, p.chibi ?? null]));
  // La carte se balaie au doigt : un toucher ici ne doit pas lancer le balayage.
  const stop = (e: Event) => e.stopPropagation();
  return (
    <div class="revue-qui-parle" onPointerDown={stop} data-testid="revue-qui-parle">
      <button type="button" class="lien" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)} data-testid="revue-lien-qui-parle">
        {TV.bestOf.lienQuiParle}
      </button>{' '}
      <span class="petit doux">— {TV.bestOf.lienQuiParleAide}</span>
      {ouvert && (
        <CartesVoix
          detectees={{ ...detectees, voix: detectees.voix.filter((v) => personnes.some((p) => p.id === v.id)) }}
          source={source}
          noms={noms}
          chibis={chibis}
          surNom={(p, nom) => partout((r) => nommerDansClip(r, p, nom))}
          surChibi={(p, def, bib) => partout((r) => persoDansClip(r, p, def, bib))}
        />
      )}
    </div>
  );
}
