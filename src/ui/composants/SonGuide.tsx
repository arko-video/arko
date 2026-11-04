// Son guide dans Couper : importer le son tendance, régler où il commence et son volume,
// caler les coupes sur ses temps forts. Bandeau permanent : il ne sera pas dans la vidéo.

import { useEffect } from 'preact/hooks';
import { GUIDE } from '../../recette/defauts';
import { T } from '../../textes-fr';
import { recetteAffichee } from '../etat';
import { formatTemps } from '../format';
import {
  analyserGuide,
  caleRythme,
  choisirGuide,
  decalerGuide,
  guideEnCours,
  reglerGuide,
  retirerGuide,
  sourceGuide,
  tempsFortsGuide,
  tempsFortsSortie,
} from '../guide';
import { IconeAlerte, IconeNote, IconePoubelle } from './Icones';
import { CurseurValeur, Decaler, Interrupteur } from './outils/Reglages';

function ChoisirFichier({ label, testid }: { label: string; testid: string }) {
  return (
    <label class="btn guide-choisir" data-occupe={guideEnCours.value ? '1' : '0'} data-testid={testid}>
      <IconeNote taille={18} />
      {guideEnCours.value ? T.sons.chargement : label}
      <input
        type="file"
        class="sr-only"
        accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov"
        disabled={guideEnCours.value}
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const f = input.files?.[0];
          input.value = '';
          if (f) void choisirGuide(f);
        }}
        data-testid={`${testid}-fichier`}
      />
    </label>
  );
}

export function SonGuide() {
  const r = recetteAffichee.value;
  const source = sourceGuide.value;
  useEffect(() => {
    if (source) void analyserGuide(source);
  }, [source]);
  const g = r?.guide;
  if (!r) return null;
  if (!g) {
    return (
      <div class="guide guide-vide" data-testid="son-guide">
        <ChoisirFichier label={T.guide.bouton} testid="son-guide-bouton" />
        <p class="petit doux">{T.guide.intro}</p>
      </div>
    );
  }

  const debut = g.debut ?? 0;
  const dureeSon = source?.infos.duree ?? Math.max(debut, 1);
  const tf = tempsFortsGuide.value;
  const nTf = tempsFortsSortie(r).length;

  return (
    <section class="guide" aria-label={T.guide.titre} data-testid="son-guide">
      <div class="message message-alerte message-court" role="note" data-testid="bandeau-guide">
        <IconeAlerte taille={16} />
        <span>{T.guide.bandeau}</span>
      </div>
      <div class="guide-entete">
        <IconeNote taille={18} />
        <strong class="guide-nom">{source?.infos.nom ?? T.guide.titre}</strong>
        <button type="button" class="btn btn-icone" aria-label={T.guide.retirer} onClick={retirerGuide} data-testid="retirer-guide">
          <IconePoubelle taille={18} />
        </button>
      </div>

      <CurseurValeur
        label={T.guide.debut}
        min={0}
        max={Math.max(0.1, dureeSon)}
        step={0.1}
        valeur={Math.min(debut, dureeSon)}
        format={formatTemps}
        onValider={(v) => reglerGuide({ debut: Math.round(v * 100) / 100 })}
        testid="debut-guide"
      />
      <Decaler moins={T.guide.avant} plus={T.guide.apres} valeur={formatTemps(debut)} onDecaler={decalerGuide} testid="decaler-guide" />
      <CurseurValeur
        label={T.guide.volume}
        min={GUIDE.volMin * 100}
        max={GUIDE.volMax * 100}
        step={5}
        valeur={Math.round((g.vol ?? GUIDE.vol) * 100)}
        format={(v) => T.sons.volumeValeur(Math.round(v))}
        onValider={(v) => reglerGuide({ vol: Math.round(v) / 100 })}
        testid="volume-guide"
      />
      <Interrupteur
        titre={T.guide.rythme}
        aide={tf && tf.t.length === 0 ? T.guide.aucunTempsFort : `${T.guide.rythmeAide} ${tf ? T.guide.tempsForts(nTf) : T.guide.tempsForts(0)}`}
        actif={caleRythme.value}
        onChange={(v) => (caleRythme.value = v)}
        testid="cale-rythme"
      />
      <ChoisirFichier label={T.guide.changer} testid="changer-guide" />
    </section>
  );
}
