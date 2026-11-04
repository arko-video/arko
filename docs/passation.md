# Passation — Arko (éditeur vidéo TikTok open source)

Mise à jour : 4 novembre 2026, au petit matin. Toutes les phases (1 à 6) sont construites et testées automatiquement.

## En une phrase
Arko est une appli web gratuite et open source (licence MIT), qui s'installe comme une appli (PWA). Elle sert à transformer une vidéo de jeu en TikTok vertical, directement sur le téléphone. Il n'y a pas de compte, et la vidéo n'est jamais envoyée sur un serveur.

## Où sont les choses
- **Le code** : dossier `arko`, à mettre sur le PC de Romain dans `C:\dev\arko`. Ce dossier est la racine du dépôt.
- **Le plan complet** (phases 0 à 6) : doc « Plan — Arko, éditeur vidéo TikTok open source ».
- **La conception** (dans le dépôt, dossier `docs/`, et dans le projet) :
  - `decisions-phases-2-6.md` : il l'emporte sur tout le reste
  - `phases-2-6.md`
  - `architecture.md`
  - `decisions-phase1.md`
  - `retours-ux.md`
- **Les rapports de relecture** :
  - `tests/qa/RAPPORT-QA.md` (phase 1)
  - `tests/qa/RAPPORT-QA-P2.md` (phase 2)
  - `tests/qa/RAPPORT-QA-P3.md` (phase 3)
  - `tests/qa/RAPPORT-QA-FINAL.md` (phases 4 à 6)
- **Pour le public** : `README.md`, `CREDITS.md`, `CONTRIBUTING.md`, `SECURITY.md`, ainsi que des modèles d'issues en français.
- **Le module pour Mon Hub** : `integration/mon-hub/`, avec un fichier `LISEZ-MOI.md` et un écran Dart prêt à copier.

## Ce que fait Arko

### Phase 1 : le parcours de base (finie et testée)
- **Importer** une vidéo, même un live de plusieurs heures.
- **Couper** au pouce :
  - scinder, supprimer, ajuster avec les poignées, zoomer, avancer de ±1 image
  - « Commencer ici » / « Finir ici »
  - annuler / rétablir
  - « Dans ta vidéo d'origine » et « Aller à » pour les longues vidéos
- **Vertical** : fond flou ou plein écran recadré.
- **Exporter** : MP4 en 1080×1920, 30 images par seconde (720p en secours), puis Partager ou Télécharger.
- **Sauvegarde automatique** : on reprend son montage en re-choisissant la vidéo.

### Phase 2 : Habiller (finie et testée)
- Une nouvelle étape **Habiller** s'ajoute, ce qui fait 5 étapes. Elle a une barre d'outils en bas, un panneau, et une mini-frise qui montre ce qu'on a ajouté.
- **Accroche** :
  - un texte de 0 à 2,5 s, visible dès la 1re image
  - une vingtaine de suggestions gaming
- **Texte** :
  - 5 styles : accroche, bulle, citron, alerte, discret
  - on le fait glisser sur l'aperçu, avec un aimant au centre
  - le texte entier reste dans la zone visible de TikTok
  - un avertissement s'affiche si on tape un émoji, car il ne s'affiche pas encore dans la vidéo
- **Sous-titres automatiques** :
  - Whisper tourne dans le téléphone. Il se télécharge une seule fois (environ 94 Mo), après accord, puis il marche sans internet.
  - Le résultat est découpé mot par mot, avec 3 styles : karaoké, pop, boîte.
  - Les mots forts (« NON », « mdr », « gg »…) sont mis en valeur.
  - On peut corriger un mot, une fois ou dans toute la vidéo, et lui faire « retenir pour mes prochaines vidéos ».
  - Les phrases inventées par Whisper (« Amara.org »…) sont filtrées.
- **Jeu + webcam** : on place le cadre de la webcam, on choisit webcam en haut ou en bas et sa taille. Le réglage est mémorisé.
- **Tests** :
  - 179 tests Vitest
  - 10 tests e2e dans Chrome
  - 8 tests des sous-titres avec le vrai modèle : 94 % des mots reconnus, 8 à 10 s pour une phrase
  - 35 scénarios difficiles de relecture (phases 1 et 2)

