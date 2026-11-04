// Service worker (hors ligne) : quand une nouvelle version est prête, on propose « Recharger ».

import { registerSW } from 'virtual:pwa-register';
import { etatExport, majDisponible } from './etat';

export function enregistrerPwa() {
  if (!('serviceWorker' in navigator)) return;
  const miseAJour = registerSW({
    onNeedRefresh() {
      majDisponible.value = () => {
        // On ne recharge jamais pendant un export.
        if (etatExport.peek().phase === 'encours') return;
        majDisponible.value = null;
        void miseAJour(true);
      };
    },
  });
}
