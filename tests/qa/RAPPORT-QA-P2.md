# Arko phase 2 (« Habiller ») : rapport de QA indépendante

4 novembre 2026. Relecteur qui n'a pas vu le code s'écrire. Référence : `conception/decisions-phases-2-6.md` (fait foi) et `phases-2-6.md` (Phase 2).
Environnement : Linux, Chrome stable headless (Playwright `channel: 'chrome'`), 360 × 740, 2 cœurs, ffmpeg 6.1. Rien n'a été modifié dans `src/`, `tests/e2e/`, `index.html` ni les configs de l'appli. Seule la config QA a changé : port 4184 et build dans `dist-qa/`.

## 1. Résultats

| Suite | Résultat |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erreur |
| `npx vitest run` | ✅ 22 fichiers, 170 tests |
| QA phase 1 (`tests/qa/[a-n]-*.qa.ts`, mis à jour pour « Étape x sur 5 » + étape Habiller) | ✅ **22/22** (4,3 min). B-2 et I-2 de la phase 1 ne se reproduisent plus (assertions de h1, m, n2). B-1 n'est pas contrôlé par une assertion : i et k1 ne font que noter le résultat. |
| QA phase 2 (`tests/qa/p2-*.qa.ts`) | **11 réussis, 2 échecs** (deux vrais bugs : I-1 et I-3) |

