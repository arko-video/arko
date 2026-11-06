// Monteur IA, écran 3 : la Revue. Plein écran, un clip à la fois, lu en boucle, avec sa raison (sans score).
// Balayer à droite = Garder (nouveau projet dans « Mes montages »), à gauche = Jeter. Boutons et flèches aussi.

import { useEffect, useRef, useState } from 'preact/hooks';
import { dureeFinale } from '../../../recette/operations';
import { T } from '../../../textes-fr';
import { IconeCoche, IconePoubelle, IconeRetour } from '../../composants/Icones';
import { LecteurClip } from '../../composants/monteur/LecteurClip';
import { formatDuree, formatHeure } from '../../format';
import { revue, sourceMonteur } from '../../monteur/etat-monteur';
import { quitterMonteur, retourMonteur } from '../../monteur/navigation-monteur';
import { gardesEcrits, garder, jeter, retoucherPremier } from '../../monteur/revue-monteur';
import { compilerGardes } from '../../monteur/compilation-monteur';
import { destinationChoisie } from '../../destination';
import { TY } from '../../../textes-youtube';

/** Part de la largeur à balayer pour garder ou jeter. */
const SEUIL = 0.28;

export function Revue() {
  const r = revue.value;
  const source = sourceMonteur.value;
  // Décalage du balayage et animation de sortie, notés pour UN brouillon (uid) : dès que le suivant s'affiche,
  // ils ne valent plus, sans attendre la fin de l'écriture (sinon le 1er geste sur le suivant serait ignoré).
  const [glisse, setGlisse] = useState<{ uid: string; dx: number } | null>(null);
  const [depart, setDepart] = useState<{ uid: string; a: 'garder' | 'jeter' } | null>(null);
  const geste = useRef<{ id: number; x0: number; largeur: number; bouge: boolean } | null>(null);
  const b = r?.restants[0];
  const dx = glisse && glisse.uid === b?.uid ? glisse.dx : 0;
  const sortie = depart && depart.uid === b?.uid ? depart.a : null;
  const setDx = (v: number) => b && setGlisse({ uid: b.uid, dx: v });

  function agir(a: 'garder' | 'jeter') {
    if (sortie || !b) return;
    setDepart({ uid: b.uid, a });
    // Petite animation de sortie, puis le clip suivant, une fois le choix écrit sur l'appareil.
    setTimeout(() => void (a === 'garder' ? garder() : jeter()), 180);
  }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible?.closest('input, textarea, select, dialog')) return;
      if (e.key === 'ArrowRight') agir('garder');
      else if (e.key === 'ArrowLeft') agir('jeter');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });

  if (!r) return null;
  if (!b) return <Fin />;
  if (!source) return null;

  const rang = r.total - r.restants.length + 1;
  const plans = b.recette.plans;
  const pic = b.recette.marqueurs?.[0]?.ts ?? b.recette.sons[0]?.ts ?? plans[0]?.de ?? 0;
  const debut = Math.min(...plans.map((p) => p.de));
  const fin = Math.max(...plans.map((p) => p.a));
  const decalage = sortie === 'garder' ? 480 : sortie === 'jeter' ? -480 : dx;
  const force = Math.max(-1, Math.min(1, decalage / 120));

  function bas(e: PointerEvent) {
    if (!e.isPrimary || sortie) return;
    const el = e.currentTarget as HTMLElement;
    geste.current = { id: e.pointerId, x0: e.clientX, largeur: el.clientWidth || 1, bouge: false };
    el.setPointerCapture(e.pointerId);
  }
  function bouge(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    const d = e.clientX - g.x0;
    if (Math.abs(d) > 8) g.bouge = true;
    if (g.bouge) setDx(d);
  }
  function haut(e: PointerEvent) {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    geste.current = null;
    const d = e.clientX - g.x0;
    if (g.bouge && Math.abs(d) > g.largeur * SEUIL) agir(d > 0 ? 'garder' : 'jeter');
    else setDx(0);
    // Un balayage n'est pas un toucher : on ne met pas l'aperçu en pause.
    if (g.bouge) {
      const bloquer = (ev: Event) => ev.stopPropagation();
      window.addEventListener('click', bloquer, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', bloquer, { capture: true }), 50);
    }
  }

  /** Geste repris par le navigateur (défilement…) : on remet la carte en place, sans garder ni jeter (M-1). */
  function annulerGeste(e: PointerEvent) {
    if (geste.current?.id !== e.pointerId) return;
    geste.current = null;
    setDx(0);
  }

  return (
    <div class="revue" data-testid="monteur-revue">
      <header class="revue-haut">
        <button
          type="button"
          class="btn btn-icone"
          aria-label={T.retour}
          onClick={retourMonteur}
          data-testid="retour"
        >
          <IconeRetour taille={22} />
        </button>
        <span class="revue-titre">{T.monteur.revueTitre}</span>
        <span class="revue-compteur chiffres" data-testid="revue-compteur">
          {T.monteur.compteur(rang, r.total)}
        </span>
      </header>

      <div class="revue-scene">
        <div
          // Un élément neuf par brouillon : le suivant apparaît en place, sans revenir du bord.
          key={b.uid}
          class="revue-carte"
          style={{
            transform: `translateX(${decalage}px) rotate(${decalage / 24}deg)`,
            transition: geste.current ? 'none' : undefined,
          }}
          onPointerDown={bas}
          onPointerMove={bouge}
          onPointerUp={haut}
          onPointerCancel={annulerGeste}
          data-testid="revue-carte"
          data-titre={b.recette.titre ?? ''}
          data-de={debut.toFixed(2)}
          data-a={fin.toFixed(2)}
          data-pic={pic.toFixed(2)}
        >
          <LecteurClip key={`${rang}`} recette={b.recette} source={source} />
          <span class="tampon tampon-garder" style={{ opacity: Math.max(0, force) }} aria-hidden="true">
            {T.monteur.garde}
          </span>
          <span class="tampon tampon-jeter" style={{ opacity: Math.max(0, -force) }} aria-hidden="true">
            {T.monteur.jete}
          </span>
          <div class="revue-infos">
            <strong class="revue-nom" data-testid="revue-titre">
              {b.recette.titre || T.monteur.nom}
            </strong>
            <span class="petit chiffres">
              {formatDuree(dureeFinale(b.recette))} · {T.monteur.plage(formatHeure(debut), formatHeure(fin))}
            </span>
            <p class="revue-raison" data-testid="revue-raison">
              {b.raison || T.monteur.raisonParDefaut}
            </p>
          </div>
        </div>
      </div>

      <p class="revue-aide petit doux">{T.monteur.aide}</p>
      <div class="revue-boutons">
        <button type="button" class="revue-btn revue-jeter" onClick={() => agir('jeter')} data-testid="jeter">
          <IconePoubelle taille={26} />
          {T.monteur.jeter}
        </button>
        <button
          type="button"
          class="revue-btn revue-garder"
          onClick={() => agir('garder')}
          data-testid="garder"
        >
          <IconeCoche taille={26} />
          {T.monteur.garder}
        </button>
      </div>
    </div>
  );
}

