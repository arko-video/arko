// « Mes montages » sur Importer : le dernier montage en haut, mis en avant, puis les autres.
// Chaque carte : vignette, titre, durée, date relative ; un toucher l'ouvre ; ⋮ = Renommer, Dupliquer, Montage express,
// Supprimer.

import { useState } from 'preact/hooks';
import type { ResumeProjet } from '../../moteur/api';
import { T } from '../../textes-fr';
import { TY } from '../../textes-youtube';
import { ouvrirExpress } from '../auto/express/etat-express';
import { destinationChoisie, ouvrirChoix } from '../destination';
import { sources } from '../etat';
import { formatDepuis, formatDuree } from '../format';
import { continuerMontage, dupliquerMontage, estOuvert, montages, renommerMontage, supprimerMontage } from '../montages';
import { Dialogue } from './Dialogue';
import { DialogueRenommer, FeuilleActions, type ActionMontage } from './DialoguesMontage';
import { IconeFleche } from './Icones';
import { IconeMenu } from './IconesRythme';

const NOMS_ETAPES: Record<string, string> = {
  couper: T.couper.nom,
  vertical: T.vertical.nom,
  habiller: T.habiller.nom,
  exporter: T.exporter.nom,
};

export function Chargement({ nom, etape }: { nom: string; etape: string }) {
  return (
    <span class="chargement" role="status" data-testid="chargement">
      <span class="spinner" aria-hidden="true" />
      <span class="chargement-nom">{nom}</span>
      <span class="petit doux">{etape}</span>
    </span>
  );
}

interface Props {
  occupe: boolean;
  /** Montage en cours d'ouverture (id) et son étape de chargement. */
  chargement: { id: string; nom: string; etape: string } | null;
  /** Ouvrir un montage fermé : l'écran Importer fait re-choisir la vidéo (puis le Montage express si `express`). */
  onRechoisir(m: ResumeProjet, express?: boolean): void;
}

export function MesMontages({ occupe, chargement, onRechoisir }: Props) {
  const [menu, setMenu] = useState<ResumeProjet | null>(null);
  const [dialogue, setDialogue] = useState<{ type: 'renommer' | 'supprimer'; m: ResumeProjet } | null>(null);
  const liste = montages.value;
  if (!liste || liste.length === 0) return null;

  function action(a: ActionMontage) {
    const m = menu;
    setMenu(null);
    if (!m) return;
    if (a === 'dupliquer') void dupliquerMontage(m);
    else if (a === 'express') {
      // Montage express sur la vidéo de ce montage (un NOUVEAU montage est créé, celui-ci reste tel quel).
      const video = sources.peek()[0];
      if (estOuvert(m.id) && video) void ouvrirExpress(video);
      else onRechoisir(m, true);
    } else setDialogue({ type: a, m });
  }

  return (
    <section class="montages" aria-labelledby="montages-titre" data-testid="mes-montages">
      <div class="montages-entete">
        <h2 id="montages-titre" class="montages-titre">
          {T.montages.titre}
        </h2>
        <button type="button" class="btn btn-discret btn-petit" onClick={ouvrirChoix} aria-label={TY.changerAide} data-testid="montages-changer-destination">
          {TY.pour(TY.noms[destinationChoisie.value ?? 'tiktok'])} · {TY.changer}
        </button>
      </div>
      <ul class="montages-liste">
        {liste.map((m, i) => {
          const ouvert = estOuvert(m.id);
          const charge = chargement?.id === m.id ? chargement : null;
          return (
            <li key={m.id} class="montage" data-vedette={i === 0 ? '1' : '0'} data-ouvert={ouvert ? '1' : '0'} data-testid={`montage-${i}`}>
              <button
                type="button"
                class="montage-ouvrir"
                disabled={occupe}
                aria-label={ouvert ? `${T.montages.continuer} : ${m.titre}` : T.montages.ouvrir(m.titre)}
                onClick={() => (ouvert ? continuerMontage() : onRechoisir(m))}
                data-testid={`montage-ouvrir-${i}`}
              >
                <span class="montage-vignette" aria-hidden="true">
                  {m.vignette && <img src={m.vignette} alt="" width={i === 0 ? 54 : 40} height={i === 0 ? 76 : 56} />}
                </span>
                {charge ? (
                  <Chargement nom={charge.nom} etape={charge.etape} />
                ) : (
                  <span class="montage-infos">
                    {i === 0 && <span class="montage-etiquette petit">{ouvert ? T.montages.enCours : T.montages.dernier}</span>}
                    <strong class="montage-titre" data-testid={`montage-titre-${i}`}>
                      {m.titre}
                    </strong>
                    {m.destination && (
                      <span class="badge-destination petit" data-testid={`montage-destination-${i}`}>
                        {TY.noms[m.destination]}
                      </span>
                    )}
                    <span class="petit doux chiffres">
                      {formatDuree(m.duree)} · {formatDepuis(m.modifieLe)}
                    </span>
                    {i === 0 && <span class="petit doux">{T.importer.arreteA((m.destination === 'youtube' && m.etape === 'vertical' ? TY.cadrage.nom : NOMS_ETAPES[m.etape]) ?? T.couper.nom)}</span>}
                  </span>
                )}
                {i === 0 && ouvert && !charge && <IconeFleche />}
              </button>
              <button
                type="button"
                class="btn btn-icone montage-menu"
                disabled={occupe}
                aria-label={T.montages.actions(m.titre)}
                aria-haspopup="dialog"
                onClick={() => setMenu(m)}
                data-testid={`montage-menu-${i}`}
              >
                <IconeMenu taille={22} />
              </button>
              {i === 0 && !ouvert && !charge && <p class="petit doux montage-aide">{T.montages.rechoisirAide(m.nomSource)}</p>}
            </li>
          );
        })}
      </ul>

      {menu && <FeuilleActions titre={menu.titre} onAction={action} onFermer={() => setMenu(null)} />}
      {dialogue?.type === 'renommer' && (
        <DialogueRenommer
          titre={dialogue.m.titre}
          onFermer={() => setDialogue(null)}
          onValider={(t) => {
            setDialogue(null);
            void renommerMontage(dialogue.m.id, t);
          }}
        />
      )}
      {dialogue?.type === 'supprimer' && (
        <Dialogue
          titre={T.montages.supprimerTitre(dialogue.m.titre)}
          texte={T.montages.supprimerTexte}
          confirmer={T.montages.supprimer}
          annuler={T.montages.garder}
          onAnnuler={() => setDialogue(null)}
          onConfirmer={() => {
            setDialogue(null);
            void supprimerMontage(dialogue.m.id);
          }}
          testid="dialogue-supprimer"
        />
      )}
    </section>
  );
}
