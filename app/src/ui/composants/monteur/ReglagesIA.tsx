// Mode « Avec l'IA » de la Demande : fournisseur, modèle, clé API (gardée sur l'appareil, affichée masquée),
// « Tester ma clé », « Oublier ma clé », coût estimé et « Voir ce qui est envoyé ».

import { useEffect, useState } from 'preact/hooks';
import {
  construireRequete,
  ErreurArko,
  estimerDemande,
  formaterMoments,
  FOURNISSEURS,
  masquer,
  NOMBRE,
  testerCle,
  trouverFournisseur,
  type IdFournisseur,
  type Moment,
} from '../../../moteur/api';
import type { Sec } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { afficherToast } from '../../etat';
import { demandeAgent } from '../../monteur/analyse-monteur';
import {
  cleGardee,
  clesEnMemoire,
  clesSaisies,
  garderCle,
  oublierCleMonteur,
  saisie,
  saisir,
} from '../../monteur/cles-monteur';
import { demande, regler, resultat, sourceMonteur } from '../../monteur/etat-monteur';
import { PanneauEnvoi } from './PanneauEnvoi';

/** Nom court du fournisseur (« Anthropic », « OpenAI », « Gemini »). */
export function nomCourt(id: IdFournisseur): string {
  return trouverFournisseur(id)
    .nom.replace(/\s*\(.*\)/, '')
    .replace(/^Google\s+/, '');
}

/** Avant l'analyse : 40 lignes d'exemple, pour estimer le coût et montrer la forme du texte. */
function resumeExemple(transcrire: boolean): string {
  const duree = (sourceMonteur.peek()?.infos.duree ?? 3600) as Sec;
  const moments: Moment[] = Array.from({ length: 40 }, (_, i) => {
    const debut = ((i + 0.5) * duree) / 40;
    return {
      debut,
      fin: debut + 14,
      score: 90 - i,
      etiquettes: ['silence>pic', 'cri'],
      ...(transcrire ? { extrait: 'attends attends… non il m’a eu, c’est pas possible ça' } : {}),
    };
  });
  return formaterMoments({ src: 's1', duree, langue: 'fr' }, moments);
}

export function ReglagesIA() {
  const d = demande.value;
  const f = trouverFournisseur(d.fournisseur);
  const [gardee, setGardee] = useState<string | null>(null);
  const [modeles, setModeles] = useState<string[]>([]);
  const [test, setTest] = useState<{ etat: 'rien' | 'encours' | 'ok' | 'erreur'; message?: string }>({
    etat: 'rien',
  });
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    setGardee(null);
    setModeles([]);
    setTest({ etat: 'rien' });
    void cleGardee(d.fournisseur).then((c) => vivant && setGardee(c ? masquer(c) : null));
    return () => {
      vivant = false;
    };
  }, [d.fournisseur]);

  async function tester() {
    // Toujours la clé de CE fournisseur : celle tapée dans son champ (visible seulement sans clé gardée), sinon la gardée.
    const fournisseur = d.fournisseur;
    const deja = await cleGardee(fournisseur);
    const tapee = deja ? '' : saisie(fournisseur);
    const cle = tapee || deja;
    const encore = () => demande.peek().fournisseur === fournisseur;
    if (!cle) return setTest({ etat: 'erreur', message: T.monteur.cleManque });
    setTest({ etat: 'encours' });
    try {
      const liste = await testerCle(fournisseur, cle);
      if (tapee) await garderCle(fournisseur, tapee);
      if (!encore()) return;
      if (tapee) setGardee(masquer(tapee));
      setModeles(liste);
      setTest({ etat: 'ok', message: T.monteur.cleOk(liste.length) });
    } catch (e) {
      if (encore())
        setTest({ etat: 'erreur', message: e instanceof ErreurArko ? e.message : T.erreurInconnue });
    }
  }

  async function oublier() {
    await oublierCleMonteur(d.fournisseur);
    setGardee(null);
    setModeles([]);
    setTest({ etat: 'rien' });
    afficherToast(T.monteur.cleOubliee);
  }

  const res = resultat.value;
  const da = demandeAgent(res?.resume ?? resumeExemple(d.transcrire), d);
  const cout = estimerDemande(da).phrase;
  const listeModeles = modeles.length > 0 ? modeles : [f.modeleParDefaut];

  return (
    <div class="reglages-ia" data-testid="reglages-ia">
      <div class="champ">
        <span class="champ-titre">{T.monteur.fournisseur}</span>
        <div class="segments" role="radiogroup" aria-label={T.monteur.fournisseur}>
          {FOURNISSEURS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === d.fournisseur}
              data-actif={x.id === d.fournisseur ? '1' : '0'}
              onClick={() => regler({ fournisseur: x.id, modele: '' })}
              data-testid={`fournisseur-${x.id}`}
            >
              {nomCourt(x.id)}
            </button>
          ))}
        </div>
      </div>

      <label class="champ">
        <span class="champ-titre">{T.monteur.modele}</span>
        <select
          class="champ-saisie"
          value={d.modele || f.modeleParDefaut}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            regler({ modele: v === f.modeleParDefaut ? '' : v });
          }}
          data-testid="modele"
        >
          {listeModeles.map((m) => (
            <option key={m} value={m}>
              {m === f.modeleParDefaut ? T.monteur.conseille(m) : m}
            </option>
          ))}
        </select>
      </label>

      <div class="champ">
        <span class="champ-titre">{T.monteur.cle}</span>
        {gardee ? (
          <p class="cle-gardee" data-testid="cle-gardee">
            {T.monteur.cleGardee(gardee)}
          </p>
        ) : (
          <input
            key={d.fournisseur}
            class="champ-saisie"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder={T.monteur.clePlaceholder}
            aria-label={T.monteur.cle}
            value={clesSaisies.value[d.fournisseur] ?? ''}
            onInput={(e) => saisir(d.fournisseur, (e.currentTarget as HTMLInputElement).value)}
            data-testid="cle"
          />
        )}
        <p class="petit doux">{T.monteur.cleRassure}</p>
        {clesEnMemoire.value.includes(d.fournisseur) && (
          <p class="petit message message-alerte" role="status" data-testid="cle-memoire">
            {T.monteur.cleMemoire}
          </p>
        )}
        <div class="grille-2">
          <button
            type="button"
            class="btn"
            disabled={test.etat === 'encours'}
            onClick={() => void tester()}
            data-testid="tester-cle"
          >
            {T.monteur.tester}
          </button>
          <button
            type="button"
            class="btn btn-discret"
            disabled={!gardee}
            onClick={() => void oublier()}
            data-testid="oublier-cle"
          >
            {T.monteur.oublier}
          </button>
        </div>
        {test.etat !== 'rien' && (
          <p class="petit test-cle" data-etat={test.etat} role="status" data-testid="test-cle">
            {test.etat === 'encours' ? T.monteur.test : test.message}
          </p>
        )}
      </div>

      <p class="petit cout" data-testid="cout">
        {T.monteur.cout(cout)}
      </p>
      <button type="button" class="btn btn-contour" onClick={() => setEnvoi(true)} data-testid="voir-envoi">
        {T.monteur.voirEnvoi}
      </button>
      {envoi && (
        <PanneauEnvoi
          texte={construireRequete(da)}
          exemple={!res}
          deuxDemandes={d.nombre > NOMBRE.parRequete}
          onFermer={() => setEnvoi(false)}
        />
      )}
    </div>
  );
}
