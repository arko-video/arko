# Passation — Arko (éditeur vidéo TikTok et YouTube open source)

Mise à jour : 7 novembre 2026 (« Façon Wankil » : Best-of serré, Qui parle ?, avatars, chibis, Insérer ici, derush ; puis persos en papier découpé goofy et situations de jeu, voir « Persos : 6 styles non-chibi »). Toutes les phases (1 à 6), le Montage auto, « Améliorer l'image », Ma bibliothèque et la version « façon Wankil » sont construits et testés automatiquement.

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

## Façon Wankil (7/11/2026)
Demande de Romain (7/11, 1 h 37) : un monteur sans IA meilleur avec un titre qu'on peut retirer, insérer un élément
entre deux parties de la vidéo, un montage auto « façon Wankil Studio » (best-of serré, avatars des voix), des chibis
« dessin un peu raté » déclinables selon qui parle, et un meilleur derush. Conception : `conception/brief-wankil.md`,
`conception/contrat-wankil.md`. Construit par 3 devs puis assemblé par l'intégrateur. Toujours : 100 % gratuit, tout
sur l'appareil, aucune dépendance npm ajoutée, recette `arko.recette/1` (champs facultatifs : les anciens montages
s'ouvrent pareil, vérifié sur 24 recettes figées), une seule voie de rendu (aperçu = export).
**Droits** : aucun dessin, nom ni fichier de Wankil Studio (Wankuls, cartes) ni de Pepe. Les chibis sont NOS
personnages, dessinés par le code (CC0).

