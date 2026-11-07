// Montage express, écran 3 (les deux styles : Montage express et Best-of serré) : « Qui parle ? », les voix trouvées
// (CartesVoix du dev 1 : nom, 3 extraits, perso), et en Best-of : « Sous-titres pour : <personne> » (la voix qu'on
// entend mal, choisie d'office) et le nombre de passages pas retenus (retrouvés après le montage dans Couper).

import type { AnalyseBestOf, SceneBestOf } from '../../../auto/express/best-of';
import { TV } from '../../../textes-v3';
import { CartesVoix } from '../voix/CartesVoix';
import { chibisVoix, chibiVoix, enBestOf, nommerVoix, nomsVoix, sousTitresPourVoix } from './etat-best-of';
import { analyseExpress, reglagesExpress, sourceExpress } from './etat-express';

const TB = TV.bestOf;

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
  return (
    <section class="champ" id="express-voix" data-testid={bestOf ? 'express-best-of' : 'express-voix'}>
      <span class="champ-titre">{TB.lienQuiParle}</span>
      <p class="petit doux">{!voix ? TB.pasDeVoix : voix.voix.length < 2 ? TB.aucuneVoix : TB.voixAide}</p>
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
        </>
      )}
    </section>
  );
}
