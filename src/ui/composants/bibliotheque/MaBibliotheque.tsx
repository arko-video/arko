// Écran « Ma bibliothèque » (par-dessus l'écran en cours ; Retour le ferme) : 4 rayons (Bruitages, Musiques, Fonds
// verts, Mèmes), import d'un dossier entier, de fichiers ou d'un .zip (rangement automatique d'après le nom des
// dossiers, sinon la question « Où ranger ? »), bilan (fichiers à convertir, illisibles), recherche, renommer,
// supprimer, place utilisée. Tout reste sur l'appareil.

import { useEffect, useRef } from 'preact/hooks';
import { RAYONS, type Rayon } from '../../../bibliotheque/rayons';
import { TB } from '../../textes-bibliotheque';
import {
  bibliothequeOuverte,
  demandeRayon,
  dernierBilan,
  fermerBibliotheque,
  importerDansBibliotheque,
  progresBibliotheque,
  rayonActif,
  repondreRayon,
} from '../../bibliotheque';
import { arreterLecture } from '../../ecoute-sons';
import { IconeAlerte, IconeImporter, IconeRetour } from '../Icones';
import { Onglets } from '../outils/Reglages';
import { ListeRayon } from './ListeRayon';

/** Types acceptés par « Importer des fichiers ». */
export const ACCEPTE_BIBLIOTHEQUE = 'audio/*,video/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.flac,.mp4,.m4v,.webm,.mov,.mkv,.wmv,.avi,.zip,application/zip';

export function MaBibliotheque() {
  const titre = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titre.current?.focus();
    return arreterLecture;
  }, []);
  if (!bibliothequeOuverte.value) return null;
  const rayon = rayonActif.value;
  return (
    <div class="bibliotheque-fond" data-testid="bibliotheque">
      <div class="ecran bibliotheque">
        <header class="entete">
          <button type="button" class="btn btn-icone" aria-label={TB.fermer} onClick={fermerBibliotheque} data-testid="bibliotheque-fermer">
            <IconeRetour taille={22} />
          </button>
          <h1 ref={titre} class="entete-titre" tabIndex={-1}>
            {TB.titre}
          </h1>
        </header>
        <main class="ecran-corps">
          <p class="petit doux">{TB.intro}</p>
          <Importer />
          <Bilan />
          <Onglets
            label={TB.titre}
            onglets={RAYONS.map((r) => ({ id: r, nom: TB.rayons[r] }))}
            actif={rayon}
            onChoisir={(id) => (rayonActif.value = id as Rayon)}
            prefixe="rayon"
            panneau="liste-rayon"
          />
          <p class="petit doux">{TB.rayonsAide[rayon]}</p>
          <ListeRayon rayon={rayon} />
          <p class="petit droits-sons">
            <IconeAlerte taille={14} />
            {TB.rappel}
          </p>
        </main>
      </div>
      {demandeRayon.value && <DemandeRayon />}
    </div>
  );
}

function Importer() {
  const enCours = progresBibliotheque.value;
  const choisir = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const fichiers = [...(input.files ?? [])];
    input.value = '';
    void importerDansBibliotheque(fichiers);
  };
  return (
    <div class="bibliotheque-import">
      <div class="grille-2">
        <label class="btn btn-principal" data-occupe={enCours ? '1' : '0'} data-testid="bibliotheque-dossier">
          <IconeImporter taille={18} />
          {enCours ?? TB.importerDossier}
          <input
            type="file"
            class="sr-only"
            multiple
            ref={(el) => el?.setAttribute('webkitdirectory', '')}
            disabled={!!enCours}
            onChange={choisir}
            data-testid="bibliotheque-dossier-input"
          />
        </label>
        <label class="btn" data-occupe={enCours ? '1' : '0'} data-testid="bibliotheque-fichiers">
          <IconeImporter taille={18} />
          {TB.importerFichiers}
          <input type="file" class="sr-only" multiple accept={ACCEPTE_BIBLIOTHEQUE} disabled={!!enCours} onChange={choisir} data-testid="bibliotheque-fichiers-input" />
        </label>
      </div>
      <p class="petit doux">{TB.importAide}</p>
      {enCours && (
        <p class="petit" aria-live="polite" data-testid="bibliotheque-progres">
          <span class="rond-chargement" /> {enCours}
        </p>
      )}
    </div>
  );
}

/** Ce que le dernier import a laissé de côté : vidéos à convertir, fichiers illisibles, fichiers ignorés. */
function Bilan() {
  const b = dernierBilan.value;
  if (!b || (b.aConvertir.length === 0 && b.illisibles.length === 0 && b.ignores === 0 && !b.erreur)) return null;
  return (
    <div class="bibliotheque-bilan" role="status" data-testid="bibliotheque-bilan">
      {b.erreur && <p class="petit">{b.erreur}</p>}
      {b.aConvertir.length > 0 && (
        <p class="petit" data-testid="bibliotheque-a-convertir">
          {TB.aConvertir(b.aConvertir)}
        </p>
      )}
      {b.illisibles.length > 0 && (
        <div class="petit" data-testid="bibliotheque-illisibles">
          {TB.illisibles(b.illisibles.length)}
          <ul>
            {b.illisibles.slice(0, 6).map((x) => (
              <li key={x.nom}>
                {x.nom} : {x.raison}
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.ignores > 0 && (
        <p class="petit doux" data-testid="bibliotheque-ignores">
          {TB.ignores(b.ignores)}
        </p>
      )}
    </div>
  );
}

/** « Où ranger N fichiers ? » : 4 rayons, ou les laisser de côté. */
function DemandeRayon() {
  const ref = useRef<HTMLDialogElement>(null);
  const d = demandeRayon.value;
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  if (!d) return null;
  return (
    <dialog
      ref={ref}
      class="dialogue"
      aria-labelledby="demande-rayon-titre"
      onCancel={(e) => {
        e.preventDefault();
        void repondreRayon(null);
      }}
      data-testid="demande-rayon"
    >
      <h2 id="demande-rayon-titre">{TB.demandeTitre(d.sansRayon)}</h2>
      <p>{TB.demandeTexte}</p>
      <div class="demande-rayon-choix">
        {RAYONS.map((r) => (
          <button key={r} type="button" class="btn" onClick={() => void repondreRayon(r)} data-testid={`demande-rayon-${r}`}>
            {TB.rayons[r]}
          </button>
        ))}
      </div>
      <button type="button" class="btn btn-discret" onClick={() => void repondreRayon(null)} data-testid="demande-rayon-passer">
        {TB.passer}
      </button>
    </dialog>
  );
}
