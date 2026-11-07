// Écran gardé allumé pendant l'analyse du monteur (Wake Lock), sorti de analyse-monteur.ts (v3, dev 1).

/* ------------------------------------------------------------------ écran allumé */

// analyserSource prend déjà un verrou au départ (src/ia/client-analyse.ts) ; le navigateur le relâche quand on
// change d'onglet. L'interface ne prend donc le sien qu'AU RETOUR sur l'onglet : jamais deux verrous à la fois.
let verrou: WakeLockSentinel | null = null;
let enDemande = false;
let actif = false;

async function demanderVerrou() {
  if (!actif || verrou || enDemande || !('wakeLock' in navigator) || document.visibilityState !== 'visible')
    return;
  enDemande = true;
  try {
    const v = await navigator.wakeLock.request('screen');
    // L'analyse a pu finir (ou être annulée) pendant la demande : on relâche tout de suite (I-3).
    if (!actif) {
      void v.release().catch(() => {});
      return;
    }
    verrou = v;
    v.addEventListener('release', () => {
      if (verrou === v) verrou = null;
    });
  } catch {
    verrou = null;
  } finally {
    enDemande = false;
  }
}

/** Le navigateur relâche le verrou quand on change d'onglet : on le reprend au retour. */
function auRetour() {
  if (document.visibilityState === 'visible') void demanderVerrou();
}

export function garderAllume(oui: boolean) {
  actif = oui;
  if (oui) document.addEventListener('visibilitychange', auRetour);
  else {
    document.removeEventListener('visibilitychange', auRetour);
    void verrou?.release().catch(() => {});
    verrou = null;
  }
}
