# Arko — Brief des phases 2 à 6 (proposition à relire)

4 novembre 2026. Base : phase 1 livrée (Importer → Couper → Vertical → Exporter), `architecture.md`, `decisions-phase1.md`.
Romain dort et ne répondra pas avant demain : chaque question ouverte est tranchée ici, et notée dans la passation.

## Principes communs
- La recette `arko.recette/1` reste la seule source de vérité. On n'ajoute que des champs facultatifs (compatibles), sans changer de version.
- Un seul chemin de rendu : tout nouveau calque (texte, sous-titre, zoom, transition, son) passe par `rendre()`, donc l'aperçu et l'export donnent le même résultat. Les tests de cohérence couvrent les nouveaux calques.
- Aucun appel réseau sans action de l'utilisateur. Seules exceptions : le téléchargement du module sous-titres (après accord) et l'appel à l'IA avec sa clé (phase 6).
- Tout est en français et pensé pour le pouce. Ce qui n'existe pas encore est masqué.

## Nouveau parcours (dès la phase 2)
**Importer → Couper → Vertical → Habiller → Exporter** (« Étape x sur 5 »).
- **Habiller** a la même disposition que CapCut : l'aperçu en haut, une mini-frise, puis une **barre d'outils en bas** qui défile à l'horizontale.
  - Phase 2 : Texte, Sous-titres, Zone sûre (interrupteur).
  - Phase 3 : Sons, Transitions, Zoom, Son guide.
  - Phase 4 : Modèles.
- Un outil s'ouvre dans un **panneau du bas** (bottom sheet, environ 45 % de la hauteur). L'aperçu reste visible au-dessus.
- Les outils de **coupe** de la phase 4 (Couper les blancs, Vitesse, Arrêt sur image) vont dans **Couper**, sur le plan sélectionné.
- Une source déjà verticale saute Vertical, comme avant. Annuler / Rétablir reste dans l'en-tête de Couper, Vertical et Habiller.

## Phase 2 — Habiller

### Textes (`textes[]`, déjà dans la recette)
- **5 styles** prêts, dessinés dans le canevas (`couches/textes.ts`) pour une référence de 1080 px :

  | id | Rendu |
  |---|---|
  | `accroche` (défaut) | Space Grotesk 700, blanc, contour noir 10 px, 84 px, entrée « pop » (0,6 → 1,08 → 1 en 0,25 s) |
  | `bulle` | Inter 800, texte noir sur fond blanc arrondi (rayon 28), 64 px |
  | `citron` | Inter 800, texte #0F1115 sur fond accent #C8FF4D, 64 px |
  | `alerte` | Space Grotesk 700, jaune #FFE14D, contour noir, rotation −3°, légère secousse à l'entrée |
  | `discret` | Inter 600, blanc, ombre douce, 52 px |