/** Fin de la revue : combien de clips sont dans « Mes montages », et la suite. */
function Fin() {
  const r = revue.value;
  const [occupe, setOccupe] = useState(false);
  const n = r?.gardes.length ?? 0;

  async function voirMontages() {
    setOccupe(true);
    await gardesEcrits();
    revue.value = null;
    quitterMonteur();
  }
  async function retoucher() {
    setOccupe(true);
    const ok = await retoucherPremier();
    if (!ok) setOccupe(false);
  }

  return (
    <div class="ecran monteur" data-testid="revue-fin">
      <main class="ecran-corps revue-fin">
        <span class="revue-fin-icone" aria-hidden="true">
          <IconeCoche taille={34} />
        </span>
        <h2 class="titre" data-testid="revue-fin-titre">
          {T.monteur.finTitre(n)}
        </h2>
        <p class="intro">{n > 0 ? T.monteur.finAide : T.monteur.finAucun}</p>
        {n > 0 && (
          <ul class="revue-gardes">
            {r!.gardes.map((g, i) => (
              <li key={i}>{g.titre}</li>
            ))}
          </ul>
        )}
      </main>
      <footer class="ecran-pied pile">
        <button
          type="button"
          class="btn btn-principal"
          disabled={occupe}
          onClick={() => void voirMontages()}
          data-testid="voir-montages"
        >
          {n > 0 ? T.monteur.voirMontages : T.monteur.accueil}
        </button>
        {n > 0 && sourceMonteur.value && destinationChoisie.value === 'youtube' && (
          <button
            type="button"
            class="btn"
            disabled={occupe}
            onClick={() => {
              setOccupe(true);
              void compilerGardes().then((ok) => !ok && setOccupe(false));
            }}
            data-testid="compiler"
          >
            {TY.monteur.compiler}
          </button>
        )}
        {n > 0 && sourceMonteur.value && (
          <button
            type="button"
            class="btn"
            disabled={occupe}
            onClick={() => void retoucher()}
            data-testid="retoucher-premier"
          >
            {T.monteur.retoucher}
          </button>
        )}
      </footer>
    </div>
  );
}
