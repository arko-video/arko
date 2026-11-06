// Outils « Fond vert » et « Mèmes » de Habiller : les clips du rayon (Ma bibliothèque) à poser à la tête de lecture,
// une recherche, et le lien vers Ma bibliothèque pour importer. Un clip posé (choisi sur la mini-frise ou juste posé)
// ouvre ses réglages à la place de la liste.

import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { chercher, type MonClip } from '../../../moteur/api';
import { TB } from '../../textes-bibliotheque';
import { chargerClips, mesClips, ouvrirBibliotheque } from '../../bibliotheque';
import { clipEnCours, incrustationChoisie, insererMemeCoupure, memeChoisi, poserIncrustation } from '../../clips-montage';
import { recetteAffichee } from '../../etat';
import { formatDuree } from '../../format';
import { Vignette } from '../bibliotheque/ListeRayon';
import { IconeImporter, IconePlus } from '../Icones';
import { ReglagesCoupure, ReglagesIncrustation } from './ReglagesIncrustation';

const requete = signal('');

function Liste({ rayon, actions }: { rayon: 'fondsVerts' | 'memes'; actions: (c: MonClip) => ComponentChildren }) {
  useEffect(() => void chargerClips(), []);
  const tous = (mesClips.value ?? []).filter((c) => c.rayon === rayon);
  const q = requete.value.trim();
  const liste = q ? chercher(tous, q, (c) => ({ nom: c.nom, autres: [c.etiquette] }), 500) : tous;
  const textes = rayon === 'fondsVerts' ? TB.fondVert : TB.memes;
  return (
    <>
      {tous.length > 6 && (
        <label class="champ-saisie">
          <span class="sr-only">{TB.chercher}</span>
          <input type="search" placeholder={TB.chercherIndice} value={requete.value} onInput={(e) => (requete.value = (e.currentTarget as HTMLInputElement).value)} data-testid={`${rayon}-recherche`} />
        </label>
      )}
      {mesClips.value !== null && tous.length === 0 && <p class="petit">{textes.vide}</p>}
      <ul class="liste-sons liste-clips" data-testid={`liste-${rayon}`}>
        {liste.map((c) => (
          <li key={c.id} class="son-ligne clip-ligne" data-testid={`clip-${c.id}`}>
            <span class="son-ecouter">
              <Vignette clip={c} />
              <span class="son-nom">
                {c.nom}
                {c.etiquette && <span class="son-etiquette">{c.etiquette}</span>}
              </span>
              <span class="chiffres petit doux">{clipEnCours.value === c.id ? <span class="rond-chargement" /> : formatDuree(c.duree)}</span>
            </span>
            {actions(c)}
          </li>
        ))}
      </ul>
      <button type="button" class="btn" onClick={() => ouvrirBibliotheque(rayon)} data-testid={`${rayon}-bibliotheque`}>
        <IconeImporter taille={18} />
        {textes.importer}
      </button>
    </>
  );
}

export function OutilFondVert() {
  const r = recetteAffichee.value;
  const i = incrustationChoisie.value;
  if (r && i !== null && r.incrustations?.[i]) return <ReglagesIncrustation i={i} />;
  return (
    <div class="outil" data-testid="outil-fond-vert">
      <p class="petit doux outil-aide">{TB.fondVert.aide}</p>
      <Liste
        rayon="fondsVerts"
        actions={(c) => (
          <button type="button" class="btn btn-icone son-ajouter" aria-label={TB.fondVert.poser(c.nom)} disabled={!!clipEnCours.value} onClick={() => void poserIncrustation(c, 'fondVert')} data-testid={`poser-fond-vert-${c.id}`}>
            <IconePlus taille={20} />
          </button>
        )}
      />
    </div>
  );
}

export function OutilMemes() {
  const r = recetteAffichee.value;
  const i = incrustationChoisie.value;
  if (r && i !== null && r.incrustations?.[i]) return <ReglagesIncrustation i={i} />;
  const p = memeChoisi.value;
  if (r && p !== null && r.plans[p]) return <ReglagesCoupure i={p} />;
  return (
    <div class="outil" data-testid="outil-memes">
      <p class="petit doux outil-aide">{TB.memes.aide}</p>
      <Liste
        rayon="memes"
        actions={(c) => (
          <span class="clip-actions">
            <button type="button" class="btn clip-action" aria-label={TB.memes.coupureNom(c.nom)} disabled={!!clipEnCours.value} onClick={() => void insererMemeCoupure(c)} data-testid={`meme-coupure-${c.id}`}>
              {TB.memes.coupure}
            </button>
            <button type="button" class="btn clip-action" aria-label={TB.memes.incrustationNom(c.nom)} disabled={!!clipEnCours.value} onClick={() => void poserIncrustation(c, 'meme')} data-testid={`meme-incrustation-${c.id}`}>
              {TB.memes.incrustation}
            </button>
          </span>
        )}
      />
    </div>
  );
}
