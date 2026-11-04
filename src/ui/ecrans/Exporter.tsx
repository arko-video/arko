// Étape 5 : créer le MP4. Avant (estimations, alertes) → pendant (progression) → après (aperçu, partage).

import { useEffect, useState } from 'preact/hooks';
import { estimerExport, type EstimationExport, type ResultatExport } from '../../moteur/api';
import { dureeFinale } from '../../recette/operations';
import { T } from '../../textes-fr';
import { InterrupteurZoneSure, ZoneSure } from '../composants/Apercu';
import { Entete } from '../composants/Entete';
import { IconeAlerte, IconeAmpoule, IconeHorloge, IconeNote, IconePartager, IconeTelecharger } from '../composants/Icones';
import { etatExport, recette, toutFermer, zoneSure } from '../etat';
import { demarrerExport, lireBatterie, retourAvantExport } from '../exportation';
import { formatDuree, formatTaille } from '../format';
import { formatDebutTikTok } from '../guide';
import { recommencer } from '../navigation';

/** Temps de création estimé : environ la durée du clip sur un téléphone récent (estimation grossière). */
const FACTEUR_TEMPS = 1.2;

export function Exporter() {
  const e = etatExport.value;
  return (
    <div class="ecran">
      <Entete titre={T.exporter.nom} ecran="exporter" retourDesactive={e.phase === 'encours'} />
      <main class="ecran-corps exporter">
        {e.phase === 'avant' && <Avant />}
        {e.phase === 'encours' && <Pendant p={e.p} resteS={e.resteS} annuler={e.annuler} />}
        {e.phase === 'erreur' && <Erreur message={e.message} code={e.code} absence={e.pendantAbsence} />}
        {e.phase === 'fini' && <Apres url={e.url} resultat={e.resultat} />}
      </main>
    </div>
  );
}

function Avant() {
  const r = recette.value;
  const [estimation, setEstimation] = useState<EstimationExport | null>(null);
  const [batterieFaible, setBatterieFaible] = useState(false);

  useEffect(() => {
    let vivant = true;
    if (r) estimerExport(r).then((x) => vivant && setEstimation(x)).catch((err) => console.error(err));
    lireBatterie().then((b) => vivant && setBatterieFaible(!!b && b.niveau < 0.2 && !b.enCharge));
    return () => {
      vivant = false;
    };
  }, [r]);

  if (!r) return null;
  const duree = estimation?.duree ?? dureeFinale(r);
  return (
    <>
      <h2 class="titre titre-etape">{T.exporter.titre}</h2>
      <ul class="resume" data-testid="resume-export">
        <li>
          <strong class="chiffres">{formatDuree(duree)}</strong>
        </li>
        <li>{estimation ? T.exporter.environTaille(formatTaille(estimation.tailleOctets)) : '…'}</li>
        <li>{T.exporter.environTemps(formatDuree(Math.max(5, duree * FACTEUR_TEMPS)))}</li>
      </ul>
      <p class="petit doux">{T.exporter.qualite}</p>

      {batterieFaible && (
        <div class="message message-alerte" role="alert" data-testid="alerte-batterie">
          <IconeAlerte />
          <span>{T.exporter.batterie}</span>
        </div>
      )}
      {estimation?.manqueDePlace && (
        <div class="message message-alerte" role="alert" data-testid="alerte-place">
          <IconeAlerte />
          <span>{T.exporter.place(formatTaille(estimation.tailleOctets * 1.3))}</span>
        </div>
      )}

      <div class="pousse" />
      <button type="button" class="btn btn-principal" onClick={demarrerExport} data-testid="creer-video">
        <IconeTelecharger />
        {T.exporter.creer}
      </button>
    </>
  );
}

/** Délai pendant lequel « Annuler l'export » ne réagit pas (évite qu'un double toucher sur « Créer » annule). */
const DELAI_ANNULER_MS = 800;

function Pendant({ p, resteS, annuler }: { p: number; resteS: number | null; annuler: () => void }) {
  const pc = Math.min(100, Math.max(0, Math.floor(p * 100)));
  const [annulable, setAnnulable] = useState(false);
  useEffect(() => {
    const m = setTimeout(() => setAnnulable(true), DELAI_ANNULER_MS);
    return () => clearTimeout(m);
  }, []);
  return (
    <>
      <h2 class="titre titre-etape" aria-live="polite" data-testid="progression-texte">
        {T.exporter.creation(pc)}
      </h2>
      <div
        class="progression"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pc}
        aria-label={T.exporter.creation(pc)}
        data-testid="progression"
      >
        <span style={{ width: `${pc}%` }} />
      </div>
      <div class="progression-ligne">
        <p class="doux chiffres">{resteS === null ? T.exporter.calcul : T.exporter.reste(formatDuree(resteS))}</p>
        {/* Bouton discret, en haut, loin de l'endroit où était « Créer la vidéo ». */}
        <button
          type="button"
          class="btn btn-discret btn-annuler-export"
          aria-disabled={!annulable}
          onClick={() => {
            if (annulable) annuler();
          }}
          data-testid="annuler-export"
        >
          {T.exporter.annuler}
        </button>
      </div>
      <div class="message message-info">
        <IconeHorloge />
        <span>{T.exporter.gardeOuvert}</span>
      </div>
    </>
  );
}

