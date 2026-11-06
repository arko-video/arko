// Réglages d'un fond vert ou d'un mème posé (incrustation) : plein écran ou taille, position au doigt sur l'aperçu,
// son du clip (oui / non + volume), début / fin du clip à couper, et le détourage du fond vert (Tolérance, Douceur
// des bords, Anti-débordement). Et ceux d'un mème « Coupure » (début / fin, retirer). Chaque geste = un seul Annuler.

import { CHROMA_BORNES, CHROMA_DEFAUT } from '../../../moteur/incrustation/chroma';
import { INCRUSTATION } from '../../../recette/normaliser-bibliotheque';
import { supprimer } from '../../../recette/operations';
import { sansClipsOrphelins } from '../../../recette/operations-bibliotheque';
import { TB } from '../../textes-bibliotheque';
import { basculerDetourage, incrustationChoisie, memeChoisi, reglerCoupure, reglerIncrustation, retirerIncrustation } from '../../clips-montage';
import { modifier, recetteAffichee } from '../../etat';
import { formatDuree } from '../../format';
import { IconePoubelle, IconeRetour } from '../Icones';
import { CurseurValeur, Interrupteur } from './Reglages';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const sec = (v: number) => `${v.toFixed(2).replace('.', ',')} s`;

function Retour({ onRetour }: { onRetour: () => void }) {
  return (
    <div class="panneau-mot-entete">
      <button type="button" class="btn btn-discret" onClick={onRetour} data-testid="clip-retour">
        <IconeRetour taille={18} />
        {TB.reglages.retour}
      </button>
    </div>
  );
}

/** Début et fin gardés d'un clip de `duree` secondes. */
function DebutFin({ de, a, duree, onChange, testid }: { de: number; a: number; duree: number; onChange: (de: number, a: number) => void; testid: string }) {
  return (
    <>
      <CurseurValeur label={TB.reglages.debut} min={0} max={Math.max(0.1, duree - 0.1)} step={0.05} valeur={de} format={sec} onValider={(v) => onChange(Math.min(v, a - 0.1), a)} testid={`${testid}-debut`} />
      <CurseurValeur label={TB.reglages.fin} min={0.1} max={duree} step={0.05} valeur={a} format={sec} onValider={(v) => onChange(de, Math.max(v, de + 0.1))} testid={`${testid}-fin`} />
      <p class="petit doux">{TB.reglages.duree(formatDuree(a - de))}</p>
    </>
  );
}

export function ReglagesIncrustation({ i }: { i: number }) {
  const r = recetteAffichee.value;
  const x = r?.incrustations?.[i];
  if (!r || !x) return null;
  const source = r.sources.find((s) => s.id === x.src);
  const duree = source?.duree ?? x.a;
  const regler = (p: Parameters<typeof reglerIncrustation>[1]) => reglerIncrustation(i, p);
  const cle = x.cle;
  return (
    <div class="outil" data-testid="reglages-clip">
      <Retour onRetour={() => (incrustationChoisie.value = null)} />
      <h3 class="reglages-titre">{source?.nom ?? x.src}</h3>
      <Interrupteur titre={TB.reglages.plein} aide={TB.reglages.pleinAide} actif={x.plein === true} onChange={(v) => regler({ plein: v ? true : undefined })} testid="clip-plein" />
      {!x.plein && (
        <>
          <CurseurValeur
            label={TB.reglages.taille}
            min={INCRUSTATION.taille.min}
            max={INCRUSTATION.taille.max}
            step={0.01}
            valeur={x.taille ?? INCRUSTATION.taille.defaut}
            format={pct}
            onValider={(v) => regler({ taille: v })}
            testid="clip-taille"
          />
          <p class="petit doux">{TB.reglages.position}</p>
        </>
      )}
      <Interrupteur titre={TB.reglages.son} actif={x.son !== false} onChange={(v) => regler({ son: v ? undefined : false })} testid="clip-son" />
      {x.son !== false && (
        <CurseurValeur label={TB.reglages.volume} min={0} max={1.5} step={0.05} valeur={x.vol ?? INCRUSTATION.vol.defaut} format={pct} onValider={(v) => regler({ vol: v })} testid="clip-volume" />
      )}
      <DebutFin de={x.de} a={x.a} duree={duree} onChange={(de, a) => regler({ de, a })} testid="clip" />
      <Interrupteur titre={TB.reglages.detourer} aide={TB.reglages.detourerAide} actif={!!cle} onChange={(v) => void basculerDetourage(i, v)} testid="clip-detourer" />
      {cle && x.genre === 'meme' && <p class="petit">{TB.memes.vertTrouve}</p>}
      {cle && (
        <>
          <p class="petit doux clip-couleur">
            <span class="clip-pastille" style={{ background: `rgb(${cle.couleur.join(',')})` }} aria-hidden="true" />
            {TB.reglages.detourerAide}
          </p>
          <CurseurValeur label={TB.reglages.tolerance} min={CHROMA_BORNES.tolerance[0]} max={CHROMA_BORNES.tolerance[1]} step={0.01} valeur={cle.tolerance ?? CHROMA_DEFAUT.tolerance} format={pct} onValider={(v) => regler({ cle: { ...cle, tolerance: v } })} testid="clip-tolerance" />
          <CurseurValeur label={TB.reglages.douceur} min={CHROMA_BORNES.douceur[0]} max={CHROMA_BORNES.douceur[1]} step={0.01} valeur={cle.douceur ?? CHROMA_DEFAUT.douceur} format={pct} onValider={(v) => regler({ cle: { ...cle, douceur: v } })} testid="clip-douceur" />
          <CurseurValeur label={TB.reglages.debordement} min={0} max={1} step={0.01} valeur={cle.debordement ?? CHROMA_DEFAUT.debordement} format={pct} onValider={(v) => regler({ cle: { ...cle, debordement: v } })} testid="clip-debordement" />
          <p class="petit doux">{TB.reglages.debordementAide}</p>
        </>
      )}
      <button type="button" class="btn outil-supprimer" onClick={() => retirerIncrustation(i)} data-testid="clip-supprimer">
        <IconePoubelle taille={18} />
        {TB.reglages.supprimer}
      </button>
    </div>
  );
}

/** Mème « Coupure » (plan i) : début / fin du mème, retirer (le jeu se recolle). */
export function ReglagesCoupure({ i }: { i: number }) {
  const r = recetteAffichee.value;
  const p = r?.plans[i];
  if (!r || !p) return null;
  const source = r.sources.find((s) => s.id === p.src);
  return (
    <div class="outil" data-testid="reglages-coupure">
      <Retour onRetour={() => (memeChoisi.value = null)} />
      <h3 class="reglages-titre">
        {TB.reglages.coupureTitre} · {source?.nom ?? p.src}
      </h3>
      <p class="petit doux">{TB.reglages.coupureAide}</p>
      <DebutFin de={p.de} a={p.a} duree={source?.duree ?? p.a} onChange={(de, a) => reglerCoupure(i, de, a)} testid="coupure" />
      <button
        type="button"
        class="btn outil-supprimer"
        onClick={() => {
          modifier((x) => sansClipsOrphelins(supprimer(x, i)));
          memeChoisi.value = null;
        }}
        data-testid="coupure-supprimer"
      >
        <IconePoubelle taille={18} />
        {TB.reglages.supprimer}
      </button>
    </div>
  );
}
