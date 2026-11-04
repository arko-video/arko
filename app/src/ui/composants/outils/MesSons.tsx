// Onglet « Mes sons » du panneau Sons : les sons gardés sur l'appareil pour TOUS les montages.
// - « Importer des sons » : plusieurs fichiers d'un coup, ou un .zip, avec une étiquette (« Memes »…) ;
// - le lien « Trouver des sons sur MyInstants ↗ » (nouvel onglet : c'est l'utilisateur qui télécharge) et 3 lignes d'aide ;
// - le rappel sur la responsabilité ; une recherche par mot (nom et étiquette) ;
// - chaque son : écouter, modifier (nom, étiquette, supprimer), « + » pour le poser à la tête de lecture.

import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { chercher, LIMITE_MES_SONS, type MonSon } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { arreterLecture, enChargement } from '../../ecoute-sons';
import { formatDuree } from '../../format';
import { chargerMesSons, ecouterMonSon, etiquetteImport, importerMesSons, mesSons, oublierMonSon, poserMonSon, progresImport, renommerMonSon } from '../../mes-sons';
import { Dialogue } from '../Dialogue';
import { IconeAlerte, IconeCrayon, IconeImporter, IconeLecture, IconePlus } from '../Icones';

/** Seul lien externe de Mes sons (ouvert dans un nouvel onglet, aucun téléchargement par Arko). */
export const LIEN_MYINSTANTS = 'https://www.myinstants.com/fr/index/fr/';
/** Types acceptés par « Importer des sons » : sons et .zip. */
export const ACCEPTE_SONS = 'audio/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.flac,.zip,application/zip';

/** Son en cours de modification (id), ou null. */
const sonEdite = signal<string | null>(null);
const requete = signal('');

