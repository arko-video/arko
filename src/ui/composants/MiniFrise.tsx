// Mini-frise de Habiller : seulement les calques de l'outil ouvert (barres de textes, lignes de sous-titres).
// Glisser = défiler · toucher une barre = la choisir · règle ou tête = se déplacer · zoom et ±1 image comme dans Couper.
// Réutilise la règle, la tête de lecture et les calculs de la frise de Couper.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { dureeFinale } from '../../recette/operations';
import { T } from '../../textes-fr';
import { recette, recetteAffichee, teteLecture } from '../etat';
import { auCentieme, formatTemps, pasImage } from '../format';
import { chercher, mettreEnPause } from '../lecture';
import { clavierTete } from './frise-clavier';
import { borner, bornerDecalage, graduations, MARGE_FRISE as MARGE, pasDeRegle, PPS_MAX } from './frise-outils';
import { TuilesGeneriques, xTete } from './FriseGeneriques';
import { Regle, TeteLecture } from './FriseElements';
import { IconeImageMoins, IconeImagePlus, IconeMoins, IconePlus } from './Icones';
import { RepereRythme } from './RepereRythme';

export interface Calque {
  /** Identifiant transmis au toucher (indice du texte, indice de la ligne…). */
  id: number;
  t0: number;
  t1: number;
  label: string;
  choisi?: boolean;
  /** Couleur de la barre. */
  genre: 'texte' | 'accroche' | 'ligne' | 'son' | 'zoom' | 'coupe' | 'plan' | 'chapitre' | 'clip' | 'meme' | 'insere';
  /** Pastille ronde centrée sur t0 (une coupe), au lieu d'une barre. */
  point?: boolean;
}

interface Props {
  calques: Calque[];
  onToucher(c: Calque): void;
}

const SEUIL = 6;
/** Hauteur d'un rang : la zone de toucher d'une barre fait 44 px de haut (barre visible de 28 px). */
const H_RANG = 44;
const RANGS_MAX = 3;
/** Largeur d'une pastille de coupe (zone de toucher). */
const TAILLE_POINT = 36;

type Geste = { type: 'defile'; id: number; x0: number; dec0: number; bouge: boolean; calque: number | null } | { type: 'tete'; id: number };

/** Range les calques en rangs sans chevauchement (3 rangs au plus, le reste va dans le dernier). */
export function rangerCalques(calques: Calque[]): number[] {
  const fins: number[] = [];
  return calques.map((c) => {
    let r = fins.findIndex((f) => f <= c.t0 + 1e-6);
    if (r < 0) r = fins.length < RANGS_MAX ? fins.length : RANGS_MAX - 1;
    fins[r] = Math.max(fins[r] ?? 0, c.t1);
    return r;
  });
}

