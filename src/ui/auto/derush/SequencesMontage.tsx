// Habiller → Couper, Best-of v4 (intégrateur, panneau demandé par dev-ui) : les SÉQUENCES du montage (une par
// chapitre) : ↑ ↓ pour changer l'ordre, « Retirer » (elle part dans « Passages pas retenus », d'où « Ajouter » la
// remet), et au début ou à la fin « + contexte » (un bout de plus, coupé comme le Best-of : morceauxDuPassage sur les
// mesures gardées, sans réécouter) ou « − un bout ». Toute la logique est dans recette/operations-sequences.ts ; un
// geste = une opération = un seul Annuler. Mobile d'abord : cibles de 44 px.

import { useState } from 'preact/hooks';
import { deplacerSequence, etendreSequence, retirerSequence, sequencesDeLaVideo, type SequenceMontage } from '../../../recette/operations';
import type { PassageNote } from '../../../recette/types';
import { T } from '../../../textes-fr';
import { afficherToast, annulerAction, modifier, recette, recetteAffichee } from '../../etat';
import { formatDuree } from '../../format';
import { chercher, mettreEnPause } from '../../lecture';
import { BRANCHEMENTS } from '../express/branchements-v4';
import { TEXTES_V4 } from '../express/textes-v4';
import './derush.css';

const TS = TEXTES_V4.sequences;
/** « + contexte » : le bout ajouté est pris dans les FENETRE s de source juste avant (ou après) la séquence. */
const FENETRE = 10;

/** Le bout de source à ajouter avant (ou après) la séquence, coupé comme le Best-of ; null : pas de mesures. */
async function boutAAjouter(s: SequenceMontage, cote: 'debut' | 'fin'): Promise<{ de: number; a: number }[] | null> {
  const r0 = recette.peek();
  const couper = BRANCHEMENTS.morceauxPassage;
  if (!r0 || !couper || !s.src) return null;
  const p: PassageNote = cote === 'debut' ? { src: s.src, de: Math.max(0, s.de - FENETRE), a: s.de, note: 0, raison: '' } : { src: s.src, de: s.a, a: s.a + FENETRE, note: 0, raison: '' };
  if (!(p.a > p.de)) return [];
  const morceaux = await couper(r0, p).catch(() => null);
  if (!morceaux) return null;
  // Le morceau le plus proche de la séquence : une phrase de plus, pas dix secondes d'un coup.
  const tries = [...morceaux].sort((x, y) => x.de - y.de);
  const proche = cote === 'debut' ? tries[tries.length - 1] : tries[0];
  return proche ? [proche] : [];
}

export function SequencesMontage() {
  const r = recetteAffichee.value;
  const [occupe, setOccupe] = useState(false);
  if (!r) return null;
  const seqs = sequencesDeLaVideo(r).filter((s) => s.plans.length > 0);
  if (seqs.length < 2) return null;

  function agir(f: Parameters<typeof modifier>[0], message?: string) {
    mettreEnPause();
    if (modifier(f) && message) afficherToast(message, 6000, { label: T.annuler, agir: annulerAction });
  }

  async function plus(s: SequenceMontage, cote: 'debut' | 'fin') {
    if (occupe) return;
    setOccupe(true);
    try {
      const r0 = recette.peek();
      const bout = await boutAAjouter(s, cote);
      if (bout === null) return afficherToast(TS.sansMesures, 5000);
      if (bout.length === 0) return afficherToast(TS.rienAAjouter, 4000);
      if (recette.peek() !== r0) return;
      agir((x) => etendreSequence(x, s.i, cote, 1, bout));
    } finally {
      setOccupe(false);
    }
  }

  const coteTexte = (c: 'debut' | 'fin') => (c === 'debut' ? TS.debut : TS.fin).toLowerCase();

  return (
    <section class="sequences-montage" data-testid="sequences-montage" aria-busy={occupe}>
      <span class="ca-label">{TS.titre}</span>
      <p class="petit doux outil-aide">{TS.aide}</p>
      <ol class="liste-sequences">
        {seqs.map((s, n) => (
          <li key={`${s.i}-${s.de}`} class="sequence-montage" data-testid={`sequence-${n}`}>
            <div class="sequence-entete">
              <button type="button" class="pastille chiffres" onClick={() => chercher(s.t0 + 0.01)} aria-label={s.nom}>
                {formatDuree(s.t1 - s.t0)}
              </button>
              <span class="sequence-nom">{s.nom}</span>
              <button type="button" class="btn btn-icone" disabled={n === 0 || occupe} aria-label={TS.monter(s.nom)} onClick={() => agir((x) => deplacerSequence(x, s.i, -1))} data-testid={`sequence-monter-${n}`}>
                ↑
              </button>
              <button type="button" class="btn btn-icone" disabled={n === seqs.length - 1 || occupe} aria-label={TS.descendre(s.nom)} onClick={() => agir((x) => deplacerSequence(x, s.i, 1))} data-testid={`sequence-descendre-${n}`}>
                ↓
              </button>
              <button type="button" class="btn" disabled={occupe} onClick={() => agir((x) => retirerSequence(x, s.i), TS.retiree(s.nom))} data-testid={`sequence-retirer-${n}`}>
                {TS.retirer}
              </button>
            </div>
            <div class="sequence-bords">
              {(['debut', 'fin'] as const).map((c) => (
                <div key={c} class="sequence-bord">
                  <span class="petit doux">{c === 'debut' ? TS.debut : TS.fin}</span>
                  <button type="button" class="btn" disabled={occupe || s.plans.length < 2} aria-label={TS.moinsAide(coteTexte(c), s.nom)} onClick={() => agir((x) => etendreSequence(x, s.i, c, -1))} data-testid={`sequence-moins-${c}-${n}`}>
                    {TS.moins}
                  </button>
                  <button type="button" class="btn" disabled={occupe || !BRANCHEMENTS.morceauxPassage} aria-label={TS.plusAide(coteTexte(c), s.nom)} onClick={() => void plus(s, c)} data-testid={`sequence-plus-${c}-${n}`}>
                    {TS.plus}
                  </button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
