// Outil Chapitres (YouTube 16:9) : poser des marqueurs nommés sur la frise, voir s'ils respectent les règles de
// YouTube, et « Copier les chapitres » (texte prêt à coller dans la description). Repli : le texte est sélectionné.

import { useRef } from 'preact/hooks';
import { bilanChapitres, formatHorodatage } from '../../../recette/chapitres';
import { ajouterChapitre, renommerChapitre, supprimerChapitre } from '../../../recette/operations';
import { TY } from '../../../textes-youtube';
import { afficherToast, modifier, recetteAffichee, teteLecture } from '../../etat';
import { chercher, mettreEnPause } from '../../lecture';
import { IconeAlerte, IconeCoche } from '../Icones';

const T = TY.chapitres;

/** Copie dans le presse-papiers ; en cas de refus, sélectionne le texte pour une copie à la main. */
export async function copierTexte(texte: string, zone: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('presse-papiers indisponible');
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    if (zone) {
      zone.focus();
      zone.select();
      zone.setSelectionRange(0, texte.length);
    }
    return false;
  }
}

export function OutilChapitres() {
  const r = recetteAffichee.value;
  const zone = useRef<HTMLTextAreaElement>(null);
  if (!r) return null;
  const chapitres = r.chapitres ?? [];
  const bilan = bilanChapitres(r);

  function ajouter() {
    mettreEnPause();
    modifier((x) => ajouterChapitre(x, teteLecture.peek(), T.nomParDefaut((x.chapitres?.length ?? 0) + 1)).recette);
  }

  async function copier() {
    const ok = await copierTexte(bilan.texte, zone.current);
    afficherToast(ok ? T.copie : T.copieManuelle);
  }

  return (
    <div class="outil" data-testid="outil-chapitres">
      <p class="petit doux outil-aide">{T.aide}</p>
      <button type="button" class="btn" onClick={ajouter} data-testid="ajouter-chapitre">
        {T.ajouter}
      </button>
      {chapitres.length === 0 ? (
        <p class="petit doux">{T.vide}</p>
      ) : (
        <ol class="chapitres" data-testid="liste-chapitres">
          {chapitres.map((c, i) => {
            const tFinal = bilan.liste[i]?.t ?? c.t;
            return (
              <li key={`${c.t}`} class="chapitre" data-testid={`chapitre-${i}`}>
                <button type="button" class="pastille chiffres" onClick={() => chercher(c.t + 0.01)} aria-label={formatHorodatage(tFinal)}>
                  {formatHorodatage(tFinal)}
                </button>
                <input
                  class="champ chapitre-nom"
                  type="text"
                  maxLength={60}
                  value={c.nom}
                  aria-label={T.nom(formatHorodatage(tFinal))}
                  onChange={(e) => modifier((x) => renommerChapitre(x, i, (e.currentTarget as HTMLInputElement).value))}
                  data-testid={`chapitre-nom-${i}`}
                />
                <button type="button" class="btn btn-icone" aria-label={T.supprimer(c.nom)} onClick={() => modifier((x) => supprimerChapitre(x, i))} data-testid={`chapitre-suppr-${i}`}>
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {bilan.problemes.length > 0 ? (
        <div class="message message-alerte message-court" role="status" data-testid="chapitres-problemes">
          <IconeAlerte />
          <ul class="liste-simple">
            {bilan.problemes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p class="message message-info message-court" role="status" data-testid="chapitres-ok">
          <IconeCoche />
          <span>{T.ok}</span>
        </p>
      )}
      <p class="petit doux">{T.regles}</p>
      <label class="petit doux" for="texte-chapitres">
        {T.texte}
      </label>
      <textarea id="texte-chapitres" ref={zone} class="champ chapitres-texte" readOnly rows={Math.min(6, Math.max(2, chapitres.length))} value={bilan.texte} data-testid="chapitres-texte" />
      <button type="button" class="btn btn-principal" disabled={chapitres.length === 0} onClick={() => void copier()} data-testid="copier-chapitres">
        {T.copier}
      </button>
    </div>
  );
}
