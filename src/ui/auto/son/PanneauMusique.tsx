// Panneau « Musique » de fond (F, dev 3), dans Habiller → Sons : les morceaux (Mes sons ou fichier, 6 au plus, le
// 1er au début, les suivants à la tête de lecture), baisse quand on parle, volume, rappels de licence (crédit CC BY à
// copier, alerte musiques de jeux), Retirer. Tout passe par recette/operations-son-auto.ts (un seul Annuler).

import { useEffect, useState } from 'preact/hooks';
import { avisMusique } from '../../../auto/son/credits';
import { chercher, estBruitage } from '../../../moteur/api';
import { TB } from '../../textes-bibliotheque';
import { ouvrirBibliotheque } from '../../bibliotheque';
import { MUSIQUE } from '../../../recette/normaliser-auto-son';
import { TA } from '../../../textes-auto';
import { afficherToast, recetteAffichee } from '../../etat';
import { arreterLecture } from '../../ecoute-sons';
import { formatTemps } from '../../format';
import { chargerMesSons, mesSons } from '../../mes-sons';
import { CurseurValeur, Interrupteur, Onglets } from '../../composants/outils/Reglages';
import { IconeImporter, IconePlus, IconePoubelle, IconeRetour } from '../../composants/Icones';
import { ajouterMorceau, attenteSon, panneauSonAuto, reglerMusique, retirerMorceau, retirerMusique, volEnDb } from './etat-son';

const TX = TA.son.musique;

export function PanneauMusique() {
  useEffect(() => void chargerMesSons(), []);
  const [requete, setRequete] = useState('');
  const [onglet, setOnglet] = useState<'musiques' | 'bruitages' | null>(null);
  const r = recetteAffichee.value;
  const piste = r?.musique;
  const noms = (piste?.morceaux ?? []).map((m) => r?.sources.find((s) => s.id === m.src)?.nom ?? m.src);
  const avis = avisMusique(noms);
  // Ma bibliothèque : le rayon Musiques d'abord (onglet Bruitages pour les anciens sons longs).
  const musiques = mesSons.value.filter((x) => x.rayon === 'musiques');
  const ongletVu = onglet ?? (musiques.length > 0 ? 'musiques' : 'bruitages');
  const tous = ongletVu === 'musiques' ? musiques : mesSons.value.filter(estBruitage);
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
          <pre class="petit">{avis.credits.join('\n')}</pre>
          <button
            type="button"
            class="btn"
            onClick={() => void navigator.clipboard?.writeText(avis.credits.join('\n')).then(() => afficherToast(TX.copie), () => undefined)}
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
      <Onglets
        label={TX.choisir}
        onglets={[
          { id: 'musiques', nom: TB.musiques.onglet },
          { id: 'bruitages', nom: TB.musiques.ongletBruitages },
        ]}
        actif={ongletVu}
        onChoisir={(id) => setOnglet(id as 'musiques' | 'bruitages')}
        prefixe="musique-rayon"
        panneau="musique-mes-sons"
      />
      {ongletVu === 'musiques' && musiques.length === 0 && <p class="petit doux" data-testid="musique-rayon-vide">{TB.musiques.vide}</p>}
      {tous.length > 6 && (
        <label class="champ-saisie">
          <span class="sr-only">{TA.son.bruitages.mesSons}</span>
          <input type="search" value={requete} onInput={(e) => setRequete((e.currentTarget as HTMLInputElement).value)} data-testid="musique-recherche" />
        </label>
      )}
      <ul id="musique-mes-sons" class="liste-sons" role="tabpanel" data-testid="musique-mes-sons">
        {liste.map((s) => (
          <li key={s.id} class="son-ligne">
            <span class="son-nom">
              {s.nom}
              {s.etiquette && <span class="son-etiquette">{s.etiquette}</span>}
            </span>
            <span class="chiffres petit doux">{formatTemps(s.duree)}</span>
            <button type="button" class="btn btn-icone son-ajouter" aria-label={`${TX.ajouter} ${s.nom}`} disabled={!!attenteSon.value} onClick={() => void ajouterMorceau({ monSon: s })} data-testid={`musique-ajouter-${s.id}`}>
              <IconePlus taille={20} />
            </button>
          </li>
        ))}
      </ul>
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