### Phase 3 : sons, transitions, zooms, son guide (livrée)
- **Sons** :
  - 20 effets sonores **fabriqués par Arko**, sans aucun fichier copié, donc 100 % libres de droits (CC0). Ils sont rangés en 7 familles : impacts, whoosh, mèmes, comédie, tension, jeu, interface.
  - Un toucher écoute le son, « + » le pose à la tête de lecture. Il suit le moment de la vidéo même si on recoupe.
  - Réglages : volume, décalage de ±0,1 s, supprimer.
  - On peut aussi importer son propre son (audio, ou son d'une vidéo) ou enregistrer au micro. Ces sons sont gardés sur l'appareil pour la reprise.
- **Transitions** :
  - 7 au choix : coupe, flash, zoom, glissé, noir, glitch, secousse. Chacune a son son, qu'on peut couper.
  - Bouton « Partout » pour mettre la même à toutes les coupes.
- **Zooms** :
  - punch ou doux, avec la force, la durée et le point visé à faire glisser
  - en jeu + webcam, le zoom se fait sur la bande webcam
- **Son guide** (dans Couper) :
  - on importe le son tendance, qui est joué dans l'aperçu mais **jamais exporté**
  - les temps forts s'affichent sur la frise, et une option aimante les coupes sur le rythme
  - après l'export, un rappel indique : « dans TikTok, démarre le son à 0:12 »
- **Tests** :
  - 248 tests Vitest et 12 tests e2e
  - cohérence aperçu / export en pleine transition : 43 à 51 dB
  - un son posé tombe à ±10 ms
- **Relecture** : en cours sur une copie, pendant que la phase 4 se construit. Les corrections seront dans le zip de la phase 4.

### Phase 4 : rythme (livrée)
- **Couper** : vitesse par passage (de ×0,25 à ×3) et **arrêt sur image** à la fin d'un passage (0,5, 1 ou 2 s).
- **Combos en un toucher**, à poser pendant la lecture. Arko les cale tout seul sur le pic de son le plus proche.
  - **Boom** : zoom + « boum » de mème.
  - **Figé** : arrêt sur image + scratch.
  - **Raté** : ralenti + trombone triste.
- **Modèles** :
  - **Top 3** : « #3, #2, #1 » + transitions + sons. Il faut au moins 3 passages.
  - **Le meilleur d'abord** : le moment fort est copié au tout début, avec « ATTENDS… ».
- **Alerte de rythme** : un seul repère orange, sur le passage qui traîne le plus. Un conseil s'affiche aussi si l'accroche est calme.
- **Mes montages** : plusieurs projets, avec Ouvrir, Renommer, Dupliquer et Supprimer.
- **Tests** : 368 tests Vitest et 17 tests e2e.

### Phase 5 : ouverture au public (prête, il reste la publication)
- Dans l'appli :
  - un écran **Aide** (le « ? » sur Importer)
  - 3 conseils au tout premier lancement
  - un lien vers le code source
- Dans le dépôt : `README`, `CREDITS` (toutes les licences), `CONTRIBUTING`, `SECURITY`, modèles d'issues, et une publication automatique sur GitHub Pages (`.github/workflows/publier.yml`).
- **Module Mon Hub** : dossier `integration/mon-hub/`. Il contient un écran Dart qui ouvre Arko dans un onglet Chrome intégré, et un guide pour le brancher. C'est à faire avec Claude, pendant une session où ton PC est relié.
- **À faire par Romain** :
  - publier sur GitHub (voir plus bas)
  - tourner un TikTok qui présente Arko, monté avec Arko

### Phase 6 : le monteur IA (construit et testé)
- **Où le trouver** : quand on importe une vidéo de plus de 5 min, Arko propose « Je monte moi-même » ou « **Monteur IA** ».
- **Écran 1, Réglages** :
  - le nombre de clips (10 par défaut, 30 au plus), la durée visée et une consigne libre (« que des clutchs »)
  - « Transcrire les voix »
  - le mode
- **Le mode sans IA** est le mode par défaut. Il est gratuit et rien n'est envoyé.
- **Le mode avec l'IA** :
  - fournisseurs : Anthropic, OpenAI, Gemini
  - la clé est gardée **sur le téléphone seulement**, dans IndexedDB, jamais dans le code
  - boutons « Tester ma clé », « Oublier ma clé » et « Voir ce qui est envoyé »
  - le coût est estimé en mots simples
  - **aucune image ni vidéo n'est envoyée** : seulement un résumé texte des moments, environ 2 000 à 15 000 tokens
- **Écran 2, Analyse sur le téléphone** :
  - pics de son, « calme puis pic », cris, rires, changements de scène
  - transcription seulement autour des 40 meilleurs moments
  - Annuler, et Reprendre là où ça s'était arrêté
  - mesuré sur PC : une vidéo de 2 h est analysée en environ 30 s sans transcription
- **Écran 3, Revue** :
  - en plein écran et en boucle : on balaie à droite pour garder, à gauche pour jeter
  - la raison est affichée (« Gros pic de son après un calme »)
  - les clips gardés vont dans **Mes montages**, où on les retouche et on les exporte un par un
- **Modèles conseillés** (vérifiés le 4/11/2026 dans les documentations officielles) : `claude-haiku-5-5`, `gpt-6-luna`, `gemini-3.5-flash-lite`. Le bouton « Tester ma clé » liste ceux auxquels ta clé a droit.

## Décisions prises cette nuit (à valider par Romain)
- **Sous-titres sur fond flou** : placés juste sous la vidéo (y = 0,66). Un avertissement apparaît s'ils descendent dans la zone cachée par la description TikTok. À juger sur une vraie vidéo.
- **Cadre webcam par défaut** : en bas à gauche, à ajuster une fois puis mémorisé.
- **Effets sonores** (phase 3) : ils sont **fabriqués par le code d'Arko** (synthèse), sans aucun fichier copié. Ils sont donc 100 % libres de droits (CC0). On peut aussi importer son propre son, ou enregistrer au micro.
- **Couper les blancs** : repoussé. Le son du jeu n'est jamais vraiment muet, il faudra une méthode « temps morts ».
- **Monteur IA** (phase 6) :
  - le mode **sans IA** est le mode par défaut
  - la clé API de l'utilisateur reste dans Arko, sur son appareil
  - 3 fournisseurs : Anthropic, OpenAI, Gemini
- **Hébergement** : sur `<compte>.github.io`, toutes les pages du même compte partagent le stockage. Conseil : créer une **organisation GitHub gratuite** rien que pour Arko (par exemple `arko-video`) et y mettre le dépôt `arko`. L'adresse sera alors `https://arko-video.github.io/arko/`.

## Petites dettes connues
- **Tests de cohérence** : ils ne repèrent pas à coup sûr un décalage d'une seule image (à ±1 image, environ 31 dB pour un seuil de 30 dB).
- **Vidéo muette** : le message « vidéo muette » n'a pas été testé avec un vrai fichier abîmé.
- **Module Mon Hub** : le fichier Dart n'a pas pu être analysé, car Flutter n'est pas dans la VM. Lance `flutter analyze` sur le PC.
- **Monteur IA, rires** : la détection des rires est une heuristique, testée sur des signaux fabriqués. Elle n'a pas été testée sur une vraie voix.
- **Monteur IA, liens** : le lien avec la clé du collègue IA de Mon Hub viendra plus tard.
- **Analyse interrompue** : la reprise d'une analyse ne fait gagner que quelques secondes sur une vidéo de 2 h, parce que l'analyse est déjà rapide.

## À valider par Romain (goût et vocabulaire)
- **Les 20 sons** : écoute-les tous. Ils ont été réglés pour avoir à peu près le même volume, mais personne ne les a encore entendus avec une vraie oreille. Dis lesquels refaire.
- **Les mots anglais** : Whoosh, Bass drop, Tape stop, Glitch, Punch, Boom, Top 3, scratch, tokens. On les garde, puisque les créateurs gaming les utilisent, ou on les traduit ?
- **Hauteur des sous-titres** sur le fond flou : juste sous la vidéo.
- **Accroches** proposées et textes du monteur sans IA (« ATTENDS LA FIN… », etc.).

## Pas encore vérifié (à faire par Romain)
- **Sur le vrai Xiaomi** :
  - la fluidité de l'aperçu, surtout avec des transitions, des zooms et des sous-titres
  - l'export en 1080p ou en 720p, et son temps
  - le partage vers TikTok
- **Whisper sur le téléphone** : le temps de transcription, et le clavier Android quand le panneau se réduit.
- **Monteur IA sur un vrai live** : le temps d'analyse sur le téléphone, et la question qui compte : les moments trouvés sont-ils les bons ?
- **Monteur avec une vraie clé API** : c'est toi qui la tapes, dans Arko.

## Tester sur le Xiaomi
Arko a besoin d'une adresse sécurisée (https ou `localhost`), sinon Chrome bloque l'encodage vidéo.

**A. Par GitHub Pages (recommandé)**
1. Sur github.com, crée une **organisation gratuite** (« New organization », offre Free), par exemple `arko-video`. Crée-y un dépôt public nommé exactement **`arko`**. Le nom compte : l'appli attend l'adresse `/arko/`.
2. Fais la sauvegarde Git ci-dessous, puis envoie le code avec `git push`.
3. Sur GitHub, ouvre le dépôt, puis Settings → Pages → Source → **GitHub Actions**.
4. Attends environ 2 minutes que l'onglet Actions passe au vert.
5. Sur le Xiaomi, ouvre `https://arko-video.github.io/arko/` dans Chrome. Menu ⋮ → « Ajouter à l'écran d'accueil ».

**B. Sans rien publier (câble USB)**
1. Il faut Node.js 22 sur le PC. Vérifie avec `node -v`. Si la commande n'est pas reconnue, utilise la méthode A.
2. Dans `C:\dev\arko`, lance `npm install` (une seule fois), puis `npm run dev`.
3. Branche le Xiaomi en USB, avec le débogage USB activé.
4. Dans Chrome sur le PC, ouvre `chrome://inspect/#devices` → Port forwarding → `5173` → `localhost:5173`.
5. Sur le Xiaomi, ouvre `http://localhost:5173/arko/` dans Chrome.

**À tester, dans l'ordre**
1. Importer une vraie vidéo de jeu (1 à 5 min).
2. Couper : scinder, supprimer, poignées, annuler.
3. Vertical : fond flou, plein écran, puis jeu + webcam (placer le cadre).
4. Habiller :
   - mettre une accroche
   - ajouter un texte et le faire glisser
   - lancer les sous-titres (noter le temps de transcription)
   - corriger un mot
   - ajouter 2 sons, une transition partout et un zoom (écoute bien chaque son : sont-ils réussis ?)
   - essayer les combos Boom / Figé / Raté pendant la lecture, et le modèle Top 3
   - écouter chaque son : lesquels sont réussis, lesquels sont à refaire ?
5. Couper : importer un son tendance comme son guide, puis vérifier qu'il n'est pas dans la vidéo exportée.
6. Exporter : noter le temps et la qualité, regarder la vidéo dans la galerie, puis Partager vers TikTok en brouillon.
7. Fermer Chrome en plein montage, rouvrir Arko, puis rouvrir le montage dans « Mes montages ».
8. **Monteur IA**, avec un vrai live d'1 h ou plus :
   - d'abord **sans IA** : noter le temps d'analyse, puis voir si les moments proposés sont vraiment les bons
   - ensuite, si tu veux, **avec ta propre clé**. C'est toi qui la tapes, dans Arko, jamais dans la conversation.

**À renvoyer à Claude** :
- le modèle exact du Xiaomi
- des captures, avec les messages d'erreur exacts
- les temps d'export et de sous-titres
- ce qui était lent ou peu pratique au pouce

## Sauvegarde Git (sur le PC de Romain, jamais dans la VM)
Pour la première fois, dans `C:\dev\arko` :
```
git init
git add .
git commit -m "Arko : phases 1 à 6"
git branch -M main
git remote add origin https://github.com/arko-video/arko.git
git push -u origin main
```
Pour chaque nouvelle phase reçue en zip :
1. Remplace le contenu de `C:\dev\arko` par celui du zip, en gardant le dossier caché `.git`.
2. Lance :
   ```
   git add .
   git commit -m "Arko : phase N"
   git push
   ```

## Règles à garder
- **Effets sonores** : uniquement ceux fabriqués par Arko (CC0), ou des sons importés par l'utilisateur, sous sa propre responsabilité. Les sons tendance de TikTok s'ajoutent dans TikTok au moment de publier.
- **La recette** `arko.recette/1` est la seule source de vérité. L'interface la modifie uniquement par les fonctions de `src/recette/operations*.ts`.
- **Versions figées**, à ne mettre à jour qu'après un test sur le Xiaomi :
  - `mediabunny` 1.65.1
  - `@huggingface/transformers` 4.3.2
  - `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0
- **Clés API** : jamais dans le code. Pour le monteur IA, chaque utilisateur met sa propre clé, gardée sur son appareil.
