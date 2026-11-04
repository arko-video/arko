// Écran de départ : « Tu montes pour où ? » — deux gros boutons, TikTok et YouTube.
// YouTube propose ensuite « Vidéo (16:9) » ou « Short (vertical) ». Le choix est mémorisé (ui/destination.ts).
// Les pictos sont de simples formes dessinées ici (téléphone + note, écran + lecture) : aucun logo de marque.

import { useState } from 'preact/hooks';
import type { Destination } from '../../recette/destination';
import { TY } from '../../textes-youtube';
import { choisirDestination, choixOuvert, destinationChoisie } from '../destination';

/** Téléphone vertical avec une note de musique (évoque un clip court vertical). */
export function PictoVertical({ taille = 56 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="16" y="4" width="24" height="48" rx="6" stroke="currentColor" stroke-width="3" />
      <path d="M31 18v14.5a4.5 4.5 0 1 1-3-4.24V18h3Z" fill="currentColor" />
      <path d="M31 18c1.2 2.6 3.4 4 5.5 4.3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
  );
}

/** Écran horizontal avec un triangle « lecture » (évoque une vidéo à regarder). */
export function PictoHorizontal({ taille = 56 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="3" y="12" width="50" height="30" rx="7" stroke="currentColor" stroke-width="3" />
      <path d="M24 21v12l10-6-10-6Z" fill="currentColor" />
      <path d="M18 48h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}

function GrosBouton(p: { titre: string; aide: string; picto: preact.ComponentChildren; actif: boolean; onClick: () => void; testid: string }) {
  return (
    <button type="button" class="depart-bouton" data-actif={p.actif ? '1' : '0'} onClick={p.onClick} data-testid={p.testid}>
      <span class="depart-picto">{p.picto}</span>
      <span class="depart-textes">
        <strong>{p.titre}</strong>
        <span class="petit doux">{p.aide}</span>
      </span>
    </button>
  );
}

export function Depart() {
  const actuel = destinationChoisie.value;
  const [youtube, setYoutube] = useState(false);
  const choisir = (d: Destination) => choisirDestination(d);

  return (
    <div class="ecran depart" data-testid="depart">
      <main class="ecran-corps depart-corps">
        <p class="depart-marque">Arko</p>
        {!youtube ? (
          <>
            <h1 class="titre">{TY.depart.titre}</h1>
            <p class="intro doux">{TY.depart.intro}</p>
            <div class="depart-choix">
              <GrosBouton titre={TY.depart.tiktok} aide={TY.depart.tiktokAide} picto={<PictoVertical />} actif={actuel === 'tiktok'} onClick={() => choisir('tiktok')} testid="depart-tiktok" />
              <GrosBouton titre={TY.depart.youtube} aide={TY.depart.youtubeAide} picto={<PictoHorizontal />} actif={actuel === 'youtube' || actuel === 'short'} onClick={() => setYoutube(true)} testid="depart-youtube" />
            </div>
          </>
        ) : (
          <>
            <h1 class="titre">{TY.depart.quelFormat}</h1>
            <div class="depart-choix">
              <GrosBouton titre={TY.depart.video} aide={TY.depart.videoAide} picto={<PictoHorizontal />} actif={actuel === 'youtube'} onClick={() => choisir('youtube')} testid="depart-video" />
              <GrosBouton titre={TY.depart.short} aide={TY.depart.shortAide} picto={<PictoVertical />} actif={actuel === 'short'} onClick={() => choisir('short')} testid="depart-short" />
            </div>
            <button type="button" class="btn btn-discret" onClick={() => setYoutube(false)} data-testid="depart-retour">
              {TY.depart.retour}
            </button>
          </>
        )}
        {actuel && !youtube && (
          <button type="button" class="btn btn-discret" onClick={() => (choixOuvert.value = false)} data-testid="depart-garder">
            {TY.pour(TY.noms[actuel])}
          </button>
        )}
      </main>
    </div>
  );
}

/** Pastille de l'accueil : « Pour : YouTube 16:9 · Changer ». */
export function PastilleDestination() {
  const d = destinationChoisie.value ?? 'tiktok';
  return (
    <button type="button" class="pastille-destination" aria-label={TY.changerAide} onClick={() => (choixOuvert.value = true)} data-testid="changer-destination">
      {d === 'youtube' ? <PictoHorizontal taille={20} /> : <PictoVertical taille={20} />}
      <span>{TY.pour(TY.noms[d])}</span>
      <span class="pastille-changer">{TY.changer}</span>
    </button>
  );
}
