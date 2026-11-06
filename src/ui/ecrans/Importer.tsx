// Étape 1 : choisir une vidéo. Pas de bouton Suivant : choisir une vidéo fait avancer (nouveau montage ;
// le montage ouvert reste dans « Mes montages »). Toucher un montage l'ouvre : on re-choisit sa vidéo (contrôlée
// par empreinte), sauf s'il est déjà ouvert dans cette session.

import { ouvrirBibliotheque } from '../bibliotheque';
import { IconeBibliotheque } from '../composants/IconesBibliotheque';
import { TB } from '../textes-bibliotheque';
import { useEffect, useRef, useState } from 'preact/hooks';
import { capacites, ErreurArko, ouvrirSource, type ResumeProjet } from '../../moteur/api';
import { T } from '../../textes-fr';
import { ouvrirAide } from '../aide';
import { ConseilsDepart } from '../composants/ConseilsDepart';
import { Entete } from '../composants/Entete';
import { PastilleDestination } from './Depart';
import { IconeAlerte, IconeImporter } from '../composants/Icones';
import { Chargement, MesMontages } from '../composants/MesMontages';
import { CarteRevue, ChoixMonteur } from '../composants/monteur/EntreeMonteur';
import { demarrerMontage, montages, ouvrirMontage, rafraichirMontages } from '../montages';
import { fermerChoix, proposerMonteur } from '../monteur/entree-monteur';
import { choixVisible, SEUIL_LONGUE } from '../monteur/etat-monteur';
import { chargerRevue } from '../monteur/revue-monteur';
import { ouvrirExpress } from '../auto/express/etat-express';
import { sources } from '../etat';

function messageErreur(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return T.erreurInconnue;
}

export function Importer() {
  const input = useRef<HTMLInputElement>(null);
  const [bloquant, setBloquant] = useState<string | null>(null);
  const [chargement, setChargement] = useState<{ id: string | null; nom: string; etape: string } | null>(
    null,
  );
  const [erreur, setErreur] = useState<string | null>(null);
  /** Montage à ouvrir avec le prochain fichier choisi (null : nouveau montage), et le Montage express ensuite. */
  const cible = useRef<ResumeProjet | null>(null);
  const pourExpress = useRef(false);
  const [survol, setSurvol] = useState(false);

  useEffect(() => {
    let vivant = true;
    capacites()
      .then((c) => vivant && setBloquant(c.bloquant))
      .catch((e) => console.error(e));
    void rafraichirMontages();
    void chargerRevue();
    return () => {
      vivant = false;
    };
  }, []);

  function ouvrirSelecteur(m: ResumeProjet | null, express = false) {
    cible.current = m;
    pourExpress.current = express;
    setErreur(null);
    if (input.current) {
      input.current.value = '';
      input.current.click();
    }
  }

  async function fichierChoisi(fichier: File) {
    const m = cible.current;
    setErreur(null);
    const progression = (etape: string) => setChargement({ id: m?.id ?? null, nom: fichier.name, etape });
    progression(T.importer.chargement);
    try {
      if (m) {
        const refus = await ouvrirMontage(m.id, fichier, progression);
        if (refus) setErreur(refus);
        else if (pourExpress.current && sources.peek()[0]) await ouvrirExpress(sources.peek()[0]!);
      } else {
        fermerChoix();
        const source = await ouvrirSource(fichier, progression);
        // Longue vidéo (plus de 5 min) : on propose le monteur IA.
        if (source.infos.duree > SEUIL_LONGUE) proposerMonteur(source);
        else await demarrerMontage(source);
      }
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(null);
    }
  }

  const occupe = chargement !== null;
  const aDesMontages = (montages.value?.length ?? 0) > 0;

  function deposer(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    if (occupe || bloquant) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      cible.current = null;
      pourExpress.current = false;
      void fichierChoisi(f);
    }
  }

  return (
    <div class="ecran">
      <Entete titre={T.nomsEtapes[0]} ecran="importer" avecRetour={false} onAide={ouvrirAide} />
      <main class="ecran-corps">
        <div class="importer-titres">
          <h1 class="titre">{T.importer.titre}</h1>
          <p class="intro">{T.importer.intro}</p>
          <PastilleDestination />
        </div>

        {bloquant && (
          <div class="message message-erreur" role="alert" data-testid="bloquant">
            <IconeAlerte />
            <span>{bloquant}</span>
          </div>
        )}

        <ConseilsDepart />
        <ChoixMonteur occupe={occupe} />

        <input
          ref={input}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (f) void fichierChoisi(f);
          }}
          data-testid="fichier"
        />

        <button
          type="button"
          class="zone-import"
          disabled={occupe || bloquant !== null}
          aria-busy={occupe}
          data-survol={survol ? '1' : '0'}
          data-compact={aDesMontages || choixVisible.value ? '1' : '0'}
          onClick={() => ouvrirSelecteur(null)}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={deposer}
          data-testid="choisir-video"
        >
          {chargement && chargement.id === null ? (
            <Chargement nom={chargement.nom} etape={chargement.etape} />
          ) : (
            <>
              <span class="zone-import-icone">
                <IconeImporter taille={30} />
              </span>
              <span class="zone-import-texte">
                {survol
                  ? T.importer.deposer
                  : choixVisible.value
                    ? T.monteur.autreVideo
                    : aDesMontages
                      ? T.montages.nouveau
                      : T.importer.choisir}
              </span>
              <span class="petit doux">
                {aDesMontages ? `${T.importer.choisir} · ${T.importer.formats}` : T.importer.formats}
              </span>
            </>
          )}
        </button>

        <CarteRevue occupe={occupe} />

        {erreur && (
          <div class="message message-erreur" role="alert" data-testid="erreur-import">
            <IconeAlerte />
            <span>{erreur}</span>
          </div>
        )}

        {/* Ma bibliothèque : sons, musiques, fonds verts et mèmes gardés sur l'appareil. */}
        <button type="button" class="btn bouton-bibliotheque" onClick={() => ouvrirBibliotheque()} data-testid="ouvrir-bibliotheque">
          <IconeBibliotheque taille={20} />
          <span>
            <strong>{TB.accueil}</strong>
            <span class="petit doux">{TB.accueilAide}</span>
          </span>
        </button>

        <MesMontages
          occupe={occupe}
          chargement={
            chargement?.id ? { id: chargement.id, nom: chargement.nom, etape: chargement.etape } : null
          }
          onRechoisir={ouvrirSelecteur}
        />
      </main>
    </div>
  );
}
