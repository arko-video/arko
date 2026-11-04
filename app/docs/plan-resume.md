# Arko — résumé du plan validé par Romain (3 nov. 2026)

Arko : éditeur vidéo gratuit et open source (licence MIT), spécialisé TikTok gaming. Tourne dans le navigateur (Chrome Android d'abord, PC ensuite), installable (PWA), rien n'est envoyé en ligne, aucun serveur, aucune API payante. Doit être efficace, ergonomique et à la portée de n'importe qui.

Décisions : nom Arko · téléphone d'abord (testé sur un Xiaomi) · notre propre code (OpenReel sert de modèle) · licence MIT · Arko existe seule ET comme module de Mon Hub (appli Flutter sur Google Play ; v1 : Mon Hub l'ouvre dans un Chrome Custom Tab).

Romain : débutant, francophone, fait du contenu gaming TikTok. Il veut aussi, plus tard, un agent IA (clé API de l'utilisateur) qui monte seul « 30 TikToks drôles » à partir d'un live de 1 h 30 à 5 h, presque sans tokens.

## Parcours en 5 étapes (un écran par étape, gros bouton Suivant)
1. Importer · 2. Mettre en vertical (recadré, fond flou, jeu + webcam) · 3. Couper (scinder, supprimer, raccourcir les silences) · 4. Habiller (sous-titres auto mot par mot, texte d'accroche, effets sonores, transitions + son assorti, zoom) · 5. Exporter (MP4 1080×1920 30 i/s H.264 + AAC, aperçu avec l'interface TikTok, partage Android).

## Règles TikTok intégrées
Format bloqué 9:16 · zone sûre affichée (≈ haut 240 px, bas 660 px, côtés 120 px sur 1080×1920) · repère des 3 premières secondes (accroche) · alerte de rythme quand un plan traîne · sous-titres gravés 60–75 px · option boucle · musique tendance ajoutée dans TikTok (pas dans l'app) · « son guide » : on importe le son tendance pour caler le montage, il est retiré à l'export.

## Sons
Uniquement CC0 ou créés par nous (voir recherche/sons.md). Pas de sons mèmes copiés.

## Phases
0 Cadrage (fait : nom, décisions, maquette 5 écrans) · 1 Minimum qui marche : importer, fond flou, couper/scinder, exporter MP4, poster un 1er TikTok · 2 Texte et sous-titres + zone sûre + 2 autres mises en page · 3 Sons et transitions + zoom + son guide · 4 Rythme et recettes (silences, vitesse, repères, projets sauvegardés, modèles Top 3/Fail/Réaction) · 5 Ouverture (GitHub, PWA, vidéo de présentation) · 6 Monteur IA : analyse locale (transcription, pics sonores, rires…) → résumé texte 60–100 moments → l'IA renvoie des « recettes de montage » JSON → Arko monte seul. À prévoir dès la phase 1 : un « langage de recette » JSON commun aux boutons et à l'IA, et un moteur qui lit les longues vidéos par morceaux.

## Fichiers existants
- /home/claude/arko/prototype/index.html — prototype qui marche (Mediabunny 1.61.6, Conversion API, fond flou, découpe, export, testé dans Chrome headless)
- /home/claude/arko/recherche/technique.md — intégration Mon Hub, sous-titres Whisper, WebCodecs Android
- /home/claude/arko/recherche/sons.md — sources CC0
- Maquette des 5 écrans : /tmp/claude-0/-home-claude/327ea8c0-317a-5474-83a2-dbe668eff1bf/scratchpad/arko-maquette/project/*.dc.html (fond #0F1115, accent citron #C8FF4D, orange #FF8A3D pour les sons, polices Space Grotesk + Inter)
