// Rayon « Chibis » de Ma bibliothèque (D, dev 3) : la liste des chibis gardés (vignette, nom, renommer, modifier,
// supprimer) et « Nouveau chibi ».

import { useEffect, useState } from 'preact/hooks';
import type { MonChibi } from '../../../stockage/chibis';
import { TV } from '../../../textes-v3';
import { BoutonAuto } from '../BoutonAuto';
import { ApercuChibi } from './ApercuChibi';
import { chargerChibis, mesChibis, renommer, supprimer } from './atelier';
import { ouvrirAtelier } from './etat-chibis';
import './chibis.css';

export const PRETE_CHIBIS = true;

function Ligne({ c }: { c: MonChibi }) {
  const t = TV.chibis;
  const [edition, setEdition] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  return (
    <li class="chibi-ligne" data-testid={`chibi-${c.id}`}>
      <ApercuChibi def={c.def} taille={56} label={c.nom} />
      {edition === null ? (
        <span class="chibi-ligne-nom">{c.nom}</span>
      ) : (
        <input class="chibi-ligne-nom" type="text" maxLength={24} value={edition} onInput={(e) => setEdition((e.currentTarget as HTMLInputElement).value)} aria-label={t.nom} data-testid="chibi-renommer-champ" />
      )}
      {edition === null ? (
        <>
          <button type="button" class="btn" onClick={() => setEdition(c.nom)} data-testid="chibi-renommer">
            {t.renommer}
          </button>
          <button type="button" class="btn" onClick={() => ouvrirAtelier({ id: c.id })} data-testid="chibi-modifier">
            {t.modifier}
          </button>
          <button type="button" class="btn" onClick={() => (confirmer ? void supprimer(c) : setConfirmer(true))} data-testid="chibi-supprimer">
            {confirmer ? t.supprimerOui : t.supprimer}
          </button>
        </>
      ) : (
        <button type="button" class="btn btn-principal" onClick={() => void renommer(c, edition).then(() => setEdition(null))} data-testid="chibi-renommer-ok">
          {t.valider}
        </button>
      )}
    </li>
  );
}

export function RayonChibis() {
  useEffect(() => void chargerChibis(), []);
  const liste = mesChibis.value ?? [];
  return (
    <div class="liste-rayon" data-testid="v3-rayon-chibis">
      <p class="petit doux">{TV.chibis.rayonAide}</p>
      <BoutonAuto drapeau="chibis" prete={PRETE_CHIBIS} label={TV.chibis.nouveau} testid="v3-nouveau-chibi" agir={() => ouvrirAtelier()} principal />
      {mesChibis.value && liste.length === 0 && <p class="petit doux">{TV.chibis.vide}</p>}
      <ul class="chibi-liste" data-testid="liste-chibis">
        {liste.map((c) => (
          <Ligne key={c.id} c={c} />
        ))}
      </ul>
      <p class="petit doux">{TV.chibis.licence}</p>
    </div>
  );
}
