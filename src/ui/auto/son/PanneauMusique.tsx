// Panneau « Musique » de fond (F, dev 3 ; dev-musique), dans Habiller → Sons : les morceaux (Mes sons, fichier, ou
// « Musiques d'Arko » : Kevin MacLeod et musiques fabriquées ; 12 au plus, le 1er au début, les suivants à la tête de
// lecture), Remplacer un morceau (même place), Retirer, baisse quand on parle (et « même quand la voix est faible »),
// volume, rappels de licence (crédit CC BY à copier, alerte musiques de jeux). Tout passe par
// recette/operations-son-auto.ts (un geste = un Annuler).

import { useEffect, useState } from 'preact/hooks';
import { avisMusique } from '../../../auto/son/credits';
import { candidatsArko, candidatsKevin, MORCEAUX_KEVIN } from '../../../auto/son/musique-auto';
import { chercher, estBruitage } from '../../../moteur/api';
import { TB } from '../../textes-bibliotheque';
import { ouvrirBibliotheque } from '../../bibliotheque';
import { MUSIQUE } from '../../../recette/normaliser-auto-son';
import { TA } from '../../../textes-auto';
import { afficherToast, recetteAffichee } from '../../etat';
import { arreterLecture, enChargement } from '../../ecoute-sons';
import { formatTemps } from '../../format';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { CurseurValeur, Interrupteur, Onglets } from '../../composants/outils/Reglages';
import { IconeImporter, IconeLecture, IconePlus, IconePoubelle, IconeRetour } from '../../composants/Icones';
import {
  ajouterMorceau,
  attenteSon,
  chargerMusiquesArko,
  ecouterPropose,
  kevinSurAppareil,
  morceauARemplacer,
  panneauSonAuto,
  reglerMusique,
  retirerMorceau,
  retirerMusique,
  volEnDb,
} from './etat-son';

const TX = TA.son.musique;

