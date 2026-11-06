// Panneau « Améliorer l'image » : Non / Léger / Fort, « Nettoyer la compression », « Agrandir avec l'IA », moteur
// utilisé (IA ou repli sans IA, dit clairement), vitesse mesurée sur l'appareil (avec la proposition « seulement à
// l'export » si l'aperçu va ramer), avant / après à glisser, et les conseils OBS. Chaque choix = un seul Annuler.

import { useEffect, useRef, useState } from 'preact/hooks';
import { mesurerVitesse } from '../../../moteur/amelioration/banc-vitesse';
import {
  definirApercuExportSeulement,
  etatAmelioration,
  modeMoteur,
  surChangementAmelioration,
} from '../../../moteur/amelioration/image-amelioree';
import { surcoutExport, vitesse as classerVitesse } from '../../../moteur/amelioration/mesures';
import { choisirAmelioration } from '../../../moteur/amelioration/operation-amelioration';
import { AMELIORATION_DEFAUT, type NiveauImage, type ReglagesAmelioration } from '../../../moteur/amelioration/reglages';
import { dureeTotale } from '../../../recette/generiques';
import type { Recette } from '../../../recette/types';
import { modifier, recette, sources } from '../../etat';
import { formatDuree } from '../../format';
import { AvantApres, tailleExport } from './AvantApres';
import { ConseilsObs } from './ConseilsObs';
import { TI } from './textes';
import './image.css';

const NIVEAUX = ['non', 'leger', 'fort'] as const;

/** Combien de fois la source est agrandie à l'export (16:9 : en largeur ; vertical : fond flou en largeur, sinon en hauteur). */
export function echelleExport(r: Recette, l: number, h: number): number {
  const e = tailleExport(r);
  if (e.l >= e.h || r.mise.type === 'flou') return e.l / l;
  return e.h / h;
}

function changer(maj: (a: ReglagesAmelioration) => ReglagesAmelioration | null) {
  modifier((x) => choisirAmelioration(x, maj(x.amelioration ?? AMELIORATION_DEFAUT)));
}

export function PanneauImage({ fermer }: { fermer: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [, setTour] = useState(0);
  const [ms, setMs] = useState<number | null>(null);
  const r = recette.value;
  const a = r?.amelioration;
  const src = sources.value[0]?.infos;
  const L = src?.l ?? 1280;
  const H = src?.h ?? 720;
  const mode = modeMoteur();
  const etat = etatAmelioration();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => surChangementAmelioration(() => setTour((n) => n + 1)), []);

  // Vitesse de CET appareil pour ce réglage (même moteur et même plan que l'export).
  const cleVitesse = a && r ? JSON.stringify([a, L, H, echelleExport(r, L, H)]) : '';
  useEffect(() => {
    if (!a || !r || mode === 'aucun') return setMs(null);
    let vivant = true;
    setMs(null);
    mesurerVitesse(a, L, H, echelleExport(r, L, H))
      .then((v) => vivant && setMs(v ? v.ms : null))
      .catch(() => vivant && setMs(null));
    return () => void (vivant = false);
  }, [cleVitesse]);

  if (!r) return null;
  const niveau: 'non' | NiveauImage = a?.niveau ?? 'non';
  const lent = ms !== null && classerVitesse(ms) !== 'fluide';
  const plus = ms !== null ? formatDuree(Math.max(1, Math.round(surcoutExport(ms, dureeTotale(r))))) : '';

  return (
    <dialog ref={ref} class="ai-panneau" aria-labelledby="image-titre" onCancel={(e) => (e.preventDefault(), fermer())} data-testid="panneau-image">
      <div class="ai-corps">
        <div>
          <h2 id="image-titre">{TI.titre}</h2>
          <p class="ai-aide">{TI.aide}</p>
        </div>
        <fieldset class="ai-groupe">
          <legend>{TI.niveau}</legend>
          <div class="ai-choix" role="radiogroup">
            {NIVEAUX.map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={niveau === n}
                class={`ai-pastille${niveau === n ? ' ai-pastille-choisie' : ''}`}
                onClick={() => changer((x) => (n === 'non' ? null : { ...x, niveau: n }))}
                data-testid={`image-niveau-${n}`}
              >
                {TI.niveaux[n].nom}
              </button>
            ))}
          </div>
          <p class="ai-aide" data-testid="image-niveau-texte">{TI.niveaux[niveau].texte}</p>
        </fieldset>

        {a && (
          <>
            <label class="interrupteur">
              <span>
                <strong>{TI.nettoyer}</strong>
                <span class="petit doux">{TI.nettoyerAide}</span>
              </span>
              <input type="checkbox" checked={a.nettoyer} onChange={() => changer((x) => ({ ...x, nettoyer: !x.nettoyer }))} data-testid="image-nettoyer" />
            </label>
            <label class="interrupteur">
              <span>
                <strong>{mode === 'ia' ? TI.agrandirIa : TI.agrandirSansIa}</strong>
                <span class="petit doux">{TI.agrandirAide}</span>
              </span>
              <input type="checkbox" checked={a.agrandir} onChange={() => changer((x) => ({ ...x, agrandir: !x.agrandir }))} data-testid="image-agrandir" />
            </label>
            <p class={`ai-aide${mode === 'ia' ? '' : ' ai-alerte'}`} data-testid="image-moteur" data-mode={mode}>
              {TI.moteur[mode]}
            </p>
            {mode !== 'aucun' && (
              <p class="ai-aide" role="status" data-testid="image-vitesse" data-ms={ms === null ? '' : String(Math.round(ms))}>
                {ms === null ? TI.mesure : TI.vitesse(String(Math.round(ms)), plus)}
              </p>
            )}
            {mode !== 'aucun' && (
              <label class="interrupteur">
                <span>
                  <strong>{TI.dansApercu}</strong>
                  <span class="petit doux">{lent && !etat.apercuExportSeulement ? `${TI.vitesseLente} ${TI.dansApercuAide}` : TI.dansApercuAide}</span>
                </span>
                <input
                  type="checkbox"
                  checked={!etat.apercuExportSeulement}
                  onChange={(e) => definirApercuExportSeulement(!(e.currentTarget as HTMLInputElement).checked)}
                  data-testid="image-apercu"
                />
              </label>
            )}
            {etat.apercuCoupeLent && !etat.apercuExportSeulement && (
              <p class="ai-aide ai-alerte" role="status" data-testid="image-apercu-coupe">{TI.apercuCoupe}</p>
            )}
            {mode !== 'aucun' && (
              <div>
                <p class="ai-label">{TI.avantApres}</p>
                <AvantApres recette={r} />
                <p class="ai-aide">{TI.avantApresAide}</p>
              </div>
            )}
          </>
        )}
        <ConseilsObs />
        <button type="button" class="btn btn-principal" onClick={fermer} data-testid="image-fermer">
          {TI.fermer}
        </button>
      </div>
    </dialog>
  );
}
