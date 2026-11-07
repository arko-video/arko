// Écouter un passage de la vidéo SOURCE (dev 1) : extraits des voix (« Qui parle ? ») et passages pas retenus.
// Un seul lecteur audio pour toute l'appli (le fichier reste sur l'appareil : simple adresse blob:). Ce n'est pas un
// rendu du montage : juste le son brut du passage, de `de` à `a`.

import { signal } from '@preact/signals';

/** Clé de ce qui est en train d'être écouté (null : rien). */
export const ecouteEnCours = signal<string | null>(null);

let audio: HTMLAudioElement | null = null;
let fichierOuvert: Blob | null = null;
let adresse: string | null = null;
let minuteur: ReturnType<typeof setTimeout> | undefined;

export function arreterEcoute() {
  clearTimeout(minuteur);
  audio?.pause();
  ecouteEnCours.value = null;
}

/** Joue [de, a] (s) du fichier ; un 2e toucher sur la même clé arrête. */
export async function ecouterPassage(fichier: Blob, de: number, a: number, cle: string): Promise<void> {
  if (ecouteEnCours.peek() === cle) return arreterEcoute();
  arreterEcoute();
  audio ??= new Audio();
  if (fichier !== fichierOuvert) {
    if (adresse) URL.revokeObjectURL(adresse);
    adresse = URL.createObjectURL(fichier);
    fichierOuvert = fichier;
    audio.src = adresse;
  }
  const lecteur = audio;
  ecouteEnCours.value = cle;
  try {
    if (lecteur.readyState < 1) await new Promise<void>((ok) => lecteur.addEventListener('loadedmetadata', () => ok(), { once: true }));
    lecteur.currentTime = Math.max(0, de);
    await lecteur.play();
  } catch {
    // Lecture refusée (navigateur) : rien à faire, on remet le bouton.
    if (ecouteEnCours.peek() === cle) ecouteEnCours.value = null;
    return;
  }
  minuteur = setTimeout(() => {
    if (ecouteEnCours.peek() === cle) arreterEcoute();
  }, Math.max(0.2, a - de) * 1000);
}