| # | Scénario | Résultat | Mesures |
|---|---|---|---|
| p2-a | Accroche, image 0 du MP4 | ✅ | 20 suggestions. Accroche de 3 lignes entière dès l'image 0, même boîte qu'à l'image 15 (pas de « pop »), y ≥ 0,14. Disparue à 2,67 s. |
| p2-b | Texte glissé | ❌ | Aperçu = export à **0,2 %** près. Aimant : x = 0,5 et guide affiché. Zone sûre affichée pendant le glissé. **Un texte de 3 lignes descend jusqu'à y = 0,685, dans la zone basse de TikTok** (I-3). |
| p2-c | 5 styles de texte × 3 styles de sous-titres | ✅ | Planches `captures/p2-c-planche-*.png`, sur une mire très colorée. Lisibles comme sur TikTok : accroche, bulle, citron, alerte, karaoké, pop, boîte. **« discret » est peu lisible** sur un fond clair ou chargé (M-1). |
| p2-d | Émoji | ✅ | Message affiché. L'image du texte avec émojis est identique à celle du texte sans émoji (PSNR 99 dB) : aucun carré. Une accroche faite seulement d'émojis ne dessine rien. |
| p2-e | Sous-titres par l'interface (vrai Whisper) | ✅ | Aucune requête avant l'accord. 6,9 s jusqu'à « J'écoute ». Annuler ferme le Worker. Relance sans dialogue, transcription en 7,5 s, **94 % des mots**. « Corriger partout » change les 2 « on » et mémorise la correction. Mot en valeur OK. Sous-titres visibles dans l'export. **La barre de progression revient de 100 % à 0 %** (I-2). |
| p2-f | Sous-titres et découpe | ✅ | Après avoir retiré [2 ; 4] s dans Couper, « aujourd'hui / on / lance » disparaissent, et « une partie… » passe à 0:02,2. |
| p2-e2 | Course : nouvelle vidéo pendant une transcription | ❌ | **Les sous-titres de l'ancienne vidéo arrivent dans le nouveau projet** (I-1). |
| p2-g | Jeu + webcam | ✅ | Cadre déplacé puis réduit sur la vraie webcam. Bandes exportées justes en haut (0,35) et en bas (0,5) : webcam rouge, séparation noire, jeu centré. Sous-titres centrés sur la jointure (0,35, puis 0,50 quand on change la mise). `arko.cam` est repris au montage suivant, avec le message. |
| p2-h | Clavier ouvert (visualViewport à 400 px) | ✅ | Panneau réduit au champ (pas d'idées, de styles ni de mini-frise). Aperçu de 203 px visible, champ à y 332–384. |
| p2-i | Annuler / Rétablir + reprise | ✅ | **15/15 actions** : accroche (idée, texte, retrait), texte (ajout, style, durée, jusqu'à la fin, glissé, suppression), sous-titres (style, mot, partout, en valeur, suppression, retrait). La reprise à Habiller redonne la même recette. |
| p2-j | Cohérence aperçu / export | ✅ | PSNR de la luminance : **36,1 dB** sur l'image, 33,0 dB dans la zone des textes, 33,1 dB dans celle des sous-titres. |
| p2-k | Performance (10 s en 1080p, mire) | ✅ | Sans calques 14,6 s ; avec accroche + 2 textes + karaoké 14,6 s ; avec pop 14,6 s. **Surcoût 0 %.** |

Sécurité (p2-e/f) : la seule requête externe va vers `huggingface.co` (13 requêtes, une par fichier). Le WASM d'onnxruntime vient de `/arko/ort/`. Aucune requête vers un CDN, aucune violation de CSP. Le Worker Whisper est fermé à la fin et après Annuler.
Aucun texte visible en anglais. Aucun fichier TS/TSX de plus de 300 lignes.

## 2. Bugs

### Bloquant
Aucun.

### Important

**I-1. Une transcription en cours pose ses sous-titres dans le projet suivant** (sous-titres, interface)
- `src/ui/sous-titres-ui.ts:88` : `modifier((x) => poserSousTitres(x, mots))` s'applique à la recette du moment. `demarrerProjet` et `toutFermer` (`src/ui/etat.ts:125`, `:140`) n'annulent pas la transcription.
- Reproduction (`p2-e2`) : lancer « Tout refaire », revenir à Importer, choisir une autre vidéo. 25 s plus tard, le projet de la vidéo grise contient « Salut tout le monde, une partie est ON… ».
- Correction : appeler `annulerSousTitres()` dans `demarrerProjet` et `toutFermer`. Et ne poser les mots que si `sources.peek()[0]` est toujours la source transcrite (comparer l'empreinte).

**I-2. Progression 0 → 100 % → 0 %, avec « Je télécharge… 0 / 94 Mo » une 2ᵉ fois** (sous-titres)
- `src/ui/sous-titres-ui.ts:82-85` : un 1ᵉʳ Worker télécharge, puis un 2ᵉ recharge le modèle pour transcrire. `src/sous-titres/worker.ts:64` et `:70` affichent « Je télécharge » même quand les fichiers viennent du cache (aucune requête réseau à ce moment-là).
- Effet : l'utilisateur croit que 94 Mo se téléchargent deux fois. Le modèle est aussi initialisé deux fois (WASM compilé deux fois, plus lent sur téléphone).
- Correction : un seul Worker qui télécharge puis transcrit, avec une barre de 0 à 1 (par exemple 0–60 % pour le téléchargement, 60–100 % pour l'écoute). Afficher « Je télécharge » seulement s'il y a vraiment des octets reçus du réseau.

**I-3. Un texte de plusieurs lignes peut descendre dans la zone basse de TikTok** (interface, moteur)
- `src/ui/composants/CalqueTextes.tsx:44` et `src/recette/defauts.ts:22` : `yMax = 0,62` s'applique au **centre** du texte, sans tenir compte de sa hauteur. `src/moteur/couches/textes.ts:135` ne borne le texte qu'aux bords de l'image.
- Reproduction (`p2-b`, capture `p2-b-apercu-texte2-zone-sure.png`) : un texte « bulle » de 3 lignes, glissé vers le bas, va jusqu'à y = 0,685 (la zone basse commence à 0,656). Sa dernière ligne passe sous la description TikTok.
- Correction : borner le centre à [0,125 + h/2 ; 0,656 − h/2], avec h tiré de `boitesTextes`, dans le glissé comme dans le normaliseur.

**I-4. Un nouveau texte se pose exactement sur l'accroche** (interface)
- `src/ui/habillage.ts:126` : le texte est créé à y = 0,2 (`TEXTE.y`), la même hauteur que l'accroche (`ACCROCHE.y`).
- Reproduction : capture `p2-j-export-2s.png`. Un texte ajouté à 1 s cache l'accroche « 1v4 avec 8 PV » jusqu'à 2,5 s.
- Correction : si une accroche est visible à la tête de lecture, placer le nouveau texte plus bas (par exemple y = 0,4). Sinon, le décaler sous les textes déjà visibles.

**I-5. Sous-titres par défaut dans la zone cachée par TikTok** (sous-titres, conception)
- `src/recette/defauts.ts:34` : avec le fond flou, y = 0,68. Une ligne karaoké couvre alors environ 0,63–0,73, alors que la zone sûre d'Arko commence à 0,656 (capture `p2-e-export-1-9s.png`). C'est pire pour une **vidéo déjà verticale** (Vertical sautée, mise « flou ») : il n'y a pas de « dessous de la vidéo », et les sous-titres tombent sur la description.
- L'avertissement « un sous-titre ou un texte touche la zone basse », demandé par `phases-2-6.md` (§ Zone sûre), n'existe pas.
- Correction : 0,60 pour une source verticale ; limiter à 0,656 − h/2 ; ajouter l'avertissement. **La valeur 0,68 est une décision écrite : à faire trancher par Romain.**

### Mineur
- **M-1** (moteur) `src/moteur/couches/styles-texte.ts:42` : « discret » (Inter 600, 52 px, ombre seule) est presque illisible sur un fond clair ou chargé (planches p2-c). Ajouter un léger contour ou un fond à 30 %.
- **M-2** (moteur) `src/moteur/polices.ts:45-47` : la minuterie de 8 s n'est jamais arrêtée. Si elle gagne la course, `chargees` passe à vrai et `memo` (`mesure.ts:34`) garde des mises en page faites avec la police de secours. Le rejet tardif de `tout` n'est pas intercepté.
- **M-3** (sous-titres) `src/sous-titres/corrections.ts:59` : `table[...]` est un objet ordinaire. Un mot comme « constructor » renvoie une fonction, et `remplacement.endsWith` plante la transcription. Utiliser `Object.hasOwn` ou une `Map`.
- **M-4** (sous-titres, interface) `src/ui/sous-titres-ui.ts:140` : « Corriger partout » mémorise la correction pour toujours (ex. « on » → « ON »), et aucun écran ne permet de l'oublier. Séparer « tous les mots identiques » de « dans mes prochaines vidéos ».
- **M-5** (interface, accessibilité) Le cadre webcam et ses poignées (`EditeurWebcam.tsx:139`, `role="img"` sur une poignée active) et les textes sur l'aperçu (`CalqueTextes.tsx:123`) ne se déplacent qu'au doigt : pas d'alternative au clavier. Les barres de la mini-frise font 60 × 26 px (moins de 44 px).
- **M-6** (interface) `src/recette/defauts.ts:19` : le cadre webcam par défaut est en haut à droite (0,72 ; 0,04). Le brief dit x 0,02, y 0,62, l 0,26, h 0,34 (en bas à gauche).
- **M-7** (sous-titres) `src/sous-titres/lecture-son.ts:39-47` : un `AudioSample` n'est pas fermé si une erreur survient entre `copyTo` et `close` (utiliser `try/finally`).
- **M-8** (interface, performance) `OutilSousTitres.tsx:79` et `Habiller.tsx` (`calquesPour`) : `lignesSousTitres` → `compiler()` est recalculé à chaque image pendant la lecture (la tête est lue au rendu). Mémoriser par recette.
- **M-9** (sous-titres) `src/sous-titres/nettoyage.ts:42` : « monde! » est écrit sans l'espace française avant « ! ? : ».
- **M-10** (interface) `src/ui/habillage.ts:94` : tout texte à 0 s qui dure 2,5 s est pris pour l'accroche.
- **M-11** (interface) `src/ui/styles/ecrans.css` fait 732 lignes et `theme.css` 477 (au-delà de 300, si la règle vaut pour le CSS).
- Remarque (pas un bug) : en Jeu + webcam, la webcam incrustée dans la capture du jeu reste visible dans la bande de jeu (capture `p2-g-export-cam-bas.png`). On peut la sortir en glissant la zone de jeu.

## 3. Pas testé
Le vrai téléphone : encodeur matériel, Whisper en WASM sur le Xiaomi (le temps de transcription ici vient d'un PC), vrai clavier Android, gestes au doigt, vibration de l'aimant. Le dialogue « place insuffisante » (`navigator.storage.estimate`) et `persist()` n'ont pas été vérifiés de près.

## 4. Fichiers
Scénarios : `tests/qa/p2-*.qa.ts`, outils communs dans `tests/qa/p2-outils.ts`. Vidéos de test : `tests/qa/fixtures/p2-*.mp4`. Captures : `tests/qa/captures/p2-*.png`. Lancer : `npx playwright test --config tests/qa/playwright.qa.config.ts`.
