// « Enregistrer au micro » : getUserMedia + MediaRecorder. Bouton rouge, durée qui défile, Stop,
// puis le fichier obtenu est importé comme n'importe quel son. Rien n'est envoyé en ligne.

import { useEffect, useRef, useState } from 'preact/hooks';
import { T } from '../../../textes-fr';
import { afficherToast } from '../../etat';
import { formatTemps } from '../../format';
import { IconeMicro } from '../Icones';

/** Au-delà, l'import refuserait le son (10 min) : on arrête tout seul. */
const DUREE_MAX_MS = 10 * 60 * 1000;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

interface Enregistrement {
  rec: MediaRecorder;
  flux: MediaStream;
  debut: number;
  /** true si on quitte le panneau pendant l'enregistrement : rien n'est importé. */
  jeter: boolean;
}

let numero = 0;

export function BoutonMicro({ onFichier }: { onFichier(f: File): void }) {
  const [enCours, setEnCours] = useState<Enregistrement | null>(null);
  const [maintenant, setMaintenant] = useState(0);
  const courant = useRef<Enregistrement | null>(null);
  /** Demande d'autorisation en cours (bouton désactivé : jamais 2 flux à la fois). */
  const [demande, setDemande] = useState(false);
  /** Le panneau est fermé : un flux obtenu après coup est arrêté tout de suite (I-3). */
  const demonte = useRef(false);

  useEffect(() => {
    if (!enCours) return;
    const id = setInterval(() => {
      setMaintenant(Date.now());
      if (Date.now() - enCours.debut > DUREE_MAX_MS) arreter();
    }, 200);
    return () => clearInterval(id);
  }, [enCours]);

  // Panneau fermé pendant l'enregistrement : on coupe le micro et on jette.
  useEffect(
    () => () => {
      demonte.current = true;
      const e = courant.current;
      if (e) {
        e.jeter = true;
        if (e.rec.state !== 'inactive') e.rec.stop();
        e.flux.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  async function demarrer() {
    if (demande || courant.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      afficherToast(T.sons.microAbsent);
      return;
    }
    let flux: MediaStream;
    setDemande(true);
    try {
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true },
      });
    } catch (err) {
      if (!demonte.current) {
        setDemande(false);
        afficherToast(
          (err as DOMException)?.name === 'NotFoundError' ? T.sons.microAbsent : T.sons.microRefuse,
        );
      }
      return;
    }
    const couper = () => flux.getTracks().forEach((t) => t.stop());
    // Autorisation arrivée après la fermeture du panneau : on coupe le micro, rien n'est enregistré.
    if (demonte.current) return couper();
    setDemande(false);
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(flux, mimeType ? { mimeType } : undefined);
    } catch {
      couper();
      afficherToast(T.sons.microAbsent);
      return;
    }
    const morceaux: Blob[] = [];
    const e: Enregistrement = { rec, flux, debut: Date.now(), jeter: false };
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) morceaux.push(ev.data);
    };
    rec.onstop = () => {
      couper();
      if (e.jeter || morceaux.length === 0) return;
      const type = rec.mimeType || mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      onFichier(new File(morceaux, `${T.sons.nomMicro(++numero)}.${ext}`, { type: type.split(';')[0] }));
    };
    try {
      rec.start(250);
    } catch {
      couper();
      afficherToast(T.sons.microAbsent);
      return;
    }
    courant.current = e;
    setMaintenant(e.debut);
    setEnCours(e);
  }

  function arreter() {
    const e = courant.current;
    courant.current = null;
    setEnCours(null);
    if (e && e.rec.state !== 'inactive') e.rec.stop();
  }

  if (enCours) {
    return (
      <button
        type="button"
        class="btn btn-micro"
        data-enregistre="1"
        onClick={arreter}
        data-testid="micro-stop"
      >
        <span class="micro-point" aria-hidden="true" />
        <span class="chiffres" role="timer" data-testid="micro-duree">
          {formatTemps((maintenant - enCours.debut) / 1000)}
        </span>
        {T.sons.stop}
      </button>
    );
  }
  return (
    <button
      type="button"
      class="btn btn-micro"
      disabled={demande}
      onClick={() => void demarrer()}
      data-testid="micro"
    >
      <IconeMicro taille={18} />
      {T.sons.micro}
    </button>
  );
}
