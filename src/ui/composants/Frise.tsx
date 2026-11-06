// Frise des plans de l'écran Couper (rendu et état). Les gestes sont dans frise-gestes.ts,
// le clavier dans frise-clavier.ts, les petits éléments dans FriseElements.tsx.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bornesDesPlans } from '../../recette/operations';
import { T } from '../../textes-fr';
import { recette, recetteAffichee, selection, sources, teteLecture } from '../etat';
import { formatDuree } from '../format';
import { tempsFortsSortie } from '../guide';
import { RepereRythme } from './RepereRythme';
import { clavierPoignee, clavierTete } from './frise-clavier';
import { creerGestesFrise, type Geste, type VueFrise } from './frise-gestes';
import { borner, bornerDecalage, graduations, MARGE_FRISE as MARGE, pasDeRegle, PPS_MAX } from './frise-outils';
import { TuilesGeneriques, xTete } from './FriseGeneriques';
import { Poignee, Regle, TeteLecture } from './FriseElements';
import { VignettesPlan } from './Vignettes';

const H_PLAN = 64;

export function Frise({ zoomRef }: { zoomRef?: { current: ((facteur: number) => void) | null } }) {
  const element = useRef<HTMLDivElement>(null);
  const [largeurVue, setLargeurVue] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [decalage, setDecalage] = useState(0);
  const [decalageGeste, setDecalageGeste] = useState<number | null>(null);
  const [bulle, setBulle] = useState<{ x: number; texte: string } | null>(null);
  const geste = useRef<Geste | null>(null);
  const pointeurs = useRef(new Map<number, number>());

  const r = recetteAffichee.value;
  const rv = recette.value;
  const source = sources.value[0];
  const tete = teteLecture.value;
  const sel = selection.value;

  // Échelle calculée sur la recette validée (stable pendant un rognage).
  const dureeValidee = rv ? Math.max(0.1, bornesDesPlans(rv).at(-1) ?? 0.1) : 1;
  const ppsAjuste = Math.max(1, (largeurVue - 2 * MARGE) / dureeValidee);
  const zoomMax = Math.max(1, PPS_MAX / ppsAjuste);
  const pps = ppsAjuste * borner(zoom, 1, zoomMax);

  const bornes = r ? bornesDesPlans(r) : [0];
  const duree = bornes.at(-1) ?? 0;
  const largeurContenu = 2 * MARGE + duree * pps;
  const dec = decalageGeste ?? decalage;
  const xDe = (t: number) => MARGE + t * pps - dec;
  const tempsA = (x: number) => (x + dec - MARGE) / pps;

  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeurVue(el.clientWidth || 320));
    ro.observe(el);
    setLargeurVue(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  // Garde le décalage dans les bornes quand la taille ou le zoom changent.
  useEffect(() => {
    if (decalageGeste === null) setDecalage((d) => bornerDecalage(d, largeurContenu, largeurVue));
  }, [largeurContenu, largeurVue, decalageGeste]);

  // La frise suit la tête de lecture (lecture, ±1 image, passage déplacé…) quand elle sort de la vue.
  useEffect(() => {
    if (geste.current) return;
    const x = MARGE + tete * pps - decalage;
    if (x > largeurVue - MARGE || x < MARGE) {
      setDecalage(bornerDecalage(MARGE + tete * pps - largeurVue / 4, largeurContenu, largeurVue));
    }
  }, [tete]);

  /** Zoom par les boutons −/+, centré sur la tête de lecture. */
  function zoomer(facteur: number) {
    const nouveau = borner(zoom * facteur, 1, zoomMax);
    const nPps = ppsAjuste * nouveau;
    const xTete = borner(MARGE + tete * pps - decalage, 0, largeurVue);
    setZoom(nouveau);
    setDecalage(bornerDecalage(MARGE + tete * nPps - xTete, 2 * MARGE + duree * nPps, largeurVue));
  }
  if (zoomRef) zoomRef.current = zoomer;

  if (!r || !rv || !source) return null;

  const vue: VueFrise = {
    pps, ppsAjuste, zoom, zoomMax, decalage, decalageGeste, largeurVue, largeurContenu, duree, xDe, tempsA,
  };
  const gestes = creerGestesFrise({
    vue,
    element: element.current,
    geste,
    pointeurs,
    recette: rv,
    dureeSource: source.infos.duree,
    setZoom,
    setDecalage,
    setDecalageGeste,
    setBulle,
  });

  const pas = pasDeRegle(pps);
  const ticks = graduations(tempsA(0), tempsA(largeurVue), pas);
  const poignees = r.plans.length === 1 ? 0 : sel;

  return (
    <div
      ref={element}
      class="frise"
      onPointerDown={gestes.bas}
      onPointerMove={gestes.bouge}
      onPointerUp={gestes.haut}
      onPointerCancel={gestes.haut}
      data-testid="frise"
    >
      <Regle ticks={ticks} pas={pas} xDe={xDe} />

      <div class="frise-piste" role="group" aria-label={T.couper.frise}>
        <TuilesGeneriques xDe={xDe} duree={duree} />
        <div
          class="frise-accroche"
          aria-hidden="true"
          style={{ left: `${xDe(0)}px`, width: `${Math.min(3, duree) * pps}px` }}
        />
        {tempsFortsSortie(r).map((t) => {
          const x = xDe(t);
          if (x < -2 || x > largeurVue + 2) return null;
          return <span key={t} class="temps-fort" aria-hidden="true" style={{ left: `${x}px` }} data-testid="temps-fort" />;
        })}
        {r.plans.map((p, i) => {
          const x = xDe(bornes[i]);
          const w = Math.max(4, (bornes[i + 1] - bornes[i]) * pps - 2);
          if (x > largeurVue + 60 || x + w < -60) return null;
          return (
            <button
              type="button"
              key={i}
              class="plan"
              data-cible="plan"
              data-i={i}
              data-choisi={sel === i ? '1' : '0'}
              aria-pressed={sel === i}
              aria-label={T.couper.plan(i + 1, formatDuree(bornes[i + 1] - bornes[i]))}
              style={{ left: `${x}px`, width: `${w}px` }}
              onClick={(e) => {
                // Clic clavier (Entrée/Espace) : les gestes au doigt sont gérés par frise-gestes.ts.
                if (e.detail === 0) selection.value = sel === i ? null : i;
              }}
              data-testid={`plan-${i}`}
            >
              <VignettesPlan
                source={source}
                de={p.de}
                a={p.a}
                vit={p.vit ?? 1}
                x={x}
                largeur={w}
                largeurVue={largeurVue}
                hauteur={H_PLAN - 8}
                pps={pps}
              />
              {p.fige ? <span class="plan-fige" style={{ width: `${Math.min(w, p.fige * pps)}px` }} data-testid={`fige-${i}`} /> : null}
              {(p.vit ?? 1) !== 1 && (
                <span class="plan-vitesse chiffres" data-testid={`badge-vitesse-${i}`}>
                  {T.plan.vitesseValeur(p.vit ?? 1)}
                </span>
              )}
            </button>
          );
        })}
        {poignees !== null && poignees < r.plans.length && (
          <>
            <Poignee type="debut" i={poignees} x={xDe(bornes[poignees])} onKeyDown={(e) => clavierPoignee(e, 'debut', poignees)} />
            <Poignee type="fin" i={poignees} x={xDe(bornes[poignees + 1]) - 2} onKeyDown={(e) => clavierPoignee(e, 'fin', poignees)} />
          </>
        )}
      </div>

      <RepereRythme xDe={xDe} pps={pps} largeurVue={largeurVue} />
      <TeteLecture x={xTete(tete, xDe, duree)} tete={tete} duree={duree} onKeyDown={(e) => clavierTete(e, tete, duree)} />
      {bulle && (
        <div class="bulle chiffres" style={{ left: `${borner(bulle.x, 32, largeurVue - 32)}px` }} data-testid="bulle">
          {bulle.texte}
        </div>
      )}
    </div>
  );
}
