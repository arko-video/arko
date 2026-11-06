// Volume final (F, dev 3), sur l'écran Exporter :
// - avant l'export, l'option « Régler le volume pour YouTube et TikTok (−14 LUFS) » (recette.volumeFinal) ;
// - une fois la vidéo prête : « Volume : −14,0 LUFS · crête −1,6 dBTP ». Rien tant que l'export ne donne pas `resultat.sonie`.

import { choisirVolumeFinal } from '../../../recette/operations-son-auto';
import { VOLUME_FINAL } from '../../../recette/normaliser-auto-son';
import { TA } from '../../../textes-auto';
import { etatExport, modifier, recette } from '../../etat';
import { Interrupteur } from '../../composants/outils/Reglages';
import { visible } from '../drapeaux';

const PRETE = true;

/** −14.04 → « −14,0 » (signe moins typographique, virgule). */
function dB(x: number): string {
  return `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')}`;
}

export function BilanVolume() {
  const e = etatExport.value;
  if (!visible('volumeFinal', PRETE) || e.phase !== 'fini' || !e.resultat.sonie) return null;
  const s = e.resultat.sonie;
  return (
    <p class="petit doux" data-testid="auto-bilan-volume" data-lufs={s.lufs.toFixed(2)} data-crete={s.creteDbtp.toFixed(2)}>
      {TA.son.volume.bilan(dB(s.lufs), dB(s.creteDbtp))}
    </p>
  );
}

/** Option avant l'export : volume réglé pour YouTube et TikTok (−14 LUFS, crête −1,5 dBTP). */
export function OptionVolumeFinal() {
  const r = recette.value;
  if (!r || !visible('volumeFinal', PRETE)) return null;
  return (
    <Interrupteur
      titre={TA.son.volume.option}
      aide={TA.son.volume.aide}
      actif={!!r.volumeFinal}
      onChange={(v) => modifier((x) => choisirVolumeFinal(x, v ? { lufs: VOLUME_FINAL.lufs, crete: VOLUME_FINAL.crete } : null))}
      testid="auto-volume-final"
    />
  );
}
