// Correction des temps des mots donnés par transformers.js 4.3.2 (Whisper, return_timestamps: 'word').
//
// Le problème : pour aligner les mots sur le son, transformers.js lit l'attention du modèle ligne par ligne,
// mais il saute une ligne de trop au début. Chaque morceau de mot reçoit donc le temps du morceau SUIVANT :
// les mots commencent trop tard (souvent quand ils se terminent) et le dernier mot s'étire jusqu'à la fin du son.
// Mesuré sur nos phrases de test : +0,3 s de retard en moyenne. Décaler d'un cran donne -0,2 s d'avance ;
// la MOYENNE des deux (ce qu'on fait ici) tombe à ±0,1 s.
//
// À revoir si on change de version de transformers.js (le bug peut être corrigé un jour).

/**
 * Recentre les temps d'une ligne de jetons (pur) : chaque jeton généré prend la moyenne
 * de son temps et de celui du jeton d'avant. Les `nbEntree` premiers (consignes du modèle) ne bougent pas.
 */
export function recentrer(temps: Float32Array, nbEntree: number): void {
  const avant = Float32Array.from(temps);
  for (let k = nbEntree + 1; k < temps.length; k++) temps[k] = (avant[k - 1]! + avant[k]!) / 2;
}

/** Ce qu'on utilise du modèle Whisper de transformers.js (méthode interne, version figée 4.3.2). */
interface ModeleWhisper {
  _extract_token_timestamps?: (...args: unknown[]) => { dims: number[]; data: Float32Array };
}

/** Ce qu'on utilise du découpeur de texte de Whisper (transformers.js 4.3.2). */
interface TokeniseurWhisper {
  decode?: (ids: unknown, options?: unknown) => string;
}

/**
 * Correction d'un 2ᵉ bug de transformers.js 4.3.2 (dev-mots, 7/11/2026) : quand Whisper rend deux repères de temps
 * à la suite SANS texte entre eux (un « segment vide », fréquent sur un son presque muet), `_decode_asr` appelle
 * `decode([])`, qui lève « token_ids must be a non-empty array of integers. » : toute la fenêtre de 28 s plante, et
 * avant ce correctif toute l'analyse avec elle (vraie session : fenêtre 7039–7067 s, à chaque essai). Un segment
 * vide doit simplement donner un texte vide (c'est ce que fait la version Python). Installée une seule fois.
 */
export function reparerDecodageVide(asr: { tokenizer: unknown }): void {
  const t = asr.tokenizer as TokeniseurWhisper | null | undefined;
  const original = t?.decode;
  if (!t || typeof original !== 'function' || (original as { arkoVide?: boolean }).arkoVide) return;
  const repare = (ids: unknown, options?: unknown): string => (Array.isArray(ids) && ids.length === 0 ? '' : original.call(t, ids, options));
  (repare as { arkoVide?: boolean }).arkoVide = true;
  t.decode = repare;
}

/** Installe la correction sur le modèle du pipeline (une seule fois). */
export function corrigerTempsWhisper(asr: { model: unknown }): void {
  const modele = asr.model as ModeleWhisper;
  const original = modele._extract_token_timestamps;
  if (typeof original !== 'function') return;
  modele._extract_token_timestamps = (...args: unknown[]) => {
    const res = original.apply(modele, args);
    // 5e argument : nombre de jetons de consigne (début de transcription, langue, tâche).
    const nbEntree = typeof args[4] === 'number' ? args[4] : 0;
    const [lots = 0, longueur = 0] = res.dims;
    for (let b = 0; b < lots; b++) recentrer(res.data.subarray(b * longueur, (b + 1) * longueur), nbEntree);
    return res;
  };
}
