// Montage express, écran 3 (les deux styles : Montage express et Best-of serré) : « Qui parle ? », les voix trouvées
// (CartesVoix du dev 1 : nom, 3 extraits, perso), et en Best-of : « Sous-titres pour : <personne> » (la voix qu'on
// entend mal, choisie d'office) et le nombre de passages pas retenus (retrouvés après le montage dans Couper).
// Best-of v4 (dev-ui) : « Combien de personnes parlent ? » (Une seule / Deux : la chaîne est refaite depuis les mesures
// gardées, sans réécouter) et, quand Arko n'entend qu'une voix ou hésite, l'empreinte de voix (28 Mo, une fois,
// seulement après le geste de l'utilisateur).

import type { AnalyseBestOf, SceneBestOf } from '../../../auto/express/best-of';
import { TV } from '../../../textes-v3';
import { CartesVoix } from '../voix/CartesVoix';
import { parcoursV4 } from './best-of-v4';
import { chibisVoix, chibiVoix, enBestOf, nommerVoix, nomsVoix, sousTitresPourVoix } from './etat-best-of';
import { analyseExpress, reglagesExpress, sourceExpress } from './etat-express';
import { choixCombien, estV4 } from './etat-v4';
import { ReglagePrecis } from './SousTitresPrecis';
import { TEXTES_V4 } from './textes-v4';

const TB = TV.bestOf;
const TR = TEXTES_V4.revue;

/** Petite étiquette « resserrée » d'une séquence (scène drôle mais longue). */
export function EtiquetteResserree({ scene }: { scene: SceneBestOf }) {
  const n = scene.morceaux?.length ?? 0;
  if (n === 0) return null;
  return (
    <span class="petit express-resserree" title={TB.resserreeAide(n)} data-testid="express-resserree">
      {TB.resserree} · {TB.resserreeAide(n)}
    </span>
  );
}

/** Lien « Qui parle ? » (en haut de la revue) : descend jusqu'aux cartes des voix. */
function LienQuiParle() {
  return (
    <p class="petit">
      <a
        href="#express-voix"
        class="lien"
        data-testid="express-lien-qui-parle"
        onClick={(e) => {
          e.preventDefault();
          const s = document.getElementById('express-voix');
          s?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          s?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
        }}
      >
        {TB.lienQuiParle}
      </a>{' '}
      <span class="doux">— {TB.lienQuiParleAide}</span>
    </p>
  );
}

/** Best-of v4 : « Combien de personnes parlent ? » (pas avec des pistes séparées : là, c'est exact). */
function CombienDeVoix() {
  const a = analyseExpress.value;
  if (!estV4(a) || !a.voix || a.voix.methode === 'pistes' || !parcoursV4.aDesMesures()) return null;
  // 3 voix ou plus : « Trois ou plus » actif, « Deux » se touche (relecture point 12).
  const { actif, choix } = choixCombien(a.voix.voix.length, parcoursV4.forcer.value);
  return (
    <div class="champ" data-testid="express-combien">
      <span class="champ-titre">{TR.combien}</span>
      <div class="segments" role="radiogroup" aria-label={TR.combien}>
        {choix.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={actif === n} data-actif={actif === n ? '1' : '0'} onClick={() => actif !== n && parcoursV4.forcerVoix(n === 3 ? null : n)} data-testid={`express-voix-${n}`}>
            {n === 1 ? TR.une : n === 2 ? TR.deux : TR.trois}
          </button>
        ))}
      </div>
      <span class="petit doux">{TR.combienAide}</span>
    </div>
  );
}