export function PanneauMusique() {
  useEffect(() => {
    void chargerMesSons();
    void chargerMusiquesArko();
    return () => void (morceauARemplacer.value = null);
  }, []);
  const [requete, setRequete] = useState('');
  const [onglet, setOnglet] = useState<'musiques' | 'bruitages' | 'arko' | null>(null);
  const remplace = morceauARemplacer.value;
  const actionAjout = (nom: string) => (remplace !== null ? `${TX.remplacer} : ${nom}` : `${TX.ajouter} ${nom}`);
  const r = recetteAffichee.value;
  const piste = r?.musique;
  const noms = (piste?.morceaux ?? []).map((m) => r?.sources.find((s) => s.id === m.src)?.nom ?? m.src);
  const avis = avisMusique(noms);
  // Ma bibliothèque : le rayon Musiques d'abord (onglet Bruitages pour les anciens sons longs).
  const musiques = mesSons.value.filter((x) => x.rayon === 'musiques');
  const ongletVu = onglet ?? (musiques.length > 0 ? 'musiques' : 'bruitages');
  const tous = ongletVu === 'musiques' ? musiques : ongletVu === 'bruitages' ? mesSons.value.filter(estBruitage) : [];
  const liste = (requete.trim() ? chercher(tous, requete, (s) => ({ nom: s.nom, autres: [s.etiquette] })) : tous).slice(0, 30);
  return (
    <div class="outil" data-testid="panneau-musique">
      <div class="panneau-mot-entete">
        <button type="button" class="btn btn-discret" onClick={() => (arreterLecture(), (panneauSonAuto.value = null))} data-testid="musique-retour">
          <IconeRetour taille={18} />
          {TA.son.bruitages.fermer}
        </button>
      </div>
      <h3 class="reglages-titre">{TX.titre}</h3>
      <p class="petit doux">{TX.aide}</p>
      {attenteSon.value && (
        <p class="petit" aria-live="polite">
          <span class="rond-chargement" /> {attenteSon.value}
        </p>
      )}

      {!piste && <p class="petit" data-testid="musique-aucune">{TX.aucune}</p>}
      {piste && (
        <ul class="liste-sons" data-testid="musique-morceaux">
          {piste.morceaux.map((m, i) => (
            <li key={`${m.src}-${m.t}`} class="son-ligne" data-testid={`musique-morceau-${i}`}>
              <span class="son-nom">
                {noms[i]}
                <span class="son-etiquette">{TX.morceau(i + 1, formatTemps(m.t))}</span>
              </span>
              <button
                type="button"
                class="btn btn-discret son-secondaire"
                aria-label={TX.remplacerCe(i + 1)}
                aria-pressed={remplace === i}
                onClick={() => (morceauARemplacer.value = remplace === i ? null : i)}
                data-testid={`musique-remplacer-${i}`}
              >
                {TX.remplacer}
              </button>
              <button type="button" class="btn btn-icone son-secondaire" aria-label={`${TX.retirerMorceau} ${i + 1}`} onClick={() => retirerMorceau(i)} data-testid={`musique-retirer-${i}`}>
                <IconePoubelle taille={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {piste && (
        <>
          <Interrupteur titre={TX.baisse} actif={piste.baisse !== false} onChange={(v) => reglerMusique({ baisse: v })} testid="musique-baisse" />
          {piste.baisse !== false && (
            <Interrupteur
              titre={TX.baisseParole}
              aide={TX.baisseParoleAide}
              actif={piste.baisseSur === 'parole'}
              onChange={(v) => reglerMusique({ baisseSur: v ? 'parole' : undefined })}
              testid="musique-baisse-parole"
            />
          )}
          <CurseurValeur
            label={TX.volume}
            min={-30}
            max={-6}
            step={1}
            valeur={volEnDb(piste.vol ?? MUSIQUE.vol)}
            format={(v) => `${v < 0 ? '−' : ''}${Math.abs(v)} dB`}
            onValider={(v) => reglerMusique({ vol: Math.round(Math.pow(10, v / 20) * 100) / 100 })}
            testid="musique-volume"
          />
        </>
      )}

      {avis.credits.length > 0 && (
        <div class="musique-credit" data-testid="musique-credit">
          <p class="petit">{TX.credit}</p>
          <pre class="petit">{avis.credits.join('\n\n')}</pre>
          <button
            type="button"
            class="btn"
            onClick={() => void navigator.clipboard?.writeText(avis.credits.join('\n\n')).then(() => afficherToast(TX.copie), () => undefined)}
            data-testid="musique-copier"
          >
            {TX.copier}
          </button>
        </div>
      )}
      {avis.alertes.map((a) => (
        <p key={a} class="petit droits-sons" data-testid="musique-alerte">
          {a}
        </p>
      ))}

      <h3 class="outil-sous-titre">{TX.choisir}</h3>
      {remplace !== null && piste?.morceaux[remplace] && (
        <p class="petit message message-info" data-testid="musique-remplacer-aide">
          {TX.remplacerQuoi(remplace + 1)}{' '}
          <button type="button" class="btn btn-discret" onClick={() => (morceauARemplacer.value = null)} data-testid="musique-remplacer-annuler">
            {TX.annulerRemplacer}
          </button>
        </p>
      )}
      <Onglets
        label={TX.choisir}
        onglets={[
          { id: 'musiques', nom: TB.musiques.onglet },
          { id: 'bruitages', nom: TB.musiques.ongletBruitages },
          { id: 'arko', nom: TX.ongletArko },
        ]}
        actif={ongletVu}
        onChoisir={(id) => setOnglet(id as 'musiques' | 'bruitages' | 'arko')}
        prefixe="musique-rayon"
        panneau="musique-mes-sons"
      />
      {ongletVu === 'musiques' && musiques.length === 0 && <p class="petit doux" data-testid="musique-rayon-vide">{TB.musiques.vide}</p>}
      {ongletVu === 'arko' && <MusiquesArko action={actionAjout} />}
      {tous.length > 6 && (
        <label class="champ-saisie">
          <span class="sr-only">{TA.son.bruitages.mesSons}</span>
          <input type="search" value={requete} onInput={(e) => setRequete((e.currentTarget as HTMLInputElement).value)} data-testid="musique-recherche" />
        </label>
      )}
      {ongletVu !== 'arko' && (
        <ul id="musique-mes-sons" class="liste-sons" role="tabpanel" data-testid="musique-mes-sons">
          {liste.map((s) => (
            <li key={s.id} class="son-ligne">
              <span class="son-nom">
                {s.nom}
                {s.etiquette && <span class="son-etiquette">{s.etiquette}</span>}
              </span>
              <span class="chiffres petit doux">{formatTemps(s.duree)}</span>
              <button type="button" class="btn btn-icone son-ajouter" aria-label={actionAjout(s.nom)} disabled={!!attenteSon.value} onClick={() => void ajouterMorceau({ monSon: s })} data-testid={`musique-ajouter-${s.id}`}>
                <IconePlus taille={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn" onClick={() => ouvrirBibliotheque('musiques')} data-testid="musique-bibliotheque">
        <IconeImporter taille={18} />
        {TB.ouvrir}
      </button>
      <label class="btn" data-testid="musique-fichier">
        <IconeImporter taille={18} />
        {TX.fichier}
        <input
          type="file"
          class="sr-only"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
          onChange={(e) => {
            const input = e.currentTarget as HTMLInputElement;
            const f = input.files?.[0];
            input.value = '';
            if (f) void ajouterMorceau({ fichier: f });
          }}
          data-testid="musique-fichier-input"
        />
      </label>
      {piste && (
        <button type="button" class="btn outil-supprimer" onClick={retirerMusique} data-testid="musique-retirer">
          <IconePoubelle taille={18} />
          {TX.retirer}
        </button>
      )}
    </div>
  );
}

/** Onglet « Musiques d'Arko » : les morceaux de Kevin MacLeod (téléchargés à la demande) et les musiques fabriquées. */
function MusiquesArko({ action }: { action: (nom: string) => string }) {
  const gardes = kevinSurAppareil.value;
  const enLigne = typeof navigator === 'undefined' || navigator.onLine !== false;
  const kevin = candidatsKevin();
  const arko = candidatsArko();
  const ligne = (id: string, nom: string, detail: string, possible: boolean) => {
    const charge = enChargement.value === id;
    return (
      <li key={id} class="son-ligne" data-testid={`musique-arko-${id}`}>
        <button type="button" class="son-ecouter" aria-label={TX.ecouter(nom)} aria-busy={charge} disabled={!possible || !!attenteSon.value} onClick={() => void ecouterPropose(id)}>
          <span class="son-lecture" aria-hidden="true">
            {charge ? <span class="rond-chargement" /> : <IconeLecture taille={16} />}
          </span>
          <span class="son-nom">
            {nom}
            <span class="son-etiquette">{detail}</span>
          </span>
        </button>
        <button type="button" class="btn btn-icone son-ajouter" aria-label={action(nom)} disabled={!possible || !!attenteSon.value} onClick={() => void ajouterMorceau({ propose: id })} data-testid={`musique-arko-ajouter-${id}`}>
          <IconePlus taille={20} />
        </button>
      </li>
    );
  };
  return (
    <div id="musique-arko" role="tabpanel" data-testid="musique-arko">
      <p class="petit doux">{TX.arkoAide}</p>
      <h4 class="petit">{TX.kevin}</h4>
      <ul class="liste-sons">
        {kevin.map((c) => {
          const m = MORCEAUX_KEVIN.find((x) => `kevin:${x.id}` === c.id)!;
          const ici = gardes.has(m.id);
          return ligne(c.id, m.titre, `${m.ambiances.map((a) => TX.ambiances[a]).join(', ')} · ${formatTemps(m.duree)} · ${ici ? TX.surAppareil : TX.aTelecharger}`, ici || enLigne);
        })}
      </ul>
      <h4 class="petit">{TX.fabriquees}</h4>
      <ul class="liste-sons">{arko.map((c) => ligne(c.id, c.nom.replace(/^Musique Arko - /, '').replace(/\.wav$/, ''), `${TX.ambiances[c.ambiances[0]!]} · ${TX.boucle}`, true))}</ul>
    </div>
  );
}
