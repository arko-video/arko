// Aperçu 9:16 (ou 16:9 en YouTube vidéo) : canevas dessiné par le lecteur du moteur, bouton lecture, zone sûre en calque DOM.
// Peut recevoir un glissé horizontal (cadrage du Plein écran) : un simple toucher lance/arrête la lecture.

import { useSignalEffect } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { creerLecteur, type Lecteur } from '../../moteur/api';
import { T } from '../../textes-fr';
import { textesPour } from '../../textes-youtube';
import { destinationProjet, gabaritProjet } from '../destination';
import { recetteAffichee, sources, teteLecture, zoneSure } from '../etat';
import { basculerLecture, brancherLecteur, enLecture } from '../lecture';
import { IconeLecture, IconePause } from './Icones';

export interface Glisse {
  debut(): void;
  /** dx en fraction de la largeur de l'aperçu (−1 à 1), depuis le début du glissé. */
  deplacer(dx: number): void;
  fin(): void;
}

interface Props {
  glisse?: Glisse;
  enfants?: ComponentChildren;
  /** Affiche la zone sûre même si l'interrupteur est coupé (pendant le glissé d'un texte). */
  zoneSureForcee?: boolean;
}

const SEUIL_GLISSE_PX = 6;

export function Apercu({ glisse, enfants, zoneSureForcee }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lecteurRef = useRef<Lecteur | null>(null);
  const attente = useRef(0);
  const geste = useRef<{ id: number; x0: number; glisse: boolean } | null>(null);
  /** Dernière recette donnée au lecteur : on ne rappelle jamais charger() avec la même (B-1). */
  const chargee = useRef<{ r: unknown; s: unknown }>({ r: null, s: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let l: Lecteur;
    try {
      l = creerLecteur(canvas);
    } catch (e) {
      console.error('Aperçu indisponible', e);
      return;
    }
    lecteurRef.current = l;
    brancherLecteur(l);
    const desabonner = l.surChangement(() => {
      teteLecture.value = l.temps;
      enLecture.value = l.enLecture;
    });
    const r = recetteAffichee.peek();
    if (r) {
      const s = sources.peek();
      chargee.current = { r, s };
      l.charger(r, s);
      l.aller(teteLecture.peek());
    }
    return () => {
      cancelAnimationFrame(attente.current);
      desabonner();
      brancherLecteur(null);
      lecteurRef.current = null;
      l.detruire();
    };
  }, []);

  // Recharge la recette à chaque modification (au plus une fois par image).
  // Au montage, la recette a déjà été chargée ci-dessus : on ne la recharge pas une 2ᵉ fois.
  useSignalEffect(() => {
    const r = recetteAffichee.value;
    const s = sources.value;
    cancelAnimationFrame(attente.current);
    attente.current = requestAnimationFrame(() => {
      const l = lecteurRef.current;
      if (!r || !l) return;
      if (chargee.current.r === r && chargee.current.s === s) return;
      chargee.current = { r, s };
      l.charger(r, s);
    });
  });

  const lecture = enLecture.value;
  const paysage = gabaritProjet.value.paysage;

  function bas(e: PointerEvent) {
    if (!e.isPrimary) return;
    geste.current = { id: e.pointerId, x0: e.clientX, glisse: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function bouge(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId || !glisse) return;
    const dx = e.clientX - g.x0;
    if (!g.glisse && Math.abs(dx) > SEUIL_GLISSE_PX) {
      g.glisse = true;
      glisse.debut();
    }
    if (g.glisse) {
      const largeur = (e.currentTarget as HTMLElement).clientWidth || 1;
      glisse.deplacer(dx / largeur);
    }
  }
  function haut(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    if (g.glisse) glisse?.fin();
    else if (e.type === 'pointerup') basculerLecture();
  }

  return (
    <div
      class="apercu"
      data-paysage={paysage ? '1' : '0'}
      data-lecture={lecture ? '1' : '0'}
      data-glisse={glisse ? '1' : '0'}
      style={glisse ? { cursor: 'grab' } : undefined}
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onPointerCancel={haut}
      data-testid="apercu"
    >
      <canvas ref={canvasRef} width={paysage ? 960 : 540} height={paysage ? 540 : 960} role="img" aria-label={T.apercu.canvas} />
      {(zoneSure.value || zoneSureForcee) && <ZoneSure />}
      {enfants}
      <button
        type="button"
        class="apercu-lecture"
        aria-label={lecture ? T.apercu.pause : T.apercu.lire}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={basculerLecture}
        data-testid="lecture"
      >
        {lecture ? <IconePause taille={22} /> : <IconeLecture taille={22} />}
      </button>
    </div>
  );
}

/** Ce que l'interface de la plateforme cache (TikTok : haut 12,5 %, bas 34,375 %, côtés 11,1 %). */
export function ZoneSure() {
  const z = gabaritProjet.value.zone;
  const pc = (v: number) => `${(v * 100).toFixed(3)}%`;
  const style = { '--zs-haut': pc(z.haut), '--zs-bas': pc(z.bas), '--zs-cote': pc(z.cote) } as Record<string, string>;
  return (
    <div class="zone-sure" aria-hidden="true" data-testid="zone-sure" style={style}>
      <div class="zs-haut" />
      <div class="zs-bas" />
      <div class="zs-gauche" />
      <div class="zs-droite" />
      <div class="zs-cadre" />
    </div>
  );
}

export function InterrupteurZoneSure() {
  return (
    <label class="interrupteur">
      <span>
        <strong>{T.zoneSure.titre}</strong>
        <span class="petit doux">{textesPour(destinationProjet.value).zoneSureAide}</span>
      </span>
      <input
        type="checkbox"
        checked={zoneSure.value}
        onChange={(e) => (zoneSure.value = (e.currentTarget as HTMLInputElement).checked)}
        data-testid="zone-sure-interrupteur"
      />
    </label>
  );
}