/** Best-of v4 : l'empreinte de voix (28 Mo), proposée seulement quand le niveau ne sépare pas les voix. */
function PropositionEmpreinte() {
  const a = analyseExpress.value;
  const e = parcoursV4.empreinte.value;
  if (!estV4(a)) return null;
  const raison = a.besoins.raisonEmpreinte;
  if (!raison || a.besoins.empreintes.length === 0 || e.phase === 'refusee' || e.phase === 'faite') return null;
  const TE = TR.empreinte;
  return (
    <div class="message message-info express-empreinte" data-testid="express-empreinte" data-phase={e.phase}>
      {e.phase === 'rien' && (
        <>
          <span>{raison === 'memeNiveau' ? TE.memeNiveau : TE.ambigus}</span>
          <div class="express-empreinte-boutons">
            <button type="button" class="btn btn-principal express-mini" onClick={() => void parcoursV4.accepterEmpreinte()} data-testid="express-empreinte-oui">
              {TE.oui}
            </button>
            <button type="button" class="btn express-mini" onClick={() => parcoursV4.refuserEmpreinte()} data-testid="express-empreinte-non">
              {TE.non}
            </button>
          </div>
        </>
      )}
      {(e.phase === 'telechargement' || e.phase === 'calcul') && (
        <>
          <span role="status">{e.phase === 'telechargement' ? TE.telechargement : TE.calcul}</span>
          <div class="ca-progression" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.p * 100)}>
            <span style={{ width: `${Math.round(e.p * 100)}%` }} />
          </div>
        </>
      )}
      {e.phase === 'erreur' && <span role="alert">{e.message}</span>}
    </div>
  );
}

/** `haut` : lien « Qui parle ? » et passages pas retenus (au-dessus des séquences) ; `bas` : les voix. */
export function RevueBestOf({ partie }: { partie: 'haut' | 'bas' }) {
  const a = analyseExpress.value as (AnalyseBestOf & Partial<Pick<AnalyseBestOf, 'passages'>>) | null;
  const source = sourceExpress.value;
  if (!a || !source) return null;
  const bestOf = enBestOf();
  const voix = a.voix ?? null;
  const ecoutees = 'voix' in a && (bestOf || reglagesExpress.value.persos !== false);
  const noms = nomsVoix.value;
  const pour = sousTitresPourVoix.value;
  const nomDe = (id: string, k: number) => noms[id] ?? TV.voix.voix(k + 1);
  if (partie === 'haut') {
    return (
      <>
        {voix && <LienQuiParle />}
        {bestOf && a.passages && a.passages.length > 0 && (
          <p class="petit message message-info" data-testid="express-passages">
            {TB.passages(a.passages.length)}. {TB.passagesAide}
          </p>
        )}
      </>
    );
  }
  if (!ecoutees) return null;
  const v4 = estV4(a);
  return (
    <section class="champ" id="express-voix" data-testid={bestOf ? 'express-best-of' : 'express-voix'}>
      <span class="champ-titre">{TB.lienQuiParle}</span>
      <p class="petit doux">{!voix ? TB.pasDeVoix : voix.voix.length < 2 ? TB.aucuneVoix : TB.voixAide}</p>
      {v4 && <CombienDeVoix />}
      {v4 && <PropositionEmpreinte />}
      {voix && (
        <CartesVoix
          detectees={voix}
          source={source}
          noms={noms}
          chibis={Object.fromEntries(Object.entries(chibisVoix.value).map(([p, c]) => [p, c.def]))}
          surNom={nommerVoix}
          surChibi={chibiVoix}
        />
      )}
      {bestOf && voix && a.parole === 'mots' && (
        <>
          <span class="champ-titre">{TB.sousTitresPour}</span>
          <p class="petit doux">{TB.sousTitresPourAide}</p>
          <div class="segments" role="radiogroup" aria-label={TB.sousTitresPour}>
            {[null, ...voix.voix.map((v) => v.id)].map((id, k) => (
              <button
                key={id ?? '-'}
                type="button"
                role="radio"
                aria-checked={pour === id}
                data-actif={pour === id ? '1' : '0'}
                onClick={() => (sousTitresPourVoix.value = id)}
                data-testid={`express-st-pour-${id ?? 'personne'}`}
              >
                {id === null ? TB.personne : nomDe(id, k - 1)}
              </button>
            ))}
          </div>
          {v4 && <ReglagePrecis />}
        </>
      )}
      {v4 && voix && voix.voix.length > 0 && <p class="petit doux">{TR.phraseApres}</p>}
    </section>
  );
}
