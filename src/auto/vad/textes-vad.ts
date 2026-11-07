// Textes de la parole et du détecteur de voix (dev-vad) : français simple, phrases courtes, tutoiement.
// Ce sont des avertissements de l'analyse (MesuresSource.avertissements), affichés par l'écran de revue.

export const TEXTES_VAD = {
  /** Le fichier du détecteur de voix ne se charge pas (hors ligne la 1ʳᵉ fois, fichier abîmé). */
  pasCharge: 'Le détecteur de voix ne s\'est pas chargé : coupes et voix moins précises. Réessaie avec internet.',
  /** onnxruntime-web ne démarre pas (appareil trop vieux) ou le modèle plante. */
  pasDemarre: 'Le détecteur de voix n\'a pas pu démarrer sur cet appareil : coupes et voix moins précises.',
  /** Message de la passe du son reprise depuis les mesures gardées. */
  reprise: 'Je reprends l\'écoute des voix déjà faite.',
} as const;
