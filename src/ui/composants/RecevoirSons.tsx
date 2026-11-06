// Sons reçus par « Partager → Arko » : « 3 sons reçus — Les garder ? », avec l'étiquette proposée (« Memes »)
// et le rappel sur la responsabilité. Garder les range dans Mes sons (vérifiés un par un, .zip compris).

import { useEffect, useRef, useState } from 'preact/hooks';
import { T } from '../../textes-fr';
import { repondrePartage, sonsRecus } from '../mes-sons';

export function RecevoirSons() {
  const fichiers = sonsRecus.value;
  if (!fichiers) return null;
  return <DialogueRecus nombre={fichiers.length} />;
}

function DialogueRecus({ nombre }: { nombre: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [etiquette, setEtiquette] = useState(T.messons.etiquetteDefaut);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class="dialogue"
      aria-labelledby="recus-titre"
      aria-describedby="recus-texte"
      onCancel={(e) => {
        e.preventDefault();
        void repondrePartage(false, etiquette);
      }}
      data-testid="dialogue-sons-recus"
    >
      <h2 id="recus-titre">{T.partage.titre(nombre)}</h2>
      <p id="recus-texte">{T.partage.question}</p>
      <label class="champ-saisie">
        <span class="petit doux">{T.messons.etiquette}</span>
        <input
          type="text"
          maxLength={60}
          value={etiquette}
          onInput={(e) => setEtiquette((e.currentTarget as HTMLInputElement).value)}
          data-testid="recus-etiquette"
        />
      </label>
      <p class="petit doux">{T.messons.rappel}</p>
      <div class="dialogue-boutons">
        <button type="button" class="btn" onClick={() => void repondrePartage(false, etiquette)} data-testid="recus-non">
          {T.partage.non}
        </button>
        <button type="button" class="btn btn-principal" autoFocus onClick={() => void repondrePartage(true, etiquette)} data-testid="recus-garder">
          {T.partage.garder}
        </button>
      </div>
    </dialog>
  );
}
