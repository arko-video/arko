// Petit dialogue de confirmation (élément <dialog> modal : focus piégé, Échap = annuler).

import { useEffect, useRef } from 'preact/hooks';

interface Props {
  titre: string;
  texte: string;
  confirmer: string;
  annuler: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
  testid?: string;
}

export function Dialogue({ titre, texte, confirmer, annuler, onConfirmer, onAnnuler, testid }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class="dialogue"
      aria-labelledby="dialogue-titre"
      aria-describedby="dialogue-texte"
      onCancel={(e) => {
        e.preventDefault();
        onAnnuler();
      }}
      data-testid={testid}
    >
      <h2 id="dialogue-titre">{titre}</h2>
      <p id="dialogue-texte">{texte}</p>
      <div class="dialogue-boutons">
        {/* Le choix sans risque d'abord, et c'est lui qui a le focus. */}
        <button type="button" class="btn btn-principal" autoFocus onClick={onAnnuler} data-testid="dialogue-annuler">
          {annuler}
        </button>
        <button type="button" class="btn" onClick={onConfirmer} data-testid="dialogue-confirmer">
          {confirmer}
        </button>
      </div>
    </dialog>
  );
}
