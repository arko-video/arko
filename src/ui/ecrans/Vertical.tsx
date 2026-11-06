// Étape 3 : mettre en vertical. Fond flou, Plein écran (on fait glisser l'image pour cadrer),
// Jeu + webcam (un éditeur s'ouvre pour placer le cadre de la webcam).
// En YouTube 16:9, la même étape devient « Cadrage » : Plein 16:9 (recadré) ou Ajustée + fond flou.

import { useRef, useState } from 'preact/hooks';
import { choisirMise } from '../../recette/operations';
import type { MiseEnPage, Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { TY } from '../../textes-youtube';
import { gabaritProjet } from '../destination';
import { Apercu, InterrupteurZoneSure, type Glisse } from '../composants/Apercu';
import { EditeurWebcam } from '../composants/EditeurWebcam';
import { Entete } from '../composants/Entete';
import { IconeGlisser } from '../composants/Icones';
import { afficherToast, modifier, recette, recetteAffichee, recetteTemporaire, sources } from '../etat';
import { auCentieme } from '../format';
import { suivant } from '../navigation';
import { mettreEnPause } from '../lecture';
import { lireCamMemorisee, memoriserCam, miseJeuCamDepart } from '../webcam';

type TypeMise = MiseEnPage['type'];

/** Mises en page disponibles, dans l'ordre des cartes. */
const MISES_ACTIVES: TypeMise[] = ['flou', 'recadre', 'jeuCam'];

/** Flèches du clavier dans le groupe de cartes (comportement standard d'un groupe de boutons radio). */
function clavierMises(e: KeyboardEvent, actuel: TypeMise, choisir: (t: TypeMise) => void) {
  const sens = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!sens) return;
  e.preventDefault();
  const i = Math.max(0, MISES_ACTIVES.indexOf(actuel));
  const suivante = MISES_ACTIVES[(i + sens + MISES_ACTIVES.length) % MISES_ACTIVES.length];
  choisir(suivante);
  const groupe = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => groupe.querySelector<HTMLElement>(`[data-testid="mise-${suivante}"]`)?.focus());
}

