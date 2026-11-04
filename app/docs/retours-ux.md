# Arko : retours UX avant de coder

Relecture critique du plan et de la maquette (5 écrans), point de vue d'un créateur gaming TikTok débutant, sur téléphone. 3 nov. 2026.

## 1. Ce qui est bien

- **Parcours linéaire, un écran par étape, gros bouton Suivant** : c'est ce qui manque aux concurrents. CapCut est « optimisé pour la vitesse, pas pour le contrôle » et ses fonctions varient selon la région, l'appareil ou l'abonnement. StreamLadder et OpusClip bloquent le 1080p, les sous-titres ou le recadrage avancé derrière un paiement. Arko, gratuit, local et sans filigrane, a un vrai argument.
- **« Rien n'est envoyé en ligne »** dès le premier écran.
- **Règles TikTok intégrées** (zone sûre, accroche des 3 s, aperçu avec l'interface TikTok) : c'est le différenciateur. L'algorithme tranche vers 1,5 à 3 s, et environ 40 % des premières vues se font sans le son.
- **« Jeu + webcam »** : c'est le format de référence (webcam en haut, jeu en dessous ; 30/70 chez OpusClip).
- **« Reprendre un projet »** : très bien, s'il est fiable techniquement (voir 2).

## 2. Problèmes et risques

**Parcours**
- **Vertical avant Couper est à l'envers.** Le réflexe gaming, c'est « je trouve mon moment, puis je le mets en forme » (Medal, Eklipse). En coupant d'abord, on recadre sur l'action gardée et l'export traite moins d'images.
- **Suivant est actif sur Importer sans vidéo.** Choisir une vidéo doit faire avancer tout seul.
- **« Étape x sur 5 » en phase 1 alors qu'Habiller n'existe pas** : il faut 4 étapes en phase 1.
- **Clips de jeux mobiles déjà verticaux** (Brawl Stars, Clash…) : il faut sauter l'étape Vertical.
- **La maquette d'Exporter montre des éléments des phases 2 et 3** (son guide, vérification des textes) : on ne montre rien qui ne marche pas encore.

**Couper (l'écran le plus risqué)**
- **Poignées de 14 px** : impossibles à attraper au pouce. IMG.LY conseille une zone de toucher d'environ 1 cm², au moins deux fois plus large que la poignée visible, placée à l'extérieur du clip.
- **8 vignettes pour 48 s, soit 6 s par vignette** : aucune précision. Il faut zoomer en pinçant, afficher le temps pendant le glissé, aimanter à la tête de lecture et vibrer légèrement.
- **Scinder et Supprimer sans sélection visible** : on ne sait pas ce qui va disparaître.
- **« 0:12 / 0:31 gardées sur 0:48 »** : trois nombres, illisible.
- **Il n'y a pas d'Annuler.** Au pouce, les fausses manipulations sont constantes.

**Vertical**
- **« Jeu + webcam » ne dit pas où est la webcam dans la vidéo source.** Il faut un cadre réglable et mémorisé (un streamer garde la même scène OBS).
- **« Recadré » doit permettre de déplacer la zone gardée** : recadrer une action située sur les bords est une erreur classique de débutant.

**Interruptions, batterie, fichiers**
- **Appel ou passage sur TikTok pendant l'export** : l'onglet est gelé et le Wake Lock est libéré automatiquement quand la page est cachée. L'export est perdu.
- **Reprise** : un fichier choisi avec `<input type=file>` n'est sans doute plus lisible après un rechargement ou si l'onglet est tué [à tester]. Il faut soit copier le passage gardé dans l'OPFS, soit demander de re-choisir la vidéo.
- **Taille** : environ 1 Mo par seconde en 1080×1920 [estimation]. Le manque de stockage est la première cause d'échec d'export sur mobile selon CapCut. Vérifier avec `navigator.storage.estimate`.
- **Batterie** : prévenir sous 20 % (`navigator.getBattery`).
- **« Partager vers TikTok »** promet trop (c'est la feuille de partage Android), et « Enregistrer » envoie le fichier dans Téléchargements, pas dans la Galerie.
- **30 i/s fixes** alors que beaucoup de clips sont en 60 i/s. Insights.gg conseille de garder la cadence de la source : à envisager plus tard.

## 3. Top 15 des améliorations (par impact)

| # | Idée | Phase | Effort | Change la phase 1 ? |
|---|---|---|---|---|
| 1 | **Sauvegarde automatique et reprise** après un appel ou un onglet tué (recette JSON à chaque action, copie OPFS ou nouveau choix guidé) | 1 | moyen | **oui** |
| 2 | **Couper avant Vertical**, avec un bouton « Commencer ici » : on démarre sur l'action | 1 | petit | **oui** |
| 3 | **Découpe au pouce** : grandes poignées, zoom en pinçant, ±1 image, bulle de temps, aimant et vibration | 1 | moyen | **oui** |
| 4 | **Annuler / Rétablir** (c'est trivial avec la recette JSON) | 1 | petit | **oui** |
| 5 | **Export solide** : taille et durée estimées, Wake Lock repris, Annuler, contrôle de la batterie et de l'espace | 1 | moyen | **oui** |
| 6 | **Compteur de durée coloré** : vert de 7 à 30 s, orange au-delà de 45 s (les clips de 15 à 30 s font mieux) | 1 | petit | **oui** |
| 7 | **Détection des vidéos verticales**, qui saute l'étape | 1 | petit | **oui** |
| 8 | **Cadre webcam mémorisé**, puis **détection automatique de la webcam** (visage, rectangle fixe dans un coin) | 2, puis 4 | moyen, puis gros | non |
| 9 | **Texte d'accroche sur la 1re image**, avec des modèles gaming (« 1v4 avec 8 PV ») | 2 | petit | non |
| 10 | **Sous-titres gras mot par mot entre la webcam et le jeu**, toujours modifiables (noms de jeux et pseudos mal reconnus) | 2 | gros | non |
| 11 | **Recette « Le meilleur d'abord »** : on copie la seconde la plus forte en ouverture, puis l'action en entier | 4 | moyen | non (la recette doit permettre de réutiliser un passage) |
| 12 | **Zoom réaction** sur la webcam lors d'un pic sonore (cri, rire), avec un son d'impact assorti | 3 | moyen | non |
| 13 | **Préréglages par jeu** (Fortnite, Valorant, LoL, Minecraft…) : recadrage, zone de la liste des kills, HUD | 4 | moyen | non |
| 14 | **Repères de moments forts sur la frise** (pics de voix ou de son du jeu, kills) | 4 | moyen | non (prévoir le champ `marqueurs`) |
| 15 | **Ergonomie du monteur IA** (voir ci-dessous) | 6 | gros | non (prévoir l'état `brouillon / gardé / jeté`) |

**Monteur IA (phase 6)**
- **La demande en un écran** : nombre de clips (curseur, 30 par défaut), durée (15, 30 ou 45 s), ambiance en pastilles (Drôle, Clutch, Rage, Fail), et une option « Précise ta demande ».
- **Une progression honnête** (« Analyse : 1 h 12 sur 3 h 40 ») avec « Laisse ton téléphone branché, écran allumé ». Les outils en ligne mettent de 30 minutes à plusieurs heures pour un live de 3 h.
- **Revue façon TikTok** : lecture plein écran en boucle, on balaie à droite pour garder, à gauche pour jeter, on touche pour retoucher. Sous chaque clip, la raison du choix (« Gros rire à 1:02:13 »). Eklipse compte environ 15 minutes pour 12 à 15 clips : il faut faire mieux.
- **Pas de « score de viralité »** : les utilisateurs d'OpusClip le jugent peu fiable. Mieux vaut un tri par type de moment.
- **Les clips gardés partent dans une file d'export** et restent modifiables dans l'éditeur.

## 4. Liste de modifications pour l'interface (phase 1)

**Général**
- [ ] Ordre : Importer → Couper → Vertical → Exporter, avec « Étape x sur 4 ».
- [ ] Annuler et Rétablir dans l'en-tête de Couper et de Vertical (zone de toucher de 48 px).
- [ ] Recette sauvegardée à chaque action (IndexedDB), avec la mention « Enregistré » discrète.
- [ ] Le bouton Retour d'Android ramène à l'étape précédente sans rien perdre.
- [ ] Masquer tout ce qui n'existe pas encore (silences, alerte de rythme, son guide).

**Importer**
- [ ] Retirer Suivant : le choix d'une vidéo fait avancer.
- [ ] Barre de chargement avec le nom du fichier. Erreurs claires (format, durée, espace).
- [ ] Si la vidéo est verticale, sauter l'étape Vertical.
- [ ] « Reprendre » avec une vraie vignette. Si la source a disparu, proposer « Re-choisir la vidéo ».

**Couper**
- [ ] Poignées de 24 px visibles et de 48 px au moins au toucher, placées à l'extérieur du clip.
- [ ] Zoom en pinçant avec une règle en secondes, et une bulle de temps (0:12,4) pendant le glissé.
- [ ] Boutons « −1 image / +1 image ».
- [ ] « Commencer ici » et « Finir ici » à la tête de lecture.
- [ ] On touche un morceau pour le sélectionner (contour citron) ; Supprimer reste grisé sans sélection.
- [ ] Une seule information : « Durée finale : 24 s », colorée.
- [ ] Bande des 3 premières secondes sur la frise.

**Vertical**
- [ ] L'aperçu joue le passage coupé.
- [ ] Recadré : on fait glisser l'image. Jeu + webcam : cadre réglable, bouton « Inverser », réglage mémorisé.
- [ ] Zone sûre désactivée par défaut.

**Exporter**
- [ ] Avant : durée, taille et temps estimés, avertissements de batterie et d'espace.
- [ ] Pendant : pourcentage, temps restant, Annuler, Wake Lock repris quand la page redevient visible.
- [ ] Après : aperçu en boucle avec l'interface TikTok, « Partager » et « Télécharger » (en disant où va le fichier), puis une astuce de publication.
- [ ] « Monter un autre clip » seulement après l'export.

## 5. Textes recommandés (phase 1)

| Endroit | Texte |
|---|---|
| Importer | **Quel clip on monte ?** · Ta vidéo reste sur ton téléphone. Rien n'est envoyé en ligne. · **Choisir une vidéo** |
| Chargement | Je prépare ta vidéo… |
| Vidéo déjà verticale | Ta vidéo est déjà verticale, on passe direct à la suite. |
| Reprendre | **Reprendre** · Arrêté à : Couper |
| Source perdue | Je ne retrouve plus la vidéo d'origine. **Re-choisir la vidéo** |
| Couper | **Garde le meilleur** · Démarre direct sur l'action : pas de lobby, pas de chargement. |
| Boutons de Couper | **Commencer ici** · **Finir ici** · **Scinder** · **Supprimer** · **Annuler** |
| Durée | Durée finale : 24 s · « 52 s : un peu long, vise 15 à 30 s » |
| Bande des 3 s | Les 3 premières secondes : ton accroche |
| Vertical | **Mets-le en vertical** · **Plein écran** · **Fond flou** · **Jeu + webcam** |
| Aides de Vertical | Fais glisser pour garder l'action. · Place le cadre sur ta webcam, je m'en souviendrai. |
| Exporter | **C'est prêt à sortir** · 24 s · environ 25 Mo · environ 30 s de création · **Créer la vidéo** |
| Pendant l'export | Création… 42 % · Garde Arko ouvert, sinon ça s'arrête. |
| Retour sur la page | L'export s'est mis en pause pendant ton absence. **Reprendre** |
| Alertes | Batterie faible : branche ton téléphone avant de lancer. · Pas assez de place : il faut environ 25 Mo de libre. |
| Fin | **Vidéo prête !** · **Partager** · **Télécharger** |
| Astuce | Dans TikTok, ajoute un son tendance à volume bas et mets le nom du jeu au début de ta description. |
| Après l'export | **Monter un autre clip** |
| Erreurs | Export annulé, ton montage est gardé. · Oups, l'export a planté. Ton montage est sauvegardé. **Réessayer** |

## Sources

- OpusClip, « 8 Things All Viral TikToks Do in the First 3 Seconds (2026) », 12 mai 2026 : https://www.opus.pro/blog/viral-tiktoks-first-3-seconds-2026
- OpusClip, Gaming Video Editor : https://www.opus.pro/tools/gaming-video-editor
- OpusClip, aide « Layout and reframing » : https://help.opus.pro/docs/article/layout-and-reframing.md
- Two Average Gamers, « Eklipse vs OpusClip 2026 », avril 2026 : https://www.twoaveragegamers.com/eklipse-vs-opusclip-head-to-head-for-gaming-streamers-2026/
- Eklipse, « Edit Twitch highlights without a timeline », 21 avril 2026 : https://blog.eklipse.gg/streaming-tips/edit-twitch-highlights-no-timeline.html
- Eklipse, « How does Eklipse AI choose highlights » : https://eklipse.gg/help/how-does-eklipse-ai-choose-highlights/
- Eklipse, « TikTok algorithm for gaming creators », 28 avril 2026 : https://blog.eklipse.gg/beginner-guide-2/tiktok-algorithm-gaming-creators.html
- Eklipse, « TikTok caption length, gaming clips », 30 avril 2026 : https://blog.eklipse.gg/basic-knowledge/tiktok-caption-length-gaming-clips-guide.html
- Insights.gg, « How to Post Gaming Clips to TikTok », 20 août 2026 : https://insights.gg/blog/how-to-post-gaming-clips-to-tiktok
- Vidpros, « StreamLadder review 2026 », 9 février 2026 : https://vidpros.com/streamladder-review-2026/
- Cutsio, « Twitch VOD to TikTok workflow » : https://cutsio.com/blog/twitch-vod-to-tiktok-workflow-cuts-captions-and-reformatting
- Medal, Clip editor : https://medal.tv/learn/clip-editor
- Pixflow, « Best Mobile Video Editing Apps 2026 (CapCut, VN, InShot) », juin 2026 (mis à jour en octobre 2026) : https://pixflow.net/blog/?p=92496
- Nemo, « CapCut Review 2026 » : https://www.nemovideo.com/blog/capcut-review-2026
- CapCut, aide « Export not working » : https://www.capcut.com/help/how-to-fix-capcut-export-not-working-issue
- IMG.LY, « Designing a timeline for mobile video editing », août 2024 : https://img.ly/blog/designing-a-timeline-for-mobile-video-editing/
- Chrome for Developers, « Screen Wake Lock API » : https://developer.chrome.com/docs/capabilities/web-apis/wake-lock
