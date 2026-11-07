// Écran « Qui parle ? » (C, dev 1) : une carte par voix (nom, 3 extraits à écouter, son chibi via ChoixChibi du
// dev 3), liste des phrases (un toucher = personne suivante, pointillés si incertain), Valider = le brouillon devient la
// recette (un seul Annuler), « Oublier les voix ». Actions : actions-voix.ts.

import { useEffect, useState } from 'preact/hooks';
import { horodatage } from '../../../auto/express/scenes';
import { phrasesParPersonne } from '../../../auto/voix/attribution';
import { COULEURS_VOIX } from '../../../recette/operations-voix';
import { SITUATIONS, type Situation } from '../../../chibis/catalogue';
import { situationDe } from '../../../recette/operations-chibis';
import type { Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import {
  annulerQuiParle,
  choisirChibiVoix,
  changerSituation,
  corrigerPhrase,
  demarrerQuiParle,
  etatQuiParle,
  motsDe,
  nommerVoix,
  oublierQuiParle,
  validerQuiParle,
} from './actions-voix';
import { CartesVoix } from './CartesVoix';
import { quiParleOuvert } from './etat-voix';
import './voix.css';

const PAR_PAGE = 150;

interface Ligne {
  ts: number;
  fin: number;
  p: string | null;
  texte: string;
  sur: boolean;
}

/** Les phrases (ou, sans sous-titres, les tours) qui tombent dans le montage. */
function lignes(r: Recette, src: string): Ligne[] {
  const premiere = r.sources.find((s) => s.type === 'video')?.id;
  const plans = r.plans.filter((p) => (p.src ?? premiere) === src && !p.ins);
  const dans = (ts: number, fin: number) => plans.length === 0 || plans.some((p) => fin > p.de && ts < p.a);
  const tours = (r.paroles ?? []).filter((t) => (t.src ?? premiere) === src);
  const incertain = (ts: number, fin: number) => tours.some((t) => t.sur === false && t.fin > ts && t.ts < fin);
  const mots = motsDe(r);
  if (mots.length === 0) return tours.filter((t) => dans(t.ts, t.fin)).map((t) => ({ ts: t.ts, fin: t.fin, p: t.p, texte: '…', sur: t.sur !== false }));
  return phrasesParPersonne(mots, tours)
    .filter((ph) => dans(ph.ts, ph.fin))
    .map((ph) => ({ ts: ph.ts, fin: ph.fin, p: ph.p, texte: ph.texte, sur: !incertain(ph.ts, ph.fin) }));
}

export function QuiParle() {
  const ouvert = quiParleOuvert.value;
  const [limite, setLimite] = useState(PAR_PAGE);
  useEffect(() => {
    if (ouvert) {
      setLimite(PAR_PAGE);
      void demarrerQuiParle();
    }
  }, [ouvert]);
  if (!ouvert) return null;
  const e = etatQuiParle.value;
  return (
    <div class="bibliotheque-fond" data-testid="v3-qui-parle-ecran">
      <div class="ecran bibliotheque">
        <header class="entete">
          <button type="button" class="btn btn-icone" aria-label={TV.voix.annuler} onClick={annulerQuiParle} data-testid="v3-qui-parle-ecran-fermer">
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{TV.voix.titre}</h1>
        </header>
        <main class="ecran-corps">
          <p class="petit doux">{TV.voix.aide}</p>
          {e.phase === 'attente' && <p class="petit">{TV.voix.attente}</p>}
          {e.phase === 'analyse' && (
            <div class="qp-etat" data-testid="v3-qp-analyse" role="status">
              <span>{e.message}</span>
              <div class="qp-barre" aria-hidden="true">
                <span style={{ width: `${Math.round(e.p * 100)}%` }} />
              </div>
              <button type="button" class="btn" onClick={annulerQuiParle} data-testid="v3-qp-annuler-analyse">
                {TV.voix.annulerAnalyse}
              </button>
            </div>
          )}
          {e.phase === 'erreur' && (
            <div class="message message-erreur" data-testid="v3-qp-erreur">
              <span>{e.message}</span>
            </div>
          )}
          {e.phase === 'pret' && <Pret limite={limite} plus={() => setLimite(limite + PAR_PAGE)} />}
        </main>
      </div>
    </div>
  );
}

function Pret({ limite, plus }: { limite: number; plus: () => void }) {
  const e = etatQuiParle.value;
  if (e.phase !== 'pret') return null;
  const { detectees, brouillon, source, chibis } = e;
  const personnes = brouillon.personnes ?? [];
  const noms = Object.fromEntries(personnes.map((p) => [p.id, p.nom]));
  const couleur = (p: string | null) => COULEURS_VOIX[Math.max(0, personnes.findIndex((x) => x.id === p)) % COULEURS_VOIX.length];
  const toutes = lignes(brouillon, detectees.src);
  const visibles = toutes.slice(0, limite);
  return (
    <>
      <div class="qp-etat" data-testid="v3-qp-methode" data-methode={detectees.methode}>
        <strong>{TV.voix.methode[detectees.methode]}</strong>
        {detectees.voix.length > 1 && <span class="petit doux">{TV.voix.sure(Math.round(detectees.sure * 100))}</span>}
      </div>
      {detectees.voix.length === 0 ? (
        <p>{TV.voix.aucuneVoix}</p>
      ) : (
        <CartesVoix detectees={detectees} source={source} noms={noms} chibis={chibis} surNom={nommerVoix} surChibi={choisirChibiVoix} />
      )}
      {toutes.length > 0 && (
        <section class="champ">
          <span class="champ-titre">{TV.voix.phrases}</span>
          <span class="petit doux">{motsDe(brouillon).length > 0 ? TV.voix.phrasesAide : TV.voix.sansMots}</span>
          <ul class="liste-phrases" data-testid="v3-qp-phrases">
            {visibles.map((l, k) => (
              <li key={`${l.ts}-${l.fin}`}>
                <button
                  type="button"
                  class="phrase-voix"
                  data-sur={l.sur ? '1' : '0'}
                  data-p={l.p ?? ''}
                  data-ts={l.ts}
                  data-fin={l.fin}
                  onClick={() => corrigerPhrase(l.ts, l.fin)}
                  data-testid={`v3-qp-phrase-${k}`}
                >
                  <span class="pastille-voix" style={{ background: l.p ? couleur(l.p) : 'transparent' }} aria-hidden="true" />
                  <span class="petit chiffres doux">{horodatage(l.ts)}</span>
                  <span class="phrase-voix-texte">{l.texte}</span>
                  <span class="phrase-voix-qui">
                    {l.p ? noms[l.p] ?? l.p : '—'}
                    {!l.sur && ` · ${TV.voix.incertain}`}
                  </span>
                </button>
                <select
                  class="phrase-situation"
                  aria-label={TV.situations.choisir}
                  value={situationDe(brouillon, l.ts, l.fin, detectees.src)}
                  onChange={(ev) => changerSituation(l.ts, l.fin, (ev.target as HTMLSelectElement).value as Situation)}
                  data-testid={`v3-qp-situation-${k}`}
                >
                  {SITUATIONS.map((s) => (
                    <option key={s} value={s}>
                      {TV.situations.noms[s]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {toutes.length > visibles.length && (
            <button type="button" class="btn" onClick={plus} data-testid="v3-qp-plus">
              {TV.voix.plus(Math.min(PAR_PAGE, toutes.length - visibles.length))}
            </button>
          )}
        </section>
      )}
      <div class="qp-pied">
        <button type="button" class="btn" onClick={() => void demarrerQuiParle(true)} data-testid="v3-qp-reecouter">
          {TV.voix.reecouter}
        </button>
        <button type="button" class="btn" onClick={oublierQuiParle} data-testid="v3-qp-oublier">
          {TV.voix.retirer}
        </button>
      </div>
      <button type="button" class="btn btn-principal" onClick={validerQuiParle} disabled={detectees.voix.length === 0} data-testid="v3-qp-valider">
        {TV.voix.valider}
      </button>
    </>
  );
}