export function MesSons() {
  useEffect(() => {
    void chargerMesSons();
  }, []);
  const q = requete.value.trim();
  const tous = mesSons.value;
  const liste = q ? chercher(tous, q, (s) => ({ nom: s.nom, autres: [s.etiquette] })) : tous;
  const place = tous.reduce((t, s) => t + s.taille, 0);
  return (
    <div class="mes-sons" data-testid="mes-sons">
      <p class="petit doux">{T.messons.intro}</p>
      <Importer />
      {tous.length > 0 && (
        <label class="champ-saisie">
          <span class="sr-only">{T.messons.chercher}</span>
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={T.messons.chercherIndice}
            value={requete.value}
            onInput={(e) => (requete.value = (e.currentTarget as HTMLInputElement).value)}
            data-testid="mes-sons-recherche"
          />
        </label>
      )}
      {q && (
        <p class="petit doux" aria-live="polite" data-testid="mes-sons-compte">
          {T.messons.resultats(liste.length)}
        </p>
      )}
      {tous.length === 0 && <p class="petit doux liste-sons-vide">{T.messons.vide}</p>}
      <ul id="liste-mes-sons" class="liste-sons" role="tabpanel" aria-labelledby="famille-onglet-messons" data-testid="liste-mes-sons">
        {liste.map((s) => (sonEdite.value === s.id ? <Editeur key={s.id} son={s} /> : <Ligne key={s.id} son={s} />))}
      </ul>
      <p class={place > LIMITE_MES_SONS * 0.9 ? 'petit' : 'petit doux'} data-testid="mes-sons-place">
        {T.messons.place((place / (1024 * 1024)).toFixed(1).replace('.', ','))}
      </p>
      <p class="petit droits-sons" data-testid="mes-sons-rappel">
        <IconeAlerte taille={14} />
        {T.messons.rappel}
      </p>
      <a class="btn mes-sons-lien" href={LIEN_MYINSTANTS} target="_blank" rel="noopener noreferrer" data-testid="mes-sons-myinstants">
        {T.messons.trouver} ↗<span class="sr-only"> {T.messons.nouvelOnglet}</span>
      </a>
      <ol class="petit doux mes-sons-aide">
        {T.messons.aide.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
    </div>
  );
}

/** Étiquette + « Importer des sons » (plusieurs fichiers ou un .zip) : deux gestes, toucher puis choisir. */
function Importer() {
  const enCours = progresImport.value;
  return (
    <>
      <div class="mes-sons-import">
        <label class="champ-saisie mes-sons-etiquette">
          <span class="petit doux">{T.messons.etiquette}</span>
          <input
            type="text"
            maxLength={60}
            value={etiquetteImport.value}
            onInput={(e) => (etiquetteImport.value = (e.currentTarget as HTMLInputElement).value)}
            data-testid="mes-sons-etiquette"
          />
        </label>
        <label class="btn btn-principal" data-occupe={enCours ? '1' : '0'} data-testid="mes-sons-importer">
          <IconeImporter taille={18} />
          {enCours ?? T.messons.importer}
          <input
            type="file"
            class="sr-only"
            multiple
            accept={ACCEPTE_SONS}
            disabled={!!enCours}
            onChange={(e) => {
              const input = e.currentTarget as HTMLInputElement;
              const fichiers = [...(input.files ?? [])];
              input.value = '';
              void importerMesSons(fichiers);
            }}
            data-testid="mes-sons-fichiers"
          />
        </label>
      </div>
      <p class="petit doux">{T.messons.importerAide}</p>
    </>
  );
}

function Ligne({ son }: { son: MonSon }) {
  const charge = enChargement.value === son.id;
  return (
    <li class="son-ligne" data-testid={`mon-son-${son.id}`}>
      <button
        type="button"
        class="son-ecouter"
        aria-label={T.sons.ecouter(son.nom)}
        aria-busy={charge}
        onClick={() => void ecouterMonSon(son)}
        data-testid={`mon-son-ecouter-${son.id}`}
      >
        <span class="son-lecture" aria-hidden="true">
          {charge ? <span class="rond-chargement" /> : <IconeLecture taille={16} />}
        </span>
        <span class="son-nom">
          {son.nom}
          {son.etiquette && <span class="son-etiquette">{son.etiquette}</span>}
        </span>
        <span class="chiffres petit doux">{formatDuree(son.duree)}</span>
      </button>
      <button
        type="button"
        class="btn btn-icone son-secondaire"
        aria-label={T.messons.modifier(son.nom)}
        onClick={() => (sonEdite.value = son.id)}
        data-testid={`mon-son-modifier-${son.id}`}
      >
        <IconeCrayon taille={18} />
      </button>
      <button
        type="button"
        class="btn btn-icone son-ajouter"
        aria-label={T.sons.ajouter(son.nom)}
        onClick={() => {
          arreterLecture();
          void poserMonSon(son);
        }}
        data-testid={`mon-son-ajouter-${son.id}`}
      >
        <IconePlus taille={20} />
      </button>
    </li>
  );
}

/** Modifier un son gardé, à la place de sa ligne : nom, étiquette, Supprimer (avec confirmation). */
function Editeur({ son }: { son: MonSon }) {
  const [nom, setNom] = useState(son.nom);
  const [etiquette, setEtiquette] = useState(son.etiquette);
  const [confirmer, setConfirmer] = useState(false);
  return (
    <li class="mon-son-editeur" data-testid="mon-son-editeur">
      <label class="champ-saisie">
        <span class="petit doux">{T.messons.nom}</span>
        <input type="text" maxLength={60} value={nom} onInput={(e) => setNom((e.currentTarget as HTMLInputElement).value)} data-testid="mon-son-nom" />
      </label>
      <label class="champ-saisie">
        <span class="petit doux">{T.messons.etiquette}</span>
        <input type="text" maxLength={60} value={etiquette} onInput={(e) => setEtiquette((e.currentTarget as HTMLInputElement).value)} data-testid="mon-son-etiquette" />
      </label>
      <div class="grille-2">
        <button type="button" class="btn" onClick={() => setConfirmer(true)} data-testid="mon-son-supprimer">
          {T.messons.supprimer}
        </button>
        <button
          type="button"
          class="btn btn-principal"
          onClick={() => void renommerMonSon(son.id, nom, etiquette).then(() => (sonEdite.value = null))}
          data-testid="mon-son-enregistrer"
        >
          {T.messons.enregistrer}
        </button>
      </div>
      {confirmer && (
        <Dialogue
          titre={T.messons.supprimerTitre(son.nom)}
          texte={T.messons.supprimerTexte}
          confirmer={T.messons.supprimer}
          annuler={T.annuler}
          onAnnuler={() => setConfirmer(false)}
          onConfirmer={() => {
            setConfirmer(false);
            sonEdite.value = null;
            void oublierMonSon(son);
          }}
          testid="dialogue-supprimer-son"
        />
      )}
    </li>
  );
}
