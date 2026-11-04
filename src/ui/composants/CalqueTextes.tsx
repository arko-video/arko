// Calque DOM posé sur l'aperçu de Habiller : une zone par texte visible (boitesTextes du moteur).
// Glisser un texte le déplace (x, y), avec un aimant au centre en x ; pendant le glissé la zone sûre s'affiche.
// Toucher un texte sans le déplacer l'ouvre dans l'outil Texte. Le reste de l'aperçu garde son comportement.

import { useRef } from 'preact/hooks';
import { boitesTextes, type BoiteTexte } from '../../moteur/api';
import { modifierTexte } from '../../recette/operations';
import { TEXTE } from '../../recette/defauts';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { modifier, recette, recetteAffichee, recetteTemporaire, teteLecture, zoneSure } from '../etat';
import { glisseTexte, ouvrirOutil, outilOuvert, texteChoisi, validerSaisie } from '../habillage';
import { mettreEnPause } from '../lecture';
import { bornerCentre } from '../placement';
import { IconeZoneSure } from './Icones';

const SEUIL_PX = 6;
/** Aimant au centre : à moins de 3 % de la largeur, le texte se recentre. */
const AIMANT = 0.03;
/** Flèches du clavier : 1 % par appui, 5 % avec Maj. */
const PAS_CLAVIER = 0.01;
const PAS_CLAVIER_MAJ = 0.05;

interface Geste {
  id: number;
  i: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  l: number;
  h: number;
  r0: Recette;
  bouge: boolean;
  aimante: boolean;
}

/**
 * Nouvelle position (centre du texte) après un glissé de (dx, dy) en fractions de l'aperçu. Pure.
 * C'est la BOÎTE entière (l × h) qui reste dans la zone sûre, comme au dessin.
 */
export function positionGlissee(g: { cx: number; cy: number; l: number; h: number }, dx: number, dy: number) {
  let x = g.cx + dx;
  const aimante = Math.abs(x - 0.5) < AIMANT;
  if (aimante) x = 0.5;
  return { ...bornerCentre(x, g.cy + dy, g.l, g.h), aimante };
}

/** Déplace le texte i avec les flèches (une entrée d'annulation par appui). */
function clavierTexte(e: KeyboardEvent, b: BoiteTexte) {
  const sens: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = sens[e.key];
  if (!d) return;
  e.preventDefault();
  validerSaisie();
  const pas = e.shiftKey ? PAS_CLAVIER_MAJ : PAS_CLAVIER;
  modifier((r) => {
    const x = r.textes[b.i];
    if (!x) return r;
    const p = bornerCentre((x.x ?? TEXTE.x) + d[0] * pas, (x.y ?? TEXTE.y) + d[1] * pas, b.l, b.h);
    return modifierTexte(r, b.i, p);
  });
}

export function CalqueTextes() {
  const geste = useRef<Geste | null>(null);
  const r = recetteAffichee.value;
  const tete = teteLecture.value;
  const glisse = glisseTexte.value;
  let boites: BoiteTexte[] = [];
  try {
    boites = r ? boitesTextes(r, tete) : [];
  } catch (e) {
    console.error(e);
  }

  function bas(e: PointerEvent, b: BoiteTexte) {
    e.stopPropagation();
    if (!e.isPrimary || geste.current) return;
    validerSaisie();
    const r0 = recette.peek();
    const x = r0?.textes[b.i];
    if (!r0 || !x) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    geste.current = {
      id: e.pointerId, i: b.i, x0: e.clientX, y0: e.clientY,
      cx: x.x ?? TEXTE.x, cy: x.y ?? TEXTE.y, l: b.l, h: b.h, r0, bouge: false, aimante: false,
    };
  }

  function bouge(e: PointerEvent) {
    e.stopPropagation();
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    const apercu = (e.currentTarget as HTMLElement).closest('.apercu') as HTMLElement | null;
    const L = apercu?.clientWidth || 1;
    const H = apercu?.clientHeight || 1;
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SEUIL_PX) {
      g.bouge = true;
      mettreEnPause();
      glisseTexte.value = true;
    }
    if (!g.bouge) return;
    const p = positionGlissee(g, (e.clientX - g.x0) / L, (e.clientY - g.y0) / H);
    if (p.aimante && !g.aimante && 'vibrate' in navigator) navigator.vibrate(8);
    g.aimante = p.aimante;
    recetteTemporaire.value = modifierTexte(g.r0, g.i, { x: p.x, y: p.y });
  }

  function haut(e: PointerEvent) {
    e.stopPropagation();
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    if (g.bouge) {
      const finale = recetteTemporaire.peek();
      recetteTemporaire.value = null;
      glisseTexte.value = false;
      if (e.type === 'pointerup' && finale) modifier(() => finale);
    } else if (e.type === 'pointerup') {
      choisirTexte(g.i);
    }
  }

  const aimante = glisse && geste.current?.aimante;
  return (
    <>
      <div class="calque-textes" data-testid="calque-textes">
        {aimante && <span class="guide-centre" aria-hidden="true" data-testid="guide-centre" />}
        {boites.map((b) => {
          const txt = r?.textes[b.i]?.txt ?? '';
          return (
            <button
              type="button"
              key={b.i}
              class="boite-texte"
              data-choisi={texteChoisi.value === b.i && outilOuvert.value === 'texte' ? '1' : '0'}
              aria-label={T.habiller.texteBoite(txt)}
              style={{ left: `${(b.x + b.l / 2) * 100}%`, top: `${(b.y + b.h / 2) * 100}%`, width: `${b.l * 100}%`, height: `${b.h * 100}%` }}
              onPointerDown={(e) => bas(e, b)}
              onPointerMove={bouge}
              onPointerUp={haut}
              onPointerCancel={haut}
              onKeyDown={(e) => clavierTexte(e, b)}
              onClick={(e) => {
                if (e.detail === 0) choisirTexte(b.i);
              }}
              data-testid={`texte-boite-${b.i}`}
            />
          );
        })}
      </div>
      <BoutonZoneSure />
    </>
  );
}

/** Ouvre le texte i dans l'outil Texte. */
export function choisirTexte(i: number) {
  validerSaisie();
  texteChoisi.value = i;
  ouvrirOutil('texte');
}

/** Petite icône dans le coin de l'aperçu : affiche ou masque la zone sûre à la main. */
function BoutonZoneSure() {
  const actif = zoneSure.value;
  const stop = (e: Event) => e.stopPropagation();
  return (
    <button
      type="button"
      class="bouton-zone-sure"
      data-actif={actif ? '1' : '0'}
      aria-pressed={actif}
      aria-label={T.zoneSure.bouton}
      title={T.zoneSure.aide}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={() => (zoneSure.value = !actif)}
      data-testid="zone-sure-bouton"
    >
      <span class="bouton-zone-sure-visuel">
        <IconeZoneSure taille={18} />
      </span>
    </button>
  );
}