function Erreur({ message, code, absence }: { message: string; code: string; absence: boolean }) {
  const annule = code === 'annule';
  return (
    <>
      <h2 class="titre titre-etape">{T.exporter.titre}</h2>
      <div class={`message ${annule ? 'message-info' : 'message-erreur'}`} role="alert" data-testid="erreur-export">
        <IconeAlerte />
        <span class="message-corps">
          <span>{absence ? T.exporter.absence : message}</span>
          {!annule && !absence && message !== T.exporter.plantage && (
            <span class="petit">{T.exporter.plantage}</span>
          )}
        </span>
      </div>
      <div class="pousse" />
      <button
        type="button"
        class="btn btn-principal"
        onClick={annule ? retourAvantExport : demarrerExport}
        data-testid="reessayer"
      >
        {absence ? T.exporter.reprendre : annule ? T.exporter.creer : T.exporter.reessayer}
      </button>
    </>
  );
}

/** Le moteur peut joindre un avertissement au résultat (ex. son illisible : vidéo muette). */
function avertissementDe(r: ResultatExport): string | null {
  const a = (r as ResultatExport & { avertissement?: unknown }).avertissement;
  return typeof a === 'string' && a.trim() ? a : null;
}

/** Nom de secours si le moteur n'a pas nommé le fichier (le moteur le nomme arko-AAAAMMJJ-HHMMSS.mp4). */
const NOM_SECOURS = 'arko.mp4';

function Apres({ url, resultat }: { url: string; resultat: ResultatExport }) {
  const fichier = resultat.fichier;
  const avertissement = avertissementDe(resultat);
  // Le son guide n'est pas dans le MP4 : on rappelle où le démarrer dans TikTok.
  const guide = recette.value?.guide;
  const nom =fichier.name.endsWith('.mp4') ? fichier.name : NOM_SECOURS;
  const fichierPartage = fichier.name === nom ? fichier : new File([fichier], nom, { type: 'video/mp4' });
  const peutPartager =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichierPartage] });

  async function partager() {
    try {
      await navigator.share({ files: [fichierPartage], title: T.exporter.titrePartage });
    } catch {
      /* partage fermé par l'utilisateur */
    }
  }

  return (
    <>
      <h2 class="titre titre-etape" data-testid="video-prete">
        {T.exporter.pret}
      </h2>
      {avertissement && (
        <div class="message message-alerte" role="alert" data-testid="avertissement-export">
          <IconeAlerte />
          <span>{avertissement}</span>
        </div>
      )}
      {guide && (
        <div class="message message-alerte" role="note" data-testid="rappel-guide">
          <IconeNote />
          <strong>{T.guide.rappel(formatDebutTikTok(guide.debut ?? 0))}</strong>
        </div>
      )}
      <div class="apercu apercu-fini">
        <video src={url} autoplay loop muted playsInline controls={false} data-testid="video-finale" />
        {zoneSure.value && <ZoneSure />}
      </div>
      <InterrupteurZoneSure />
      <div class={peutPartager ? 'grille-2' : 'pile'}>
        {peutPartager && (
          <button type="button" class="btn btn-principal" onClick={partager} data-testid="partager">
            <IconePartager />
            {T.exporter.partager}
          </button>
        )}
        <a
          class={`btn ${peutPartager ? '' : 'btn-principal'}`}
          href={url}
          download={nom}
          data-testid="telecharger"
        >
          <IconeTelecharger />
          {T.exporter.telecharger}
        </a>
      </div>
      <p class="petit doux">{T.exporter.ouVaLeFichier}</p>
      <div class="message message-info">
        <IconeAmpoule />
        <span>{T.exporter.astuce}</span>
      </div>
      <button
        type="button"
        class="btn btn-discret"
        onClick={() => {
          void toutFermer();
          recommencer();
        }}
        data-testid="autre-clip"
      >
        {T.exporter.autreClip}
      </button>
    </>
  );
}
