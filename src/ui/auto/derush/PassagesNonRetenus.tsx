// Écran « Passages pas retenus » (C, dev 1) : les passages notés par le derush mais pas gardés, triés par note ;
// Écouter (le son du passage dans la vidéo d'origine) et Ajouter d'un toucher (ajouterPassage : un seul Annuler).
// Best-of v4 (dev-ui) : le passage ajouté est coupé COMME le Best-of quand morceauxDuPassage est branché
// (branchements-v4.ts : mesures gardées + dev-coupes) ; sinon comme avant (Couper les blancs).

import { horodatage } from '../../../auto/express/scenes';
import { ajouterPassage, type ContextePassage } from '../../../recette/operations-derush';
import { BRANCHEMENTS } from '../express/branchements-v4';
import type { PassageNote } from '../../../recette/types';
import { transcriptionGardee } from '../../../sous-titres/transcription-longue';
import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import { afficherToast, modifier, recette, sources } from '../../etat';
import { arreterEcoute, ecouteEnCours, ecouterPassage } from '../voix/ecoute';
import { BoutonApercu, MiniApercu } from '../voix/MiniApercu';
import { fermerPassages, passagesOuverts } from './etat-derush';
import './derush.css';

const cle = (p: PassageNote) => `passage:${p.src ?? ''}:${p.de}:${p.a}`;

function fermer() {
  arreterEcoute();
  fermerPassages();
}

/** La vidéo ouverte d'un passage (absent = la 1re vidéo du montage). */
function videoDe(p: PassageNote) {
  const r = recette.peek();
  const id = p.src ?? r?.sources.find((s) => s.type === 'video')?.id;
  return sources.peek().find((s) => s.infos.id === id) ?? null;
}

function ecouter(p: PassageNote) {
  const v = videoDe(p);
  if (!v) return afficherToast(TV.derush.passages.pasDeVideo);
  void ecouterPassage(v.fichier, p.de, p.a, cle(p));
}

async function ajouter(p: PassageNote) {
  arreterEcoute();
  const titre = p.titre ?? TV.derush.passages.plage(horodatage(p.de), horodatage(p.a));
  // Les mots déjà transcrits de la vidéo (gardés sur l'appareil) : le passage est coupé comme le reste du montage
  // (Couper les blancs) et ses phrases rejoignent les sous-titres.
  const v = videoDe(p);
  const t = v ? await transcriptionGardee(v).catch(() => null) : null;
  const mots = t?.mots.some((m) => m[0].trim()) ? t.mots : undefined;
  const contexte: ContextePassage = mots ? { mots } : {};
  // Coupé comme le Best-of (sans réécouter) : `morceaux` est lu par ajouterPassage dès que l'intégrateur l'y ajoute
  // (demande du rapport dev-ui) ; avant, il est ignoré et l'ajout coupe comme d'habitude.
  const r0 = recette.peek();
  const morceaux = BRANCHEMENTS.morceauxPassage && r0 ? await BRANCHEMENTS.morceauxPassage(r0, p, mots).catch(() => null) : null;
  if (morceaux && morceaux.length > 0) Object.assign(contexte, { morceaux });
  const fait = modifier((r) => ajouterPassage(r, p, contexte).recette);
  afficherToast(fait ? TV.derush.passages.ajoute(titre) : TV.derush.passages.dejaLa);
}

export function PassagesNonRetenus() {
  if (!passagesOuverts.value) return null;
  const passages = recette.value?.derush?.passages ?? [];
  const enCours = ecouteEnCours.value;
  return (
    <div class="bibliotheque-fond" data-testid="v3-passages">
      <div class="ecran bibliotheque">
        <header class="entete">
          <button type="button" class="btn btn-icone" aria-label={TV.derush.passages.titre} onClick={fermer} data-testid="v3-passages-fermer">
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{TV.derush.passages.titre}</h1>
        </header>
        <main class="ecran-corps">
          <p class="petit doux">{passages.length > 0 ? TV.derush.passages.aide : TV.derush.passages.vide}</p>
          <ul class="liste-passages">
            {passages.map((p, k) => (
              <li key={cle(p)} class="passage" data-testid={`v3-passage-${k}`} data-de={p.de} data-a={p.a} data-note={p.note}>
                <div class="passage-haut">
                  <strong class="passage-titre">{p.titre ?? TV.derush.passages.plage(horodatage(p.de), horodatage(p.a))}</strong>
                  <span class="passage-note chiffres">{TV.derush.passages.note(p.note)}</span>
                </div>
                <span class="petit chiffres">{TV.derush.passages.plage(horodatage(p.de), horodatage(p.a))}</span>
                {p.raison && <span class="petit doux">{p.raison}</span>}
                <div class="passage-boutons">
                  <button type="button" class="btn" onClick={() => ecouter(p)} aria-pressed={enCours === cle(p)} data-testid={`v3-passage-ecouter-${k}`}>
                    {enCours === cle(p) ? TV.derush.passages.arreter : TV.derush.passages.ecouter}
                  </button>
                  <BoutonApercu cle={`apercu:${cle(p)}`} actif={!!videoDe(p)} testid={`v3-passage-voir-${k}`} />
                  <button type="button" class="btn btn-principal" onClick={() => void ajouter(p)} data-testid={`v3-passage-ajouter-${k}`}>
                    {TV.derush.passages.ajouter}
                  </button>
                </div>
                {(() => {
                  const v = videoDe(p);
                  return v ? <MiniApercu fichier={v.fichier} de={p.de} a={p.a} cle={`apercu:${cle(p)}`} /> : null;
                })()}
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}
