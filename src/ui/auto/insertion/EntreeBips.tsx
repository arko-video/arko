// Réglage « Gros mots : Laisser / Bip / Silence » (E, dev 2), dans Habiller → Sous-titres : sur chaque juron des
// sous-titres, le son de la vidéo est coupé (et un bip posé). Un toucher = une opération (un Annuler).
// Aussi l'accès au choix des pistes de son quand la vidéo en a plusieurs.

import { estJuron } from '../../../auto/habillage/jurons';
import { choisirBips } from '../../../recette/operations';
import { TV } from '../../../textes-v3';
import { modifier, recette } from '../../etat';
import { visible } from '../drapeaux';
import { PRETE_PISTES } from './ChoixPistes';
import { pistesAChoisir } from './etat-insertion';
import './insertion.css';

const PRETE = true;
const TB = TV.insertion.bips;
const CHOIX = [
  { v: 'aucun', label: TB.aucun },
  { v: 'bip', label: TB.bip },
  { v: 'muet', label: TB.muet },
] as const;

export function EntreeBips() {
  const r = recette.value;
  if (!r) return null;
  const video = r.sources.find((s) => s.type === 'video');
  const pistes = visible('pistes', PRETE_PISTES) && video && (video.pistes ?? 0) >= 2;
  if (!visible('bips', PRETE)) return null;
  const actif = r.bips?.son ?? 'aucun';
  const mots = r.sousTitres?.mots;
  const n = Array.isArray(mots) ? mots.filter((m) => estJuron(m[0])).length : null;
  return (
    <div class="ins-bips" data-testid="v3-bips">
      <span class="panneau-plan-label">{TB.titre}</span>
      <div class="choix-plan" role="radiogroup" aria-label={TB.titre}>
        {CHOIX.map(({ v, label }) => (
          <button
            type="button"
            role="radio"
            key={v}
            class="pastille"
            aria-checked={v === actif}
            data-actif={v === actif ? '1' : '0'}
            onClick={() => v !== actif && modifier((x) => choisirBips(x, v === 'aucun' ? null : { son: v }))}
            data-testid={`bips-${v}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p class="petit doux">{n === null ? TB.sansMots : `${TB.aide} ${TB.combien(n)}`}</p>
      {pistes && (
        <button
          type="button"
          class="btn"
          onClick={() => (pistesAChoisir.value = video.id)}
          data-testid="v3-pistes-ouvrir"
        >
          {TV.insertion.pistes.reglage}
        </button>
      )}
    </div>
  );
}
