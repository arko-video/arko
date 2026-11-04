// « Voir ce qui est envoyé » : le texte EXACT envoyé à l'IA, dans un panneau qui défile.

import { useEffect, useRef } from 'preact/hooks';
import { T } from '../../../textes-fr';

interface Props {
  texte: string;
  /** true avant l'analyse : les moments sont des lignes d'exemple. */
  exemple: boolean;
  deuxDemandes: boolean;
  onFermer(): void;
}

export function PanneauEnvoi({ texte, exemple, deuxDemandes, onFermer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class="dialogue panneau-envoi"
      aria-labelledby="envoi-titre"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      data-testid="panneau-envoi"
    >
      <h2 id="envoi-titre">{T.monteur.envoiTitre}</h2>
      <p class="petit">{T.monteur.envoiAide}</p>
      {exemple && <p class="petit doux">{T.monteur.envoiAvant}</p>}
      {deuxDemandes && <p class="petit doux">{T.monteur.envoiDeux}</p>}
      <pre class="envoi-texte" tabIndex={0} data-testid="envoi-texte">
        {texte}
      </pre>
      <button type="button" class="btn btn-principal" autoFocus onClick={onFermer} data-testid="envoi-fermer">
        {T.monteur.fermer}
      </button>
    </dialog>
  );
}
