// Panneau « Couper les blancs » (A, dev 1) : 1. sur quoi et comment ; 2. analyse sur l'appareil (progression,
// Annuler, reprise) ; 3. aperçu « 2 h 03 → 41 min de parole · 312 coupes », réglage Serré / Normal / Large, Appliquer.
// Fenêtre modale (<dialog>) : même panneau dans l'étape Couper et dans Habiller → Couper.

import { useEffect, useRef, useState } from 'preact/hooks';
import { dureePlages, plagesManquantes } from '../../../auto/coupes/tranches';
import { moduleSousTitres } from '../../../moteur/api';
import { dureeFinale } from '../../../recette/operations';
import { gabaritDe } from '../../../recette/destination';
import type { NiveauBlancs } from '../../../recette/types';
import { transcriptionGardee } from '../../../sous-titres/transcription-longue';
import { TA } from '../../../textes-auto';
import { recette } from '../../etat';
import { formatHeure, formatTaille } from '../../format';
import './coupes-auto.css';
import {
  analyse,
  analyser,
  apercu,
  appliquer,
  aTexte,
  arreter,
  deTexte,
  dureeLisible,
  erreur,
  etape,
  fermerBlancs,
  methode,
  morceaux,
  niveau,
  plagesDuChoix,
  progression,
  sourceACouper,
  surQuoi,
  type Methode,
  type SurQuoi,
} from './etat-blancs';

const TB = TA.coupes.blancs;
const NIVEAUX: NiveauBlancs[] = ['serre', 'normal', 'large'];

/** Groupe de boutons radio simple (au pouce : 48 px de haut). */
function Choix<V extends string>(p: { valeurs: { v: V; label: string; aide?: string }[]; actif: V; choisir: (v: V) => void; label: string; colonne?: boolean; testid: string }) {
  return (
    <div class={`ca-choix ${p.colonne ? 'ca-choix-colonne' : ''}`} role="radiogroup" aria-label={p.label}>
      {p.valeurs.map(({ v, label, aide }) => (
        <button type="button" key={v} role="radio" aria-checked={v === p.actif} onClick={() => p.choisir(v)} data-testid={`${p.testid}-${v}`}>
          {label}
          {aide && <small>{aide}</small>}
        </button>
      ))}
    </div>
  );
}

function Reglages() {
  const r = recette.value;
  const s = sourceACouper();
  const [moduleLa, setModuleLa] = useState(true);
  const [deja, setDeja] = useState<'tout' | 'partie' | null>(null);
  const choix = surQuoi.value;
  useEffect(() => {
    void moduleSousTitres().then((m) => setModuleLa(m.present)).catch(() => setModuleLa(true));
  }, []);
  useEffect(() => {
    if (!r || !s) return;
    const plages = plagesDuChoix(r, s.infos.duree, choix, deTexte.value, aTexte.value);
    if (typeof plages === 'string') return setDeja(null);
    let vivant = true;
    void transcriptionGardee(s).then((g) => {
      if (!vivant) return;
      if (!g) return setDeja(null);
      const manque = dureePlages(plagesManquantes(plages.zone, g.plages));
      setDeja(manque === 0 ? 'tout' : manque < plages.zone.a - plages.zone.de - 0.5 ? 'partie' : null);
    });
    return () => void (vivant = false);
  }, [choix, deTexte.value, aTexte.value, r, s]);
  if (!r || !s) return null;
  const valeursSurQuoi: { v: SurQuoi; label: string }[] = [
    { v: 'montage', label: TB.montage(dureeLisible(dureeFinale(r))) },
    { v: 'toute', label: TB.toute(dureeLisible(s.infos.duree)) },
    { v: 'partie', label: TB.partie },
  ];
  const valeursMethode: { v: Methode; label: string; aide: string }[] = [
    { v: 'mots', label: TB.methodeMots, aide: TB.methodeMotsAide },
    { v: 'voix', label: TB.methodeVoix, aide: TB.methodeVoixAide },
  ];
  return (
    <>
      <div class="ca-groupe">
        <span class="ca-label">{TB.surQuoi}</span>
        <Choix valeurs={valeursSurQuoi} actif={choix} choisir={(v) => (surQuoi.value = v)} label={TB.surQuoi} colonne testid="blancs-sur" />
        {choix === 'partie' && (
          <>
            <div class="ca-heures">
              <label class="sr-only" for="blancs-de">{TB.de}</label>
              <span>{TB.de}</span>
              <input id="blancs-de" inputMode="numeric" value={deTexte.value} onInput={(e) => (deTexte.value = e.currentTarget.value)} data-testid="blancs-de" />
              <span>{TB.a}</span>
              <label class="sr-only" for="blancs-a">{TB.a}</label>
              <input id="blancs-a" inputMode="numeric" value={aTexte.value} onInput={(e) => (aTexte.value = e.currentTarget.value)} data-testid="blancs-a" />
            </div>
            <p class="ca-aide">{TB.heureAide}</p>
          </>
        )}
      </div>
      <div class="ca-groupe">
        <span class="ca-label">{TB.comment}</span>
        <Choix valeurs={valeursMethode} actif={methode.value} choisir={(v) => (methode.value = v)} label={TB.comment} colonne testid="blancs-methode" />
        {methode.value === 'mots' && deja === 'tout' && <p class="ca-note">{TB.dejaTranscrit}</p>}
        {methode.value === 'mots' && deja === 'partie' && <p class="ca-note">{TB.enPartieTranscrit}</p>}
        {methode.value === 'mots' && deja !== 'tout' && !moduleLa && <p class="ca-note">{TB.module(formatTaille(90e6))}</p>}
        {methode.value === 'mots' && deja !== 'tout' && s.infos.duree > 1200 && choix !== 'montage' && <p class="ca-note">{TB.longue}</p>}
      </div>
      {erreur.value && <p class="ca-erreur" role="alert">{erreur.value}</p>}
      <div class="ca-boutons">
        <button type="button" class="btn btn-principal" onClick={() => void analyser()} data-testid="blancs-analyser">
          {TB.analyser}
        </button>
        <button type="button" class="btn" onClick={fermerBlancs} data-testid="blancs-fermer">
          {TB.fermer}
        </button>
      </div>
    </>
  );
}

