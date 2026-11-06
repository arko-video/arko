// Sur Importer : le choix pour une longue vidéo (« Je monte moi-même » / « Monteur IA »),
// et « Reprendre ma revue (n clips restants) » quand des brouillons attendent encore.

import { useRef, useState } from 'preact/hooks';
import { ErreurArko } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { formatDuree } from '../../format';
import { choixVisible, revue, sourceMonteur } from '../../monteur/etat-monteur';
import { monterSoiMeme, ouvrirMonteur } from '../../monteur/entree-monteur';
import { allerMonteur } from '../../monteur/navigation-monteur';
import { afficherToast } from '../../etat';
import { entrerMonteur, oublierRevue, restaurerRevue, rouvrirPourRevue } from '../../monteur/revue-monteur';
import { IconeAlerte, IconeCiseaux, IconeFleche } from '../Icones';
import { Chargement } from '../MesMontages';
import { EntreeExpress } from '../../auto/express/EntreeExpress';

export function ChoixMonteur({ occupe }: { occupe: boolean }) {
  const s = sourceMonteur.value;
  const [attente, setAttente] = useState(false);
  if (!choixVisible.value || !s) return null;
  return (
    <section class="choix-monteur" aria-labelledby="choix-titre" data-testid="choix-monteur">
      <h2 id="choix-titre" class="choix-titre">
        {T.monteur.choixTitre(formatDuree(s.infos.duree))}
      </h2>
      <p class="petit doux choix-nom">{s.infos.nom}</p>
      <button
        type="button"
        class="choix choix-ia"
        disabled={occupe || attente}
        onClick={() => void ouvrirMonteur()}
        data-testid="choix-monteur-ia"
      >
        <span class="monteur-etoile grande" aria-hidden="true" />
        <span class="choix-textes">
          <strong>{T.monteur.ia}</strong>
          <span class="petit">{T.monteur.iaAide}</span>
        </span>
        <IconeFleche />
      </button>
      <EntreeExpress />
      <button
        type="button"
        class="choix"
        disabled={occupe || attente}
        onClick={() => {
          setAttente(true);
          void monterSoiMeme().finally(() => setAttente(false));
        }}
        data-testid="choix-moi-meme"
      >
        <IconeCiseaux taille={24} />
        <span class="choix-textes">
          <strong>{T.monteur.moiMeme}</strong>
          <span class="petit doux">{T.monteur.moiMemeAide}</span>
        </span>
      </button>
    </section>
  );
}

export function CarteRevue({ occupe }: { occupe: boolean }) {
  const r = revue.value;
  const input = useRef<HTMLInputElement>(null);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!r || r.restants.length === 0) return null;
  const prete = sourceMonteur.value?.infos.emp === r.source.emp;

  async function fichier(f: File) {
    setErreur(null);
    setChargement(T.importer.chargement);
    try {
      const refus = await rouvrirPourRevue(f, (etape) => setChargement(etape));
      if (refus) setErreur(refus);
      else allerMonteur('revue');
    } catch (e) {
      setErreur(e instanceof ErreurArko ? e.message : T.erreurInconnue);
    } finally {
      setChargement(null);
    }
  }

  function oublier() {
    const avant = oublierRevue();
    if (avant)
      afficherToast(T.monteur.revueOubliee, 6000, { label: T.annuler, agir: () => restaurerRevue(avant) });
  }

  return (
    <section class="carte-revue" data-testid="carte-revue">
      <input
        ref={input}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        class="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = (e.currentTarget as HTMLInputElement).files?.[0];
          if (f) void fichier(f);
        }}
        data-testid="fichier-revue"
      />
      {chargement ? (
        <Chargement nom={r.source.nom} etape={chargement} />
      ) : (
        <button
          type="button"
          class="btn btn-contour carte-revue-btn"
          disabled={occupe}
          onClick={() => {
            // Le montage ouvert est fermé (enregistré) : les clips gardés deviennent de nouveaux projets.
            if (prete) return void entrerMonteur().then(() => allerMonteur('revue'));
            if (input.current) {
              input.current.value = '';
              input.current.click();
            }
          }}
          data-testid="reprendre-revue"
        >
          <span class="monteur-etoile" aria-hidden="true" />
          {T.monteur.reprendreRevue(r.restants.length)}
        </button>
      )}
      {!prete && !chargement && <p class="petit doux">{T.monteur.reprendreAide(r.source.nom)}</p>}
      {erreur && (
        <div class="message message-erreur" role="alert">
          <IconeAlerte />
          <span>{erreur}</span>
        </div>
      )}
      <button
        type="button"
        class="lien petit"
        disabled={occupe}
        onClick={oublier}
        data-testid="oublier-revue"
      >
        {T.monteur.oublierRevue}
      </button>
    </section>
  );
}
