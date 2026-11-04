// Étape 4 : habiller le clip. Disposition à la CapCut : l'aperçu en haut, une mini-frise (calques de l'outil
// ouvert), puis une barre d'outils en bas. Un outil s'ouvre dans un panneau du bas ; l'aperçu reste visible.
// Clavier ouvert : le panneau se réduit au champ de saisie.

import type { ComponentType } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import { avertissementsZone, dureePlan } from '../../recette/operations';
import { TEXTE } from '../../recette/defauts';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { Apercu } from '../composants/Apercu';
import { CalqueTextes, choisirTexte } from '../composants/CalqueTextes';
import { Entete } from '../composants/Entete';
import { calquesEffets } from '../composants/calques-effets';
import { CalqueZoom } from '../composants/CalqueZoom';
import {
  IconeAccroche,
  IconeAlerte,
  IconeCiseaux,
  IconeCoche,
  IconeSon,
  IconeSousTitres,
  IconeTexte,
  IconeTransition,
  IconeZoom,
} from '../composants/Icones';
import { IconeCombos, IconeModeles } from '../composants/IconesRythme';
import { MiniFrise, type Calque } from '../composants/MiniFrise';
import { calquesPlans, OutilCouper } from '../composants/outils/OutilCouper';
import { OutilCombos } from '../composants/outils/OutilCombos';
import { OutilModeles } from '../composants/outils/OutilModeles';
import { OutilAccroche } from '../composants/outils/OutilAccroche';
import { OutilSons } from '../composants/outils/OutilSons';
import { OutilSousTitres } from '../composants/outils/OutilSousTitres';
import { OutilTexte } from '../composants/outils/OutilTexte';
import { OutilTransitions } from '../composants/outils/OutilTransitions';
import { OutilZoom } from '../composants/outils/OutilZoom';
import { OutilChapitres } from '../composants/outils/OutilChapitres';
import { OutilGeneriques } from '../composants/outils/OutilGeneriques';
import { IconeChapitres, IconeGenerique } from '../composants/IconesYoutube';
import { TY } from '../../textes-youtube';
import { gabaritProjet } from '../destination';
import { coupeChoisie, coupes, sonChoisi, zoomChoisi } from '../effets';
import { planVise } from '../coupe-tete';
import { recetteAffichee, selection, teteLecture } from '../etat';
import { suivreClavier } from '../clavier';
import {
  clavierOuvert,
  fermerOutil,
  glisseTexte,
  indiceAccroche,
  lignesDe,
  ouvrirOutil,
  outilOuvert,
  texteChoisi,
  OUTILS_YOUTUBE,
  type Outil,
} from '../habillage';
import { chercher, mettreEnPause } from '../lecture';
import { suivant } from '../navigation';
import { conseil } from '../rythme';
import { travailSousTitres } from '../sous-titres-ui';

const BOUTONS: { outil: Outil; label: string; Icone: ComponentType<{ taille?: number }> }[] = [
  { outil: 'couper', label: T.coupe.outil, Icone: IconeCiseaux },
  { outil: 'accroche', label: T.habiller.accroche, Icone: IconeAccroche },
  { outil: 'texte', label: T.habiller.texte, Icone: IconeTexte },
  { outil: 'sousTitres', label: T.habiller.sousTitres, Icone: IconeSousTitres },
  { outil: 'sons', label: T.habiller.sons, Icone: IconeSon },
  { outil: 'transitions', label: T.habiller.transitions, Icone: IconeTransition },
  { outil: 'zoom', label: T.habiller.zoom, Icone: IconeZoom },
  { outil: 'combos', label: T.combos.titre, Icone: IconeCombos },
  { outil: 'modeles', label: T.modeles.titre, Icone: IconeModeles },
  { outil: 'chapitres', label: TY.chapitres.outil, Icone: IconeChapitres },
  { outil: 'generiques', label: TY.generiques.outil, Icone: IconeGenerique },
];

