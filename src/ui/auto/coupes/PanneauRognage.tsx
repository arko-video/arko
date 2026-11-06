// Panneau « Enlever les bords de l'écran » (D, dev 1) : Arko regarde 20 images réparties dans la vidéo, trouve les
// bandes qui ne bougent pas (barre de titre, barre des tâches), les montre en sombre sur une image de la vidéo avec
// le cadre gardé (même format que la source, agrandi ensuite), et 4 poignées pour ajuster. Appliquer = un seul Annuler.

import { useEffect, useRef, useState } from 'preact/hooks';
import { cadreRognage, detecterBords, AUCUN_BORD, type Bords } from '../../../auto/coupes/rognage-detection';
import { imagesReparties } from '../../../auto/coupes/mesures';
import { vignette } from '../../../moteur/api';
import { rognerSource } from '../../../recette/operations';
import { TA } from '../../../textes-auto';
import { afficherToast, annulerAction, modifier, recette } from '../../etat';
import { T } from '../../../textes-fr';
import './coupes-auto.css';
import { sourceACouper } from './etat-blancs';

const TR = TA.coupes.rognage;
type Cote = keyof Bords;
const COTES: Cote[] = ['haut', 'bas', 'gauche', 'droite'];
/** Un bord ne dépasse jamais ce morceau de l'image (le cadre garde au moins la moitié). */
const BORD_MAX = 0.25;

/** Bords qui donnent ce cadre (pour rouvrir un rognage déjà fait). */
function bordsDuCadre(c: { x: number; y: number; l: number; h: number }, L: number, H: number): Bords {
  return {
    haut: Math.round(c.y * H),
    bas: Math.max(0, Math.round(H - (c.y + c.h) * H)),
    gauche: Math.round(c.x * L),
    droite: Math.max(0, Math.round(L - (c.x + c.l) * L)),
  };
}

