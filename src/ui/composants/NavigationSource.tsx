// Navigation dans une longue vidéo d'origine (live de 2 h…), affichée dans Couper au-delà de 3 min.
// Une barre = toute la source ; en citron les passages gardés. On touche un moment (ou on tape « 1:30:00 »),
// puis « Déplacer ce passage ici » ou « Ajouter un passage ici » : 1 h 30 en deux gestes.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { SourceOuverte } from '../../moteur/api';
import { ajouterPlan, bornesDesPlans, deplacerPlan } from '../../recette/operations';
import { T } from '../../textes-fr';
import { afficherToast, modifier, recette, recetteAffichee, selection } from '../etat';
import { formatHeure, lireHeure } from '../format';
import { chercher, mettreEnPause } from '../lecture';
import { demanderVignette } from '../vignettes';
import { borner } from './frise-outils';
import { VignettesPlan } from './Vignettes';

/** Au-delà de cette durée de source, la barre est affichée. */
export const SEUIL_LONGUE_SOURCE = 180;
const H_BARRE = 48;
const DUREE_AJOUT = 30;

export function NavigationSource({ source }: { source: SourceOuverte }) {
  const D = source.infos.duree;
  const barre = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(320);
  const [point, setPoint] = useState<number | null>(null);
  const [glisse, setGlisse] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const r = recetteAffichee.value;
  const sel = selection.value;

  useEffect(() => {
    const el = barre.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth || 320));
    ro.observe(el);
    setLargeur(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  if (!r) return null;
  const pps = largeur / D;

  function tempsDe(e: PointerEvent) {
    const gauche = barre.current?.getBoundingClientRect().left ?? 0;
    return Math.round(borner((e.clientX - gauche) / pps, 0, D));
  }

  function bas(e: PointerEvent) {
    if (!e.isPrimary) return;
    barre.current?.setPointerCapture(e.pointerId);
    setGlisse(true);
    setErreur(null);
    setPoint(tempsDe(e));
  }
  function bouge(e: PointerEvent) {
    if (glisse) setPoint(tempsDe(e));
  }
  function haut() {
    setGlisse(false);
  }
  function clavier(e: KeyboardEvent) {
    const pas: Record<string, number> = { ArrowRight: 10, ArrowLeft: -10, PageUp: 300, PageDown: -300 };
    const t = point ?? 0;
    if (e.key in pas) setPoint(borner(t + pas[e.key], 0, D));
    else if (e.key === 'Home') setPoint(0);
    else if (e.key === 'End') setPoint(D);
    else return;
    e.preventDefault();
  }

  function aller(e: Event) {
    e.preventDefault();
    const t = lireHeure(saisie);
    if (t === null || t < 0 || t > D) {
      setErreur(T.source.invalide(formatHeure(D)));
      return;
    }
    setErreur(null);
    setPoint(t);
  }

  /** Après une modification, on montre le plan i : sélection + tête de lecture à son début. */
  function montrer(i: number) {
    const rr = recette.peek();
    if (!rr || i >= rr.plans.length) return;
    selection.value = i;
    chercher(bornesDesPlans(rr)[i]);
  }

  function deplacer() {
    if (point === null) return;
    mettreEnPause();
    const i = sel ?? 0;
    if (modifier((x) => deplacerPlan(x, i, point))) {
      montrer(i);
      afficherToast(T.source.deplace(formatHeure(point)));
    }
  }
  function ajouter() {
    if (point === null) return;
    mettreEnPause();
    const apres = sel ?? r!.plans.length - 1;
    if (modifier((x) => ajouterPlan(x, point, DUREE_AJOUT, apres))) {
      montrer(apres + 1);
      afficherToast(T.source.ajoute(formatHeure(point)));
    }
  }

  const xPoint = point === null ? null : point * pps;

  return (
    <section class="nav-source" aria-labelledby="nav-source-titre" data-testid="nav-source">
      <h3 id="nav-source-titre" class="nav-source-titre">
        {T.source.titre(formatHeure(D))}
      </h3>
      <div
        ref={barre}
        class="nav-source-barre"
        role="slider"
        tabIndex={0}
        aria-label={T.source.barre}
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={point ?? 0}
        aria-valuetext={point === null ? undefined : formatHeure(point)}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        onKeyDown={clavier}
        data-testid="nav-source-barre"
      >
        <div class="nav-source-images" aria-hidden="true">
          <VignettesPlan source={source} de={0} a={D} vit={1} x={0} largeur={largeur} largeurVue={largeur} hauteur={H_BARRE} pps={pps} />
        </div>
        {r.plans.map((p, i) => (
          <span
            key={i}
            class="nav-source-garde"
            data-choisi={sel === i ? '1' : '0'}
            aria-hidden="true"
            style={{ left: `${p.de * pps}px`, width: `${Math.max(3, (p.a - p.de) * pps)}px` }}
          />
        ))}
        {xPoint !== null && <span class="nav-source-point" aria-hidden="true" style={{ left: `${xPoint}px` }} />}
        {xPoint !== null && glisse && <BulleSource source={source} ts={point!} x={borner(xPoint, 48, largeur - 48)} />}
      </div>
      <p class="petit doux nav-source-aide" aria-live="polite" data-testid="nav-source-point">
        {point === null ? T.source.aide : T.source.point(formatHeure(point))}
      </p>
      <div class="grille-2">
        <button type="button" class="btn" disabled={point === null} onClick={deplacer} data-testid="nav-source-deplacer">
          {T.source.deplacer}
        </button>
        <button type="button" class="btn" disabled={point === null} onClick={ajouter} data-testid="nav-source-ajouter">
          {T.source.ajouter}
        </button>
      </div>
      <form class="nav-source-aller" onSubmit={aller}>
        <label for="nav-source-saisie" class="petit">
          {T.source.allerA}
        </label>
        <input
          id="nav-source-saisie"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder={T.source.exemple}
          value={saisie}
          aria-invalid={erreur !== null}
          aria-describedby={erreur ? 'nav-source-erreur' : undefined}
          onInput={(e) => setSaisie((e.currentTarget as HTMLInputElement).value)}
          data-testid="nav-source-saisie"
        />
        <button type="submit" class="btn" data-testid="nav-source-aller">
          {T.source.allerOk}
        </button>
      </form>
      {erreur && (
        <p id="nav-source-erreur" class="petit nav-source-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

/** Bulle de temps avec une petite image de la source, pendant le glissé. */
function BulleSource({ source, ts, x }: { source: SourceOuverte; ts: number; x: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Une image tous les 1/100 de la source au plus : le cache de vignettes reste petit.
  const grain = Math.max(1, source.infos.duree / 100);
  const tsImage = Math.round(ts / grain) * grain;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    return demanderVignette(source, tsImage, 54, (img) => {
      if (!img) return;
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')?.drawImage(img, 0, 0);
    });
  }, [source, tsImage]);
  return (
    <div class="bulle bulle-source chiffres" style={{ left: `${x}px` }} aria-hidden="true" data-testid="nav-source-bulle">
      <canvas ref={canvas} width={96} height={54} />
      <span>{formatHeure(ts)}</span>
    </div>
  );
}
