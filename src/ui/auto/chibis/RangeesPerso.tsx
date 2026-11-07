// Rangées de l'atelier pour les persos en papier découpé (7/11/2026) : « Persos tout prêts » (les 6 persos proposés
// d'office aux voix) et « Situations » (chaque situation de jeu sur le perso en cours, avec son émotion par défaut).

import { SITUATIONS } from '../../../chibis/catalogue';
import { DEF_SITUATIONS } from '../../../chibis/persos/situations';
import { PERSOS_PRETS } from '../../../chibis/persos/prets';
import type { DefinitionChibi } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { ApercuChibi } from './ApercuChibi';
import { choisirSituation, partirDe, sitChoisie } from './atelier';

export function PersosPrets() {
  const t = TV.situations;
  return (
    <section class="chibi-section">
      <h2 class="outil-sous-titre">{t.prets}</h2>
      <span class="petit doux">{t.pretsAide}</span>
      <div class="chibi-vignettes">
        {PERSOS_PRETS.map((p, i) => (
          <button key={i} type="button" class="chibi-vignette" onClick={() => partirDe(p)} data-testid={`atelier-pret-${i + 1}`}>
            <ApercuChibi def={p} taille={66} />
            <span class="petit">{i + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Situations({ def }: { def: DefinitionChibi }) {
  const t = TV.situations;
  const actuelle = sitChoisie.value;
  return (
    <section class="chibi-section">
      <h2 class="outil-sous-titre">{t.titre}</h2>
      <span class="petit doux">{t.aide}</span>
      <div class="chibi-grille" role="radiogroup" aria-label={t.titre}>
        {SITUATIONS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === actuelle} class="chibi-vignette" data-actif={s === actuelle ? '1' : '0'} onClick={() => choisirSituation(s)} data-testid={`chibi-sit-${s}`}>
            <ApercuChibi def={def} emo={DEF_SITUATIONS[s].emo} sit={s} taille={70} />
            <span class="petit">{t.noms[s]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