- Retour à la ligne automatique, largeur maximale 1080 − 2 × 120 px (zone sûre des côtés), 3 lignes au plus. Le texte rétrécit tout seul s'il dépasse.
- Fondu de sortie de 0,15 s. Pas d'émoji en phase 2 : la police du canevas du Worker ne les a pas.
- **Polices dans le Worker** : on charge `FontFace` depuis les fichiers woff2 servis par l'appli (`self.fonts.add`) avant la première image. Le dessin attend que la police soit prête, aussi bien dans l'aperçu que dans l'export.
- **Interface** :
  - Le bouton « Texte » ajoute un texte à la tête de lecture. Il ouvre un panneau avec un champ de saisie, les 5 styles en pastilles, et une durée réglable (1 à 10 s, ou « Jusqu'à la fin »).
  - On fait glisser le texte sur l'aperçu pour le déplacer. Il reste dans la zone sûre, et l'aimant le recentre à x = 0,5.
  - Les textes apparaissent en barres sur la mini-frise. Un toucher sur une barre la modifie, et il y a un bouton Supprimer.

### Sous-titres automatiques (`sousTitres`)
- **Modèle** : `onnx-community/whisper-base_timestamped`, encodeur et décodeur quantifiés, environ 77 Mo, via `@huggingface/transformers` 4.x dans un **Worker dédié** (`src/sous-titres/`). Il donne `return_timestamps: 'word'`, en français par défaut, avec un choix « Autre langue (auto) ».
- **Premier usage** : un dialogue propose « Télécharger le module sous-titres (environ 80 Mo, une seule fois). Ensuite il marche sans internet. » Le modèle est gardé dans le Cache Storage du navigateur.
- **Fichiers WASM** : les fichiers d'onnxruntime-web sont **inclus dans l'appli**, pour ne dépendre d'aucun CDN de code. Seul le modèle vient de huggingface.co. La CSP `connect-src` autorise huggingface.co et ses CDN.
- On ne transcrit que le **son des plans gardés**. Les morceaux sont extraits, mis en 16 kHz mono, puis les mots sont remis en **temps source** (`Mot = [txt, ts, fin, fort]`). Si on change la découpe, les sous-titres suivent.
- **3 styles** :
  - `karaoke` (défaut) : blanc avec contour, le mot en cours en citron et agrandi × 1,1
  - `pop` : un mot à la fois, en gros
  - `boite` : fond noir à 80 %, texte blanc
- Réglages par défaut : `parLigne` 3, `y` 0,58 (au-dessus de la zone basse de TikTok).
- **Mots forts** : `fort = 1` automatiquement pour une liste de mots (non, quoi, mdr, ptdr, wesh, gg, jamais, incroyable, attends…), pour les mots en majuscules et pour les mots suivis de « ! ». Ils sont dessinés en citron, légèrement plus gros.
- **Interface** :
  - « Sous-titres » lance la transcription, avec une progression en % et un bouton Annuler.
  - On obtient ensuite une liste de lignes. Un toucher sur un mot permet de le corriger, de le mettre en valeur ou de le supprimer.
  - Il y a aussi un choix de style et un bouton « Tout refaire ».
- **Test** : on crée une fixture parlée en français (synthèse vocale dans la VM : espeak-ng si disponible, sinon un modèle TTS lancé dans Node). On ajoute un e2e qui télécharge le vrai modèle (le réseau de la VM le permet) et vérifie qu'au moins 70 % des mots attendus sont présents, à ±0,3 s.

### Jeu + webcam (`mise.type = 'jeuCam'`)
- **Vertical** : la carte « Jeu + webcam » devient active. Quand on la choisit, un éditeur s'ouvre sur une image de la source.
  - Un rectangle « Ta webcam » à déplacer et redimensionner, avec 4 poignées de 48 px. Par défaut : x 0,02, y 0,62, l 0,26, h 0,34.
  - Un interrupteur « Webcam en haut / en bas » (en haut par défaut).
  - Un curseur « Taille de la webcam » (`partCam` de 0,25 à 0,6, 0,35 par défaut).
  - On fait glisser horizontalement la zone de jeu (`x`).
- **Rendu** :
  - La bande webcam (partCam × 1920) montre le cadre de la webcam, recadré pour remplir la largeur.
  - Le reste montre le jeu, recadré au centre x.
  - Une séparation noire de 6 px.
- Le dernier cadre webcam est mémorisé dans `localStorage` (`arko.cam`) et proposé au montage suivant.

### Zone sûre
- Un interrupteur dans Habiller affiche le calque DOM (existe déjà sur l'écran de fin), désactivé par défaut.
- Le normaliseur garde déjà les textes dans la zone. On ajoute un **avertissement** si un sous-titre ou un texte touche la zone basse.

## Phase 3 — Sons, transitions, zooms, son guide

### Effets sonores **synthétisés par Arko** (aucun fichier, aucune licence à vérifier)
- Chaque son est une **fonction pure et déterministe** (bruit à graine fixe) qui fabrique du PCM 48 kHz stéréo : `src/sons/synthese/*.ts`. Il est mis en cache au premier usage, et l'aperçu comme l'export appellent la même fonction. Licence : « Créé par Arko — CC0 ».
- Environ 30 sons, en familles :

  | Famille | Sons |
  |---|---|
  | `impact` | boom, grave, claque, coup, meme (grosse frappe sourde avec queue de réverbération, recréée) |
  | `whoosh` | rapide, lent, montant |
  | `cartoon` | boing, pop, glisse, couac |
  | `jeu` (8-bit) | piece, saut, bonus, degat, perdu, niveau |
  | `comedie` | trombone-triste, ba-dum-tss, criquets, wah |
  | `tension` | riser, coeur, drone |
  | `interface` | clic, ding, notif, erreur |
  | `meme` | klaxon (sirène de stade recréée), disque-raye |

- Les ids `famille.nom` sont vérifiés par le normaliseur, qui propose des ids proches (déjà prévu).
- On peut aussi **importer son propre son** (MP3/M4A/WAV/OGG, ou une vidéo dont on prend le son). Il devient une source `type: 'audio'` et un `Son.src`. C'est le fichier de l'utilisateur, donc sa responsabilité, avec un message court sur les droits.
- **Interface** :
  - « Sons » ouvre un panneau avec les familles en onglets. Un toucher écoute le son, « + » l'ajoute à la tête de lecture, attaché au **temps source** pour qu'il suive le moment.
  - Les sons apparaissent comme repères sur la mini-frise. Un toucher sur un repère règle le volume (0 à 150 %), le décale de ±0,1 s ou le supprime.

### Transitions (`plan.trans`, à l'entrée du plan, sans chevauchement)
- Durée par défaut 0,3 s : la moitié sur la fin du plan précédent, l'autre moitié sur le début du suivant. Pour cela, `etatImage` doit signaler la transition **avant** la coupe aussi.
- Catalogue (`couches/transitions.ts`), chaque transition avec son son par défaut :

  | Transition | Son par défaut |
  |---|---|
  | `coupe` | aucun |
  | `flash` (blanc) | impact.claque |
  | `zoom` (zoom à travers la coupe, 1 → 1,4 puis 1,4 → 1) | whoosh.rapide |
  | `glisse` (filé horizontal avec flou de mouvement) | whoosh.rapide |
  | `noir` (passage au noir) | aucun |
  | `glitch` (décalage RVB + tranches) | interface.erreur |
  | `secousse` | impact.boom |

- `son: false` coupe le son de la transition.
- **Interface** : « Transitions » montre chaque coupe en pastille sur la mini-frise. Un toucher sur une coupe ouvre la grille des 7 transitions avec une icône animée. Il y a aussi « Appliquer à toutes les coupes » et l'interrupteur « Avec le son ».

### Zooms (`zooms[]`, en temps source)
- `punch` : entrée en 0,08 s, maintien, sortie en 0,12 s.
- `doux` : zoom lent avec courbe douce (effet Ken Burns).
- Réglages : force de 1,1 à 2,5 (1,3 par défaut), durée de 0,2 à 5 s, centre (x, y) qu'on fait glisser sur l'aperçu.
- **Interface** : « Zoom » ajoute un zoom à la tête de lecture. Un point de visée apparaît sur l'aperçu, avec ses réglages dans le panneau.

### Son guide (`guide`)
- **Interface** : « Son guide » importe le son tendance enregistré sur le téléphone (fichier audio ou vidéo). On règle son début (`debut`), son point de départ dans la vidéo (`t`) et son volume.
- Il est joué **uniquement dans l'aperçu**. Un bandeau permanent l'indique : « Le son guide ne sera pas dans ta vidéo : ajoute ce son dans TikTok au moment de publier. »
- **Temps forts** détectés (onsets, fonction pure) : affichés en petits traits sur la frise de Couper et de Habiller.
- Option « Caler les coupes sur le rythme » : scinder et les poignées s'aimantent à un temps fort à ±0,12 s.

## Phase 4 — Rythme

- **Couper les blancs** (dans Couper) :
  - On calcule l'enveloppe RMS de chaque plan, avec un seuil adaptatif (bruit de fond au 20ᵉ percentile + 8 dB, plancher −45 dBFS).
  - Un blanc est un silence d'au moins 0,6 s. On garde 0,15 s de marge de chaque côté.
  - Un aperçu affiche « 12 blancs, −8 s », puis on applique. C'est annulable.
  - Fonction pure `recette/blancs.ts` + analyse dans `ia/analyse.ts` (`enveloppeSonore`).
- **Vitesse** (plan sélectionné) : pastilles 0,25 / 0,5 / 1 / 1,5 / 2 / 3 (le champ `vit` existe). Le son au ralenti devient plus grave : c'est assumé et indiqué.
- **Arrêt sur image** : nouveau champ facultatif `plan.fige?: Sec` (0,3 à 5 s).
  - On fige la dernière image du plan, sans son pendant l'arrêt.
  - **Durée finale = Σ ((a − de) / vit + fige)**.
  - À mettre à jour : types, schéma, normaliseur, chronologie, opérations, mixeur, curseur d'images.
- **Alerte de rythme** (`recette/rythme.ts`, pure) :
  - Tout passage de plus de 4 s sans événement (coupe, début de texte, zoom, transition, son) reçoit un repère orange sur la frise et le conseil « Ça traîne ici : coupe, zoome ou ajoute un son ».
  - Si les 3 premières secondes n'ont aucun texte, son ou zoom, on affiche le conseil « Ton accroche est calme ».
- **Mes montages** : plusieurs projets dans IndexedDB (`stockage/projets.ts`, avec migration de la clé `arko.projet`).
  - Sur Importer, une liste avec vignette, titre, durée et date.
  - Actions : Ouvrir (re-choisir le fichier, avec contrôle de l'empreinte), Renommer, Dupliquer, Supprimer.
- **Modèles** (Habiller, `recette/modeles.ts`, fonctions pures et annulables) :
  - **Top 3** : il faut 3 plans ou plus, les 3 derniers sont gardés. On ajoute les textes « #3 », « #2 », « #1 » (style `alerte`) au début de chacun, une transition `zoom` et un son `impact.boom` entre eux, et le texte d'accroche « TOP 3 … » sur la première seconde.
  - **Fail** : sur la fin du dernier plan, 1,5 s au ralenti 0,5, puis un arrêt sur image de 1 s, avec un zoom punch et `comedie.trombone-triste`.
  - **Réaction** : mise en page `jeuCam` (si un cadre webcam est connu), sous-titres karaoké, texte « ATTENDS LA FIN » sur 2 s, zoom doux sur le dernier tiers.

## Phase 5 — Public
- **Dans l'appli** :
  - un écran « Aide » (5 cartes courtes, une par étape)
  - au premier lancement, 3 conseils
  - un lien « Code source » vers le dépôt
- **Dans le dépôt** :
  - `CONTRIBUTING.md` (comment proposer une idée ou du code, simplement)
  - `CREDITS.md` (sons synthétisés CC0, polices OFL, bibliothèques et leurs licences)
  - `SECURITY.md`
  - des modèles d'issues en français
- **Module Mon Hub** : du code Dart prêt à copier, avec la passation :
  - une tuile « Arko » qui ouvre l'adresse d'Arko dans un onglet Chrome intégré (`url_launcher`, `LaunchMode.inAppBrowserView`)
  - une page d'explication
  À adapter à la structure des modules de Mon Hub (`passation-mon-hub.md`). Romain l'ajoute sur son PC.

## Phase 6 — Monteur IA
- **Entrée** : pour une source de plus de 5 min, l'écran Importer propose « Monteur IA : trouve les meilleurs moments ». C'est un parcours à part, en 3 écrans : Analyse → Demande → Propositions.
- **Analyse sur l'appareil** (Worker, sans token, annulable, avec progression) :
  1. **Son** : décodage par morceaux, mise en 16 kHz mono, enveloppe toutes les 0,1 s. On détecte les pics (z-score), les « calme → pic », les cris (fort et soutenu), les rires (rafales modulées à 4–6 Hz, heuristique).
  2. **Image** : une image toutes les 2 s en petite taille, avec détection des changements de scène.
  3. On garde les **120 meilleurs candidats**. On ne transcrit avec Whisper **que ±8 s autour de chacun**, pas les 5 h : sur téléphone, une heure de live demande quelques minutes. La transcription est facultative (« Analyse rapide sans transcription »).
  4. On produit les **moments** au format `ARKO-MOMENTS/1` (`ia/moments.ts` existe déjà).
- **Avec l'IA** :
  - La clé API de l'utilisateur est gardée **sur l'appareil seulement** (IndexedDB), affichée masquée, avec un bouton « Oublier ma clé ».
  - **Fournisseurs** : Anthropic (Claude), OpenAI et tout service compatible OpenAI (Mistral, OpenRouter, Groq, LM Studio local, avec une adresse modifiable), Google Gemini.
  - L'appel part directement du navigateur. Pour Anthropic, on ajoute l'en-tête `anthropic-dangerous-direct-browser-access: true`.
  - La CSP `connect-src` liste ces domaines. Pour une adresse personnalisée, il faut `https:` : c'est assumé et noté.
  - **Consignes** (`consignesAgent()`) :
    - le format compact de la recette
    - les règles TikTok (15 à 45 s, accroche avant 3 s, textes de 6 mots au plus)
    - la liste des sons et des transitions valides
    - « réponds uniquement par un tableau JSON »
    On envoie les consignes, les moments, le nombre voulu (10 par défaut, 30 au plus) et la consigne libre.
  - **Estimation affichée** avant l'envoi : « environ 15 000 tokens ».
  - La réponse est découpée de façon robuste (blocs de code markdown, JSON partiel). Chaque recette passe par le normaliseur, et les problèmes sont listés.
- **Sans IA** : Arko choisit seul les N meilleurs moments et applique une recette type :
  - un plan de 12 à 30 s autour du pic
  - un texte d'accroche tiré de la transcription s'il y en a une, sinon « ATTENDS LA FIN »
  - un zoom punch et `impact.boom` au pic
  - les sous-titres en `"auto"`
- **Propositions** :
  - une grille de brouillons (vignette, titre, durée, score), avec Garder / Jeter (`statut`)
  - « Retoucher » ouvre le brouillon dans Couper ou Habiller
  - « Exporter les gardés » lance les exports **l'un après l'autre**, avec une progression globale, puis Partager (plusieurs fichiers) ou Télécharger
- **Tests** : un faux fournisseur et des réponses enregistrées (aucune vraie clé dans la VM : Claude ne tape jamais de clé). On utilise un audio synthétique dont les pics sont connus pour l'analyse, et la vidéo de 2 h de la QA pour la durée.

## Organisation de l'équipe (par phase)
1. Je fige les **contrats** avant de lancer le travail : ajouts dans `types.ts`, `api.ts` et les signatures des opérations.
2. **Dev moteur** et **dev interface** travaillent en parallèle, chacun dans ses dossiers. Chacun a son port Playwright (4181 / 4182). Le 4173 est réservé à la vérification finale.
3. **Relecteur indépendant** : il écrit des scénarios difficiles dans `tests/qa/`, puis rend un rapport court.
4. Les corrections sont faites, puis je vérifie tout. La phase se termine par un zip, le plan mis à jour, la passation et une notification.
