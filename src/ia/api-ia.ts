// API publique du monteur IA côté « analyse » (phase 6). L'interface n'importe QUE ce fichier
// (il sera réexporté par moteur/api.ts plus tard).

/**
 * Analyse une longue source (1 h 30 à 5 h) dans un Worker : son (enveloppe 20 ms), images clés,
 * 40 meilleurs moments, transcription facultative (±6 s autour de chaque pic).
 * Annulable (signal), avec progression, et reprise automatique après une interruption.
 */
export { analyserSource } from './client-analyse';
export type { OptionsAnalyseSource, ResultatAnalyse } from './client-analyse';
export type { StatsAnalyse } from './messages-analyse';

/** Oublie l'analyse gardée d'une source (point de reprise compris), par son empreinte. */
export { oublierAnalyse } from './reprise';

/** Mode sans IA : une recette brouillon par moment (les N meilleurs). */
export { clipsSansIA, clipDuMoment, accrocheDuMoment, titreDuMoment } from './sans-ia';
export type { OptionsSansIA } from './sans-ia';

/** Format des moments (ARKO-MOMENTS/1). */
export { formaterMoments, lireMoments, FORMAT_MOMENTS } from './moments';
export type { Moment, EnteteMoments } from './moments';

/** Fonctions pures (utiles pour les tests ou un autre écran). */
export { candidats } from './candidats';
export type { Signaux, OptionsCandidats } from './candidats';
