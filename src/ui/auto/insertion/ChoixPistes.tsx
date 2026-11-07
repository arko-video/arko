// Choix des pistes audio d'une vidéo à plusieurs pistes (E, dev 2) : « Cette vidéo a 2 pistes de son », une ligne
// par piste (nom écrit par OBS, case Garder cochée, volume 0 à 150 %), Valider → choisirPistes (un Annuler).
// Fermer sans choisir = toutes les pistes lisibles gardées à 100 %. Une piste illisible est décochée et grisée.
// Ouvert à l'import (pistesAChoisir), et depuis Habiller → Sous-titres (« Pistes de son »).

import { useEffect, useState } from 'preact/hooks';
import { pistesDuFichier, type InfoPiste } from '../../../moteur/api';
import { choisirPistes } from '../../../recette/operations';
import type { PisteGardee } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import { afficherToast, modifier, recette, sources } from '../../etat';
import { visible } from '../drapeaux';
import { fermerPistes, pistesAChoisir } from './etat-insertion';
import './insertion.css';

const TP = TV.insertion.pistes;
export const PRETE_PISTES = true;

interface Ligne extends InfoPiste {
  garder: boolean;
  vol: number;
}

/** Applique le choix (toutes lisibles à 100 % si `lignes` est null). */
function valider(src: string, lignes: Ligne[] | null, infos: InfoPiste[]) {
  const choisies: PisteGardee[] = (
    lignes ?? infos.filter((p) => p.lisible).map((p) => ({ ...p, garder: true, vol: 1 }))
  )
    .filter((l) => l.garder && l.lisible)
    .map((l) => {
      const p: PisteGardee = { n: l.n };
      if (Math.abs(l.vol - 1) > 1e-3) p.vol = Math.round(l.vol * 100) / 100;
      if (l.nom) p.nom = l.nom;
      return p;
    });
  if (choisies.length === 0) return afficherToast(TP.aucune);
  modifier((r) => choisirPistes(r, src, choisies));
  afficherToast(TP.choisies(choisies.length), 2500);
  fermerPistes();
}

export function ChoixPistes() {
  const src = pistesAChoisir.value;
  const [infos, setInfos] = useState<InfoPiste[] | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  useEffect(() => {
    setInfos(null);
    setLignes(null);
    const s = src ? sources.peek().find((x) => x.infos.id === src) : undefined;
    if (!s) return;
    void pistesDuFichier(s.fichier).then(
      (p) => {
        setInfos(p);
        const reglage = recette.peek()?.pistesAudio?.find((x) => x.src === src);
        setLignes(
          p.map((x) => {
            const g = reglage?.pistes.find((y) => y.n === x.n);
            return { ...x, garder: x.lisible && (!reglage || !!g), vol: g?.vol ?? 1 };
          }),
        );
      },
      () => fermerPistes(),
    );
  }, [src]);
  if (!src || !visible('pistes', PRETE_PISTES)) return null;
  const changer = (n: number, partiel: Partial<Ligne>) =>
    setLignes((l) => l?.map((x) => (x.n === n ? { ...x, ...partiel } : x)) ?? null);
  const fermer = () => (infos ? valider(src, null, infos) : fermerPistes());
  return (
    <div class="bibliotheque-fond" data-testid="v3-pistes">
      <div class="ecran bibliotheque">
        <header class="entete">
          <button
            type="button"
            class="btn btn-icone"
            aria-label={TP.toutes}
            onClick={fermer}
            data-testid="v3-pistes-fermer"
          >
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{TP.titre(infos?.length ?? 2)}</h1>
        </header>
        <main class="ecran-corps ins-corps">
          <p class="petit doux">{TP.aide}</p>
          {!lignes && <p class="petit doux">{TP.lecture}</p>}
          {lignes?.map((l) => (
            <div
              class="ins-piste"
              key={l.n}
              data-lisible={l.lisible ? '1' : '0'}
              data-testid={`piste-${l.n}`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={l.garder}
                  disabled={!l.lisible}
                  onChange={(e) => changer(l.n, { garder: (e.target as HTMLInputElement).checked })}
                  data-testid={`piste-garder-${l.n}`}
                />
                <strong>{TP.piste(l.n + 1, l.nom)}</strong>
              </label>
              {!l.lisible && <p class="petit doux">{TP.illisible}</p>}
              <label>
                <span class="petit doux">{TP.volume}</span>
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={5}
                  value={Math.round(l.vol * 100)}
                  disabled={!l.garder}
                  onInput={(e) => changer(l.n, { vol: Number((e.target as HTMLInputElement).value) / 100 })}
                  data-testid={`piste-volume-${l.n}`}
                />
                <span class="chiffres">{`${Math.round(l.vol * 100)}\u00a0%`}</span>
              </label>
            </div>
          ))}
          {lignes && (
            <button
              type="button"
              class="btn btn-principal"
              onClick={() => valider(src, lignes, infos ?? [])}
              data-testid="v3-pistes-valider"
            >
              {TP.valider}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