export function PanneauRognage({ fermer }: { fermer: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const geste = useRef<{ id: number; cote: Cote; x0: number; y0: number; b0: Bords } | null>(null);
  const source = sourceACouper();
  const L = source?.infos.l ?? 1280;
  const H = source?.infos.h ?? 720;
  const r = recette.value;
  const existant = r?.rognages?.find((x) => x.src === source?.infos.id);
  const [bords, setBords] = useState<Bords | null>(existant ? bordsDuCadre(existant, L, H) : null);
  const [trouves, setTrouves] = useState<Bords | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // Image de la vidéo (au milieu) et détection des bords fixes sur 20 images.
  useEffect(() => {
    if (!source) return;
    let vivant = true;
    const c = canvas.current;
    if (c) {
      void vignette(source, source.infos.duree / 2, c.width, c.height)
        .then((img) => vivant && img && c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height))
        .catch((e) => console.error(e));
    }
    imagesReparties(source, 20, 640)
      .then((images) => {
        if (!vivant) return;
        const b = detecterBords(images, L, H);
        setTrouves(b);
        setBords((avant) => avant ?? b);
      })
      .catch((e) => {
        console.error(e);
        if (vivant) setTrouves({ ...AUCUN_BORD });
      });
    return () => void (vivant = false);
  }, [source]);

  if (!source || !r) return null;
  const cadre = bords ? cadreRognage(bords, L, H, L / H) : null;
  const borner = (cote: Cote, v: number) => Math.max(0, Math.min(Math.round(v), Math.floor((cote === 'haut' || cote === 'bas' ? H : L) * BORD_MAX)));

  function bas(e: PointerEvent, cote: Cote) {
    if (!e.isPrimary || !bords) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    geste.current = { id: e.pointerId, cote, x0: e.clientX, y0: e.clientY, b0: bords };
  }
  function bouge(e: PointerEvent) {
    const g = geste.current;
    const el = zone.current;
    if (!g || g.id !== e.pointerId || !el) return;
    const dx = ((e.clientX - g.x0) / (el.clientWidth || 1)) * L;
    const dy = ((e.clientY - g.y0) / (el.clientHeight || 1)) * H;
    const delta = { haut: dy, bas: -dy, gauche: dx, droite: -dx }[g.cote];
    setBords({ ...g.b0, [g.cote]: borner(g.cote, g.b0[g.cote] + delta) });
  }
  function haut(e: PointerEvent) {
    if (geste.current?.id === e.pointerId) geste.current = null;
  }
  function clavier(e: KeyboardEvent, cote: Cote) {
    const sens: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
    const d = sens[e.key];
    if (!d || !bords) return;
    e.preventDefault();
    const signe = cote === 'haut' || cote === 'gauche' ? 1 : -1;
    setBords({ ...bords, [cote]: borner(cote, bords[cote] + d * signe * (e.shiftKey ? 10 : 1)) });
  }

  function appliquer() {
    if (!cadre || !source) return afficherToast(TR.rien);
    if (modifier((x) => rognerSource(x, source.infos.id, cadre))) afficherToast(TR.applique, 5000, { label: T.annuler, agir: annulerAction });
    fermer();
  }
  function remettre() {
    if (source && modifier((x) => rognerSource(x, source.infos.id, null))) afficherToast(TR.remis, 4000, { label: T.annuler, agir: annulerAction });
    fermer();
  }

  const pc = (v: number) => `${v * 100}%`;
  const b = bords ?? AUCUN_BORD;
  const hc = Math.round((640 * H) / L);
  const aucunTrouve = trouves && COTES.every((c) => trouves[c] === 0);
  return (
    <dialog ref={ref} class="ca-panneau" aria-labelledby="rognage-titre" onCancel={(ev) => (ev.preventDefault(), fermer())} data-testid="panneau-rognage">
      <div class="ca-corps">
        <div>
          <h2 id="rognage-titre">{TR.titre}</h2>
          <p class="ca-aide">{TR.aide}</p>
        </div>
        <div ref={zone} class="ca-image" style={{ aspectRatio: `${L} / ${H}` }} onPointerMove={bouge} onPointerUp={haut} onPointerCancel={haut}>
          <canvas ref={canvas} width={640} height={hc} role="img" aria-label={TR.image} />
          <div class="ca-bord" style={{ left: 0, right: 0, top: 0, height: pc(b.haut / H) }} />
          <div class="ca-bord" style={{ left: 0, right: 0, bottom: 0, height: pc(b.bas / H) }} />
          <div class="ca-bord" style={{ left: 0, width: pc(b.gauche / L), top: pc(b.haut / H), bottom: pc(b.bas / H) }} />
          <div class="ca-bord" style={{ right: 0, width: pc(b.droite / L), top: pc(b.haut / H), bottom: pc(b.bas / H) }} />
          {cadre && <div class="ca-cadre" style={{ left: pc(cadre.x), top: pc(cadre.y), width: pc(cadre.l), height: pc(cadre.h) }} data-testid="rognage-cadre" />}
          {bords &&
            COTES.map((c) => {
              const x = c === 'gauche' ? b.gauche / L : c === 'droite' ? 1 - b.droite / L : 0.5;
              const y = c === 'haut' ? b.haut / H : c === 'bas' ? 1 - b.bas / H : 0.5;
              return (
                <button
                  type="button"
                  key={c}
                  class="ca-poignee"
                  style={{ left: pc(x), top: pc(y) }}
                  aria-label={TR.poignee(TR.cotes[c])}
                  onPointerDown={(e) => bas(e, c)}
                  onKeyDown={(e) => clavier(e, c)}
                  data-testid={`rognage-poignee-${c}`}
                />
              );
            })}
        </div>
        <p class="ca-aide" role="status" aria-live="polite" data-testid="rognage-etat">
          {!trouves && !existant ? TR.cherche : aucunTrouve && !existant ? TR.aucun : `${TR.trouve(b.haut, b.bas)}${b.gauche || b.droite ? ` ${TR.trouveCotes(b.gauche, b.droite)}` : ''}`}
        </p>
        {cadre && <p class="ca-aide" data-testid="rognage-garde">{TR.garde(Math.round(cadre.l * L), Math.round(cadre.h * H))} {TR.ajuster}</p>}
        <div class="ca-boutons">
          <button type="button" class="btn btn-principal" disabled={!cadre} onClick={appliquer} data-testid="rognage-appliquer">
            {TR.appliquer}
          </button>
          {existant && (
            <button type="button" class="btn" onClick={remettre} data-testid="rognage-remettre">
              {TR.remettre}
            </button>
          )}
          <button type="button" class="btn" onClick={fermer} data-testid="rognage-fermer">
            {TR.fermer}
          </button>
        </div>
      </div>
    </dialog>
  );
}