const TITRES: Record<Outil, string> = {
  couper: T.coupe.titre,
  accroche: T.accroche.titre,
  texte: T.texte.titre,
  sousTitres: T.sousTitres.titre,
  sons: T.sons.titre,
  transitions: T.transitions.titre,
  zoom: T.zoom.titre,
  combos: T.combos.titre,
  modeles: T.modeles.titre,
  chapitres: TY.chapitres.titre,
  generiques: TY.generiques.titre,
};

/** Élément choisi de l'outil d'effets ouvert (pour surligner son repère). */
function choixEffet(o: Outil | null): number | null {
  if (o === 'sons') return sonChoisi.value;
  if (o === 'transitions') return coupeChoisie.value;
  if (o === 'zoom') return zoomChoisi.value;
  return null;
}

/** Calques montrés par la mini-frise : seulement ceux de l'outil ouvert (tous si aucun outil). */
export function calquesPour(r: Recette, outil: Outil | null, choisi: number | null): Calque[] {
  if (outil === 'couper') return calquesPlans(r, choisi);
  if (outil === 'sons' || outil === 'transitions' || outil === 'zoom') return calquesEffets(r, outil, choisi);
  // Combos : on voit les zooms et les sons posés ; Modèles : tout.
  if (outil === 'combos') return [...calquesEffets(r, 'zoom', null), ...calquesEffets(r, 'sons', null)];
  if (outil === 'modeles') return calquesPour(r, null, null);
  // Chapitres (YouTube) : une barre par chapitre, jusqu'au suivant.
  if (outil === 'chapitres' || outil === 'generiques') {
    const fin = r.plans.reduce((s, p) => s + dureePlan(p), 0);
    const liste = r.chapitres ?? [];
    return liste.map((c, i) => ({ id: i, t0: c.t, t1: liste[i + 1]?.t ?? fin, label: c.nom, genre: 'chapitre' as const }));
  }
  const res: Calque[] = [];
  const iAcc = indiceAccroche(r);
  if (outil !== 'sousTitres') {
    r.textes.forEach((x, i) => {
      const estAcc = i === iAcc;
      if (outil === 'accroche' && !estAcc) return;
      res.push({
        id: i,
        t0: x.t,
        t1: x.t + (x.dur ?? TEXTE.dur),
        label: x.txt,
        genre: estAcc ? 'accroche' : 'texte',
        choisi: outil === 'texte' && choisi === i,
      });
    });
  }
  if (outil === 'sousTitres' || outil === null) {
    lignesDe(r).forEach((l, n) => res.push({ id: n, t0: l.t0, t1: l.t1, label: l.mots.map((m) => m[0]).join(' '), genre: 'ligne' }));
  }
  return res;
}

/** Messages « zone sûre » du moteur (textes déplacés, sous-titres trop bas). */
function lireAvertissements(r: Recette): string[] {
  try {
    return avertissementsZone(r);
  } catch (e) {
    console.error(e);
    return [];
  }
}