### Ce que fait chaque partie, et où la trouver
- **A. Monteur sans IA (clips) bien meilleur** (Monteur IA → mode sans IA) — `src/ia/recit.ts`, `src/ia/sans-ia.ts`,
  notation partagée `src/auto/derush/notation.ts`.
  - Chaque moment est noté comme une scène (rires, fous rires, cris, jurons, mots forts, échanges rapides, pic après
    calme, densité de parole, réactions), pas seulement par le pic.
  - **Mise en place** : le clip commence au début de la phrase (ou de l'échange) qui précède le moment fort, 5 à 15 s
    avant ; **chute** : fin du rire / cri / réaction + 1 s, jusqu'à la fin de la phrase, 6 s au plus. Pour tenir la
    durée maximale, on raccourcit d'abord la chute, puis la mise en place ; jamais le moment ni la réaction.
  - **Pas de doublons** : deux clips qui se recouvrent à plus de 30 % → le mieux noté reste.
  - **Titre retirable** : sur la carte de la revue, « Changer le titre » et « Retirer le titre » d'un toucher
    (`ui/auto/derush/BarreTitre.tsx`, opérations `src/recette/operations-titres.ts`) ; réglage « Mettre un titre sur
    les clips » sur l'écran Demande (mémorisé) ; dans Habiller, toucher un titre sur l'aperçu le choisit (Retirer).
  - Plus de « boum » automatique dans les clips (option `bruitage: true` dans le code seulement).
- **B. Insérer un élément entre deux parties** (Couper, et Habiller → Couper → « Insérer ici ») —
  `src/recette/operations-insertion.ts`, `src/auto/insertion/point.ts`, rendu `src/moteur/inserts/`,
  écrans `src/ui/auto/insertion/`.
  - La tête de lecture coupe le plan (aimant 0,15 s sur une coupe proche) et place entre les deux parties : une autre
    vidéo (fichier ou Ma bibliothèque, début / fin au choix), un mème, une **image fixe** (2 s, fond flou), un **carton
    texte** (fond noir, texte blanc, 2 s), ou un **chibi plein écran** (émotion, texte, 1,5 s). Durées 0,3 à 30 s.
  - La suite est **décalée** (textes, incrustations, chapitres, musique, sons et zooms posés en temps de sortie) ; ce
    qui suit les images (sous-titres, punchlines, sons « au moment de la vidéo », voix) suit tout seul. **Insérer puis
    retirer redonne exactement le montage d'avant** (testé). Toucher l'élément : durée, texte, couleurs, émotion,
    « Déplacer ici », « Retirer » ; un seul Annuler par geste. Tuile à part sur les frises (« Carton », « Image »…).
  - Une vidéo insérée depuis un fichier est gardée dans Ma bibliothèque → Mèmes (pour la rouvrir à la reprise) ; une
    image est gardée sur l'appareil (IndexedDB) et rouverte à la reprise.
- **E. Vidéo à plusieurs pistes de son** (à l'import) — `src/moteur/audio/pistes.ts`, `ui/auto/insertion/ChoixPistes.tsx`.
  « Cette vidéo a 2 pistes de son » (nom de chaque piste, Garder, volume 0 à 150 %) ; fermer sans choisir = toutes à
  100 %. L'aperçu, l'export et « Qui parle ? » lisent les pistes gardées.
- **E. Gros mots** (Habiller → Sous-titres : Laisser / Bip / Silence) — `src/moteur/audio/bips.ts`. Chaque juron des
  sous-titres : le son des plans est coupé (fondus 10 ms) et, en « Bip », un bip 1 kHz à −12 dBFS ; musique et sons
  posés intacts.
- **C. Qui parle ?** (Habiller → Avatars → « Qui parle ? », et la revue du Best-of) — `src/auto/voix/`,
  `src/recette/operations-voix.ts`, écrans `src/ui/auto/voix/`.
  - Pistes séparées (OBS : micro et Discord) : une voix par piste, exact. Sinon niveau + timbre (comme sur la session
    de Romain : sa voix à −40 dB, celle de son pote à −25 dB) ; même niveau : timbre seul ; une seule voix : « une ».
  - Écran : 3 extraits à écouter par voix, nom, chibi ; la liste des phrases avec une pastille par personne (un toucher
    = la personne suivante) ; Valider (un seul Annuler) ; « Oublier les voix ». Résultat gardé par vidéo (pas de
    réanalyse).
- **D. Chibis** (Ma bibliothèque → onglet **Chibis** → atelier ; aussi depuis « Qui parle ? » et « Insérer ici ») —
  `src/chibis/`, `src/stockage/chibis.ts`, écrans `src/ui/auto/chibis/`.
  - Dessinés par le code (Canvas 2D, même dessin dans la page et dans le Worker d'export), « dessin vite fait » : grosse
    tête, trait noir épais tremblé, aplats qui débordent un peu. **3 styles** : Feutre raté, Crayon, Paint (pixels).
  - Base déclinable : peau, 10 coiffures, couleur des cheveux, 10 tenues (sweat, t-shirt, armure, astronaute, cow-boy,
    pyjama…), accessoire (aucun + 9 : casquette, casque audio, lunettes…), couleur, yeux. « Au hasard » et
    « Ressemble à… ».
  - **48 variantes par style** : 24 émotions (parle, rit, mort de rire, crie, hurle, énervé, rage, choqué, surpris,
    frime, moqueur, panique, triste, pleure, gêné, réfléchit, confus, dort, content, amoureux, malade, déterminé,
    victoire, défaite) × bouche fermée / ouverte ; soit 3 × 48 = 144 dessins par personnage.
  - Gardés dans Ma bibliothèque (200 au plus, base `arko-chibis`), export PNG transparent ou .zip des 48 PNG d'un style.
  - Sans chibi choisi, chaque voix a un chibi **par défaut** tiré de son identifiant (toujours le même) : il est montré
    sur les cartes des voix (bouton « Choisir un chibi »), sur l'avatar et sur le chibi plein écran.
- **C. Avatars** (Habiller → **Avatars**) — `src/moteur/couches/avatars.ts`, `ui/auto/chibis/OutilAvatars.tsx`.
  Le chibi de la personne apparaît quand elle parle (pop 0,12 s, reste 0,5 s, part en 0,15 s), change selon l'émotion
  de la phrase, bouche ouverte / fermée selon le volume (façon PNGtuber), petit rebond. Défaut : **en bas à gauche,
  taille moyenne** (16:9 : 30 % de la hauteur ; vertical : 16 %, pieds au-dessus de la zone cachée) ; 2ᵉ personne en
  bas à droite. Glisser = placer, pincer / molette = taille. Dessinés juste après la vidéo (sous les textes).
- **C. Derush meilleur** — `src/auto/derush/` (notation, resserrer, choix), écran `ui/auto/derush/PassagesNonRetenus.tsx`.
  - Note par minute gardée (rires 8, fous rires 12, cris 6, pics 4, pic après calme 10, jurons 3, mots forts 3,
    échanges 2, réactions 5) ; une scène avec un **fou rire** ou ≥ 6 **échanges rapides** par minute est
    **protégée** : jamais jetée parce qu'elle est longue, elle est **resserrée** à 60–90 s (chaque moment fort avec sa
    mise en place et sa chute).
  - Écran **« Passages pas retenus »** (Couper, et Habiller → Couper, quand le montage en a) : titre, « de 1:02:10 à
    1:02:48 », raison, note sur 100, **Écouter**, **Ajouter** d'un toucher (à sa place dans l'ordre, coupé comme le
    reste avec les mots déjà transcrits, un seul Annuler).
- **C. Best-of serré** (intégrateur) — Montage express → **Style du montage : Best-of serré** —
  `src/auto/express/best-of.ts` (pur), `src/ui/auto/express/{etat-best-of,ReglagesStyle,RevueBestOf}.ts(x)`.
  1. **Réglages** : coupe **Serrée** d'office ; **Titres de séquence** (décochés d'office : facultatifs, et retirables
     ensuite comme n'importe quel texte), Reconnaître qui parle (coché), Avatars des voix (coché), Bip sur les gros mots
     (décoché). **Jamais de bruitages** dans un Best-of (retour de Romain), ni de mode IA.
  2. **Analyse** : celle du Montage express (son, transcription reprise, bords), puis « Qui parle ? » (pistes gardées
     de la vidéo si elle en a, sinon niveau + timbre, sur les zones où il y a des mots), puis le derush : scènes notées,
     les protégées longues resserrées, choix jusqu'à la durée visée, passages pas retenus.
  3. **Revue** : les séquences (+ « resserrée · n morceaux gardés »), le nombre de passages pas retenus, les **voix**
     (cartes : nom, 3 extraits, chibi par défaut ou choisi) et **« Sous-titres pour : Personne / Voix 1 / Voix 2 »**
     (choisi d'office : la voix la plus faible si elle est au moins 6 dB sous la plus forte).
  4. **« Monter la vidéo »** : un **nouveau montage « Best-of — <nom> »** (dans Mes montages, supprimable), construit
     en **une seule opération** (un seul Annuler revient à la vidéo brute), dans l'ordre du contrat §6 : les étapes du
     Montage express (plans = morceaux des scènes gardées, un chapitre par scène : Couper les blancs → bords →
     punchlines calées sur les mots → zooms → accroche de 6 s **sans texte si les titres sont décochés** → chapitres →
     titres de section **seulement si cochés** → musique qui baisse quand on parle + −14 LUFS) → passages pas retenus
     → qui parle (noms) → un chibi par personne + avatars (mode « parle », rebond) → sous-titres pour la voix faible
     → bips si cochés.
  - **Sous-titres pour une personne** (nouveau champ facultatif `sousTitres.pour`, `src/recette/sous-titres-voix.ts`) :
    en mode punchlines, toutes les phrases de cette personne sont aussi sous-titrées (style boîte, en bas : y = 0,88 en
    16:9 ; 7 mots, 0,7 à 2,8 s par ligne), jamais en même temps qu'une punchline (la punchline gagne). Opération
    `sousTitresPour(r, p | null)`. Le normaliseur l'oublie si la personne n'existe plus.
  - L'option « arrêt sur image + zoom sur un fail » (contrat §6, « si le temps le permet ») n'est pas faite.

### Mesures des devs et de l'intégrateur (VM, Chrome headless)
| Partie | Mesure | Avant | Après |
|---|---|---|---|
| A. Monteur sans IA | moments connus du signal fabriqué dans un clip entier ([moment − 5 s, fin de l'action + 1 s]) | — | 4/4, 0 doublon |
| A. Monteur sans IA | avec des mots : le clip commence au début de la phrase de mise en place | — | 11 s avant le pic |
| Derush | session fabriquée de 30 min, 10 passages drôles plantés retrouvés (gardés ou dans les passages, note ≥ 20) | 4/10 | 10/10 |
| Qui parle | 2 voix fabriquées à −40 / −25 dB : trames bien attribuées | — | 100 % |
| Qui parle | même niveau, timbres différents | — | 93,3 % |
| Qui parle | une seule voix → « une » ; pistes séparées → exact | — | oui |
| Qui parle | temps de calcul | — | ~1 s pour 10 min de son (≈ 11 s pour 2 h, + décodage) |
| Chibis | dessin d'un chibi de 300 px sans cache (feutre / crayon / paint) | — | 3,1 / 3,7 / 0,6 ms (visé : 2 ms) |
| Chibis | avec le cache d'images (aperçu et export) | — | 0,03 ms par image |
| Avatars | export 12 s en 1080p avec 2 avatars | — | 7,5 s |
| Best-of (e2e) | session de 3 min 25 à 2 voix (−40 / −25 dB) + fou rire + musique | — | analyse 2,4 s (transcription déjà gardée) ; 2 voix trouvées (−40 / −25 dB), la faible sous-titrée d'office ; la scène de 150 s resserrée, 1 passage pas retenu ; montage de 1 min 27 ; export 1920 × 1080 en 61 s ; −14,0 LUFS (Arko et ffmpeg) ; avatar de la bonne voix sur 40/40 images vérifiées ; boîte de la voix faible 8 fois sur 9 mots, 0 sur la voix forte ; aperçu / export PSNR 42 dB |

### Tests
- `tsc` : 0 erreur. Vitest : 96 fichiers, 968 verts, 0 « à faire » (avant la v3 : 81 fichiers, 760 verts ; à la livraison des devs : 95 fichiers, 955 verts + 17 `it.todo` ;
  les 17 `it.todo` de l'échafaudage sont retirés, les tests sont dans les fichiers des devs). `vite build` passe. E2e (`ARKO_PORT` libre) :
  43 verts + 8 sautés (bancs Whisper, lancés à part) ; banc sous-titres (vrai Whisper) 8 verts ; dev 1 3 verts ;
  Améliorer l'image 2 verts ; banc chroma 1 vert. Aucun test instable sur ce passage.
- Nouvel e2e `tests/e2e/best-of.spec.ts` (+ `tests/e2e/outils-best-of.ts`) : session fabriquée à 2 voix dans un seul
  mélange (−40 / −25 dB, voix synthétiques de `src/auto/voix/voix-test.ts`), un fou rire, une musique → Best-of serré →
  2 voix reconnues, chibis par défaut affichés, noms, « Sous-titres pour : Romain » choisi d'office → montage sans
  aucun texte de titre, avatars, sous-titres de la voix faible, passages pas retenus, pas de bruitage → un seul Annuler
  → « Passages pas retenus » → Ajouter (puis Annuler) → export 1920 × 1080 : −14 LUFS ± 1, l'avatar de la voix 1 en bas
  à gauche seulement quand elle parle (celui de la voix 2 à droite), la boîte des sous-titres seulement sur la voix
  faible, aperçu = export (PSNR).
- e2e du dev 1 (monteur sans IA + Qui parle ?) : `npx vite build --outDir dist-dev1 && ARKO_PORT=xxxx npx playwright
  test --config playwright.dev1.config.ts`.
- **Banc des planches de chibis** (3 styles × 48 variantes, catalogue, temps de dessin) :
  `node tests/harness-chibis/planches.mjs <dossier> [port]` (ou `ARKO_PORT_BANC=xxxx`). Les planches du 7/11 sont dans
  le dossier de travail de Claude (`scratchpad/chibis/`) : à regarder pour juger le goût.

### Intégration : ce qui a été corrigé ou branché
- `definirQuiParle` passe le niveau de chaque personne à `completerTours` : seuil de la bouche exact (niveau − 10 dB).
- Cartes des voix : le chibi par défaut est affiché (plus « Aucun ») et le bouton dit « Choisir un chibi ».
- Chibi plein écran d'une personne sans chibi : son chibi par défaut (comme son avatar), plus un carton avec son nom.
  Il est dessiné par `dessinerChibi` dans l'image du plan gardée en cache (par plan et par taille) : pas besoin de
  `dessinerChibiCentre`, la mise en page du dev 2 (62 % de la hauteur) est gardée.
- « Passages pas retenus » → Ajouter : les mots déjà transcrits de la vidéo sont donnés à `ajouterPassage` (le passage
  est coupé comme le reste et ses phrases rejoignent les sous-titres).
- `construireMontageExpress` est découpé en `etapesMontage` (réutilisé par le Best-of) ; `modeleMeilleurDAbord` accepte
  `{ texte: null }` (accroche sans texte).
- Aucun code de débogage (`__dbg`) n'est resté ; `tsc` est à 0.
- Prettier avait reformaté tout `Frise.tsx` (dev 2) : sans effet sur le code, le diff Git sera juste plus gros.

### À valider par Romain (sur sa vraie session, idéalement sur le Xiaomi)
- **Best-of serré** : les scènes gardées et resserrées sont-elles les bonnes sur 2 h ? La durée visée (15–20 min) ;
  le seuil « voix qu'on entend mal » (6 dB) et la place de ses sous-titres (boîte en bas, y = 0,88 en 16:9) ; titres
  décochés d'office ; l'accroche de 6 s sans texte.
- **Monteur sans IA** : plus de « boum » automatique ; rires acceptés jusqu'à 10 s ; transcription ~23 s par moment
  (2 passes de Whisper) ; « Retirer le titre » retire tous les titres du clip.
- **Derush** : la parole seule vaut ~26/100, donc beaucoup de passages dans la liste (seuil 20) ; « Passages pas
  retenus » accessible depuis Couper.
- **Qui parle** : sur sa session (−40 / −25 dB) et sur une session OBS à 2 pistes ; le timbre seul (même niveau) n'est
  testé que sur des voix fabriquées.
- **Chibis** : le goût de chaque style (Paint un peu gris en petit) ; taille par défaut 0,30 en 16:9, 0,16 en vertical
  (pieds à 0,64) ; lunettes relevées, casque d'astronaute, flammes de « déterminé » ; le temps de dessin sans cache
  sur le Xiaomi.
- **Insertion** : vidéo insérée gardée dans Ma bibliothèque → Mèmes (place prise) ; défauts du carton / chibi / image ;
  chibi plein écran fixe (pas animé) ; recollage des morceaux au retrait ; « Insérer » sur un élément inséré → coupe la
  plus proche ; images, export et place sur le Xiaomi.
- **Pistes et gros mots** : bip 1 kHz à −12 dBFS (la musique remonte un peu pendant le bip) ; fermer le choix des
  pistes = toutes à 100 %.

### Persos : 6 styles non-chibi (7/11/2026)
Romain trouvait le look chibi (grosse tête, petit corps) « pas beau ». 6 styles NON-chibi ont été faits, chacun avec
ses proportions : BD, Dessin animé, Bonhomme raté, Mascotte ronde, Pixel, Papier découpé. Romain a choisi
**« Papier découpé »**, à finir seul, **en buste « goofy »** et décliné en **situations de jeu**. Dans les textes de
l'appli, « chibi » devient **« perso »** (rayon « Persos », « Choisir un perso », « Perso plein écran »…) ; les noms
dans le code restent `chibi`. Tout est dessiné par le code (Canvas 2D, même dessin dans la page et dans le Worker
d'export), CC0, sans aucun dessin ni objet d'un jeu, d'une série ou d'un studio (rien de Wankil, rien de Minecraft).
- **Où** : `src/chibis/persos/` — `fiches.ts` (proportions de chaque style), `postures.ts` + `squelette.ts` (pose du
  corps par émotion, coudes et genoux par cinématique inverse), `corps-perso.ts`, `tete-perso.ts` (les coiffures,
  visages, chapeaux et tenues des chibis sont reposés sur la tête et le torse du perso par des sous-repères du
  pinceau : rien n'est dupliqué), `rendus-persos.ts` (encre BD, contour dessin animé, trait raté, mascotte, papier),
  `pixel.ts` (grille de 56 cases, sans canevas), `papier.ts` (goofy, bord déchiré), `situations.ts` +
  `objets-armes.ts` + `objets-vie.ts`, `prets.ts` (6 persos tout prêts), `dessin-perso.ts` (assemblage, effets lag
  et chute). Le pinceau délègue maintenant remplissage et trait à un « rendu » par style (`rendus.ts`,
  `rendu-classique.ts` = le code d'origine du feutre, du crayon et de Paint, déplacé sans rien changer).
- **Papier découpé** (le style par défaut d'un nouveau perso et des persos tout prêts) : buste coupé sous la ceinture
  par un bord de papier **déchiré** (une bande de fibre blanche dessous) ; tête ≈ 1/3 du buste ; pièces de papier
  aux bords un peu irréguliers, **un peu mal collées** (± 2,5°, ½ trait), petite ombre portée sous chaque pièce,
  bras articulés par pièces (attaches dorées) ; **goofy** : yeux de tailles différentes (le petit un peu de
  travers), bouche × 1,5 (× 1,75 pour les cris), tête penchée d'office (3 à 6°, côté tiré de la graine) qui **se
  balance** en rythme (6 images/s, ± 3,5°), yeux en spirale pour « mort de rire » et « confus », langue qui pend pour
  « moqueur » (le troll), larmes en jets pour « pleure ». Les traits du visage ont un liseré clair et les pièces
  sombres un bord clair : lisibles sur une peau foncée (vérifié à la taille d'un avatar 1080p).
- **6 persos tout prêts** (`PERSOS_PRETS`) : 1 casque audio + sweat rouge, 2 casquette à l'envers + t-shirt,
  3 lunettes + chemise, 4 cheveux longs + bonnet, 5 chauve + barbe + costume, 6 capuche relevée. Voix 1 → perso 1,
  Voix 2 → perso 2… (id « p7 » → perso 1 ; un id sans numéro → tiré de l'id). Ajouts au catalogue (en fin de liste) :
  tenue `chemise`, accessoires `barbe`, `casquetteEnvers`, `capuche`.
- **23 situations de jeu** (`SITUATIONS`, + « aucune ») : épée, arc, bouclier, pioche (+ pierre précieuse), marteau,
  bombe à mèche, en feu, pêche, mange (cuisse de poulet), potion, mort (petit fantôme), trophée, coffre, pierre
  précieuse, rage manette, lag (perso coupé en 4 bandes décalées), peur d'un monstre d'ombre, AFK, micro, se soigne,
  tombe dans le vide, court, frime (lunettes de soleil). Une situation = pose des bras + objet ou décor + émotion par
  défaut ; elle se combine avec les 24 émotions × bouche ouverte / fermée. Règle : l'émotion « parle » (le défaut
  d'un tour) laisse la situation choisir la sienne ; toute autre émotion est gardée.
- **Choix automatique** (Best-of, Qui parle ?) : `completerTours` écrit `sit` d'après les mots dits pendant le tour
  et à ± 1,5 s. **La table des mots clés est dans `src/chibis/situations-mots.ts`, et seulement là** (une ligne par
  situation, la première qui correspond gagne ; « mort de rire », « mdr »… ne comptent pas). Sans mot clé : aucune
  situation. **À la main** : « Qui parle ? » → sous chaque phrase, un menu « Situation » (opération
  `situationDuPassage`, un seul Annuler).
- **Recette** : champs FACULTATIFS `tour.sit` et `ins.sit` (perso plein écran) ; normaliseur (`normaliserSituation`) :
  inconnue ou « aucune » → retirée avec un message ; `schema.json` (`$defs.situation`, nouveaux styles, tenue,
  accessoires). Les anciens montages s'ouvrent pareil (24 recettes figées vertes). Un style inconnu → feutre.
- **Avatars** : un buste se pose sur le bas de l'image en 16:9 (`PLACES_BUSTES`, y = 1) ; à la même taille de calque
  (0,30), le perso est plus gros que le chibi entier. 9:16 : inchangé (0,64, au-dessus de la zone cachée). Le
  balancement de la tête suit le temps (cache : 6 images par seconde).
- **Perso plein écran** (Insérer ici) : perso + **situation** + émotion ; un buste est posé sur le bas de l'image
  (66 % de la hauteur). **Atelier** : styles proposés = Papier découpé, puis les 3 chibis d'origine ; rangées
  « Persos tout prêts » et « Situations » ; l'export PNG transparent prend la situation montrée.
- **Les 5 autres styles** (BD, Dessin animé, Bonhomme raté, Mascotte ronde, Pixel) restent dans le code, dessinés et
  testés (coût nul), mais ne sont plus proposés dans l'atelier. Les 3 chibis d'origine sont **identiques au trait
  près** (`src/chibis/anciens-styles.test.ts` compare les empreintes de 4 persos × 48 variantes).
- **Mesures** (Chrome, VM) : papier 1,5 ms par perso de 300 px sans cache (feutre : 3,5 ms) ; avec le cache
  0,02 ms par image (2 avatars de 324 px).
- **Tests (7/11, persos)** : `tsc` 0 erreur ; Vitest 99 fichiers, 1011 verts (nouveaux : `src/chibis/persos/persos.test.ts`,
  `src/chibis/persos/situations.test.ts`, `src/chibis/anciens-styles.test.ts`) ; `vite build` passe ; e2e chibis (1),
  insertion (4), best-of (1) : 6 verts en 2,9 min, aucun instable. L'e2e des persos crée « Moi » en papier découpé.
- **Banc** : `node tests/harness-chibis/planches.mjs <dossier> [port]` ; `PLANCHES=persos6,situations,emotions,avatar`
  pour les planches du papier (`tests/harness-chibis/banc-papier.ts`). Planches du 7/11 :
  `scratchpad/persos-v2/` (dossier de travail de Claude).
- **À valider par Romain** : le goût du papier goofy (taille des yeux, bouche × 1,5, penche, balancement ± 3,5°) ;
  la coupe du buste (sous la ceinture, bord déchiré) et sa place en bas de l'image ; les 6 persos tout prêts (le
  perso 6 n'a pas d'écharpe : un seul accessoire par perso) ; les 23 objets et leurs émotions par défaut ; la table
  des mots clés (ex. « tue » → épée, « vide » → chute, « gg » → trophée) ; la règle « parle » = émotion de la
  situation ; le monteur choisit la situation d'après ± 1,5 s de mots ; le menu « Situation » sous chaque phrase de
  « Qui parle ? » ; garder cachés (et non supprimés) les 5 autres styles.

### Persos partout + yeux (7/11/2026)
Deux demandes de Romain : « un œil plus petit que l'autre oui, mais là c'est trop », et « apprendre aux modèles de
montage sans IA à placer correctement, selon qui parle, un perso qui correspond ».
- **Yeux du papier goofy** (`src/chibis/persos/papier.ts`, `GOOFY`, papier SEULEMENT) : avant gros 1,26 / petit 0,82
  (le gros 54 % plus grand), petit œil tourné de 11° et décalé de 1,6 ; maintenant **1,07 / 0,94 (14 %)**, **4°**,
  **0,5**. Test : `persos.test.ts` (rapport 1,10 à 1,15). Les 3 chibis d'origine sont identiques au trait près
  (`anciens-styles.test.ts`) ; les 5 autres styles n'utilisent pas `GOOFY`.
- **Une seule étape « qui parle + persos », partagée** (plus de copier-coller) :
  - `src/auto/voix/voix-montage.ts` (navigateur) : `ecouterVoix` — pistes séparées si la vidéo en a, sinon niveau +
    timbre, sur les zones où il y a des mots ; une écoute ratée → le montage se fait sans persos, avec un message.
  - `src/auto/voix/persos-montage.ts` (pur) : `poserPersos` — une personne par voix qui parle dans le montage (ou dans
    le passage d'un clip, ± 5 s), son perso (celui choisi, sinon perso tout prêt 1, 2, 3… dans l'ordre des voix),
    émotion et situation d'après les mots (`completerTours`), avatars « parle » + rebond. Moins de 1,5 s de parole
    → aucun perso ; une seule voix → un seul perso.
- **Modes sans IA qui ont maintenant les persos** (réglage **« Persos de qui parle »** coché d'office, décochable) :
  1. Montage express, style « Montage express » (`etapePersos` dans `express.ts`, écoute dans
     `ui/auto/express/voix-express.ts`, réglage `ReglagesExpress.persos`) ; l'IA facultative ne choisit que les scènes.
  2. Montage express, style « Best-of serré » (refait sur l'étape partagée ; l'interrupteur s'appelle maintenant
     « Persos de qui parle »).
  3. Monteur IA en mode **Sans IA** (clips TikTok, Shorts, YouTube) et « Continuer sans IA » après une erreur de l'IA :
     `ui/monteur/persos-monteur.ts` (une écoute pour tous les clips, réglage mémorisé `arko.monteur.persos`). Les mots
     déjà transcrits sur l'appareil (Montage express, Couper les blancs) sont repris : sous-titres et qui parle sans
     2ᵉ passage de Whisper.
  4. « Faire une compilation 16:9 » des clips gardés (`recette/compilation.ts` réunit voix, tours et avatars).
  5. Hérités tout seuls (tours en temps source) : « Passages pas retenus → Ajouter », modèles Top 3 et « Le meilleur
     d'abord ». Les modes AVEC IA ne sont pas touchés.
- **Revue** : lien **« Qui parle ? »** (nommer les voix, changer leur perso) — Montage express (les deux styles : il
  descend jusqu'aux cartes des voix) et carte de chaque clip du monteur (un nom ou un perso changé vaut pour tous les
  clips pas encore triés). Après le montage : Habiller → Avatars → « Qui parle ? » comme avant.
- **Placement** (`src/moteur/couches/places-persos.ts`, pur, calculé AU RENDU : aperçu = export, et l'outil Avatars
  montre les mêmes places) :
  - **16:9** : en bas, collés au bord (buste à y = 1). Voix 1 à gauche (x = 0,12), voix 2 à droite (0,88), voix 3 à
    côté de la 1, voix 4 à côté de la 2… sans chevauchement (plus petits s'il le faut) ; taille 0,30.
  - **9:16** : taille 0,12 ; pieds **au-dessus des sous-titres / punchlines** (centre des sous-titres − 0,045 − 0,012,
    soit 0,603 pour le fond flou), jamais dans les **20 % du bas** ; tous entre le bord gauche (4 %) et la **bande de
    droite de TikTok (15 %)** : voix 1 à gauche, voix 2 plus à droite (x ≈ 0,11 et 0,77), les autres entre les deux.
  - **1:1** : comme le 16:9, taille 0,22 (Arko n'a pas encore de destination carrée : la règle est prête).
  - Une voix garde sa place et son perso dans tout le montage (son rang dans `recette.personnes`) ; une place
    choisie à la main est gardée.
  - **Punchline qui toucherait un perso** : il rétrécit (jusqu'à 78 %) et se décale (vers le bord en 16:9 / 1:1, vers
    le haut en 9:16, jamais dans la bande de droite), avec un fondu de 0,15 s (`eviterTextes`, boîte de la ligne
    mesurée comme son dessin : `boites-textes.ts`).
  - **Aucun perso pendant un plan inséré plein écran** (carton, image, perso plein écran, mème, vidéo insérée).
- **Retours des 6 agents persos** (`conception/demandes-persos.md`, papier seulement) traités : trophée 4 unités plus
  haut ; couronne de flammes « En feu » 4 unités plus haut ; cuisse de « mange » à hauteur de la bouche ; signes
  « ? », « … », « zzz », « ! » et nuage gris 4 unités plus haut (9 avec la casquette à l'envers : le nuage ne se pose
  plus sur la visière) ; micro tenu sur le côté du visage (pose `microCote`, plus sur le micro du casque) ; mains sur
  les côtés du coffre (pose `coffre`) — via `SITUATIONS_PAPIER` / `situationDe` (les autres styles gardent
  `DEF_SITUATIONS`) ; teintes rage / malade / choqué dessinées APRÈS la barbe du perso 5 ; trou de la barbe plus grand
  pour une grande bouche ouverte. **Pas faits** : cheveux qui réagissent à l'émotion (facultatif) ; « capuche +
  écharpe » (à Romain de décider).
- **Travail des 6 agents persos** (un par perso tout prêt, chacun sur ses éléments, en papier seulement ; les
  anciens styles gardent leurs dessins) : perso 1 `persos/perso-1-papier.ts` (hérissés à 7 pointes + épi et reflet,
  casque audio, détails du sweat ; plus de capuche baissée derrière le cou quand l'accessoire est `capuche`) ;
  perso 2 `persos/casquette-envers.ts` (visière vive derrière la tête, ouverture et sangle devant ; elle saute
  — surpris, choqué, hurle, victoire — ou part de travers) ; perso 4 `persos/longs.ts` (cheveux longs derrière les
  épaules en pointes, 2 mèches devant) et `persos/bonnet.ts` (bonnet mou, pointe et pompon sur le côté, rayure,
  revers ; pointe dressée de surprise, bonnet de nuit pour « dort ») ; perso 5 `persos/perso-5-papier.ts` (crâne rasé
  qui brille, barbe à touffes avec trou autour de la bouche, moustache en guidon, costume à revers, cravate de
  travers) ; perso 6 : la capuche relevée dans `chapeaux.ts` (rabattue pour « dort » / « malade », cordons qui
  s'affolent, elle se soulève de surprise) ; perso 3 : chemise, lunettes et mèche affinées dans les fichiers partagés.
- **Tests** : `tsc` 0 erreur ; Vitest **101 fichiers, 1027 verts** (nouveaux : `src/moteur/couches/places-persos.test.ts`
  — 16:9, 9:16, 1:1, 1 à 4 voix, punchline, plan inséré, même place ; `src/auto/voix/persos-montage.test.ts` — persos
  dans le Montage express, le Best-of, les clips sans IA et leur compilation, une voix, pas de parole ; test des yeux
  dans `persos.test.ts`) ; les 24 recettes figées restent vertes ; `vite build` passe. E2e (`ARKO_PORT` libre) :
  best-of, chibis, insertion (4), montage express, monteur (6) et le **nouvel e2e `tests/e2e/clips-persos.spec.ts`**
  (clip 9:16 sans IA sur une session fabriquée à 2 voix −40 / −25 dB, mots repris de la transcription gardée) :
  **14 verts en 4,5 min**. Clip : 20 images sur 22 avec le bon perso à la bonne place (les 2 autres : changement de
  voix), sous-titres vus 19 fois, toujours sous les pieds des persos, 0 perso hors de sa place, export 1080 × 1920
  sans erreur. Best-of : export 54 s, −14,0 LUFS, avatar de la bonne voix sur toutes les images vérifiées, aperçu /
  export PSNR 42,1 dB.
- **Planches et captures** : `scratchpad/persos-v3/` (dossier de travail de Claude) : `persos-6.png`, `emotions.png`,
  `emotions-6-persos.png` (24 émotions × 6 persos), `situations.png`, `situations-6-persos.png` (6 persos × 8
  situations clés), `taille-avatar.png` (324 px), `placement-16-9.png` et `placement-9-16.png` (vrais montages à 2
  voix). Banc : `PLANCHES=persos6,situations,emotions,avatar,situations6,emotions6 node tests/harness-chibis/planches.mjs <dossier> [port]`.
- **À valider par Romain** : l'écart des yeux (14 %, 4°) ; en 9:16 la taille 0,12 et les pieds au-dessus des
  sous-titres (le perso couvre le bas de la vidéo de jeu en fond flou) ; la bande de droite 15 % et le bas 20 %
  (le gabarit TikTok d'Arko compte 34 % en bas pour la description : à trancher) ; les voix 3 et 4 en bas à côté des
  voix 1 et 2 ; le rétrécissement / décalage pendant une punchline ; « Persos de qui parle » coché d'office partout ;
  aucun perso sous 1,5 s de parole ; les anciens montages verticaux voient leurs avatars (sans place choisie) passer
  à la nouvelle place ; les retouches des situations (trophée, flammes, cuisse, micro, coffre) et les 6 persos.

## Best-of v4 (7/11/2026, le soir)
Demande de Romain (7/11, 12 h 04) : sur sa vraie session (Minecraft, 2 voix dans un seul mélange), le « Best-of serré »
sans IA n'avait trouvé qu'une voix, pas de musique, des blancs et de mauvais cuts. Une équipe (diagnostic, références,
bancs, 11 devs, intégrateur) l'a refait : `/home/claude/equipe/` (BRIEF, CONTRAT, rapports) côté VM. Toujours : gratuit,
sur l'appareil, aucune dépendance npm ajoutée, recette `arko.recette/1` (un seul champ nouveau, facultatif :
`musique.baisseSur: 'parole'`), une seule voie de rendu.

### La chaîne (une fonction pure par étape, la même pour l'appli et le banc)
`src/auto/express/chaine-best-of.ts` : réglages (`reglagesBestOfV4` : coupe **Normal** = la DA 0,25 / 0,35 / 0,5,
musique automatique, Transcrire coché) → mesures sur l'appareil (`mesures-best-of.ts` : signaux, UNE passe du son =
empreintes + détecteur de voix + hauteur, Whisper seulement sur la parole, empreinte CAM++ si elle est là) →
`analyserChaine` : parole (`auto/vad/`, Silero VAD v5) → mots nettoyés (`auto/mots/`) → qui parle (`auto/voix/qui-parle-v4.ts`,
niveau par morceau, p1 = la voix la plus forte, à gauche) → moments (`auto/moments/`, règles relatives à chaque voix,
hauteur) → coupes (`auto/coupes/coupes-v4.ts`, jamais dans la parole) → séquences (`auto/derush/sequences.ts`,
histoires réparties sur toute la session) → revue (durée annoncée = durée montée, accroche comprise) →
`monterSansMusique` : habillage (`auto/habillage/*-v4.ts` : punchlines, zooms, accroche de ~6 s prise dans les
séquences) → persos phrase par phrase (`auto/voix/persos-v4.ts`, `chibis/emotions-v4.ts`) → musique automatique
(`auto/son/musique-auto.ts` : Ma bibliothèque → Kevin MacLeod → musique fabriquée) → `poserMusique` (baisse sur la
parole, même la voix faible ; rien pendant l'accroche ; −14 LUFS). Un seul `modifier()` : un seul Annuler.
Interface : `src/ui/auto/express/etat-v4.ts` (parcours testable sans navigateur), `best-of-v4.ts` (branchements),
`CarteModules.tsx` (accord pour Whisper seulement). Une étape qui lève est remplacée par celle d'avant (journal).

### Modèles
- **Silero VAD v5** (2,2 Mo, MIT) : **rangé dans l'appli** (`public/modeles/`, décision de l'orchestrateur), jamais
  proposé au téléchargement, lu et vérifié au 1er Best-of puis gardé (Cache Storage `arko-modeles`). Hors ligne avant
  tout Best-of : repli « sans modèle » (énergie + rythme des syllabes) et bandeau « moins précis ».
- **CAM++** (empreinte de voix, 28 Mo, Apache 2.0) : jamais d'office ; proposé sur la revue seulement quand Arko
  n'entend qu'une voix ou hésite ; s'il est déjà sur l'appareil, il sert tout seul aux morceaux ambigus.
- Ni les modèles ni les musiques ne sont pré-cachés par le service worker (`vite.config.ts`, testé).

### Tout reste modifiable
Revue : cocher / décocher, ↑ ↓, Écouter, « ± 1 phrase » (`ajusterSequence`), durée visée sans réanalyse, une ou deux
personnes (sans réécouter), noms, persos, Sous-titres pour, empreinte. Habiller : Couper → **Rythme des coupes**
Serré / Normal / Large (recoupe sans réécouter, mesures gardées dans IndexedDB `arko.mesures.<emp>`), **Séquences**
(↑ ↓, Retirer → « Passages pas retenus », « + contexte » / « − un bout » : `recette/operations-sequences.ts`),
Passages pas retenus → Ajouter (coupé comme le Best-of) ; Avatars → Qui parle ? → menu **Émotion** ; Sons → Musique
(Remplacer, Musiques d'Arko, « Baisser même quand la voix est faible »). « Rythme des coupes » ne s'affiche que sur un
montage fait par un Best-of ; « Séquences », que sur un montage à chapitres (YouTube 16:9) : un montage fait à la main
ne les voit pas.

### Ce qui change aussi hors du Best-of (voulu)
- **Montage express (style « express »)** : la musique est mise d'office lui aussi (Ma bibliothèque → Kevin MacLeod →
  musique fabriquée ; demande de Romain « musique mise d'office », décision de l'orchestrateur du 7/11). Avant : pas de
  musique sans en cocher une. Cocher un morceau à la main coupe la musique automatique.
- **Sous-titres de la voix faible** (« Sous-titres pour ») : chaque ligne reste 0,4 s après son dernier mot ; cela se
  voit aussi sur les Best-of d'avant la v4 rouverts (aperçu et export).
- **Transcriptions gardées** : le Best-of ne fait écouter que la parole à Whisper ; ce qu'il n'a pas écouté est noté
  à part (`ecoutees`) et Couper les blancs, le Montage express et les sous-titres le retranscrivent. Une tranche qui
  plante fait de nouveau échouer ces outils (avec un message ; ce qui est fini est gardé) ; dans le Best-of elle reste
  « à refaire » et la revue le dit.

### Mesures (banc réel, la vraie session de Romain, Best-of sans IA ; `tests/banc-reel/`, données privées hors dépôt)
| | Avant (7/11 matin) mots / voix | Après (v4) mots / voix |
|---|---|---|
| Cibles atteintes | 4 / 19 · 6 / 19 (refait par le vérificateur : 3 / 19 · 6 / 19) | **15 / 19 · 13 / 19** (version livrée) |
| Voix trouvées, phrases bien attribuées | 1 · 34,7 % / 2 (jeu + voix) · 44,4 % | **2 · 92,4 %** (Romain 2ᵉ voix, Guts 1ʳᵉ) |
| Persos bon / mauvais | 57,7 / 35,6 % · 70,0 / 27,4 % | **91,9 / 9,2 % · 93,8 / 8,6 %** |
| Blancs (temps mort, > 2 s) | 0,1 s/min · 13,5 s/min et 19 | **2,7 · 3,4 s/min, 0** |
| Coupes en pleine parole (Silero) | 16,6 % · 1,0 % | **0,3 % · 0,2 %** (la main : 4,6 %) |
| Musique | aucune | **100 % hors accroche, parole de Romain et de Guts baissée ≥ 6 dB : 100 %** |
| Durée | 14 min 33 · 15 min 22 | 16 min 55 · 16 min 44 |
| Séquences de la vérité · punchlines gardées | 5/19 · 13/53 / 6/19 · 9/53 | 8/19 · 20/53 / 5/19 · 17/53 (cible 16/19, 37/53 : **non atteinte**) |
Sans Whisper : 13/19 ; sans le détecteur de voix (repli) : 12/19 (mots), 10/19 (voix). Ce qui manque (séquences,
punchlines, sous-titres de Romain) vient du SENS des histoires et des mots que Whisper base rate sur la voix faible :
aucun indice du son ne les retrouve (rapports dev-scenes, dev-habillage, dev-persos).
**Après la vérification (7/11, tard)** — corrigé : plus aucune séquence après la fin AFK (avant : 2 gardées + 1 proposée à 2 h 46, dans les 2 modes ; `avecFinAfk` de `signaux-source.ts` : < 5 min de son après une pause plus longue = fin muette ; `vad/audible.ts` : parole d'une séquence et mots à moins de 15 dB sous celle de la session ; ≥ 3 mots pas « douteux » par séquence) ; titres et punchlines ne prennent plus de mot douteux (boucles, piles). Banc : 15/19 (mots) inchangé, 13/19 (voix) au lieu de 14 : « mauvais perso » 8,6 → 11,4 % car les 35 s libérées vont à un passage d'échanges rapides (le retard connu de ~0,5 s aux changements de tour).
**Musique (problème 2 de la vérification)** : la baisse sur la parole passe de ≈ 8 dB à ≈ 5 dB (`NIVEAU_PAROLE` 0,09 → 0,06 dans `auto/son/baisse.ts`) : avec 8 dB, la musique restait à ≈ −25 dB tout le montage. À juger à l'écoute par Romain (les pauses courtes restent bouchées : `MARGE_PAROLE_V4.fusion` 0,6 s).
**Sous-titres précis** (facultatif, Whisper small 226 Mo, accord demandé) : réécoute seulement la voix faible dans les passages gardés ; mots justes de Romain 28 % → 76 %, ses sous-titres recouverts 32 → 61 / 227 (banc) ; jamais essayé dans un vrai navigateur.
**Pas corrigé** (manque de temps) : les sous-titres ne filtrent que les mots inaudibles (pas les répétitions « douteuses ») ; « sur 20 » au lieu de 19 dans le banc ; la course de l'e2e CAM++ ; le pré-cache (+1,5 Mo, pas +0,65) ; l'essai Chrome des « Sous-titres précis ». Dossier de l'équipe sur le PC de Romain : `C:\video arko\travail-claude\equipe\`.

### À valider par Romain (contrat §8)
Le détecteur de voix rangé dans l'appli (+2,2 Mo) ; l'empreinte proposée seulement si besoin ; coupe Normal d'office
(nom « Best-of serré » gardé ?) ; la voix forte à gauche ; ≈ 1 histoire par minute ; sons forts gardés seulement
s'ils sont suivis d'une réaction ; la musique baisse de ≈ 8 dB dès qu'on parle (et ne remonte presque pas entre deux
phrases) ; ta voix remontée avant Whisper (non mis d'office : à essayer) ; durée de l'analyse sur le Xiaomi (estimée
30 à 60 min pour 2 h, non mesurée) ; accroche sans texte ni musique ; rires trouvés par des règles (à juger à
l'écoute) ; Silero v5 plutôt que v6.2. Correctif de bug d'avant : la fenêtre de Whisper qui faisait échouer
l'analyse à 58 % (vers 1 h 57 de la session) passe maintenant ; une fenêtre qui plante encore est sautée et notée.

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

## Session du 9/11/2026 (petit budget, 8 % de la semaine)
Fait (fichiers modifiés directement dans `C:\dev\arko`, à tester puis `git add -A`, `git commit`, `git push`) :
- **Son aigu + notification à la fin** : `src/ui/fin-travail.ts` (2 bips fabriqués par le code ; notification
  système si la page est cachée et permise). Branché : fin d'export (`exportation.ts`, qui demande aussi la
  permission), fin du Montage express (`auto/express/etat-express.ts`), fin du Best-of v4 (`auto/express/etat-v4.ts`,
  garde `typeof window` pour les tests Node), fin de l'analyse du monteur (`monteur/analyse-monteur.ts`).
- **Mini-aperçu vidéo** à côté de « Écouter » : bouton « Voir » → petite vidéo du passage (`auto/voix/MiniApercu.tsx`),
  dans la revue Best-of (séquences, `EcranRevueExpress.tsx`) et dans Passages pas retenus. Un seul ouvert à la fois.
- **Revues du jour** : `docs/revues/README.md` (modèle). Typecheck OK ; tests unitaires et e2e PAS relancés.

- **Deux persos en Montage express (TikTok)** : bouton « On est deux à parler » sur la revue quand une seule voix
  est trouvée (`RevueBestOf.tsx` → `DeuxPersonnes`, `voix-express.ts` → `forcerDeuxVoix`). Réécoute en forçant 2
  voix (`qui-parle.ts` : réglage `forcerDeux`, niveau à 3 dB ou timbre même peu net ; passé par
  `mesures-voix.ts` / `voix-montage.ts` option `deux`). Ensuite 2 cartes → un perso par personne.
- **Titres des séquences (Montage YT)** : `titreDe` (`auto/express/scenes.ts`) ne prend plus la punchline la plus
  longue mais celle qui résume la scène (mots pleins, mot qui revient = sujet, rire/cri juste après).
- **Bruitages ≠ musique de fond** : `sonsPossibles` (`auto/son/choix-son.ts`) écarte le rayon Musiques, les sons de
  plus de 6 s au nom de musique (music, bgm, loop, beat, theme…) et toute ambiance calme (chill, lofi, ambient,
  piano, jazz…). Test ajouté dans `choix-son.test.ts`. Typecheck OK, tests non lancés.
- **Plus d'effets en TikTok** : transitions automatiques à chaque changement de scène, jamais dans les jump cuts
  (`auto/habillage/transitions-auto.ts`, branché dans `etapesMontage`, vertical seulement ; option `transitions`).
  Cri/rire/pic au début de la scène → secousse, sinon glissé → zoom → flash en boucle. Son assorti seulement si les
  bruitages sont demandés. Tests : `transitions-auto.test.ts`.
- Tests lancés (vitest, copie hors du dépôt) : auto/express, auto/voix, auto/habillage, auto/son/choix-son,
  auto/derush, ui, recette → tout passe (seul échec : un test qui lit `vite.config.ts`, absent de la copie).
- **Persos qui clignotent / précision de qui parle** (`auto/voix/persos-montage.ts`) : `corrigerIlots` rend à
  l'autre voix un tour de moins de 0,6 s collé (< 0,4 s) entre deux tours de cette autre voix (erreur d'écoute) ;
  tenue des avatars 1 s au lieu de 0,5 s dans les montages sans IA (le perso ne disparaît plus entre deux phrases).
  Le Best-of v4 garde sa tenue de la DA (0,35 s) mais profite de `corrigerIlots`. Pas avec des pistes séparées.
  Tests : `persos-montage.test.ts`, `best-of.test.ts` mis à jour.
- **Miniature et titres (retours de spectateurs)** : écran Miniature (`ui/ecrans/Miniature.tsx`) →
  GROS persos de la vidéo (`dessinerPersosMiniature`, `moteur/miniature.ts` : 2 premières personnes, 78 % de la
  hauteur, un de chaque côté, émotion au choix ou aucun), idées de gros texte et 5 titres proposés à copier
  (`auto/habillage/titres-video.ts` : jeu, mode « ONE BLOCK »…, « 100 jours », sujet qui revient ;
  ex. « 100 Jours sur Minecraft ONE BLOCK ! »). Tests : `titres-video.test.ts`.
- Idées pas faites (retours) : intro « concept » (carton ou voix off enregistrée par Romain après l'accroche),
  parler plus au public (conseil de tournage, pas du montage), son : on vise déjà −14 LUFS (norme YouTube, qui
  baisse tout ce qui est plus fort) ; si la voix de Romain est trop faible, monter sa voix plutôt que le total.
- **Mèmes et fonds verts automatiques** (Montage express / TikTok) : `auto/insertion/memes-auto.ts` (pur) choisit
  les clips de Ma bibliothèque (Mèmes + Fonds verts) par leur nom / dossier aux moments des déclencheurs des
  bruitages (mode réaction : après la phrase), jamais dans l'accroche, 1 toutes les 25 s au plus, pas à côté d'un
  bruitage ni sur une incrustation, pas deux fois le même de suite, 4 s au plus. Fond vert → détouré plein écran ;
  mème → en haut (hors des persos). Posés par `poserMemesAuto` (`ui/clips-montage.ts`) juste après « Monter la
  vidéo » (`etat-express.ts`), en une opération avec un toast « Annuler ». Pas dans le Best-of (DA YouTube).
  Tests : `memes-auto.test.ts`. À faire : la revue des bruitages pourrait écarter les moments où un mème est posé.
- **Sound effects plus dynamiques** (retour : « comparé à une vidéo lambda, ça enlève du dynamisme ») :
  - `auto/son/accents.ts` (pur) : WHOOSH juste avant chaque transition, POP à chaque punchline, IMPACT sur les
    gros zooms (×1,25 et plus) ; −8 dB, 1,2 s au plus, 2,5 s d'écart, 10/min au plus, rien pendant l'accroche ni
    à moins d'1 s d'un son ou d'un mème. Sons pris dans Mes sons par leur nom (whoosh, swoosh, pop, vine boom…,
    les 3 meilleurs en alternance), sinon ceux d'Arko. Posés par `poserAccentsAuto` (`ui/auto/son/etat-son.ts`)
    juste après « Monter la vidéo » si les bruitages sont demandés (TikTok). Tests : `accents.test.ts`.
  - Bruitages « mèmes » : 2 par minute au lieu de 1 toutes les 2 min (sûreté 3, après la phrase), cochés d'office
    quand le son vient de Mes sons, jamais à moins de 1,5 s d'un mème ou d'un son déjà posé ; mots clés des
    catégories élargis (français, noms de mèmes : metal pipe, bonk, anime wow, game over…).
  - Transitions auto : toujours sans leur son d'Arko (le whoosh vient des accents, de la bibliothèque).
- **Best-of YouTube (v4) profite aussi des sons** (`ui/auto/express/best-of-v4.ts` → `apresMontage`) : mèmes /
  fonds verts auto, accents (pop sur les punchlines, impact sur les gros zooms ; pas de transitions en YouTube), puis
  revue des bruitages — TOUT avec les sons de Mes sons SEULEMENT (option `bibliothequeSeule` : les sons fabriqués
  par Arko restent hors de la DA YouTube, Romain les trouvait « atroces »). Revue vide → pas de panneau. Un seul
  toast à la fin (montage prêt + nombre de mèmes / effets, crédit Kevin MacLeod gardé). Persos : `corrigerIlots`
  s'applique aussi au v4 (moins de clignotement), tenue de la DA gardée.
- **Calé sur la VRAIE bibliothèque de Romain** (4 dossiers sur son PC : `meme` 49 vidéos, `effet de fond vert` 110,
  `son de fond` 95 musiques, `sound effect` 405 sons ; leurs noms → bons rayons à l'import). Simulation hors dépôt
  (noms + durées seulement, aucun fichier copié) : chaque catégorie a ses sons ET un clip ; sons courts jamais
  choisis 268 → 179 sur 353. Mots clés élargis (bruitages, accents, `MOTS_CLIPS` pour les vidéos), clips de décor
  jamais posés comme réaction (boutons s'abonner, logos, fonds, VHS…). Filtre des noms offensants RETIRÉ à la
  demande de Romain (il fait le tri lui-même dans sa bibliothèque). Montage TikTok aussi en
  `bibliothequeSeule` : UNIQUEMENT les sons de Ma bibliothèque en auto (les sons d'Arko restent à la main).
- **Quand utiliser les sons** :
  - `auto/son/echos.ts` : la RÉPLIQUE dont le nom reprend ce qu'on vient de dire (« le FBI arrive » → FBI Open Up,
    « John Cena », « nani », « oof »…), juste après la phrase, 2/min ; mots courants, mots qui décrivent le son
    (cartoon, scream…), faux amis français (super, moments…) et noms de jeux ne déclenchent pas seuls. 335 des 353
    sons courts de Romain ont des déclencheurs. Dans la revue des bruitages, prioritaires et cochés.
  - Déclencheurs français élargis (`declencheurs.ts`) : « let's go », « c'est ouf », « au secours », « il m'a tué »,
    « derrière toi », « TNT », « creeper »… (une liste modifiée par l'utilisateur reste la sienne).
- **Décor** (YouTube 16:9) : `proposerDecor` (`memes-auto.ts`) pose le bouton « s'abonner / like » de la bibliothèque
  une fois tôt (≥ 30 s, 25 s après l'accroche) et 15 s avant la fin (vidéo > 3 min), sans chevaucher un mème.
- **Tout est retirable un par un** : mèmes / décor = calques « clip » de la frise (toucher → Retirer), sons (accents,
  échos, bruitages) = calques « son » (toucher → Supprimer, ou « Retirer tous les bruitages »), transitions =
  chaque coupe ; et Annuler retire chaque vague d'un coup.
- Tests : 1343 tests unitaires passent (copie complète hors dépôt, avec `public/`, `vite.config.ts`, `CREDITS.md`
  et la vidéo de test) ; e2e non lancés.
- **ARKO APPREND DES RETOUCHES** (objectif de Romain : l'améliorer chaque jour, viser la perfection) :
  - `auto/apprentissage/gouts.ts` (pur, testé) : `empreinteDe` (ce qu'il y a dans un montage : bruitages, accents,
    mèmes, zooms, transitions, punchlines, durée, noms stables `cleNom`), `comparer` (gardé / retiré / ajouté à la
    main), `apprendre` (densités ×0,25 à ×3, la moitié du chemin à chaque montage ; notes par son / clip ; un son
    retiré 2 fois de plus que gardé = plus proposé seul), `resumeGouts`.
  - `ui/apprentissage.ts` : empreinte gardée (localStorage `arko.empreinte.<emp>`) après le montage auto (express,
    Best-of v4) et après « Tout poser » des bruitages ; à l'EXPORT, comparaison, goûts mis à jour
    (`arko.gouts`), toast « Arko a appris de tes retouches : … ». Une fois par montage auto.
  - Goûts appliqués : densité des bruitages / échos (revue), des accents, des mèmes ; sons et clips rejetés écartés ;
    transitions coupées si l'utilisateur les retire toujours (< ×0,5). Encadré « Appris de tes N montages » +
    « Oublier » en haut du panneau des bruitages.
  - Nouveau rôle de son `accent` (types, normaliseur, schema.json) ; « Retirer tous les bruitages » retire aussi les
    accents.
- **Feuille de route « perfection »** (une étape par session) : appliquer aussi les goûts aux zooms, punchlines et à
  la durée visée ; apprendre des COUPES (marges avant / après les mots que Romain rallonge ou raccourcit) ;
  « copier le rythme » d'un montage de référence (coupes / zooms / sons par minute, mesurés sur l'appareil) ; banc
  réel (§0.3 de la passation générale) pour mesurer chaque progrès ; IA locale (où ? question posée à Romain).
- **Monteur IA = module complet de MON HUB** (choix de Romain, 9/11) : plan dans `docs/monteur-ia/plan.md` (Arko
  prépare le dossier et applique le plan ; Mon Hub pense avec llama.cpp + modèle GGUF local + sortie JSON forcée ;
  serveur local 127.0.0.1 ; exemples appris de chaque export ; 5 étapes). Le savoir du monteur (instruction de
  départ de l'IA, et guide pour les règles d'Arko) : `docs/monteur-ia/savoir-du-monteur.md`. Rien de codé côté
  Mon Hub pour l'instant.
  - ÉTAPE 1 FAITE (côté Arko, pur, testé) : `auto/monteur-ia/dossier.ts` (`construireDossier`, `phrasesDe` : phrases
    avec qui parle / émotion / dit fort, réactions, scènes, bibliothèque en noms + durées, goûts) et
    `auto/monteur-ia/plan.ts` (`validerPlan` : accroche ≤ 8 s, séquences triées sans chevauchement, effets d'un type
    connu et d'un VRAI fichier de la bibliothèque, ≤ 12 effets/min, textes raccourcis, journal des corrections ; ne
    lève jamais). Tests : `monteur-ia.test.ts`.
  - **SUIVI CASE PAR CASE : `docs/monteur-ia/etapes.md`** (reprendre à la première case vide). Faits le 9/11 :
    A1 à A5 (`ui/auto/express/monteur-ia.ts` : dossier depuis l'analyse, « Envoyer au monteur IA »,
    « Ouvrir un plan » + journal dans la revue). A6 fait (`auto/monteur-ia/appliquer.ts`). A7 fait (`poserEffetsSimples`). Puis A8 à A10, C2, C3, D1, D3a, E1 à E4c faits le 9/11 (voir les cases).
    TOUT LE CÔTÉ ARKO EST FAIT. Côté Mon Hub (C:\dev\mon_hub\lib\modules\monteur_ia\), B1 à B6, C1, D2, D3b
    sont ÉCRITS le 9/11 mais PAS COMPILÉS (cases [~]) : vérifier avec outils\verif_auto.bat. Avant :
    `docs/monteur-ia/plan.md` §8), D2 / D3b (Mon Hub), D4 (banc réel : il faut refaire la « vérité » du montage à
    la main, perdue avec l'ancien conteneur).

Reste à faire (demandes de Romain du 9/11), par ordre conseillé :
1. Tester les 2 points ci-dessus sur la vraie session et ajouter des tests unitaires (forcerDeux, noteTitre).
2. Qui parle : upgrade (empreinte de voix d'office quand les niveaux se ressemblent) + placement des persos quand
   l'un parle (banc réel §0.3 de la passation générale).
6. Boucle « revue du jour » → banc réel → réglages (voir `docs/revues/`).

## Session du 10/11/2026 (suite) — F4 à F8 « Arko regarde l'image »
- `src/auto/vision/` : `regard.ts` (pur : entrée CLIP, genres, zones mortes), `worker-vision.ts`, `client-vision.ts`
  (cache IndexedDB), `regarder.ts` (branchement injectable), `phrases-vision.json`. Modèle `vision` dans le catalogue.
- Zones mortes = `PlageMuette` avec `vu` dans `signaux.muets` (`appliquerRegard` / `avecRegard` dans signaux-source).
  Appelé avant les signaux dans `analyserPourExpress` et `mesurerPourBestOf`.
- UI : `ui/auto/express/regard-ui.ts` + interrupteur dans les réglages express (cocher = télécharger 89 Mo).
- Dossier du monteur IA : `zonesMortes` ; Mon Hub `nettoyerPlan` retaille les séquences (test Dart à lancer).
- À faire : essai réel par Romain ; F7 (dose d'effets en jeu) à juger sur une vraie vidéo ; chargement Nuke raté.

## Session du 10/11/2026 (soir) — section G « comme la référence »
- Avatars : mode `reactions` (recette, normaliseur, schéma, outil Avatars) d'office ; `placesDeReaction`, tête XXL.
- Punchlines YouTube : `garderMeilleuresPunchlines` (punchlines.ts) dans express.ts.
- Menus gardés quand on réagit : `zonesSansReactions` (signaux-source.ts).
- Structure YouTube : `auto/habillage/structure-youtube.ts`, appelée dans etat-express (toutes les branches) ;
  nom de chaîne : `chaineYoutube` (localStorage `arko.chaine`), champ dans les réglages express (YouTube).
- Volume des montages −13 LUFS (`LUFS_MONTAGE`). Tests : 1478 verts.
- Pas faits : G3 plateau, jingle, cercle noir, sons « pop », G12–G13 inserts, G15, G18 (CLIP pas fiable), G19.
- Suite (21 h) : cartes « nom » (`cartesNoms`), costumes du générique, accents sur cartons / réactions / tête géante
  (accents.ts). Tests 1480 verts. Restent : G3 (voix off à enregistrer), iris, jingle, G12–G13, G16 contraste, G18, G19.
- « Arko écoute tes sons » : auto/son/ecoute.ts (pur), worker-ecoute.ts, ui/auto/son/ecoute-ui.ts, modèle `ecoute`,
  `MonSon.ecoute` + `noterEcoute` (stockage/mes-sons.ts), choix-son.ts / accents.ts (`entenduPour`). Tests 1485 verts.
- H5 : apprentissage par genre de moment (Son.pour, cleMoment). Tests 1486 verts.
- ATTENTION (10/11, 23 h) : `tsc` plante (segfault) dans la VM de Cowork SANS rien afficher → les « typecheck propres »
  de la soirée étaient faux ; la publication #11 a échoué (sans-sons-arko.ts : `trans` peut être une chaîne ;
  structure-youtube.ts : `dur` facultatif). Corrigé. Vérifier les types dans le conteneur cloud (npm ci + npx tsc),
  jamais se fier à une sortie vide dans la VM.
