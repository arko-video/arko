// Prévenir quand un long travail est fini (export, analyse, Best-of) : un petit son aigu (deux bips, fabriqués par
// le code, aucun fichier) + une notification du système si la page est cachée et que l'utilisateur l'a permise.
// Tout reste sur l'appareil. Silencieux si le navigateur refuse (aucune erreur montrée).

/** À appeler au lancement d'un long travail (après un toucher) : demande la permission des notifications, une fois. */
export function preparerFinTravail(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
  } catch {
    /* pas de notifications ici */
  }
}

function bip(): void {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    const t0 = ctx.currentTime + 0.02;
    [0, 0.18].forEach((d, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 0 ? 1320 : 1760;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.16);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch {
    /* pas de son possible */
  }
}

/** Le travail est fini : bip aigu + notification si la page est cachée. */
export function signalerFinTravail(titre: string, texte = 'Tu peux revenir sur Arko.'): void {
  if (typeof window === 'undefined') return;
  bip();
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(titre, { body: texte, icon: './icones/icone-192.png', tag: 'arko-fin' });
    }
  } catch {
    /* Android : new Notification interdit hors service worker, le bip suffit */
  }
}
