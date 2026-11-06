// « Partager → Arko » (Web Share Target, Android) : ajouté au service worker de Workbox par importScripts
// (voir vite.config.ts). Reçoit le formulaire envoyé par le téléphone (POST multipart, champ « sons »),
// dépose les fichiers dans le cache « arko-partage » sur l'appareil, puis ouvre Arko sur « ?partage=N ».
// Rien n'est envoyé sur Internet : tout reste dans le téléphone. La page vérifie ensuite chaque fichier.
/* global self, caches, Response, URL */
const MAX_FICHIERS = 200;
const MAX_TOTAL = 150 * 1024 * 1024;

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  const url = new URL(requete.url);
  if (requete.method !== 'POST' || url.origin !== self.location.origin || !url.pathname.endsWith('/partager')) return;
  evenement.respondWith(
    (async () => {
      const portee = self.registration.scope;
      try {
        const donnees = await requete.formData();
        const fichiers = donnees.getAll('sons').filter((f) => typeof f === 'object' && f && 'size' in f);
        await caches.delete('arko-partage');
        const cache = await caches.open('arko-partage');
        let n = 0;
        let total = 0;
        for (const f of fichiers.slice(0, MAX_FICHIERS)) {
          if (total + f.size > MAX_TOTAL) break;
          total += f.size;
          const entetes = { 'content-type': f.type || 'application/octet-stream', 'x-arko-nom': encodeURIComponent(String(f.name || 'son').slice(0, 120)) };
          await cache.put(new URL(`__partage/${n}`, portee).href, new Response(f, { headers: entetes }));
          n++;
        }
        return Response.redirect(new URL(`./?partage=${n}`, portee).href, 303);
      } catch {
        return Response.redirect(new URL('./?partage=0', portee).href, 303);
      }
    })(),
  );
});
