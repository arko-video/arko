// Sons reçus par « Partager → Arko » (Android, Arko installé sur l'écran d'accueil).
// Le service worker (public/partage-sw.js) reçoit les fichiers et les dépose dans le cache « arko-partage » ;
// la page les lit ici, puis vide le dépôt. Les noms ne servent qu'à l'affichage.

export const CACHE_PARTAGE = 'arko-partage';

/** Fichiers déposés par le service worker (au plus 200), dans l'ordre d'arrivée. [] si rien ou si le cache est bloqué. */
export async function lireSonsPartages(): Promise<File[]> {
  try {
    if (typeof caches === 'undefined') return [];
    const cache = await caches.open(CACHE_PARTAGE);
    const requetes = (await cache.keys()).slice(0, 200);
    const fichiers: File[] = [];
    for (const r of requetes) {
      const reponse = await cache.match(r);
      if (!reponse) continue;
      let nom = 'son partagé';
      try {
        nom = decodeURIComponent(reponse.headers.get('x-arko-nom') ?? nom);
      } catch {
        // nom illisible : on garde le nom par défaut
      }
      const type = reponse.headers.get('content-type') ?? '';
      fichiers.push(new File([await reponse.blob()], nom.slice(0, 120), { type }));
    }
    return fichiers;
  } catch {
    return [];
  }
}

/** Vide le dépôt (après avoir gardé les sons, ou si l'utilisateur n'en veut pas). */
export async function viderSonsPartages(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(CACHE_PARTAGE);
  } catch {
    // rien à faire
  }
}
