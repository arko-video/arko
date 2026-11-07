// Insérer une vidéo (fichier, ou Ma bibliothèque) ou un mème (rayon Mèmes) entre deux parties (B, dev 2) : choisir le
// clip, régler le début et la fin gardés, puis « Insérer ». Une vidéo d'un fichier est gardée dans Ma bibliothèque →
// Mèmes (pour rouvrir le montage plus tard ; à confirmer avec Romain, contrat §9.5).

import { useEffect, useRef, useState } from 'preact/hooks';
import { ErreurArko, listerClips, type MonClip } from '../../../moteur/api';
import { TV } from '../../../textes-v3';
import { afficherToast } from '../../etat';
import { garderVideo, insererClip } from './actions-insertion';
import { ChampDuree } from './ChampsInsertion';

const TI = TV.insertion;

export function FormulaireClip({ meme, t, fini }: { meme: boolean; t: number; fini: (ok: boolean) => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [clips, setClips] = useState<MonClip[] | null>(null);
  const [choisi, setChoisi] = useState<MonClip | null>(null);
  const [de, setDe] = useState(0);
  const [a, setA] = useState(0);
  const [occupe, setOccupe] = useState<string | null>(null);

  useEffect(() => {
    void listerClips(meme ? 'memes' : undefined).then(setClips, () => setClips([]));
  }, [meme]);

  function choisir(c: MonClip) {
    setChoisi(c);
    setDe(0);
    setA(c.duree);
  }

  async function depuisFichier(f: File | undefined) {
    if (!f) return;
    setOccupe(TI.ouverture);
    try {
      choisir(await garderVideo(f));
      afficherToast(TI.gardeDansMemes, 4000);
    } catch (e) {
      afficherToast(e instanceof ErreurArko ? e.message : TI.impossible, 5000);
    } finally {
      setOccupe(null);
    }
  }

  if (choisi) {
    return (
      <div class="ins-formulaire">
        <p class="ins-clip-choisi" data-testid="ins-clip-choisi">
          {choisi.vignette && <img src={choisi.vignette} alt="" />}
          <strong>{choisi.nom}</strong>
        </p>
        <div class="ins-ligne">
          <ChampDuree
            label={TI.debut}
            valeur={de}
            min={0}
            max={Math.max(0, a - 0.1)}
            changer={setDe}
            testid="ins-clip-debut"
          />
          <ChampDuree
            label={TI.fin}
            valeur={a}
            min={de + 0.1}
            max={choisi.duree}
            changer={setA}
            testid="ins-clip-fin"
          />
        </div>
        <button
          type="button"
          class="btn btn-principal ins-valider"
          disabled={!!occupe}
          onClick={() => {
            setOccupe(TI.ouverture);
            void insererClip(choisi, de, a, t).then((ok) => (setOccupe(null), fini(ok)));
          }}
          data-testid="ins-valider"
        >
          {occupe ?? TI.inserer}
        </button>
      </div>
    );
  }

  return (
    <div class="ins-formulaire">
      {!meme && (
        <>
          <input
            ref={entree}
            type="file"
            accept="video/*"
            class="sr-only"
            onChange={(e) => void depuisFichier((e.target as HTMLInputElement).files?.[0])}
            data-testid="ins-fichier-video"
          />
          <button
            type="button"
            class="btn"
            disabled={!!occupe}
            onClick={() => entree.current?.click()}
            data-testid="ins-depuis-fichier"
          >
            {occupe ?? TI.depuisFichier}
          </button>
          <h2 class="ins-sous-titre">{TI.depuisBibliotheque}</h2>
        </>
      )}
      {clips && clips.length === 0 && <p class="petit doux">{meme ? TI.aucunMeme : TI.aucunClip}</p>}
      <ul class="ins-liste">
        {(clips ?? []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              class="btn ins-clip"
              onClick={() => choisir(c)}
              data-testid={`ins-clip-${c.id}`}
            >
              {c.vignette ? <img src={c.vignette} alt="" /> : <span class="ins-clip-vide" />}
              <span>{c.nom}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