export function Vertical() {
  const r = recetteAffichee.value;
  const debutGlisse = useRef<{ r0: Recette; x0: number } | null>(null);
  const [editeur, setEditeur] = useState(false);
  const paysage = gabaritProjet.value.paysage;
  if (!r) return null;
  const type = r.mise.type;
  const src = sources.value[0]?.infos;
  // Part de la largeur source visible en plein écran (9:16, ou 16:9 en YouTube vidéo).
  const rapport = paysage ? 16 / 9 : 9 / 16;
  const partVisible = src?.l && src?.h ? Math.min(1, (rapport * src.h) / src.l) : paysage ? 1 : 0.3164;
  const nom = paysage ? TY.cadrage.nom : T.vertical.nom;

  function choisir(t: TypeMise) {
    const actuel = recette.peek()?.mise.type;
    if (t === 'jeuCam') {
      mettreEnPause();
      if (actuel !== 'jeuCam') {
        // Le dernier cadre webcam est proposé d'un montage à l'autre.
        const mem = lireCamMemorisee();
        const mise = miseJeuCamDepart(mem);
        if (modifier((x) => choisirMise(x, mise))) memoriserCam(mise);
        if (mem) afficherToast(T.webcam.repris);
      }
      setEditeur(true);
      return;
    }
    if (t === actuel) return;
    modifier((x) => choisirMise(x, t === 'recadre' ? { type: 'recadre', x: 0.5 } : { type: 'flou' }));
  }

  if (editeur && type === 'jeuCam') {
    return (
      <div class="ecran">
        <Entete titre={T.vertical.nom} ecran="vertical" avecHistorique />
        <main class="ecran-corps vertical">
          <h2 class="titre titre-etape">{T.webcam.titre}</h2>
          <EditeurWebcam />
        </main>
        <footer class="ecran-pied">
          <button type="button" class="btn btn-principal" onClick={() => setEditeur(false)} data-testid="webcam-ok">
            {T.webcam.ok}
          </button>
        </footer>
      </div>
    );
  }

  const glisse: Glisse | undefined =
    type === 'recadre'
      ? {
          debut() {
            const r0 = recette.peek();
            if (!r0 || r0.mise.type !== 'recadre') return;
            mettreEnPause();
            debutGlisse.current = { r0, x0: r0.mise.x ?? 0.5 };
          },
          deplacer(dx) {
            const g = debutGlisse.current;
            if (!g) return;
            // L'image suit le doigt : glisser vers la droite montre ce qui est à gauche.
            const marge = partVisible / 2;
            const x = auCentieme(Math.min(1 - marge, Math.max(marge, g.x0 - dx * partVisible)));
            recetteTemporaire.value = choisirMise(g.r0, { type: 'recadre', x });
          },
          fin() {
            const finale = recetteTemporaire.peek();
            recetteTemporaire.value = null;
            debutGlisse.current = null;
            if (finale) modifier(() => finale);
          },
        }
      : undefined;

  return (
    <div class="ecran">
      <Entete titre={nom} ecran="vertical" avecHistorique />
      <main class="ecran-corps vertical" data-paysage={paysage ? '1' : '0'}>
        <h2 class="titre titre-etape">{paysage ? TY.cadrage.titre : T.vertical.titre}</h2>
        <Apercu
          glisse={glisse}
          enfants={
            type === 'recadre' && (
              <span class="aide-glisse" aria-hidden="true">
                <IconeGlisser taille={16} />
              </span>
            )
          }
        />
        {type === 'recadre' && (
          <p class="petit doux centre" data-testid="aide-recadre">
            {T.vertical.aideRecadre}
          </p>
        )}

        {paysage ? (
          <div class="mises mises-169" role="radiogroup" aria-label={TY.cadrage.titre}>
            <CarteMise type="recadre" actif={type === 'recadre'} label={TY.cadrage.plein} onChoisir={choisir} />
            <CarteMise type="flou" actif={type === 'flou'} label={TY.cadrage.ajuste} onChoisir={choisir} />
          </div>
        ) : (
          <div class="mises" role="radiogroup" aria-label={T.vertical.titre} onKeyDown={(e) => clavierMises(e, type, choisir)}>
            <CarteMise type="flou" actif={type === 'flou'} label={T.vertical.fondFlou} onChoisir={choisir} />
            <CarteMise type="recadre" actif={type === 'recadre'} label={T.vertical.pleinEcran} onChoisir={choisir} />
            <CarteMise type="jeuCam" actif={type === 'jeuCam'} label={T.vertical.jeuWebcam} onChoisir={choisir} />
          </div>
        )}
        {type === 'jeuCam' && (
          <button type="button" class="btn" onClick={() => setEditeur(true)} data-testid="regler-webcam">
            {T.vertical.regler}
          </button>
        )}

        <InterrupteurZoneSure />
      </main>
      <footer class="ecran-pied">
        <button
          type="button"
          class="btn btn-principal"
          onClick={() => {
            mettreEnPause();
            suivant();
          }}
          data-testid="suivant"
        >
          {T.suivant}
        </button>
      </footer>
    </div>
  );
}

function CarteMise({
  type,
  actif,
  label,
  onChoisir,
  bientot,
}: {
  type: TypeMise;
  actif: boolean;
  label: string;
  onChoisir: (t: TypeMise) => void;
  bientot?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      tabIndex={actif ? 0 : -1}
      aria-disabled={bientot || undefined}
      disabled={bientot}
      class="carte-mise"
      data-actif={actif ? '1' : '0'}
      onClick={() => onChoisir(type)}
      data-testid={`mise-${type}`}
    >
      <span class={`mini mini-${type}`} aria-hidden="true">
        <span class="mini-jeu" />
        {type === 'jeuCam' && <span class="mini-cam" />}
      </span>
      <span class="carte-mise-label">{label}</span>
      {bientot && <span class="badge">{T.vertical.bientot}</span>}
    </button>
  );
}
