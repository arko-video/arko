# Passation — Arko (éditeur vidéo TikTok et YouTube open source)

Mise à jour : 6 novembre 2026, la nuit (Ma bibliothèque, Fond vert, Mèmes). Toutes les phases (1 à 6), le Montage auto, « Améliorer l'image » et Ma bibliothèque sont construits et testés automatiquement.

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

### Mes sons (4 novembre 2026, après la publication)
- Habiller → Sons → **Mes sons** (premier onglet) : sons gardés sur l'appareil pour tous les montages (100 Mo au plus,
  base IndexedDB à part, jamais nettoyée automatiquement), avec étiquette, recherche, renommer, supprimer.
- **Importer des sons** : plusieurs fichiers d'un coup ou un `.zip` (lecture sûre : sons seulement, 200 au plus, ni ZIP64 ni chiffré).
- Bouton « Trouver des sons sur MyInstants ↗ » (nouvel onglet) + 3 lignes d'aide + rappel sur la responsabilité.
- **Partager → Arko** (Android, Arko installé) : « 2 sons reçus — Les garder ? ».
- Un son importé dans un montage (onglet « Importés ») peut être gardé dans Mes sons.
- La bibliothèque de ~300 sons CC0 est **en pause** hors du dépôt : `biblio-en-pause/LISEZ-MOI.md`.

### Couper dans Habiller (4 novembre 2026, demande de Romain)
- Habiller → **Couper** (1er outil de la barre) : Scinder ici, Supprimer (plan touché sur la mini-frise, sinon celui sous la tête), Début ici / Fin ici (le plan commence ou finit à la tête).
- Mêmes actions que l'étape Couper (`src/ui/coupes.ts` → opérations de la recette), donc même Annuler / Rétablir.
- Ce qui suit : sons, zooms, sous-titres suivent les images et disparaissent avec leur passage ; les textes gardent leur moment de la vidéo (un texte qui tomberait après la fin est replacé au début, règle déjà existante).