export function MiniFrise({ calques, onToucher }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const [largeurVue, setLargeurVue] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [decalage, setDecalage] = useState(0);
  const geste = useRef<Geste | null>(null);

  const r = recetteAffichee.value;
  const rv = recette.value;
  const tete = teteLecture.value;
  const duree = r ? dureeFinale(r) : 0;
  const dureeValidee = Math.max(0.1, rv ? dureeFinale(rv) : duree);
  const ppsAjuste = Math.max(1, (largeurVue - 2 * MARGE) / dureeValidee);
  const zoomMax = Math.max(1, PPS_MAX / ppsAjuste);
  const pps = ppsAjuste * borner(zoom, 1, zoomMax);
  const largeurContenu = 2 * MARGE + duree * pps;
  const xDe = (t: number) => MARGE + t * pps - decalage;
  const tempsA = (x: number) => (x + decalage - MARGE) / pps;

  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeurVue(el.clientWidth || 320));
    ro.observe(el);
    setLargeurVue(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setDecalage((d) => bornerDecalage(d, largeurContenu, largeurVue)), [largeurContenu, largeurVue]);

  // La frise suit la tête de lecture quand elle sort de la vue.
  useEffect(() => {
    if (geste.current) return;
    const x = MARGE + tete * pps - decalage;
    if (x > largeurVue - MARGE || x < MARGE) setDecalage(bornerDecalage(MARGE + tete * pps - largeurVue / 4, largeurContenu, largeurVue));
  }, [tete]);

  function zoomer(facteur: number) {
    const nouveau = borner(zoom * facteur, 1, zoomMax);
    const nPps = ppsAjuste * nouveau;
    const xTete = borner(MARGE + tete * pps - decalage, 0, largeurVue);
    setZoom(nouveau);
    setDecalage(bornerDecalage(MARGE + tete * nPps - xTete, 2 * MARGE + duree * nPps, largeurVue));
  }

  const xLocal = (e: PointerEvent) => e.clientX - (element.current?.getBoundingClientRect().left ?? 0);
  const placerTete = (x: number) => chercher(auCentieme(borner(tempsA(x), 0, duree)));

  function bas(e: PointerEvent) {
    if (!e.isPrimary || geste.current) return;
    element.current?.setPointerCapture(e.pointerId);
    mettreEnPause();
    const cible = (e.target as Element).closest<HTMLElement>('[data-cible]');
    const type = cible?.dataset.cible;
    if (type === 'regle' || type === 'tete') {
      geste.current = { type: 'tete', id: e.pointerId };
      if (type === 'regle') placerTete(xLocal(e));
      return;
    }
    const calque = type === 'calque' ? Number(cible!.dataset.i) : null;
    geste.current = { type: 'defile', id: e.pointerId, x0: xLocal(e), dec0: decalage, bouge: false, calque };
  }
  function bouge(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    const x = xLocal(e);
    if (g.type === 'tete') return placerTete(x);
    if (!g.bouge && Math.abs(x - g.x0) > SEUIL) g.bouge = true;
    if (g.bouge) setDecalage(bornerDecalage(g.dec0 - (x - g.x0), largeurContenu, largeurVue));
  }
  function haut(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    if (g.type === 'defile' && !g.bouge && e.type === 'pointerup' && g.calque !== null) {
      const c = calques[g.calque];
      if (c) onToucher(c);
    }
  }

  if (!r) return null;
  const rangs = rangerCalques(calques);
  const nRangs = Math.max(1, Math.min(RANGS_MAX, Math.max(0, ...rangs) + 1));
  const pas = pasDeRegle(pps);
  const ticks = graduations(tempsA(0), tempsA(largeurVue), pas);

  return (
    <div class="mini-frise-bloc">
      <div
        ref={element}
        class="frise mini-frise"
        style={{ height: `${32 + nRangs * H_RANG + 4}px` }}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        data-testid="mini-frise"
      >
        <Regle ticks={ticks} pas={pas} xDe={xDe} />
        <div class="mini-frise-piste" role="group" aria-label={T.habiller.calques} style={{ height: `${nRangs * H_RANG}px` }}>
          <div class="mini-frise-fond" style={{ left: `${xDe(0)}px`, width: `${duree * pps}px` }} />
          <TuilesGeneriques xDe={xDe} duree={duree} />
          {calques.length === 0 && (
            <span class="mini-frise-vide petit doux" style={{ left: `${Math.max(8, xDe(0) + 8)}px` }}>
              {T.habiller.rien}
            </span>
          )}
          {calques.map((c, i) => {
            const x = c.point ? xDe(c.t0) - TAILLE_POINT / 2 : xDe(c.t0);
            const w = c.point ? TAILLE_POINT : Math.max(10, (c.t1 - c.t0) * pps - 2);
            if (x > largeurVue + 40 || x + w < -40) return null;
            return (
              <button
                type="button"
                key={`${c.genre}-${c.id}-${i}`}
                class="calque"
                data-genre={c.genre}
                data-cible="calque"
                data-i={i}
                data-choisi={c.choisi ? '1' : '0'}
                aria-pressed={c.choisi ?? false}
                aria-label={`${c.label}, ${formatTemps(c.t0)}`}
                style={{ left: `${x}px`, width: `${w}px`, top: `${Math.min(rangs[i], RANGS_MAX - 1) * H_RANG}px` }}
                onClick={(e) => {
                  if (e.detail === 0) onToucher(c);
                }}
                data-testid={`calque-${c.genre}-${c.id}`}
              >
                <span class="calque-label">{c.label}</span>
              </button>
            );
          })}
        </div>
        <RepereRythme xDe={xDe} pps={pps} largeurVue={largeurVue} />
        <TeteLecture x={xTete(tete, xDe, duree)} tete={tete} duree={duree} onKeyDown={(e) => clavierTete(e, tete, duree)} />
      </div>

      <div class="mini-frise-outils">
        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={T.couper.imageMoins} onClick={() => avancer(-1)} data-testid="image-moins">
          <IconeImageMoins />
        </button>
        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={T.couper.imagePlus} onClick={() => avancer(1)} data-testid="image-plus">
          <IconeImagePlus />
        </button>
        <span class="chiffres petit doux mini-frise-temps" aria-hidden="true">
          {T.habiller.temps(formatTemps(tete), formatTemps(duree))}
        </span>
        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={T.couper.zoomMoins} onClick={() => zoomer(1 / 1.6)} data-testid="zoom-moins">
          <IconeMoins taille={18} />
        </button>
        <button type="button" class="btn btn-icone encadre petit-btn" aria-label={T.couper.zoomPlus} onClick={() => zoomer(1.6)} data-testid="zoom-plus">
          <IconePlus taille={18} />
        </button>
      </div>
    </div>
  );
}

function avancer(n: number) {
  mettreEnPause();
  chercher(pasImage(teteLecture.peek(), n));
}
