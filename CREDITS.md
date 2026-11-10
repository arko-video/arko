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
- **Sous-titres précis (facultatif, Best-of)** : [openai/whisper-small](https://huggingface.co/openai/whisper-small)
  (Apache-2.0), converti en ONNX par [onnx-community/whisper-small_timestamped](https://huggingface.co/onnx-community/whisper-small_timestamped)
  (≈ 226 Mo). Il réécoute seulement les phrases de la voix faible dans les passages gardés. Téléchargé une seule fois
  depuis huggingface.co, après accord de l'utilisateur ; pas inclus dans le dépôt.

## Détecteur de voix et empreinte de voix (Best-of)
- **Silero VAD v5** — [snakers4/silero-vad](https://github.com/snakers4/silero-vad), Silero Team, licence MIT
  (Copyright (c) 2020-present Silero Team). Le fichier ONNX (2,2 Mo, SHA-256 vérifié, fiche dans
  `src/auto/modeles/catalogue.ts`) est **livré dans l'appli** : `public/modeles/silero-vad-v5.onnx`, avec sa licence
  à côté (`public/modeles/silero-vad-v5.LICENSE.txt`). Il trouve la parole (jump cuts, qui parle, musique qui baisse).
- **CAM++ « common advanced » (empreinte de voix, facultative)** — [3D-Speaker](https://github.com/modelscope/3D-Speaker)
  (ModelScope / iic), licence Apache 2.0 ; conversion ONNX par [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
  (k2-fsa). 28 Mo, téléchargé une seule fois depuis huggingface.co à une révision figée, SHA-256 vérifié, et
  seulement après le geste de l'utilisateur (« Séparer les voix »). Il n'est pas inclus dans le dépôt.
- **CLIP ViT-B/32, partie vision (« regard sur l'image », facultatif)** — [OpenAI CLIP](https://github.com/openai/CLIP), licence MIT ; conversion ONNX quantifiée : [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) (MIT). Téléchargé une fois seulement si l'utilisateur coche « Couper les menus et chargements ».
- Les deux tournent sur l'appareil avec ONNX Runtime Web (WASM, 1 fil) : rien n'est envoyé.

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

## Musique de fond
La musique automatique du Montage express prend d'abord **tes** musiques (Ma bibliothèque), sinon les morceaux ci-dessous, sinon une musique fabriquée par Arko.

### Morceaux de Kevin MacLeod (CC BY 4.0)
- 9 morceaux de **Kevin MacLeod** ([incompetech.com](https://incompetech.com)), sous licence [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Licence vérifiée le 7/11/2026 sur la page de chaque morceau (`incompetech.com/music/royalty-free/index.html?isrc=…`).
- Dans le dépôt : `public/musiques/kevin-macleod/`. **Modifications** (permises par la licence) : silences du début et de la fin retirés, volume égalisé (−17 LUFS, limiteur doux), converti en AAC 96 kb/s stéréo 48 kHz. La musique elle-même n'est pas changée.
- Ils ne sont pas dans le pré-cache de l'appli : ils sont téléchargés **seulement quand le Montage express en a besoin**, puis gardés sur l'appareil.
- **Le crédit est obligatoire** dans la description de ta vidéo YouTube (Arko l'affiche, prêt à copier, dans Habiller → Sons → Musique). Crédit exact demandé pour chaque morceau :

```
"Monkeys Spinning Monkeys" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Sneaky Snitch" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Fluffing a Duck" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Investigations" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Scheming Weasel (faster version)" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Divertissement - Pizzicato (from the ballet Sylvia)" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Carefree" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Hidden Agenda" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

"Pixel Peeker Polka - faster" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

- « Divertissement - Pizzicato » est une œuvre de Léo Delibes (domaine public) ; l'**enregistrement** est celui de Kevin MacLeod (CC BY 4.0).

### Musique fabriquée par Arko (CC0)
- Quand il n'y a ni musique à toi ni internet, Arko **compose** sa musique de fond (`src/sons/musique/`) : pizzicato (corde pincée de Karplus-Strong), basse, petites percussions douces, 4 ambiances (joyeux malin, enquête, rigolo, fin calme), une boucle de 16 mesures. Aucun enregistrement ni aucune mélodie copiés.
- Elle est placée dans le **domaine public (CC0)** : aucun crédit à mettre.

## Chibis (personnages et avatars)
- Les **chibis** d'Arko (10 coiffures, 10 tenues, 10 accessoires, 24 émotions, 3 styles « Feutre raté », « Crayon », « Paint ») sont **dessinés par le code d'Arko** (`src/chibis/`), sans aucune image copiée. Ce sont des personnages **originaux** : ni Wankul, ni Pepe, ni aucun personnage existant.
- Les **persos** (7/11/2026 : style « Papier découpé » en buste, 6 persos tout prêts, 23 situations de jeu avec leurs objets, et les styles BD, Dessin animé, Bonhomme raté, Mascotte ronde, Pixel) sont eux aussi **dessinés par le code** (`src/chibis/persos/`). Les objets (épée, pioche, bombe, manette, coffre, trophée…) sont **génériques** : aucun objet, bloc, outil ni monstre d'un jeu existant.
- Ils sont placés dans le **domaine public (CC0)**, comme les PNG que tu en exportes : utilise-les où tu veux, sans rien demander à personne.
- Le style « Best-of serré » s'inspire de la façon de monter des créateurs gaming (best-of de partie monté serré, avatars dessinés à la place de la webcam). Aucun contenu, personnage, dessin ni nom de Wankil Studio n'est utilisé : les Wankuls et les cartes Wankul restent leur propriété.
