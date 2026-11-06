// Montage express, écran 1 : Réglages. Destination, durée visée, ce qu'on garde, coupes, ce qu'Arko ajoute
// (punchlines, bruitages, zooms, titres, accroche, bords), musique (1 à 6 morceaux de Mes sons), Sans IA / Avec l'IA.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { avisMusique } from '../../../auto/son/credits';
import { FOURNISSEURS, masquer, moduleSousTitres, type IdFournisseur } from '../../../moteur/api';
import type { Destination } from '../../../recette/destination';
import type { NiveauBlancs } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { T } from '../../../textes-fr';
import { IconeRetour } from '../../composants/Icones';
import { nomCourt } from '../../composants/monteur/ReglagesIA';
import { afficherToast } from '../../etat';
import { formatDuree } from '../../format';
import { mesSons } from '../../mes-sons';
import { cleGardee, clesSaisies, garderCle, saisie, saisir } from '../../monteur/cles-monteur';
import { retour } from '../../navigation';
import { tailleArrondie } from '../../sous-titres-ui';
import { basculerMorceau, choisirDestinationExpress, destinationExpress, DUREES_EXPRESS, fournisseurExpress, lancerExpress, reglagesExpress, reglerExpress, sourceExpress } from './etat-express';

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

function Segments<V extends string>({ titre, valeurs, actif, nom, choisir, id }: { titre: string; valeurs: readonly V[]; actif: V; nom: (v: V) => string; choisir: (v: V) => void; id: string }) {
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
    </section>
  );
}

function Interrupteur({ titre, aide, coche, changer, id, children }: { titre: string; aide: string; coche: boolean; changer: (v: boolean) => void; id: string; children?: ComponentChildren }) {
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
  // Ma bibliothèque : le rayon Musiques d'abord.
  const musiques = mesSons.value.filter((x) => x.duree >= 8).sort((a, b) => Number(b.rayon === 'musiques') - Number(a.rayon === 'musiques'));
  const choisies = musiques.filter((x) => r.musique.includes(x.id));
  const avis = avisMusique(choisies.map((x) => x.nom));
  const durees = DUREES_EXPRESS[d];
  const iDuree = Math.max(0, durees.findIndex((x) => x.min === r.dureeVisee.min && x.max === r.dureeVisee.max));

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
        <Segments titre={TX.dureeVisee} id="duree" valeurs={['0', '1', '2']} actif={String(iDuree)} nom={(v) => fourchette(durees[Number(v)]!)} choisir={(v) => reglerExpress({ dureeVisee: durees[Number(v)]! })} />
        <Segments titre={TX.garder} id="garder" valeurs={['parole+forts', 'parole'] as const} actif={r.garder} nom={(v) => (v === 'parole' ? TX.paroleSeule : TX.parolesEtForts)} choisir={(v) => reglerExpress({ garder: v })} />
        <Segments titre={TX.coupe} id="niveau" valeurs={['serre', 'normal', 'large'] as NiveauBlancs[]} actif={r.niveauBlancs} nom={(v) => TX.niveaux[v]} choisir={(v) => reglerExpress({ niveauBlancs: v })} />

        <div class="express-interrupteurs">
          <Interrupteur titre={TX.transcrire} aide={TX.transcrireAide} coche={r.transcrire} changer={(v) => reglerExpress({ transcrire: v })} id="transcrire">
            {module && !module.present && r.transcrire && <span class="petit">{TX.moduleManque(module.taille)}</span>}
          </Interrupteur>
          <Interrupteur titre={TX.punchlines} aide={TX.punchlinesAide} coche={r.punchlines} changer={(v) => reglerExpress({ punchlines: v })} id="punchlines" />
          <Interrupteur titre={TX.bruitages} aide={TX.bruitagesAide} coche={r.bruitages} changer={(v) => reglerExpress({ bruitages: v })} id="bruitages" />
          <Interrupteur titre={TX.zooms} aide={TX.zoomsAide} coche={r.zooms !== null} changer={(v) => reglerExpress({ zooms: v ? 'normal' : null })} id="zooms" />
          {d === 'youtube' && <Interrupteur titre={TX.sections} aide={TX.sectionsAide} coche={r.sections} changer={(v) => reglerExpress({ sections: v })} id="sections" />}
          <Interrupteur titre={TX.accroche} aide={TX.accrocheAide} coche={r.accroche} changer={(v) => reglerExpress({ accroche: v })} id="accroche" />
          <Interrupteur titre={TX.bords} aide={TX.bordsAide} coche={r.bords} changer={(v) => reglerExpress({ bords: v })} id="bords" />
        </div>

        <section class="champ" data-testid="express-musique">
          <span class="champ-titre">{TX.musique}</span>
          <p class="petit doux">{TX.musiqueAide}</p>
          {musiques.length === 0 && <p class="petit">{TX.musiqueVide}</p>}
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
            <p key={c} class="petit message message-info">
              {c}
            </p>
          ))}
          {avis.alertes.map((a) => (
            <p key={a} class="petit message message-alerte">
              {a}
            </p>
          ))}
        </section>

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
        {r.avecIA && (
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
    </div>
  );
}
