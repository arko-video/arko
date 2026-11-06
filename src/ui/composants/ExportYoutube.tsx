// Morceaux de l'étape Exporter qui dépendent de la plateforme : ligne de qualité, option 1440p (YouTube 16:9),
// alerte « Short de plus de 3 min », bouton Miniature et astuce de publication.

import { choisirQualite } from '../../recette/operations';
import { dureesGeneriques } from '../../recette/generiques';
import { SHORT } from '../../recette/destination';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { TY } from '../../textes-youtube';
import { destinationProjet } from '../destination';
import { modifier, sources } from '../etat';
import { formatDuree } from '../format';
import { miniatureOuverte } from '../miniature';
import { IconeAlerte, IconeAmpoule } from './Icones';

/** La vidéo d'origine permet-elle le 1440p ? (au moins 1440 px sur son petit côté, ou 2560 de large.) */
export function sourcePermet1440(): boolean {
  const s = sources.value[0]?.infos;
  return !!s?.l && !!s?.h && (Math.min(s.l, s.h) >= 1440 || s.l >= 2560);
}

/** Sous le résumé : qualité, option 1440p, intro / outro comprises, alerte Short trop long. */
export function InfosExport({ r, duree }: { r: Recette; duree: number }) {
  const d = destinationProjet.value;
  if (d === 'tiktok') return <p class="petit doux">{T.exporter.qualite}</p>;
  const g = dureesGeneriques(r);
  return (
    <>
      <p class="petit doux" data-testid="qualite-export">
        {d === 'youtube' ? (r.export.qualite === 'haute' ? TY.exporter.haute : TY.exporter.qualite169) : TY.exporter.qualiteShort}
      </p>
      {d === 'youtube' && sourcePermet1440() && (
        <label class="interrupteur">
          <span>
            <strong>{TY.exporter.haute}</strong>
            <span class="petit doux">{TY.exporter.hauteAide}</span>
          </span>
          <input
            type="checkbox"
            checked={r.export.qualite === 'haute'}
            onChange={(e) => modifier((x) => choisirQualite(x, (e.currentTarget as HTMLInputElement).checked ? 'haute' : 'normale'))}
            data-testid="qualite-1440"
          />
        </label>
      )}
      {g.intro + g.outro > 0 && <p class="petit doux" data-testid="avec-generiques">{TY.exporter.avecGeneriques(formatDuree(g.intro + g.outro))}</p>}
      {d === 'short' && SHORT.dureeLimite !== null && duree > SHORT.dureeLimite && (
        <div class="message message-alerte" role="alert" data-testid="alerte-short">
          <IconeAlerte />
          <span>{TY.exporter.shortTropLong(formatDuree(duree))}</span>
        </div>
      )}
    </>
  );
}

/** « Faire la miniature » (YouTube 16:9 et Shorts). */
export function BoutonMiniature() {
  if (destinationProjet.value === 'tiktok') return null;
  return (
    <button type="button" class="btn" onClick={() => (miniatureOuverte.value = true)} data-testid="ouvrir-miniature">
      {TY.miniature.bouton}
    </button>
  );
}

/** Astuce de publication, selon la plateforme. */
export function AstuceExport() {
  const d = destinationProjet.value;
  return (
    <div class="message message-info">
      <IconeAmpoule />
      <span>{d === 'youtube' ? TY.exporter.astuceYoutube : d === 'short' ? TY.exporter.astuceShort : T.exporter.astuce}</span>
    </div>
  );
}
