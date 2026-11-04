// Au tout premier lancement, sur Importer : 3 conseils qui défilent (balayage ou « Suivant »), qu'on peut passer.
// Une fois vus ou passés, ils ne reviennent plus (localStorage). Rien ne bloque l'écran : c'est une carte.

import { useRef, useState } from 'preact/hooks';
import { T } from '../../textes-fr';
import { conseilsVus, marquerConseilsVus } from '../aide';

export function ConseilsDepart() {
  const [visible, setVisible] = useState(() => !conseilsVus());
  const [rang, setRang] = useState(0);
  const piste = useRef<HTMLDivElement>(null);
  if (!visible) return null;
  const n = T.aide.liste.length;

  function fermer() {
    marquerConseilsVus();
    setVisible(false);
  }
  function aller(i: number) {
    const p = piste.current;
    if (!p) return;
    p.scrollTo({ left: i * p.clientWidth, behavior: 'smooth' });
    setRang(i);
  }

  return (
    <section
      class="conseils"
      aria-roledescription="carrousel"
      aria-label={T.aide.conseils}
      data-testid="conseils"
    >
      <div
        ref={piste}
        class="conseils-piste"
        // Mis à jour à la fin du défilement (balayage ou « Suivant ») : pas d'à-coups pendant l'animation.
        onScrollEnd={(e) => {
          const p = e.currentTarget as HTMLDivElement;
          setRang(Math.round(p.scrollLeft / Math.max(1, p.clientWidth)));
        }}
      >
        {T.aide.liste.map((c, i) => (
          <article
            key={c.titre}
            class="conseil"
            aria-roledescription="diapositive"
            aria-label={T.aide.conseil(i + 1, n)}
            aria-hidden={i !== rang}
          >
            <strong>{c.titre}</strong>
            <p>{c.texte}</p>
          </article>
        ))}
      </div>
      <div class="conseils-bas">
        <button type="button" class="btn btn-discret" onClick={fermer} data-testid="conseils-passer">
          {T.aide.passer}
        </button>
        <span class="conseils-points" aria-hidden="true">
          {T.aide.liste.map((c, i) => (
            <span key={c.titre} data-actif={i === rang ? '1' : '0'} />
          ))}
        </span>
        <button
          type="button"
          class="btn btn-contour"
          onClick={() => (rang < n - 1 ? aller(rang + 1) : fermer())}
          data-testid="conseils-suivant"
        >
          {rang < n - 1 ? T.aide.suivant : T.aide.cestParti}
        </button>
      </div>
      <span class="sr-only" aria-live="polite">
        {T.aide.conseil(rang + 1, n)}
      </span>
    </section>
  );
}
