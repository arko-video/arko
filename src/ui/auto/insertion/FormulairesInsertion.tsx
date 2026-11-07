// Réglages avant d'insérer (B, dev 2) : carton texte, chibi plein écran, image fixe. Un toucher sur « Insérer » =
// une seule opération (un Annuler). La vidéo et le mème : FormulaireClip.tsx.

import { useRef, useState } from 'preact/hooks';
import { DUREE_INSERE } from '../../../recette/types-insertion';
import { CARTON } from '../../../moteur/inserts/carton';
import type { DefinitionChibi, Emotion, Situation } from '../../../recette/types';
import { DEF_SITUATIONS } from '../../../chibis/persos/situations';
import { TV } from '../../../textes-v3';
import { recette } from '../../etat';
import { chibiAuHasard } from '../../../chibis/hasard';
import { estPasEncoreFait } from '../../../auto/pas-encore-fait';
import { ChoixChibi } from '../chibis/ChoixChibi';
import { ApercuElement } from './ApercuElement';
import { insererCarton, insererChibi, insererImage } from './actions-insertion';
import { ChampCouleur, ChampDuree, ChampEmotion, ChampSituation, ChampTexte } from './ChampsInsertion';

const TI = TV.insertion;

/** Un chibi tiré au hasard (dev 3) ; null si le générateur n'est pas prêt (le carton portera le nom). */
function auHasard(): DefinitionChibi | null {
  try {
    return chibiAuHasard(Date.now() & 0x7fffffff);
  } catch (e) {
    if (!estPasEncoreFait(e)) console.warn(e);
    return null;
  }
}

interface Props {
  /** Temps de sortie où insérer (la tête de lecture à l'ouverture). */
  t: number;
  /** Appelé après l'essai (true = inséré : on ferme). */
  fini: (ok: boolean) => void;
}

function BoutonInserer({ agir, actif = true }: { agir: () => void; actif?: boolean }) {
  return (
    <button
      type="button"
      class="btn btn-principal ins-valider"
      disabled={!actif}
      onClick={agir}
      data-testid="ins-valider"
    >
      {TI.inserer}
    </button>
  );
}

export function FormulaireCarton({ t, fini }: Props) {
  const [txt, setTxt] = useState('');
  const [fond, setFond] = useState<string>(CARTON.fond);
  const [couleur, setCouleur] = useState<string>(CARTON.couleur);
  const [dur, setDur] = useState<number>(DUREE_INSERE.carton);
  return (
    <div class="ins-formulaire">
      <ChampTexte
        label={TI.texte}
        valeur={txt}
        changer={setTxt}
        placeholder={TI.textePlaceholder}
        testid="ins-texte"
      />
      <ApercuElement el={{ type: 'carton', txt: txt.trim() || TI.textePlaceholder, fond, couleur }} />
      <div class="ins-ligne">
        <ChampCouleur label={TI.fond} valeur={fond} changer={setFond} testid="ins-fond" />
        <ChampCouleur label={TI.couleur} valeur={couleur} changer={setCouleur} testid="ins-couleur" />
        <ChampDuree valeur={dur} changer={setDur} testid="ins-duree" />
      </div>
      <BoutonInserer
        actif={txt.trim().length > 0}
        agir={() => fini(insererCarton({ type: 'carton', txt: txt.trim(), fond, couleur }, dur, t))}
      />
    </div>
  );
}

export function FormulaireChibi({ t, fini }: Props) {
  const personnes = (recette.value?.personnes ?? []).filter((p) => p.chibi);
  const [p, setP] = useState<string | null>(personnes[0]?.id ?? null);
  // Personne n'a de chibi : un chibi au hasard (« Un autre chibi » en tire un nouveau).
  const [chibi, setChibi] = useState<DefinitionChibi | null>(() =>
    personnes.length === 0 ? auHasard() : null,
  );
  const [emo, setEmo] = useState<Emotion>('choque');
  const [sit, setSit] = useState<Situation>('aucune');
  const [txt, setTxt] = useState('');
  const [fond, setFond] = useState<string>(CARTON.chibi.fond);
  const [dur, setDur] = useState<number>(DUREE_INSERE.chibi);
  const el: Parameters<typeof insererChibi>[0] = { type: 'chibi', emo, fond };
  if (sit !== 'aucune') el.sit = sit;
  if (chibi) el.chibi = chibi;
  else if (p) el.p = p;
  if (txt.trim()) el.txt = txt.trim();
  const inserer = () => fini(insererChibi(el, dur, t));
  return (
    <div class="ins-formulaire">
      {personnes.length > 0 && (
        <div class="ins-champ">
          <span>{TI.personne}</span>
          <div class="ins-pastilles" role="radiogroup" aria-label={TI.personne}>
            {personnes.map((x) => (
              <button
                type="button"
                key={x.id}
                role="radio"
                class="pastille"
                aria-checked={!chibi && p === x.id}
                data-actif={!chibi && p === x.id ? '1' : '0'}
                onClick={() => (setP(x.id), setChibi(null))}
                data-testid={`ins-personne-${x.id}`}
              >
                {x.nom}
              </button>
            ))}
          </div>
        </div>
      )}
      {personnes.length === 0 && chibi && <p class="petit doux">{TI.sansChibi}</p>}
      <ApercuElement el={el} />
      <div class="ins-ligne">
        <button type="button" class="btn" onClick={() => setChibi(auHasard())} data-testid="ins-chibi-hasard">
          {TI.autreChibi}
        </button>
        <ChoixChibi valeur={chibi} surChoix={(def) => setChibi(def)} testid="ins-choix-chibi" />
      </div>
      <ChampSituation valeur={sit} changer={(s) => (setSit(s), s !== 'aucune' && setEmo(DEF_SITUATIONS[s].emo))} testid="ins-situation" />
      <ChampEmotion valeur={emo} changer={setEmo} testid="ins-emotion" />
      <ChampTexte label={TI.texteChibi} valeur={txt} changer={setTxt} max={60} testid="ins-texte" />
      <div class="ins-ligne">
        <ChampCouleur label={TI.fond} valeur={fond} changer={setFond} testid="ins-fond" />
        <ChampDuree valeur={dur} changer={setDur} testid="ins-duree" />
      </div>
      <BoutonInserer agir={inserer} />
    </div>
  );
}

export function FormulaireImage({ t, fini }: Props) {
  const entree = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [dur, setDur] = useState<number>(DUREE_INSERE.image);
  const [occupe, setOccupe] = useState(false);
  return (
    <div class="ins-formulaire">
      <input
        ref={entree}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        class="sr-only"
        onChange={(e) => setFichier((e.target as HTMLInputElement).files?.[0] ?? null)}
        data-testid="ins-fichier-image"
      />
      <button
        type="button"
        class="btn"
        onClick={() => entree.current?.click()}
        data-testid="ins-choisir-image"
      >
        {fichier ? fichier.name : TI.choisirImage}
      </button>
      <ChampDuree valeur={dur} changer={setDur} testid="ins-duree" />
      <BoutonInserer
        actif={!!fichier && !occupe}
        agir={() => {
          if (!fichier) return;
          setOccupe(true);
          void insererImage(fichier, dur, t).then((ok) => (setOccupe(false), fini(ok)));
        }}
      />
    </div>
  );
}
