// Montage express, écran 1 : le style du montage (Montage express / Best-of serré) et, en Best-of, ses réglages :
// titres de séquence (décochés d'office : facultatifs), qui parle, avatars, bips. Jamais de bruitages en Best-of.

import { TV } from '../../../textes-v3';
import { visible } from '../drapeaux';
import { Interrupteur } from './EcranReglagesExpress';
import { PRETE_BEST_OF, reglagesBestOf, reglerBestOf, styleMontage } from './etat-best-of';
import { choisirStyle } from './etat-express';

const TB = TV.bestOf;

export function ChoixStyle() {
  if (!visible('bestOf', PRETE_BEST_OF)) return null;
  const st = styleMontage.value;
  return (
    <section class="champ">
      <span class="champ-titre">{TB.mode}</span>
      <div class="modes" role="radiogroup" aria-label={TB.mode}>
        {(['express', 'bestOf'] as const).map((v) => (
          <button key={v} type="button" role="radio" class="mode" aria-checked={st === v} data-actif={st === v ? '1' : '0'} onClick={() => choisirStyle(v)} data-testid={`express-style-${v}`}>
            <strong>{v === 'bestOf' ? TB.bestOf : TB.express}</strong>
            <span class="petit doux">{v === 'bestOf' ? TB.bestOfAide : TB.expressAide}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Les interrupteurs propres au Best-of (à la place de Bruitages et Titres de section). */
export function InterrupteursBestOf() {
  const b = reglagesBestOf.value;
  return (
    <>
      <Interrupteur titre={TB.titresSequence} aide={TB.titresAide} coche={b.titres} changer={(v) => reglerBestOf({ titres: v })} id="bo-titres" />
      <Interrupteur titre={TB.quiParle} aide={TB.quiParleAide} coche={b.quiParle} changer={(v) => reglerBestOf({ quiParle: v })} id="bo-qui-parle" />
      <Interrupteur titre={TB.avatars} aide={TB.avatarsAide} coche={b.avatars} changer={(v) => reglerBestOf({ avatars: v })} id="bo-avatars" />
      <Interrupteur titre={TB.bips} aide={TB.bipsAide} coche={b.bips} changer={(v) => reglerBestOf({ bips: v })} id="bo-bips" />
      <p class="petit doux">{TB.sansBruitages}</p>
    </>
  );
}
