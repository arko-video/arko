// Outil Intro / outro (YouTube 16:9) : aucun, un des 3 modèles animés (avec le nom de la chaîne), ou une vidéo
// de l'utilisateur. Gardés sur l'appareil (« Mes génériques ») pour les prochains montages.
// L'aperçu du modèle utilise le MÊME dessin que l'export ; l'intro et l'outro s'ajoutent à la vidéo exportée.

import { useEffect, useRef } from 'preact/hooks';
import { dessinerGenerique, envPour } from '../../../moteur/api';
import { DUREE_MIN_ECRAN_FIN, DUREES_GENERIQUE, MODELES_GENERIQUE, texteParDefaut, type Place } from '../../../recette/generiques';
import { dureeFinale, reglerGenerique } from '../../../recette/operations';
import type { Generique } from '../../../recette/types';
import { TY } from '../../../textes-youtube';
import { afficherToast, modifier, recetteAffichee } from '../../etat';
import { appliquer, garderModele, importerVideo, memoriserChaine, mesGeneriques, mettreModele, oublier, placeChoisie, rafraichirGeneriques, retirer } from '../../generiques';

const T = TY.generiques;

/** Petit aperçu animé d'un modèle (en boucle). */
function ApercuModele({ g, place }: { g: Generique; place: Place }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const debut = performance.now();
    let raf = 0;
    const image = () => {
      const t = ((performance.now() - debut) / 1000) % Math.max(0.5, g.dur);
      dessinerGenerique(ctx, g, envPour(c.width, c.height), t, g.texte ?? texteParDefaut(place));
      raf = requestAnimationFrame(image);
    };
    image();
    return () => cancelAnimationFrame(raf);
  }, [g, place]);
  return <canvas ref={ref} class="generique-apercu" width={480} height={270} role="img" aria-label={T.titre} data-testid="generique-apercu" />;
}

export function OutilGeneriques() {
  const r = recetteAffichee.value;
  const place = placeChoisie.value;
  const fichier = useRef<HTMLInputElement>(null);
  useEffect(() => void rafraichirGeneriques(), []);
  if (!r) return null;
  const g = r[place];
  const bornes = DUREES_GENERIQUE[place];

  async function choisirFichier(f: File) {
    try {
      await importerVideo(place, f);
    } catch (e) {
      afficherToast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div class="outil" data-testid="outil-generiques">
      <div class="puces" role="tablist">
        {(['intro', 'outro'] as const).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === place} class="puce" data-actif={p === place ? '1' : '0'} onClick={() => (placeChoisie.value = p)} data-testid={`place-${p}`}>
            {p === 'intro' ? T.intro : T.outro}
            {r[p] ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div class="puces" role="radiogroup" aria-label={place === 'intro' ? T.intro : T.outro}>
        <button type="button" role="radio" aria-checked={!g} class="puce" data-actif={!g ? '1' : '0'} onClick={() => retirer(place)} data-testid="generique-aucun">
          {T.aucune}
        </button>
        {MODELES_GENERIQUE.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={g?.modele === m} class="puce" data-actif={g?.modele === m ? '1' : '0'} onClick={() => mettreModele(place, m)} data-testid={`generique-${m}`}>
            {T.modeles[m]}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={!!g?.src} class="puce" data-actif={g?.src ? '1' : '0'} onClick={() => fichier.current?.click()} data-testid="generique-video">
          {T.maVideo}
        </button>
        <input
          ref={fichier}
          type="file"
          accept="video/*,.mp4,.mov,.webm"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (f) void choisirFichier(f);
            (e.currentTarget as HTMLInputElement).value = '';
          }}
          data-testid="generique-fichier"
        />
      </div>

      {g?.modele && <ApercuModele g={g} place={place} />}
      {g?.src && <p class="petit doux">{r.sources.find((s) => s.id === g.src)?.nom}</p>}
      {g?.modele && (
        <div class="grille-2">
          <label class="mini-groupe">
            <span class="petit doux">{T.chaine}</span>
            <input class="champ" type="text" maxLength={40} value={g.chaine ?? ''} onChange={(e) => {
              const chaine = (e.currentTarget as HTMLInputElement).value;
              memoriserChaine(chaine);
              modifier((x) => reglerGenerique(x, place, { chaine }));
            }} data-testid="generique-chaine" />
          </label>
          <label class="mini-groupe">
            <span class="petit doux">{T.texte}</span>
            <input class="champ" type="text" maxLength={40} value={g.texte ?? ''} onChange={(e) => modifier((x) => reglerGenerique(x, place, { texte: (e.currentTarget as HTMLInputElement).value }))} data-testid="generique-texte" />
          </label>
        </div>
      )}
      {g && (
        <label class="mini-groupe">
          <span class="petit doux chiffres" data-testid="generique-duree">{T.duree(g.dur)}</span>
          <input type="range" min={bornes.min} max={bornes.max} step={1} value={g.dur} onChange={(e) => modifier((x) => reglerGenerique(x, place, { dur: Number((e.currentTarget as HTMLInputElement).value) }))} data-testid="generique-curseur" />
        </label>
      )}
      {place === 'outro' && <p class="petit doux">{T.aideOutro}</p>}
      {place === 'outro' && g && dureeFinale(r) + (r.intro?.dur ?? 0) + g.dur < DUREE_MIN_ECRAN_FIN && <p class="petit message-alerte message message-court">{T.tropCourte}</p>}
      {g?.modele && (
        <button type="button" class="btn" onClick={() => void garderModele(place)} data-testid="generique-garder">
          {T.garder}
        </button>
      )}
      {(mesGeneriques.value?.length ?? 0) > 0 && (
        <>
          <h3 class="outil-sous-titre">{T.mesGeneriques}</h3>
          <ul class="mes-generiques">
            {mesGeneriques.value!.map((m) => (
              <li key={m.id} class="outil-ligne">
                <button type="button" class="pastille" onClick={() => void appliquer(place, m)} data-testid={`mon-generique-${m.id}`}>
                  {m.nom}
                </button>
                <button type="button" class="btn btn-icone" aria-label={T.supprimer(m.nom)} onClick={() => void oublier(m)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="petit doux">{T.exporte}</p>
    </div>
  );
}
