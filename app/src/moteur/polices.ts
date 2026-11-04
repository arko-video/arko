// Chargement des polices des textes (Inter, Space Grotesk) — le MÊME module dans la page et dans le Worker,
// pour que l'aperçu et l'export dessinent exactement pareil.
// On charge les fichiers woff2 avec `new FontFace(...)`, puis on les ajoute à `document.fonts` (page)
// ou à `self.fonts` (Worker). Les noms de famille sont propres à Arko : aucun conflit avec le CSS de l'interface.

import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';
import grotesk700 from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url';

/** Familles utilisées par le canevas (avec une police de secours). */
export const INTER = '"Arko Inter", "Inter", sans-serif';
export const GROTESK = '"Arko Grotesk", "Space Grotesk", sans-serif';

const FICHIERS = [
  { famille: 'Arko Inter', poids: '600', url: inter600 },
  { famille: 'Arko Inter', poids: '700', url: inter700 },
  { famille: 'Arko Inter', poids: '800', url: inter800 },
  { famille: 'Arko Grotesk', poids: '700', url: grotesk700 },
];

/** Au-delà, on dessine avec la police de secours plutôt que de bloquer l'export. */
const DELAI_MAX_MS = 8000;

let promesse: Promise<void> | null = null;
let chargees = false;
/** Augmente quand les vraies polices arrivent : les mises en page mémorisées avant sont alors à refaire. */
let version = 0;

/** L'ensemble de polices du contexte courant (page ou Worker), ou null (tests dans Node). */
function ensembleDePolices(): FontFaceSet | null {
  if (typeof FontFace === 'undefined') return null;
  if (typeof document !== 'undefined') return document.fonts;
  return (globalThis as unknown as { fonts?: FontFaceSet }).fonts ?? null;
}

async function charger(): Promise<void> {
  const ensemble = ensembleDePolices();
  if (!ensemble) return;
  const tout = Promise.all(
    FICHIERS.map(async (f) => {
      const police = new FontFace(f.famille, `url(${f.url})`, { weight: f.poids, style: 'normal' });
      await police.load();
      ensemble.add(police);
    }),
  ).then(() => {
    version++; // même si elles arrivent après le délai : les mesures seront refaites
  });
  // Un échec (fichier introuvable, hors ligne sans cache…) est intercepté même s'il arrive après le délai.
  const resultat = tout.catch((e: unknown) => console.warn('[Arko] polices non chargées', e));
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<void>((ok) => (minuterie = setTimeout(ok, DELAI_MAX_MS)));
  try {
    await Promise.race([resultat, delai]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** Résolue quand toutes les polices utilisées par les styles de texte sont chargées dans ce contexte. */
export function policesPretes(): Promise<void> {
  promesse ??= charger().finally(() => {
    chargees = true;
  });
  return promesse;
}

/** true quand le chargement est terminé (réussi ou non) : les mesures de texte sont alors définitives. */
export function policesChargees(): boolean {
  return chargees || ensembleDePolices() === null;
}

/** Numéro qui change quand les vraies polices arrivent (pour vider les mises en page mémorisées). */
export function versionPolices(): number {
  return version;
}