function Analyse() {
  const { p, message } = progression.value;
  return (
    <>
      <p class="ca-aide" role="status" aria-live="polite" data-testid="blancs-progression">
        {message}
      </p>
      <div class="ca-progression" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
        <span style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <button type="button" class="btn" onClick={arreter} data-testid="blancs-arreter">
        {TB.annuler}
      </button>
    </>
  );
}

function Apercu() {
  const ap = apercu.value;
  const a = analyse.value;
  const r = recette.value;
  if (!ap || !a || !r) return null;
  const rien = morceaux.value.length === 0;
  const g = gabaritDe(r);
  // Durée de la vidéo finale après la coupe, comparée au maximum de la destination (bloquant à l'export).
  const tropLong = !rien && ap.apres > g.dureeMax;
  function partiePlusCourte() {
    if (!a?.coupe) return;
    const de = a.coupe.de;
    const a1 = de + ((a.coupe.a - de) * g.dureeMax * 0.9) / Math.max(1, ap!.apres);
    surQuoi.value = 'partie';
    deTexte.value = formatHeure(de);
    aTexte.value = formatHeure(Math.floor(a1));
    etape.value = 'reglages';
  }
  return (
    <>
      {rien ? (
        <p class="ca-alerte" data-testid="blancs-rien">{TB.rien}</p>
      ) : (
        <p class="ca-resultat" role="status" data-testid="blancs-apercu">
          {TB.apercu(dureeLisible(ap.avant), dureeLisible(ap.apres), ap.coupes)}
        </p>
      )}
      {a.methode === 'voix' && <p class="ca-note">{TB.sansTranscription}</p>}
      <div class="ca-groupe">
        <span class="ca-label">{TB.niveau}</span>
        <Choix valeurs={NIVEAUX.map((v) => ({ v, label: TB.niveaux[v] }))} actif={niveau.value} choisir={(v) => (niveau.value = v)} label={TB.niveau} testid="blancs-niveau" />
        <p class="ca-aide">{TB.niveauxAide[niveau.value]}</p>
      </div>
      {tropLong && (
        <p class="ca-alerte" role="alert" data-testid="blancs-trop-long">
          {TB.tropLong(dureeLisible(g.dureeMax), g.plateforme)}
        </p>
      )}
      <div class="ca-boutons">
        {tropLong && a.coupe ? (
          <button type="button" class="btn btn-principal" onClick={partiePlusCourte} data-testid="blancs-partie-courte">
            {TB.proposerPartie}
          </button>
        ) : (
          <button type="button" class="btn btn-principal" disabled={rien || tropLong} onClick={appliquer} data-testid="blancs-appliquer">
            {TB.appliquer}
          </button>
        )}
        <button type="button" class="btn" onClick={() => (etape.value = 'reglages')} data-testid="blancs-changer">
          {TB.modifier}
        </button>
      </div>
    </>
  );
}

export function PanneauBlancs() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const e = etape.value;
  return (
    <dialog
      ref={ref}
      class="ca-panneau"
      aria-labelledby="blancs-titre"
      onCancel={(ev) => {
        ev.preventDefault();
        fermerBlancs();
      }}
      data-testid="panneau-blancs"
    >
      <div class="ca-corps">
        <div>
          <h2 id="blancs-titre">{TB.titre}</h2>
          <p class="ca-aide">{TB.aide}</p>
        </div>
        {e === 'reglages' && <Reglages />}
        {e === 'analyse' && <Analyse />}
        {e === 'apercu' && <Apercu />}
        {e === 'erreur' && (
          <>
            <p class="ca-erreur" role="alert" data-testid="blancs-erreur">{erreur.value}</p>
            <div class="ca-boutons">
              <button type="button" class="btn btn-principal" onClick={() => void analyser()}>
                {TB.reessayer}
              </button>
              <button type="button" class="btn" onClick={fermerBlancs}>
                {TB.fermer}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
