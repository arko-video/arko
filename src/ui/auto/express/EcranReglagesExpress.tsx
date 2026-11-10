// Montage express, écran 1 : Réglages. Destination, durée visée, ce qu'on garde, coupes, ce qu'Arko ajoute
// (punchlines, bruitages, zooms, titres, accroche, bords), musique (automatique d'office, ou 1 à 6 morceaux de Mes
// sons, ou aucune), Sans IA / Avec l'IA.
// Best-of (v4, dev-ui) : « Tout est prêt » + ce qu'Arko va faire ; le détail est sous « Changer les réglages »
// (le chemin d'office tient en 2 touchers : Analyser, puis Monter la vidéo). Si le module sous-titres manque, la
// carte d'accord s'ouvre au toucher sur « Analyser » (CarteModules).

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { avisMusique } from '../../../auto/son/credits';
import { FOURNISSEURS, masquer, moduleSousTitres, type IdFournisseur } from '../../../moteur/api';
import type { Destination } from '../../../recette/destination';
import type { NiveauBlancs } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { T } from '../../../textes-fr';
import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import { nomCourt } from '../../composants/monteur/ReglagesIA';
import { afficherToast } from '../../etat';
import { formatDuree } from '../../format';
import { mesSons } from '../../mes-sons';
import { cleGardee, clesSaisies, garderCle, saisie, saisir } from '../../monteur/cles-monteur';
import { retour } from '../../navigation';
import { tailleArrondie } from '../../sous-titres-ui';
import { enBestOf, styleMontage } from './etat-best-of';
import { ChoixStyle, InterrupteursBestOf } from './ReglagesStyle';
import { candidatsBibliotheque } from '../../../auto/son/musique-auto';
import { basculerMorceau, choisirDestinationExpress, choisirMusiqueAuto, destinationExpress, DUREES_EXPRESS, fournisseurExpress, lancerExpress, reglagesExpress, reglerExpress, sourceExpress } from './etat-express';
import { reglagesBestOf } from './etat-best-of';
import { CarteModules } from './CarteModules';
import { basculerRegard, etatRegard, regardActif, tailleRegardMo, TEXTES_REGARD as TR, verifierRegard } from './regard-ui';
import { TEXTES_MUSIQUE_EXPRESS as TM } from './textes-musique';
import { TEXTES_V4 } from './textes-v4';
import type { ReglagesExpress } from '../../../auto/express/express';

const TX = TA.express;

/** En-tête des 3 écrans : Retour, « Montage express », « Étape x sur 3 ». */
export function EnteteExpress({ n }: { n: 1 | 2 | 3 }) {
  return (
    <>
      <header class="entete">
        <button type="button" class="btn btn-icone" aria-label={T.retour} onClick={retour} data-testid="retour">
          <IconeRetour taille={22} />
        </button>
        <h1 class="entete-titre">
          <span class="monteur-etoile" aria-hidden="true" />
          {TX.nom}
        </h1>
      </header>
      <div class="etapes">
        <span class="etapes-texte" data-testid="etape-express">
          {TX.etape(n, TX.etapes[n - 1])}
        </span>
        <div class="etapes-barres" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} data-fait={i <= n ? '1' : '0'} />
          ))}
        </div>
      </div>
    </>
  );
}

/** « 15 à 20 min », « 1 à 2 min », « 45 s à 1 min ». */
export function fourchette(d: { min: number; max: number }): string {
  if (d.min >= 60 && d.min % 60 === 0) return `${d.min / 60} à ${formatDuree(d.max)}`;
  return `${formatDuree(d.min)} à ${formatDuree(d.max)}`;
}

export function Segments<V extends string>({ titre, valeurs, actif, nom, choisir, id, aide }: { titre: string; valeurs: readonly V[]; actif: V; nom: (v: V) => string; choisir: (v: V) => void; id: string; aide?: string }) {
  return (
    <section class="champ">
      <span class="champ-titre">{titre}</span>
      <div class="segments" role="radiogroup" aria-label={titre}>
        {valeurs.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={v === actif} data-actif={v === actif ? '1' : '0'} onClick={() => choisir(v)} data-testid={`express-${id}-${v}`}>
            {nom(v)}
          </button>
        ))}
      </div>
      {aide && <span class="petit doux">{aide}</span>}
    </section>
  );
}