function toucherCalque(c: Calque) {
  mettreEnPause();
  // Outil Couper : un toucher choisit le plan (la tête de lecture ne bouge pas).
  if (c.genre === 'plan') return void (selection.value = c.id);
  chercher(c.t0 + 0.01);
  if (c.genre === 'son') sonChoisi.value = c.id;
  else if (c.genre === 'zoom') zoomChoisi.value = c.id;
  else if (c.genre === 'coupe') coupeChoisie.value = c.id;
  else if (c.genre === 'texte') choisirTexte(c.id);
  else if (c.genre === 'accroche') ouvrirOutil('accroche');
  else if (c.genre === 'chapitre') return;
  else {
    if (outilOuvert.peek() !== 'sousTitres') ouvrirOutil('sousTitres');
    requestAnimationFrame(() => document.querySelector(`[data-testid="ligne-${c.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
}

function ouvrir(o: Outil) {
  mettreEnPause();
  if (o === 'texte') texteChoisi.value = null;
  if (o === 'accroche') chercher(0);
  if (o === 'couper') selection.value = null;
  ouvrirOutil(o);
  // Transitions : la coupe la plus proche de la tête de lecture est choisie d'office.
  const r = recetteAffichee.peek();
  if (o === 'transitions' && r) {
    const t = teteLecture.peek();
    const proche = coupes(r).sort((a, b) => Math.abs(a[1] - t) - Math.abs(b[1] - t))[0];
    coupeChoisie.value = proche ? proche[0] : null;
  }
}

export function Habiller() {
  useEffect(() => suivreClavier(), []);
  const r = recetteAffichee.value;
  const outil = outilOuvert.value;
  // Outil Couper : le plan visé (choisi, sinon sous la tête de lecture).
  const choisi =
    outil === 'texte' ? texteChoisi.value : outil === 'couper' && r ? planVise(r, teteLecture.value, selection.value) : choixEffet(outil);
  // Calculés une fois par recette (pas à chaque image pendant la lecture).
  const calques = useMemo(() => (r ? calquesPour(r, outil, choisi) : []), [r, outil, choisi]);
  const avertissements = useMemo(() => (r ? lireAvertissements(r) : []), [r]);
  if (!r) return null;
  const clavier = clavierOuvert.value && outil !== null;
  const enCours = travailSousTitres.value.phase === 'encours';
  // Chapitres et Intro / outro : seulement en YouTube 16:9.
  const paysage = gabaritProjet.value.paysage;

  return (
    <div class="ecran habiller-ecran" data-outil={outil ?? ''} data-clavier={clavier ? '1' : '0'} data-testid="habiller">
      <Entete titre={T.habiller.nom} ecran="habiller" avecHistorique />
      <main class="habiller">
        <div class="habiller-apercu">
          <Apercu enfants={outil === 'zoom' ? <CalqueZoom /> : <CalqueTextes />} zoneSureForcee={glisseTexte.value} />
        </div>
        {!clavier && avertissements.length > 0 && (
          <div class="bandeau-zone" role="status" data-testid="avertissements-zone">
            <IconeAlerte taille={16} />
            <ul>
              {avertissements.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {!clavier && !outil && conseil.value && (
          <p class="bandeau-conseil petit" role="note" aria-label={T.rythme.accroche} data-testid="conseil-accroche">
            {conseil.value}
          </p>
        )}
        {!clavier && <MiniFrise calques={calques} onToucher={toucherCalque} />}
      </main>

      {outil ? (
        <section class="panneau" aria-labelledby="panneau-titre" data-testid={`panneau-${outil}`}>
          <header class="panneau-entete">
            <h2 id="panneau-titre" class="panneau-titre">
              {TITRES[outil]}
            </h2>
            <button type="button" class="btn panneau-fermer" aria-label={T.habiller.fermerAide} onClick={fermerOutil} data-testid="panneau-fermer">
              <IconeCoche taille={18} />
              {T.habiller.fermer}
            </button>
          </header>
          <div class="panneau-corps">
            {outil === 'couper' && <OutilCouper />}
            {outil === 'accroche' && <OutilAccroche />}
            {outil === 'texte' && <OutilTexte />}
            {outil === 'sousTitres' && <OutilSousTitres />}
            {outil === 'sons' && <OutilSons />}
            {outil === 'transitions' && <OutilTransitions />}
            {outil === 'zoom' && <OutilZoom />}
            {outil === 'combos' && <OutilCombos />}
            {outil === 'modeles' && <OutilModeles />}
            {outil === 'chapitres' && <OutilChapitres />}
            {outil === 'generiques' && <OutilGeneriques />}
          </div>
        </section>
      ) : (
        <footer class="habiller-pied">
          <nav class="barre-outils" aria-label={T.habiller.outils} data-testid="barre-outils">
            {BOUTONS.filter((b) => paysage || !OUTILS_YOUTUBE.includes(b.outil)).map(({ outil: o, label, Icone }) => (
              <button type="button" key={o} class="outil-bouton" onClick={() => ouvrir(o)} data-testid={`outil-${o}`}>
                <Icone taille={22} />
                <span>{label}</span>
                {o === 'sousTitres' && enCours && <span class="outil-pastille" aria-hidden="true" />}
              </button>
            ))}
          </nav>
          <div class="habiller-suivant">
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
          </div>
        </footer>
      )}
    </div>
  );
}
