// Écran Miniature (YouTube) : choisir une image de la vidéo, y mettre un GROS texte, un émoji, une flèche,
// puis l'enregistrer en JPEG ou PNG (1280 × 720 ; 1080 × 1920 pour un Short), toujours sous 2 Mo.
// L'image vient du même rendu que l'export (sans les textes ni les sous-titres du montage).

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  dessinerHabillageMiniature,
  EMOJIS_MINIATURE,
  encoderSousLimite,
  imageDuMontage,
  MINIATURE,
  tailleMiniature,
  type ReglagesMiniature,
} from '../../moteur/api';
import { dureeFinale } from '../../recette/operations';
import { TY } from '../../textes-youtube';
import { IconeTelecharger } from '../composants/Icones';
import { destinationProjet } from '../destination';
import { recette, sources } from '../etat';
import { formatDuree, formatTaille } from '../format';
import { miniatureOuverte, reglagesMiniature, reglerMiniature } from '../miniature';

type Choix<T extends string> = { v: T; label: string }[];

function Puces<T extends string>({ titre, choix, actif, onChoisir, testid }: { titre: string; choix: Choix<T>; actif: T; onChoisir: (v: T) => void; testid: string }) {
  return (
    <fieldset class="mini-groupe">
      <legend class="petit doux">{titre}</legend>
      <div class="puces" role="radiogroup" aria-label={titre}>
        {choix.map((c) => (
          <button key={c.v} type="button" role="radio" aria-checked={c.v === actif} class="puce" data-actif={c.v === actif ? '1' : '0'} onClick={() => onChoisir(c.v)} data-testid={`${testid}-${c.v || 'aucun'}`}>
            {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Miniature() {
  const r = recette.value;
  const d = destinationProjet.value;
  const { l, h } = tailleMiniature(d);
  const reg = reglagesMiniature.value;
  const canevas = useRef<HTMLCanvasElement>(null);
  /** Image de la vidéo (sans habillage), refaite seulement quand le temps change. */
  const fond = useRef<{ t: number; c: OffscreenCanvas } | null>(null);
  const [fichier, setFichier] = useState<{ url: string; nom: string; taille: number } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const duree = r ? dureeFinale(r) : 0;

  useEffect(() => {
    let vivant = true;
    const minuteur = setTimeout(() => void dessiner(reg, () => vivant), 60);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [r, reg]);
  useEffect(() => () => fichier && URL.revokeObjectURL(fichier.url), [fichier]);

  async function dessiner(x: ReglagesMiniature, vivant: () => boolean) {
    const c = canevas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !r) return;
    if (!fond.current || fond.current.t !== x.t) {
      const off = new OffscreenCanvas(l, h);
      const octx = off.getContext('2d')!;
      await imageDuMontage(r, sources.peek(), x.t, octx, l, h);
      if (!vivant()) return;
      fond.current = { t: x.t, c: off };
    }
    ctx.drawImage(fond.current.c, 0, 0);
    dessinerHabillageMiniature(ctx, l, h, x);
    c.dataset.pret = '1';
  }

  async function enregistrer(type: 'image/png' | 'image/jpeg') {
    const c = canevas.current;
    if (!c) return;
    setOccupe(true);
    try {
      const blob = await encoderSousLimite(
        (t, q) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('encodage'))), t, q)),
        type,
        MINIATURE.maxOctets,
      );
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const nom = `arko-miniature-${Date.now().toString(36)}.${ext}`;
      if (fichier) URL.revokeObjectURL(fichier.url);
      const url = URL.createObjectURL(blob);
      setFichier({ url, nom, taille: blob.size });
      const a = document.createElement('a');
      a.href = url;
      a.download = nom;
      a.click();
    } finally {
      setOccupe(false);
    }
  }

  if (!r) return null;
  const T = TY.miniature;
  return (
    <div class="ecran miniature" data-testid="miniature">
      <header class="entete">
        <h1 class="entete-titre">{T.titre}</h1>
        <button type="button" class="btn btn-discret" onClick={() => (miniatureOuverte.value = false)} data-testid="miniature-fermer">
          {T.fermer}
        </button>
      </header>
      <main class="ecran-corps">
        <div class="miniature-apercu" data-paysage={l > h ? '1' : '0'}>
          <canvas ref={canevas} width={l} height={h} role="img" aria-label={T.titre} data-testid="miniature-canevas" />
        </div>
        <label class="mini-groupe">
          <span class="petit doux">
            {T.image} · {formatDuree(reg.t)}
          </span>
          <input type="range" min={0} max={Math.max(0, duree - 0.05)} step={0.1} value={reg.t} onInput={(e) => reglerMiniature({ t: Number((e.currentTarget as HTMLInputElement).value) })} data-testid="miniature-temps" />
        </label>
        <label class="mini-groupe">
          <span class="petit doux">{T.texte}</span>
          <input class="champ" type="text" maxLength={40} value={reg.texte} onInput={(e) => reglerMiniature({ texte: (e.currentTarget as HTMLInputElement).value })} data-testid="miniature-texte" />
        </label>
        <Puces titre={T.style} actif={reg.style} onChoisir={(style) => reglerMiniature({ style })} testid="miniature-style" choix={[{ v: 'accroche', label: 'Blanc' }, { v: 'alerte', label: 'Jaune' }, { v: 'citron', label: 'Citron' }]} />
        <Puces titre={T.position} actif={reg.position} onChoisir={(position) => reglerMiniature({ position })} testid="miniature-position" choix={[{ v: 'haut', label: T.haut }, { v: 'bas', label: T.bas }]} />
        <Puces titre={T.emoji} actif={reg.emoji} onChoisir={(emoji) => reglerMiniature({ emoji })} testid="miniature-emoji" choix={[{ v: '', label: T.aucun }, ...EMOJIS_MINIATURE.map((e) => ({ v: e as string, label: e }))]} />
        <Puces titre={T.fleche} actif={reg.fleche} onChoisir={(fleche) => reglerMiniature({ fleche })} testid="miniature-fleche" choix={[{ v: 'aucune', label: T.aucun }, { v: 'gauche', label: '←' }, { v: 'droite', label: '→' }]} />
        <p class="petit doux">{d === 'short' ? T.regleShort : T.regle}</p>
        {fichier && (
          <p class="message message-info" role="status" data-testid="miniature-prete">
            {T.prete(formatTaille(fichier.taille), l, h)}{' '}
            <a href={fichier.url} download={fichier.nom}>
              {fichier.nom}
            </a>
          </p>
        )}
      </main>
      <footer class="ecran-pied grille-2">
        <button type="button" class="btn" disabled={occupe} onClick={() => void enregistrer('image/png')} data-testid="miniature-png">
          {T.exporterPng}
        </button>
        <button type="button" class="btn btn-principal" disabled={occupe} onClick={() => void enregistrer('image/jpeg')} data-testid="miniature-jpeg">
          <IconeTelecharger />
          {T.exporterJpeg}
        </button>
      </footer>
    </div>
  );
}