/** Best-of : ce qu'Arko va faire avec les réglages actuels (pastilles), sous « Tout est prêt ». */
function CeQuArkoFait({ r, d, avecTextes }: { r: ReglagesExpress; d: { min: number; max: number }; avecTextes: boolean }) {
  const F = TEXTES_V4.fait;
  const b = reglagesBestOf.value;
  const musique = r.musiqueAuto === true || r.musique.length > 0;
  const pastilles = [
    F.duree(fourchette(d)),
    F.coupes(TX.niveaux[r.niveauBlancs]),
    musique ? F.musique : F.sansMusique,
    ...(b.avatars ? [F.persos] : []),
    avecTextes ? F.sousTitres : F.sansTextes,
    ...(r.accroche ? [F.accroche] : []),
  ];
  return (
    <section class="express-pret" data-testid="express-pret">
      <strong>{TEXTES_V4.pretTitre}</strong>
      <span class="petit doux">{TEXTES_V4.pretAide}</span>
      <ul class="express-pastilles">
        {pastilles.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  );
}

export function Interrupteur({ titre, aide, coche, changer, id, children }: { titre: string; aide: string; coche: boolean; changer: (v: boolean) => void; id: string; children?: ComponentChildren }) {
  return (
    <label class="interrupteur">
      <span>
        <strong>{titre}</strong>
        <span class="petit doux">{aide}</span>
        {children}
      </span>
      <input type="checkbox" checked={coche} onChange={(e) => changer((e.currentTarget as HTMLInputElement).checked)} data-testid={`express-${id}`} />
    </label>
  );
}

export function EcranReglagesExpress() {
  const s = sourceExpress.value;
  const r = reglagesExpress.value;
  const d = destinationExpress.value;
  const f = fournisseurExpress.value;
  void styleMontage.value; // relu à chaque changement de style
  const bestOf = enBestOf();
  const [module, setModule] = useState<{ present: boolean; taille: string } | null>(null);
  const [gardee, setGardee] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    moduleSousTitres()
      .then((m) => {
        if (!vivant) return;
        setModule({ present: m.present, taille: tailleArrondie(m.tailleOctets) });
      })
      .catch(() => vivant && setModule({ present: false, taille: tailleArrondie(9e7) }));
    return () => void (vivant = false);
  }, [s]);
  useEffect(() => {
    let vivant = true;
    void cleGardee(f).then((c) => vivant && setGardee(c ? masquer(c) : null));
    return () => void (vivant = false);
  }, [f]);

  if (!s) return null;
  const er = etatRegard.value;
  if (er.phase === 'inconnu') void verifierRegard();
  const texteRegard = () =>
    er.phase === 'telechargement' ? TR.telechargement(er.p) : er.phase === 'pret' ? TR.pret : er.phase === 'erreur' ? TR.erreur : TR.aTelecharger(tailleRegardMo);
  // Ma bibliothèque : le rayon Musiques d'abord.
  const musiques = mesSons.value.filter((x) => x.duree >= 8).sort((a, b) => Number(b.rayon === 'musiques') - Number(a.rayon === 'musiques'));
  const choisies = musiques.filter((x) => r.musique.includes(x.id));
  const avis = avisMusique(choisies.map((x) => x.nom));
  const auto = r.musiqueAuto === true;
  const nbBibliotheque = candidatsBibliotheque(mesSons.value).length;
  const durees = DUREES_EXPRESS[d];
  const iDuree = Math.max(0, durees.findIndex((x) => x.min === r.dureeVisee.min && x.max === r.dureeVisee.max));

  const detail = (
    <>
        <Segments titre={TX.garder} id="garder" valeurs={['parole+forts', 'parole'] as const} actif={r.garder} nom={(v) => (v === 'parole' ? TX.paroleSeule : TX.parolesEtForts)} choisir={(v) => reglerExpress({ garder: v })} />
        <Segments titre={TX.coupe} id="niveau" valeurs={['serre', 'normal', 'large'] as NiveauBlancs[]} actif={r.niveauBlancs} nom={(v) => TX.niveaux[v]} choisir={(v) => reglerExpress({ niveauBlancs: v })} {...(bestOf ? { aide: TEXTES_V4.coupeAide[r.niveauBlancs] } : {})} />

        <div class="express-interrupteurs">
          <Interrupteur titre={TX.transcrire} aide={TX.transcrireAide} coche={r.transcrire} changer={(v) => reglerExpress({ transcrire: v })} id="transcrire">
            {module && !module.present && r.transcrire && <span class="petit">{bestOf ? TEXTES_V4.transcrireManque(module.taille) : TX.moduleManque(module.taille)}</span>}
          </Interrupteur>
          <Interrupteur titre={TX.punchlines} aide={TX.punchlinesAide} coche={r.punchlines} changer={(v) => reglerExpress({ punchlines: v })} id="punchlines" />
          {!bestOf && <Interrupteur titre={TX.bruitages} aide={TX.bruitagesAide} coche={r.bruitages} changer={(v) => reglerExpress({ bruitages: v })} id="bruitages" />}
          <Interrupteur titre={TX.zooms} aide={TX.zoomsAide} coche={r.zooms !== null} changer={(v) => reglerExpress({ zooms: v ? 'normal' : null })} id="zooms" />
          {!bestOf && d === 'youtube' && <Interrupteur titre={TX.sections} aide={TX.sectionsAide} coche={r.sections} changer={(v) => reglerExpress({ sections: v })} id="sections" />}
          <Interrupteur titre={TX.accroche} aide={TX.accrocheAide} coche={r.accroche} changer={(v) => reglerExpress({ accroche: v })} id="accroche" />
          {bestOf && <InterrupteursBestOf />}
          {!bestOf && <Interrupteur titre={TV.bestOf.avatars} aide={TV.bestOf.avatarsAide} coche={r.persos !== false} changer={(v) => reglerExpress({ persos: v })} id="persos" />}
          <Interrupteur titre={TX.bords} aide={TX.bordsAide} coche={r.bords} changer={(v) => reglerExpress({ bords: v })} id="bords" />
        </div>

        <section class="champ" data-testid="express-musique">
          <span class="champ-titre">{TX.musique}</span>
          <Interrupteur titre={TM.auto} aide={TM.autoAide} coche={auto} changer={choisirMusiqueAuto} id="musique-auto" />
          {auto && (
            <>
              <p class="petit doux" data-testid="express-musique-sources">
                {nbBibliotheque > 0 ? TM.bibliotheque(nbBibliotheque) : TM.bibliothequeVide}
              </p>
              {nbBibliotheque === 0 && <p class="petit message message-info">{TM.credit}</p>}
            </>
          )}
          {!auto && r.musique.length === 0 && <p class="petit" data-testid="express-musique-aucune">{TM.aucune}</p>}
          <p class="petit doux">{TM.apres}</p>
          {musiques.length > 0 && <p class="petit doux">{TM.aChoisir}</p>}
          {musiques.length === 0 && !auto && <p class="petit">{TX.musiqueVide}</p>}
          <ul class="express-musiques">
            {musiques.map((m) => (
              <li key={m.id}>
                <label class="interrupteur">
                  <span>
                    <strong>{m.nom}</strong>
                    <span class="petit doux">
                      {m.etiquette ? `${m.etiquette} · ` : ''}
                      {formatDuree(m.duree)}
                    </span>
                  </span>
                  <input type="checkbox" checked={r.musique.includes(m.id)} onChange={() => basculerMorceau(m.id)} data-testid={`express-morceau-${m.nom}`} />
                </label>
              </li>
            ))}
          </ul>
          {avis.credits.map((c) => (
            <p key={c} class="petit message message-info" style={{ whiteSpace: 'pre-line' }}>
              {c}
            </p>
          ))}
          {avis.alertes.map((a) => (
            <p key={a} class="petit message message-alerte">
              {a}
            </p>
          ))}
        </section>

    </>
  );

  async function lancer() {
    if (reglagesExpress.peek().avecIA && !(await cleGardee(f))) {
      const tapee = saisie(f);
      if (!tapee) return afficherToast(TX.cleManque, 5000);
      await garderCle(f, tapee);
    }
    void lancerExpress();
  }

  return (
    <div class="ecran monteur express" data-testid="express-reglages">
      <EnteteExpress n={1} />
      <main class="ecran-corps">
        <div class="importer-titres">
          <h2 class="titre">{TX.reglagesTitre}</h2>
          <p class="intro petit doux">
            {s.infos.nom} · {formatDuree(s.infos.duree)}
          </p>
        </div>

        <Segments titre={TX.pour} id="pour" valeurs={['youtube', 'tiktok', 'short'] as Destination[]} actif={d} nom={(v) => TX.destinations[v]} choisir={choisirDestinationExpress} />
        <ChoixStyle />
        <Segments titre={TX.dureeVisee} id="duree" valeurs={['0', '1', '2']} actif={String(iDuree)} nom={(v) => fourchette(durees[Number(v)]!)} choisir={(v) => reglerExpress({ dureeVisee: durees[Number(v)]! })} />
        <div class="express-interrupteurs" data-testid="express-regard">
          <Interrupteur titre={TR.titre} aide={TR.aide} coche={regardActif.value} changer={(v) => void basculerRegard(v)} id="regard">
            {regardActif.value && <span class="petit">{texteRegard()}</span>}
          </Interrupteur>
        </div>
        {bestOf ? (
          <>
            <CeQuArkoFait r={r} d={r.dureeVisee} avecTextes={r.transcrire && r.punchlines} />
            {module && !module.present && r.transcrire && (
              <p class="petit message message-info" data-testid="express-module-propose">
                {TEXTES_V4.transcrireManque(module.taille)}
              </p>
            )}
            <details class="express-plus" data-testid="express-plus-reglages">
              <summary class="btn btn-contour">{TEXTES_V4.changerReglages}</summary>
              <div class="express-plus-corps">{detail}</div>
            </details>
          </>
        ) : (
          detail
        )}
        {!bestOf && (
        <section class="champ">
          <span class="champ-titre">{TX.mode}</span>
          <div class="modes" role="radiogroup" aria-label={TX.mode}>
            {([false, true] as const).map((ia) => (
              <button key={String(ia)} type="button" role="radio" class="mode" aria-checked={r.avecIA === ia} data-actif={r.avecIA === ia ? '1' : '0'} onClick={() => reglerExpress({ avecIA: ia })} data-testid={`express-mode-${ia ? 'ia' : 'sansIA'}`}>
                <strong>{ia ? TX.avecIA : TX.sansIA}</strong>
                <span class="petit doux">{ia ? TX.avecIAAide : TX.sansIAAide}</span>
              </button>
            ))}
          </div>
        </section>
        )}
        {!bestOf && r.avecIA && (
          <div class="reglages-ia">
            <div class="segments" role="radiogroup" aria-label={T.monteur.fournisseur}>
              {FOURNISSEURS.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === f} data-actif={x.id === f ? '1' : '0'} onClick={() => (fournisseurExpress.value = x.id as IdFournisseur)}>
                  {nomCourt(x.id)}
                </button>
              ))}
            </div>
            {gardee ? (
              <p class="cle-gardee">{TX.cleGardee(gardee)}</p>
            ) : (
              <input key={f} class="champ-saisie" type="password" autocomplete="off" spellcheck={false} aria-label={TX.cle} placeholder={TX.cle} value={clesSaisies.value[f] ?? ''} onInput={(e) => saisir(f, (e.currentTarget as HTMLInputElement).value)} />
            )}
            <p class="petit doux">{T.monteur.cleRassure}</p>
          </div>
        )}
      </main>
      <footer class="ecran-pied">
        <button type="button" class="btn btn-principal" onClick={() => void lancer()} data-testid="express-lancer">
          {TX.lancer}
        </button>
      </footer>
      {bestOf && <CarteModules />}
    </div>
  );
}
