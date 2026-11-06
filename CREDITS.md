# Crédits

Arko est sous licence **MIT**. Il s'appuie sur ces projets libres. Merci à leurs auteurs !

## Bibliothèques

| Projet | Rôle dans Arko | Licence |
|---|---|---|
| [Mediabunny](https://mediabunny.dev) | lire, décoder, encoder et écrire les vidéos | MPL-2.0 |
| [@mediabunny/aac-encoder](https://www.npmjs.com/package/@mediabunny/aac-encoder) | encodeur AAC de secours | MPL-2.0 |
| [Preact](https://preactjs.com) et [@preact/signals](https://github.com/preactjs/signals) | interface | MIT |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | sauvegarde des montages | Apache-2.0 |
| [Transformers.js](https://github.com/huggingface/transformers.js) | sous-titres automatiques dans le navigateur | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | moteur de calcul des sous-titres | MIT |
| [Workbox](https://github.com/GoogleChrome/workbox) via vite-plugin-pwa | fonctionnement hors ligne | MIT |

Les fichiers sous MPL-2.0 ne sont pas modifiés. Leur code source est disponible sur npm et sur leurs dépôts.

## Modèle de sous-titres
- [openai/whisper-base](https://huggingface.co/openai/whisper-base) (Apache-2.0), converti en ONNX par [onnx-community/whisper-base_timestamped](https://huggingface.co/onnx-community/whisper-base_timestamped).
- Il est téléchargé une seule fois depuis huggingface.co, après accord de l'utilisateur. Il n'est pas inclus dans le dépôt.

## Améliorer l'image
- [Anime4K](https://github.com/bloc97/Anime4K) (licence MIT, Copyright (c) 2019-2021 bloc97) : les poids des réseaux « Restore CNN (S) » et « Upscale CNN x2 (S) » sont repris dans `src/moteur/amelioration/poids-*.ts` (avec la licence en tête), et leurs shaders mpv sont réécrits en WebGL2 pour Arko. Aucune dépendance npm.
- Le renforcement des contours s'inspire de CAS (AMD FidelityFX, licence MIT) ; il est réécrit pour Arko.

## Polices
- [Inter](https://rsms.me/inter/) et [Space Grotesk](https://github.com/floriankarsten/space-grotesk) : SIL Open Font License 1.1, via Fontsource.

## Effets sonores
- Les **22 effets sonores** d'Arko sont **fabriqués par le code d'Arko** (synthèse, sans aucun enregistrement copié), dont « Dun dun duuun » et « Extinction » ajoutés pour les bruitages automatiques.
- Ils sont placés dans le **domaine public (CC0)** : tu peux les utiliser dans tes vidéos sans rien demander à personne.
- Les sons tendance de TikTok ne sont pas dans Arko : on les ajoute dans TikTok au moment de publier.
- « Mes sons » contient seulement les sons que **toi** tu importes (fichiers, `.zip` ou Partager → Arko), gardés sur ton appareil. Ils ne font pas partie d'Arko ni du dépôt, et restent sous ta responsabilité.