### TikTok ou YouTube (5 novembre 2026, demande de Romain)
- **Écran de départ** « Tu montes pour où ? » : TikTok, ou YouTube → **Vidéo (16:9)** / **Short (vertical)**. Choix mémorisé
  (`localStorage arko.destination`), à changer depuis l'accueil ou Mes montages ; chaque montage garde le sien
  (champ facultatif `destination` de la recette ; absent = TikTok : les anciens projets s'ouvrent pareil).
- **Un seul Arko, un seul rendu** : un « gabarit » par destination (`src/recette/destination.ts`) donne la taille de référence
  (1080 × 1920 ou 1920 × 1080), la zone sûre, les bornes des textes et les durées. Textes, sous-titres, sons, zooms, transitions,
  Mes sons et Couper marchent tels quels en 16:9.
- **Short** : zone sûre des Shorts (marges prudentes, pas de mesure officielle de YouTube), export 1080 × 1920, alerte au-delà de 3 min.
- **16:9** : étape **Cadrage** (sautée si la vidéo est déjà en 16:9), export 1920 × 1080 à 8 Mb/s, 1440p à 16 Mb/s en option,
  son AAC stéréo à **384 kb/s** (conseil YouTube ; sinon le plus haut accepté par l'encodeur : 320, 256, 192 kb/s) ;
  **Chapitres** (règles 0:00 / 3 au moins / 10 s, copie en un toucher) ; **Intro / outro** (3 modèles animés ou ta vidéo, ajoutés
  par `rendre()` : dans l'aperçu comme dans l'export ; sur les frises, une tuile au début et à la fin, non coupable, « × » pour la
  retirer) ; **Miniature** 1280 × 720 < 2 Mo ; **compilation 16:9** à la
  fin de la revue du monteur IA. Sources des règles : `README.md` et commentaires du code.
- **Tests** : 430 Vitest, e2e YouTube (export 1920 × 1080 de 35 s outro comprise, miniatures JPEG / PNG) ; les anciens e2e
  jouent un appareil qui a déjà choisi TikTok (`playwright.config.ts`, port libre avec `ARKO_PORT`).
- **À regarder sur le Xiaomi** : l'export 1080p et 1440p en 16:9, la taille des textes en 16:9, les émojis de la miniature,
  le collage des chapitres dans l'appli YouTube, et la zone sûre des Shorts sur un vrai Short.

## Montage auto (6/11/2026)
Demande de Romain : « ajoute lui ça » — qu'un débutant monte une longue session de jeu (OBS, deux potes en vocal)
façon Laink / Terracid, sur téléphone comme sur PC. Conception : `conception/brief-montage-auto.md` et
`conception/contrat-montage-auto.md` (corrigé §9). Tout reste sur l'appareil, aucune dépendance npm ajoutée, la recette
reste `arko.recette/1` (champs facultatifs : les anciens montages s'ouvrent pareil, vérifié sur 20 recettes figées).

### Ce que fait chaque partie, et où la trouver
- **A. Couper les blancs** (Couper, et Habiller → Couper) : garde la parole (mots de Whisper, 0,25 s avant / 0,35 s
  après chaque mot, morceaux fusionnés sous 0,5 s, morceau ≥ 0,35 s) et les sons forts hors parole (> −16 dBFS sur
  100 ms, −0,4 / +0,6 s) ; sans transcription : voix détectée au son (bande 300–3400 Hz, 8 dB au-dessus du jeu).
  Serré / Normal / Large, « Seulement une partie », aperçu « 2 h 03 → 41 min de parole · 312 coupes », un seul
  Annuler, fondus du son 20 ms / 40 ms à chaque coupe. Transcription par tranches de 5 min, **reprise** si on ferme.
  **Les sous-titres réutilisent ensuite ces mots** (pas de 2ᵉ passage de Whisper).
- **D. Enlever les bords de l'écran** (Couper, Cadrage) : bandes fixes trouvées sur 20 images (barre de titre,
  barre des tâches), poignées pour ajuster ; exemple vérifié 1280 × 720 → 1173 × 660 à (53, 20).
- **B. Punchlines** (Habiller → Sous-titres) : seules les phrases fortes (≤ 7 mots + mot fort, « ! », juron, rire ou
  pic de son), MAJUSCULES, mot clé jaune `#FFE500` (ou rouge), jurons masqués (« P*TAIN »), un toucher ajoute / retire.
  **Calées sur les mots** (retour de Romain) : apparaissent au début du 1er mot, jamais avant, disparaissent 0,2 s
  après le dernier, 2,5 s au plus (une phrase plus longue est coupée en deux lignes).
- **C. Zooms automatiques** (Habiller → Zoom) : ×1,32 sur chaque plan à moment fort, ×1,12 un plan sur trois ;
  Doux / Normal / Fort ; centre à 45 % de la hauteur.
- **G. Titres de section** (Habiller → Chapitres, Texte) : titre du chapitre en bandeau 2,2 s + whoosh.
- **E. Bruitages auto** (Habiller → Sons) : **mode prudent** après le retour de Romain (« atroces » sur le vrai
  montage) : posés sur la **réaction** (0,15 s après la fin de la phrase, ou au début du rire / cri qui suit),
  jamais par-dessus la parole (coupés 0,05 s avant que quelqu'un reparle ; rien si moins de 0,8 s de place) ;
  seulement les déclencheurs très sûrs (expression de plusieurs mots, ou mot crié « ! » / sur un pic) ; **1 toutes
  les 2 minutes** au plus. Revue : « Écouter dans la vidéo » (l'aperçu joue de 2 s avant le son à 2 s après sa fin),
  case **Garder décochée d'office**, « Poser les n bruitages cochés » : rien n'est posé sans validation. Le son vient
  de Mes sons (étiquette + nom) sinon d'Arko. L'ancien réglage existe encore dans le code (`MODE_LARGE`).
- **Mes sons par dossiers** : un .zip ou un dossier garde le nom du dossier comme étiquette ; les .mp4 du pack ne
  gardent que leur son ; 2 000 sons / 600 Mo si le téléphone a la place.
- **F. Musique** (Habiller → Sons → Musique) : 1 à 6 morceaux qui se suivent, en boucle, fondus 1,2 / 1,5 s, −17 dB,
  **baisse quand on parle** (seuil 0,03, ratio 6, 20 / 400 ms) ; crédit Kevin MacLeod, alerte musiques de jeux.
  **Volume final** (Exporter) : −14 LUFS, crête ≤ −1,5 dBTP, en 2 passes ; mesure affichée à la fin.
- **H. Montage express** : à l'import d'une vidéo de plus de 5 min (« Montage express », entre « Monteur IA » et
  « Je monte moi-même »), ou depuis **Mes montages → ⋮ → Montage express**. Code : `src/auto/express/` (pur :
  `scenes.ts`, `express.ts`, `ia-express.ts` ; navigateur : `analyse-express.ts`) et `src/ui/auto/express/`.
  1. **Réglages** : pour YouTube 16:9 / TikTok / Short, durée visée (16:9 : 8–12, **15–20**, 25–30 min ; TikTok :
     45 s–1 min, **1–2**, 2–3 min), Parole + moments forts / Parole seulement, Serré / Normal / Large, Transcrire les
     voix (coché si le module Whisper est déjà là), Punchlines, Bruitages auto (**décoché**), Zooms, Titres de section
     (16:9), Accroche de 6 s, Enlever les bords, Musique (1 à 6 morceaux de Mes sons ≥ 8 s, crédit affiché),
     Sans IA (défaut) / Avec l'IA (ta clé, celle du Monteur IA ; seul du texte est envoyé).
  2. **Analyse** sur l'appareil : son (réutilise l'analyse du monteur IA), transcription longue avec reprise (ou voix
     au son), bords de l'écran, scènes. Avec l'IA : résumé texte des scènes + phrases fortes → l'IA coche les scènes,
     donne des titres et corrige les mots mal compris (« Voir ce qui est envoyé » sur la revue).
  3. **Revue** : séquences (titre = la meilleure phrase forte, de → à, durée après coupe, raison « 3 rires · 2 pics de
     son »), cocher / décocher, ↑ ↓, durée totale (accroche comprise) mise à jour, alerte si plus long que la limite.
     Les longs passages sans son (fin AFK, ≥ 2 min sous −60 dBFS) ne sont jamais proposés, et c'est écrit.
  - **Choix des séquences** : parole regroupée en scènes (pause > 20 s ; une scène > 4 min est recoupée à son plus
    grand blanc) ; note = rires × 8 + cris × 6 + pics × 4 + jurons × 3 + mots forts × 3, par minute gardée ; les
    meilleures jusqu'à la durée visée, remises dans l'ordre chronologique.
  - **« Monter la vidéo »** crée un **nouveau montage « Montage express — <nom> »** (dans Mes montages, supprimable)
    et applique tout en **une seule opération** : A → D → B → (E) → C → accroche de 6 s (meilleur pic, « ATTENDS… »)
    → chapitres (un par séquence, règles YouTube) → G → F (morceaux de musique au début des chapitres) + volume final.
    **Un seul Annuler** revient à la vidéo brute. Si les bruitages sont cochés, la revue des bruitages s'ouvre ensuite.
- **Autres corrections** : le conseil de durée de Couper tient compte de la destination (16:9 : vert dès 1 min,
  orange au-delà de 60 min ; Short : orange au-delà de 3 min ; TikTok inchangé) ; « Volume : … » avec espaces
  insécables (règle des textes).

### Mesures (VM, Chrome headless)
- `tsc` : 0 erreur. Vitest : 723 tests verts (76 fichiers, dont ceux de l'outil « Améliorer l'image » en cours).
  E2e : 35 verts + 8 du banc sous-titres (vrai Whisper, `--config playwright.sous-titres.config.ts`) verts.
- E2e « Montage express » (`tests/e2e/montage-express.spec.ts` : capture OBS 40 s, voix + jeu + barres, pack .zip à
  dossiers, musique Kevin MacLeod) : analyse 2,4 à 3 s (transcription déjà gardée), montage 24 s (accroche 6 s + 18 s
  de parole et d'explosion, 4 plans), 1 bruitage proposé après la phrase et posé seulement une fois coché, export
  1920 × 1080 de 24,3 s, **−14,0 LUFS** (Arko) / **−14 LUFS** (ffmpeg), crête −1,8 dBFS, 0 % de lignes de barre en
  haut et en bas. Un seul Annuler revient à la vidéo brute (40 s).
- Corrigé au passage : l'export plantait (« Ce fichier ne contient pas de vidéo ») si un son ouvert n'était pas dans la
  recette (son écouté dans la revue mais pas posé) : le Worker d'export l'ignore maintenant.

### Reporté (et pourquoi)
- `share_target` pour les .mp4 partagés vers Arko : partager une vidéo de jeu à Arko la mettrait dans Mes sons
  (seulement son son), ce qui surprendrait. À décider avec Romain.
- Revue des bruitages DANS le Montage express : elle s'ouvre juste après, dans Habiller → Sons (même écran que partout).

### À valider par Romain (sur une vraie vidéo, idéalement sur le Xiaomi)
- **Coupes** : Serré / Large ; mode « au son de la voix » (voix ≥ 8 dB au-dessus du jeu) ; marge de 2 px des bords ;
  temps de Whisper sur 2 h sur le Xiaomi ; webcam + rognage (pas d'e2e).
- **Punchlines** : hauteur en vertical (y ≤ 0,63) ; la nouvelle tenue (fin du mot + 0,2 s, 2,5 s au plus) ; liste des
  jurons et leur masque ; garder aussi les sous-titres complets en petit ?
- **Habillage** : bandeau jaune 84 px −2° à y = 0,2 ; zooms Doux / Fort ; zoom sur fond flou.
- **Sons** : les 2 nouveaux sons (Dun dun duuun, Extinction) et les secours bruh / wasted / rire / oh non ; le mode
  prudent des bruitages (assez ? trop peu ?) ; « gagné » seulement ; volume final coché d'office avec la musique ;
  l'aperçu sans le −14 LUFS ; import d'un pack de 600 Mo sur le Xiaomi.
- **Montage express** : les séquences choisies sont-elles les bonnes sur une vraie session de 3 h ? durées visées
  proposées ; accroche de 6 s (« ATTENDS… » pendant 6 s) ; titres des séquences (= la meilleure phrase forte) ;
  le mode avec IA avec une vraie clé ; le temps total sur le Xiaomi.

## Ma bibliothèque, Fond vert, Mèmes (6/11/2026, la nuit)
Demande de Romain : utiliser ses 4 dossiers (« sound effect » 405 sons, « son de fond » 95 musiques, « effet de fond
vert » 110 vidéos, « meme » 44 vidéos) dans Arko. Ce sont des fichiers sous droits : **jamais dans le dépôt ni sur le
site** ; Arko les importe et les garde **sur l'appareil de l'utilisateur** (rien n'est envoyé). Aucun fichier de Romain
n'a été utilisé : tous les tests fabriquent leurs images, sons et vidéos (code ou ffmpeg).

### Ce que ça fait, et où le trouver
- **Ma bibliothèque** (accueil → « Ma bibliothèque », ou depuis Sons, Musique, Fond vert, Mèmes ; Retour la ferme) :
  4 rayons **Bruitages** (= Mes sons, base `arko-mes-sons`), **Musiques** (même base, champ `rayon: 'musiques'`, 2 Go au
  plus), **Fonds verts** et **Mèmes** (vidéos ENTIÈRES : fiches dans la base IndexedDB `arko-bibliotheque`, fichiers dans
  l'OPFS `bibliotheque/`, sinon dans IndexedDB ; lus par morceaux ; plafond = place accordée par le navigateur moins
  200 Mo, sinon « Pas assez de place sur l'appareil : il faut … Mo, il reste … Mo »).
  - « Importer un dossier » (`webkitdirectory`) / « Importer des fichiers ou un .zip » : rangement d'après le nom du
    dossier le plus proche (`src/bibliotheque/rayons.ts` : sound effect, SFX, sons, bruitages… / son de fond, musique,
    music, BGM… / effet de fond vert, fond vert, green screen, chroma… / meme, memes, mèmes…) ; les autres fichiers
    → dialogue « Où ranger N fichiers ? » (4 rayons ou « Les laisser de côté »). Un son rangé dans un rayon de vidéos va
    dans Bruitages ; une vidéo rangée dans Bruitages ou Musiques ne garde que son son (comme avant).
  - Ignorés proprement : `.sfk` (fichiers de crêtes de Sound Forge), images, textes, fichiers cachés ; `.wmv`, `.avi`,
    `.flv`… : « Format non lu par le navigateur, convertis-le en .mp4 : … » ; HEVC : « convertis-la en .mp4 H.264 ».
  - À l'import d'une vidéo : durée, taille, petite image, et **couleur du fond** cherchée sur les bords d'une image
    (pastille « fond vert » / « fond bleu »).
  - Recherche (nom, dossier), renommer, changer un son de rayon (Bruitages ↔ Musiques), supprimer, place utilisée.
  - Le .zip est lu par morceaux ; une entrée « stockée » n'est jamais copiée en mémoire (morceau du .zip).
- **Musique de fond** (Habiller → Sons → Musique) : onglets **Musiques** (d'office s'il y en a) / Bruitages, bouton Ma
  bibliothèque. Montage express : les musiques du rayon d'abord. Les bruitages auto ne piochent plus dans les musiques.
- **Fond vert** (Habiller, après Zoom) : liste du rayon, « + » pose le clip à la tête de lecture, détouré d'office.
  Réglages : Plein écran (recouvre l'image) ou Taille, **position et taille au doigt** sur l'aperçu (glisser, pincer à
  deux doigts, molette sur PC), Son du clip + volume, Début / Fin du clip, Enlever le fond vert + Tolérance, Douceur des
  bords, Anti-débordement, Retirer. Plusieurs fonds verts par montage (barres vertes sur la mini-frise).
- **Mèmes** (Habiller) : « **Coupure** » = le passage du mème est INSÉRÉ à la tête de lecture (le plan est coupé en deux,
  tout près d'une coupe on se cale dessus) : plan ordinaire, plein écran en fond flou (bandes floues si le format
  diffère), son du mème, le jeu reprend après ; réglages Début / Fin, Retirer (barres orange sur la mini-frise ; il
  se supprime aussi comme un plan dans Couper). « **Incrustation** » = en petit en haut à droite (42 %), au doigt, avec
  son ; un mème dont le bord est vert est **détouré d'office** (« Bord vert trouvé… »).
- **Reprise** : la recette garde l'identifiant de bibliothèque (`source.bib`), jamais le fichier. À la réouverture, les
  clips sont rouverts depuis Ma bibliothèque ; un clip supprimé → « Le clip « X » n'est plus dans Ma bibliothèque : il
  est retiré du montage. » et retrait propre (incrustations, plans de mème, source). L'export refuse aussi proprement.

### Recette (rétrocompatible)
- `source.bib` (facultatif) ; `recette.incrustations` (facultatif) = `{ src, t (temps de SORTIE), de, a (dans le clip),
  x?, y?, taille?, plein?, cle?: { couleur, tolerance, douceur, debordement }, son?, vol?, genre? }`, 30 au plus.
  Normaliseur : `src/recette/normaliser-bibliotheque.ts` (branché dans `normaliser.ts`, jamais ajouté s'il est absent) ;
  opérations : `src/recette/operations-bibliotheque.ts` (un geste = un Annuler) ; `schema.json` complété.
- Le mème « Coupure » n'ajoute AUCUN champ : c'est un plan dont la source a `bib`. Test figé des 20 anciennes recettes : vert.

### Le détourage (une seule voie de rendu)
- `src/moteur/incrustation/chroma.ts` (référence processeur, aussi le repli sans WebGL2), `shader-chroma.ts` +
  `gpu-chroma.ts` (WebGL2, même calcul), `incruster.ts` (branché dans `rendre.ts` et `compositeur.ts` : clips décodés
  par le cache de décodage, détourés à leur taille d'affichage, posés sous les textes et sous-titres ; leur son mixé
  comme les sons importés). Aperçu = export.
- Calcul : « ressemblance au fond » = (P − max(Q1, Q2)) / max(P, 0,25) divisée par celle de la couleur du fond
  (P = vert ou bleu) : presque indépendante de la lumière (les ombres partent, les noirs restent) ; moyenne 3 × 3 ;
  alpha par douce montée (Tolérance 0,42, Douceur 0,25) ; **anti-poussière** 5 × 5 (points de bruit isolés) ;
  **anti-débordement** 0,7 + 2 × ressemblance du voisinage (les bords n'ont plus de reflet vert).

### Mesures (VM, Chrome headless)
- Images fabriquées (personnage sur vert dégradé + ombre + bruit + blocs 8 × 8 + couleurs 4:2:0) : fond restant
  **0 %**, personnage effacé **0 %**, excès de vert sur les bords ≤ **3 / 255**, écart d'alpha au bord 0,05 ; vert terne
  très bruité et fond bleu : idem. Carte graphique = processeur à **1 / 255** près (écart moyen 0,001).
- Temps par image (ici la « carte graphique » est SwiftShader, émulée par le processeur, donc lente) : 1080 × 608 →
  ~130 ms (WebGL émulé) / ~52 ms (processeur JS) ; 1920 × 1080 → ~415 ms / ~170 ms. Sur un vrai GPU, le shader (25
  lectures par pixel) devrait prendre quelques ms : **à mesurer sur le Xiaomi**.
- E2e (`tests/e2e/bibliotheque.spec.ts`, 2 tests) : dossier « Pack » fabriqué par ffmpeg (sound effect + .sfk, son de
  fond, effet de fond vert + .wmv, meme dont un sur fond vert, un clip sans dossier) → rangement + « Où ranger ? » +
  « convertis-le en .mp4 » ; fond vert + mème coupure + mème incrusté → export de 8,00 s sans erreur, **0 % de vert**
  dans les images, visage et « chat » présents, sons (3 kHz, 1 kHz, 2 kHz) à leur place et le jeu muet pendant la
  coupure ; reprise avec clips rouverts, puis clip supprimé → message et retrait. Banc carte graphique / processeur :
  `ARKO_PORT_BANC=4297 npx playwright test --config playwright.chroma.config.ts`.

### À valider par Romain (sur ses vrais dossiers, idéalement sur le Xiaomi)
- Importer ses 4 dossiers d'un coup (le dossier parent) : temps, place prise, fichiers ignorés / à convertir.
- Fonds verts YouTube réels : valeurs par défaut (Tolérance 42 %, Douceur 25 %, Anti-débordement 70 %) ; cheveux, fumée,
  objets transparents ; les clips sur fond bleu ; temps par image et fluidité de l'aperçu sur le Xiaomi.
- Mèmes : position par défaut en incrustation (haut à droite, 42 %) ; « Coupure » qui coupe le son du jeu.
- La place accordée par Chrome sur le Xiaomi pour 154 vidéos (fonds verts + mèmes).

## Décisions prises cette nuit (à valider par Romain)
- **Sous-titres sur fond flou** : placés juste sous la vidéo (y = 0,66). Un avertissement apparaît s'ils descendent dans la zone cachée par la description TikTok. À juger sur une vraie vidéo.
- **Cadre webcam par défaut** : en bas à gauche, à ajuster une fois puis mémorisé.
- **Effets sonores** (phase 3) : ils sont **fabriqués par le code d'Arko** (synthèse), sans aucun fichier copié. Ils sont donc 100 % libres de droits (CC0). On peut aussi importer son propre son, ou enregistrer au micro.
- **Couper les blancs** : fait le 6/11 (Montage auto, A) : on garde la parole (mots), pas le volume.
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
- **Ma bibliothèque** : les sons, musiques, fonds verts et mèmes téléchargés par Romain restent sur SON appareil ; ils ne vont jamais dans le dépôt, ni sur le site, ni dans les tests (les tests fabriquent les leurs).
- **Effets sonores** : uniquement ceux fabriqués par Arko (CC0), ou des sons importés par l'utilisateur, sous sa propre responsabilité. Les sons tendance de TikTok s'ajoutent dans TikTok au moment de publier.
- **La recette** `arko.recette/1` est la seule source de vérité. L'interface la modifie uniquement par les fonctions de `src/recette/operations*.ts`.
- **Versions figées**, à ne mettre à jour qu'après un test sur le Xiaomi :
  - `mediabunny` 1.65.1
  - `@huggingface/transformers` 4.3.2
  - `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0
- **Clés API** : jamais dans le code. Pour le monteur IA, chaque utilisateur met sa propre clé, gardée sur son appareil.
