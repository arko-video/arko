// Liste d'un rayon de Ma bibliothèque : recherche (nom, dossier), écouter un son, petite image d'un clip (avec
// « fond vert » s'il en a un), modifier (nom, dossier ; un son peut changer de rayon), supprimer, place utilisée.

import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { estRayonVideo, type Rayon } from '../../../bibliotheque/rayons';
import { chercher, rayonDuSon, type MonClip, type MonSon } from '../../../moteur/api';
import { TB } from '../../textes-bibliotheque';
import { changerRayonSon, mesClips, oublierClip, placeAppareil, renommerClip } from '../../bibliotheque';
import { enChargement } from '../../ecoute-sons';
import { formatDuree } from '../../format';
import { ecouterMonSon, mesSons, oublierMonSon, renommerMonSon } from '../../mes-sons';
import { Dialogue } from '../Dialogue';
import { IconeCrayon, IconeLecture } from '../Icones';

/** Un élément de rayon, son ou clip. */
interface Element {
  id: string;
  nom: string;
  etiquette: string;
  duree: number;
  taille: number;
  son?: MonSon;
  clip?: MonClip;
}

const requete = signal('');
const edite = signal<string | null>(null);

const mo = (o: number) => (o / (1024 * 1024)).toFixed(1).replace('.', ',');

/** Éléments d'un rayon (pur : sert aussi aux outils Fond vert et Mèmes). */
export function elementsDuRayon(rayon: Rayon, sons: readonly MonSon[], clips: readonly MonClip[]): Element[] {
  if (estRayonVideo(rayon)) return clips.filter((c) => c.rayon === rayon).map((c) => ({ id: c.id, nom: c.nom, etiquette: c.etiquette, duree: c.duree, taille: c.taille, clip: c }));
  return sons.filter((s) => rayonDuSon(s) === rayon).map((s) => ({ id: s.id, nom: s.nom, etiquette: s.etiquette, duree: s.duree, taille: s.taille, son: s }));
}

export function ListeRayon({ rayon }: { rayon: Rayon }) {
  const tous = elementsDuRayon(rayon, mesSons.value, mesClips.value ?? []);
  const q = requete.value.trim();
  const liste = q ? chercher(tous, q, (e) => ({ nom: e.nom, autres: [e.etiquette] }), 500) : tous;
  const place = tous.reduce((t, e) => t + e.taille, 0);
  const libre = placeAppareil.value;
  return (
    <div class="liste-rayon">
      {tous.length > 0 && (
        <label class="champ-saisie">
          <span class="sr-only">{TB.chercher}</span>
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={TB.chercherIndice}
            value={requete.value}
            onInput={(e) => (requete.value = (e.currentTarget as HTMLInputElement).value)}
            data-testid="bibliotheque-recherche"
          />
        </label>
      )}
      {q && <p class="petit doux" aria-live="polite">{TB.resultats(liste.length)}</p>}
      {tous.length === 0 && <p class="petit doux">{TB.vide}</p>}
      <ul id="liste-rayon" class="liste-sons" role="tabpanel" aria-labelledby={`rayon-onglet-${rayon}`} data-testid={`liste-rayon-${rayon}`}>
        {liste.map((e) => (edite.value === e.id ? <Editeur key={e.id} e={e} /> : <Ligne key={e.id} e={e} />))}
      </ul>
      <p class="petit doux" data-testid="bibliotheque-place">
        {TB.place(mo(place), libre !== null ? `${(libre / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} Go` : null)}
      </p>
    </div>
  );
}

/** Petite image d'un clip (ou un rectangle vide), avec la pastille « fond vert ». */
export function Vignette({ clip }: { clip: MonClip }) {
  return (
    <span class="clip-vignette" aria-hidden="true">
      {clip.vignette ? <img src={clip.vignette} alt="" loading="lazy" /> : <span class="clip-vignette-vide" />}
      {clip.fond && <span class={`clip-fond clip-fond-${clip.fond.type}`}>{clip.fond.type === 'vert' ? TB.fondDetecte : TB.fondBleu}</span>}
    </span>
  );
}

function Ligne({ e }: { e: Element }) {
  const charge = enChargement.value === e.id;
  const corps = (
    <>
      {e.clip ? (
        <Vignette clip={e.clip} />
      ) : (
        <span class="son-lecture" aria-hidden="true">
          {charge ? <span class="rond-chargement" /> : <IconeLecture taille={16} />}
        </span>
      )}
      <span class="son-nom">
        {e.nom}
        {e.etiquette && <span class="son-etiquette">{e.etiquette}</span>}
      </span>
      <span class="chiffres petit doux">{formatDuree(e.duree)}</span>
    </>
  );
  return (
    <li class="son-ligne" data-testid={`element-${e.id}`}>
      {e.son ? (
        <button type="button" class="son-ecouter" aria-busy={charge} onClick={() => void ecouterMonSon(e.son!)} data-testid={`element-ecouter-${e.id}`}>
          {corps}
        </button>
      ) : (
        <span class="son-ecouter">{corps}</span>
      )}
      <button type="button" class="btn btn-icone son-secondaire" aria-label={TB.modifier(e.nom)} onClick={() => (edite.value = e.id)} data-testid={`element-modifier-${e.id}`}>
        <IconeCrayon taille={18} />
      </button>
    </li>
  );
}

function Editeur({ e }: { e: Element }) {
  const [nom, setNom] = useState(e.nom);
  const [etiquette, setEtiquette] = useState(e.etiquette);
  const [confirmer, setConfirmer] = useState(false);
  const enregistrer = async () => {
    if (e.clip) await renommerClip(e.id, nom, etiquette);
    else await renommerMonSon(e.id, nom, etiquette);
    edite.value = null;
  };
  return (
    <li class="mon-son-editeur" data-testid="element-editeur">
      <label class="champ-saisie">
        <span class="petit doux">{TB.nom}</span>
        <input type="text" maxLength={60} value={nom} onInput={(x) => setNom((x.currentTarget as HTMLInputElement).value)} data-testid="element-nom" />
      </label>
      <label class="champ-saisie">
        <span class="petit doux">{TB.etiquette}</span>
        <input type="text" maxLength={60} value={etiquette} onInput={(x) => setEtiquette((x.currentTarget as HTMLInputElement).value)} />
      </label>
      {e.son && (
        <button
          type="button"
          class="btn"
          onClick={() => void changerRayonSon(e.id, rayonDuSon(e.son!) === 'musiques' ? 'bruitages' : 'musiques').then(() => (edite.value = null))}
          data-testid="element-changer-rayon"
        >
          → {rayonDuSon(e.son) === 'musiques' ? TB.rayons.bruitages : TB.rayons.musiques}
        </button>
      )}
      <div class="grille-2">
        <button type="button" class="btn" onClick={() => setConfirmer(true)} data-testid="element-supprimer">
          {TB.supprimer}
        </button>
        <button type="button" class="btn btn-principal" onClick={() => void enregistrer()} data-testid="element-enregistrer">
          {TB.enregistrer}
        </button>
      </div>
      {confirmer && (
        <Dialogue
          titre={TB.supprimerTitre(e.nom)}
          texte={TB.supprimerTexte}
          confirmer={TB.supprimer}
          annuler={TB.reglages.retour}
          onAnnuler={() => setConfirmer(false)}
          onConfirmer={() => {
            setConfirmer(false);
            edite.value = null;
            if (e.clip) void oublierClip(e.clip);
            else if (e.son) void oublierMonSon(e.son);
          }}
          testid="dialogue-supprimer-element"
        />
      )}
    </li>
  );
}
