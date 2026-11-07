// Cartes des voix (C, dev 1), composant PARTAGÉ : une carte par voix trouvée (pastille, nom, 3 extraits à écouter,
// son chibi via ChoixChibi du dev 3). Utilisé par l'écran « Qui parle ? » et par la revue du Best-of (intégrateur).
// Propriétés FIGÉES (contrat §3.3).

import { extraitsDeVoix } from '../../../auto/voix/qui-parle';
import type { VoixDetectees } from '../../../auto/types-v3';
import type { SourceOuverte } from '../../../moteur/api';
import { chibiDe } from '../../../moteur/couches/avatars';
import { COULEURS_VOIX } from '../../../recette/operations-voix';
import type { DefinitionChibi } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { ChoixChibi } from '../chibis/ChoixChibi';
import { ecouteEnCours, ecouterPassage } from './ecoute';
import './voix.css';

export interface ProprietesCartesVoix {
  detectees: VoixDetectees;
  /** Source analysée (pour écouter les extraits). */
  source: SourceOuverte;
  noms: Readonly<Record<string, string>>;
  chibis: Readonly<Record<string, DefinitionChibi | null>>;
  surNom: (p: string, nom: string) => void;
  surChibi: (p: string, def: DefinitionChibi, bib?: string) => void;
}

export function CartesVoix({ detectees, source, noms, chibis, surNom, surChibi }: ProprietesCartesVoix) {
  const enCours = ecouteEnCours.value;
  return (
    <ul class="liste-voix" data-testid="v3-cartes-voix">
      {detectees.voix.map((v, k) => {
        const extraits = extraitsDeVoix(detectees, v.id);
        const nom = noms[v.id] ?? TV.voix.voix(k + 1);
        return (
          <li key={v.id} class="carte-voix" data-testid={`v3-voix-${v.id}`}>
            <div class="carte-voix-haut">
              <span class="pastille-voix" style={{ background: COULEURS_VOIX[k % COULEURS_VOIX.length] }} aria-hidden="true" />
              <label class="carte-voix-nom">
                <span class="petit doux">{v.piste !== undefined ? `${TV.voix.nom} · ${TV.voix.piste(v.piste)}` : TV.voix.nom}</span>
                <input
                  class="champ-saisie"
                  type="text"
                  maxLength={24}
                  value={nom}
                  onChange={(e) => surNom(v.id, (e.currentTarget as HTMLInputElement).value)}
                  data-testid={`v3-voix-nom-${v.id}`}
                />
              </label>
            </div>
            <span class="petit doux chiffres">{TV.voix.infoVoix(v.niveauDb, Math.round(v.part * 100))}</span>
            <div class="extraits-voix">
              {extraits.map((x, j) => {
                const cle = `voix:${v.id}:${x.de}`;
                return (
                  <button
                    key={cle}
                    type="button"
                    class="btn"
                    aria-pressed={enCours === cle}
                    onClick={() => void ecouterPassage(source.fichier, x.de, x.a, cle)}
                    data-testid={`v3-extrait-${v.id}-${j}`}
                    data-de={x.de}
                  >
                    {enCours === cle ? TV.voix.arreter : TV.voix.extrait(j + 1)}
                  </button>
                );
              })}
            </div>
            <div class="carte-voix-chibi">
              <span class="petit doux">{TV.voix.chibi}</span>
              {/* Sans chibi choisi : celui que l'avatar dessinera (tiré de l'id), jamais « Aucun ». */}
              <ChoixChibi
                valeur={chibis[v.id] ?? chibiDe({ id: v.id, nom: nom })}
                surChoix={(def, bib) => surChibi(v.id, def, bib)}
                testid={`v3-voix-chibi-${v.id}`}
                {...(chibis[v.id] ? {} : { libelle: TV.chibis.choisirUn })}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
