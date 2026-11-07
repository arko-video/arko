// Adresses des fichiers que l'appli porte elle-même (public/ : WASM d'onnxruntime, détecteur de voix), vues d'ici
// (page ou Worker), et contrôle des adresses de téléchargement (huggingface.co, révision figée seulement). Pur.

/** Un fichier de public/ de l'appli : `chemin` sans « / » au début (« ort/ », « modeles/silero-vad-v5.onnx »). */
export function adresseDansLAppli(chemin: string): string {
  const env = import.meta.env;
  const ici = globalThis.location;
  const origine = ici?.origin ?? 'http://localhost';
  // En production, un Worker est dans <base>/assets/ : on remonte d'un dossier, quelle que soit l'adresse où Arko
  // est hébergé (comme sous-titres/worker.ts). Dans la page (ou en développement) : la base de Vite.
  const dansUnWorker = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined';
  if (ici && dansUnWorker && env && !env.DEV) return new URL('../' + chemin, ici.href).href;
  return new URL((env?.BASE_URL ?? '/') + chemin, origine).href;
}

/** Seule origine permise pour télécharger un modèle : huggingface.co, à une révision figée (40 caractères hexa). */
export function adresseHuggingFacePermise(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'huggingface.co' && /\/resolve\/[0-9a-f]{40}\//.test(u.pathname);
  } catch {
    return false;
  }
}
