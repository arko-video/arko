# Arko

**Monte tes clips de jeu pour TikTok ou YouTube, directement sur ton téléphone. Gratuit, open source, sans compte.**

Arko est un éditeur vidéo pensé pour TikTok et YouTube : il ne fait pas tout, mais ce qu'il fait doit être rapide, simple et au bon format.
Il tourne dans le navigateur (Chrome sur Android d'abord) et s'installe comme une appli. Tes vidéos ne quittent jamais ton téléphone.

## Ce que fait Arko

1. **Importer** une vidéo (même très longue : un live de plusieurs heures).
2. **Couper** : scinder, supprimer un passage, rogner au pouce, vitesse, arrêt sur image, annuler / rétablir.
3. **Vertical** (TikTok, Short) ou **Cadrage** (YouTube 16:9) : fond flou ou plein écran, jeu + webcam.
4. **Habiller** : accroche, textes, sous-titres automatiques (Whisper sur le téléphone), 22 sons CC0 fabriqués par Arko,
   Mes sons, transitions, zooms, combos, modèles (Top 3, Le meilleur d'abord), chapitres et intro / outro (YouTube),
   **fonds verts** et **mèmes** de ta bibliothèque.
5. **Exporter** en MP4 (1080 × 1920, ou 1920 × 1080 en 16:9), puis Partager ou Télécharger.

Le montage est sauvegardé tout seul (« Mes montages ») : si tu fermes l'appli, tu reprends où tu en étais.
Pour une longue vidéo, le **Monteur IA** propose des clips et le **Montage express** monte toute la vidéo (voir plus bas).

## Lancer Arko sur ton ordinateur

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvre l'adresse affichée (par exemple `http://localhost:5173/arko/`) dans Chrome.

## Vérifier que tout marche

```bash
npm run verif     # types + tests rapides
npm run e2e       # parcours complet dans Chrome (import → découpe → export)
```

## Comment c'est construit

- **La recette** (`src/recette/`) : un petit fichier JSON qui décrit le montage. C'est la seule source de vérité : l'interface l'écrit, l'aperçu et l'export la lisent. Une IA peut aussi l'écrire ; le normaliseur corrige ses erreurs au lieu de les rejeter.
- **Le moteur** (`src/moteur/`) : un seul chemin de rendu pour l'aperçu et l'export, l'encodage se fait dans un Worker, le MP4 est écrit sur le disque du téléphone (OPFS) pour ne pas saturer la mémoire.
- **L'interface** (`src/ui/`) : Preact, gros boutons, tout en français.

Les choix détaillés sont dans `docs/architecture.md` et `docs/decisions-phase1.md`.

## Licence

Arko est sous licence **MIT** (voir `LICENSE`) : tout le monde peut l'utiliser, le modifier et le partager, même pour un usage commercial.

Bibliothèques principales : [Mediabunny](https://mediabunny.dev) et `@mediabunny/aac-encoder` (MPL-2.0), Preact (MIT), polices Inter et Space Grotesk (OFL).

Les effets sonores fournis par Arko sont uniquement sous licence **CC0** (domaine public), pour que tout le monde puisse publier ses vidéos sans risque. Les sons tendance de TikTok s'ajoutent au moment de publier, dans TikTok.

## Mes sons

Dans Habiller → Sons → **Mes sons**, tu gardes tes propres sons pour tous tes montages (600 Mo et 2 000 sons au plus si
ton téléphone a la place, sinon importe dossier par dossier) :
- **Importer des sons** : plusieurs fichiers d'un coup, ou un `.zip` de pack : **le nom du dossier devient l'étiquette**
  (« Laughs », « MLG Sound Effects »…) ; les petites vidéos `.mp4` du pack ne gardent que leur son ;
- **Partager → Arko** : depuis les Téléchargements ou le navigateur du téléphone, partage un son (ou un `.zip`) vers Arko. Ça marche **une fois Arko installé sur l'écran d'accueil** (Chrome Android, menu ⋮ → « Ajouter à l'écran d'accueil ») ;
- le bouton « Trouver des sons sur MyInstants ↗ » ouvre le site dans un nouvel onglet : c'est toi qui télécharges, Arko ne télécharge rien tout seul.

Les sons que tu importes sont sous ta responsabilité : un son protégé peut faire couper le son de ta vidéo sur TikTok. Aucun de ces sons n'est dans le dépôt.

## Ma bibliothèque, fonds verts et mèmes

Sur l'accueil (ou depuis Habiller), **Ma bibliothèque** garde sur ton appareil, pour tous tes montages, 4 rayons :
**Bruitages** (= Mes sons), **Musiques**, **Fonds verts** et **Mèmes**. Rien n'est envoyé, rien n'est mis dans le dépôt.
- **Importer un dossier** (ou des fichiers, ou un `.zip`) : les dossiers nommés « sound effect », « son de fond »,
  « effet de fond vert », « meme » (et SFX, musique, music, green screen, fond vert, memes…) sont rangés tout seuls ;
  pour les autres fichiers, Arko demande le rayon. Les vidéos sont gardées **en entier** (stockage privé du navigateur,
  lu par morceaux), dans la limite de la place que le navigateur accorde. Les `.sfk` et autres fichiers illisibles sont
  ignorés ; un `.wmv` ou un `.avi` : « format non lu par le navigateur, convertis-le en .mp4 ».
- Recherche, renommer, supprimer, place utilisée. La **Musique de fond** (Habiller → Sons → Musique) propose le rayon Musiques.
- Habiller → **Fond vert** : le clip est posé à la tête de lecture, le fond vert (ou bleu) est **enlevé tout seul**
  (couleur trouvée sur les bords du clip ; réglages Tolérance, Douceur des bords, Anti-débordement), à placer et
  agrandir au doigt, plein écran ou petit, avec ou sans son, début et fin à couper. Le détourage se fait sur la carte
  graphique (WebGL2), ou sur le processeur si elle manque : même résultat, dans l'aperçu comme dans la vidéo exportée.
- Habiller → **Mèmes** : « **Coupure** » (le mème coupe ta vidéo, plein écran avec bandes floues, puis le jeu reprend)
  ou « **Incrustation** » (en petit dans un coin) ; un mème sur fond vert est détouré tout seul.
- Un montage garde seulement l'identifiant du clip : si tu le supprimes de ta bibliothèque, le montage te le dit à
  sa réouverture et le retire proprement.

Les fichiers que tu importes (sons, musiques, vidéos téléchargées) sont sous ta responsabilité.

## Montage auto (novembre 2026)

Pour monter une longue session de jeu (OBS, deux potes en vocal) façon Laink ou Terracid, sans savoir monter.
Tout tourne sur ton téléphone : ni la vidéo ni le son ne sont envoyés.

- **Couper les blancs** (Couper, et Habiller → Couper) : garde la parole (mots de Whisper, ou voix détectée au son)
  et les sons forts ; Serré / Normal / Large ; aperçu « 2 h 03 → 41 min de parole · 312 coupes » ; un seul Annuler.
- **Enlever les bords de l'écran** (Couper, Cadrage) : barre des tâches et barre de titre d'une capture OBS trouvées
  toutes seules, poignées pour ajuster.
- **Punchlines** (Sous-titres) : seules les phrases fortes, en gros, mot clé en jaune, jurons masqués (« P*TAIN »),
  calées sur les mots (jamais avant la phrase, 0,2 s après le dernier mot, 2,5 s au plus).
- **Zooms automatiques** (Zoom) : ×1,32 sur les moments forts, ×1,12 un plan sur trois ; Doux / Normal / Fort.
- **Titres de section** (Chapitres, Texte) : le titre de chaque chapitre en bandeau, avec un whoosh.
- **Bruitages auto** (Sons) : quelques propositions prudentes, posées juste après la phrase (ou sur le rire qui suit),
  jamais par-dessus la parole, 1 toutes les 2 minutes au plus ; tu écoutes chacune dans ta vidéo et tu coches celles
  que tu gardes. Le son vient de Mes sons (étiquette et nom), sinon des sons d'Arko.
- **Musique** (Sons) : 1 à 6 morceaux qui se suivent, −17 dB, baisse toute seule quand tu parles ; ligne de crédit
  pour Kevin MacLeod, alerte pour les musiques de jeux (Nintendo, Sonic…).
- **Volume final** (Exporter) : −14 LUFS, crête ≤ −1,5 dBTP (YouTube et TikTok), mesure affichée à la fin.
- **Montage express** : à l'import d'une longue vidéo (à côté de « Monteur IA ») ou depuis Mes montages (menu ⋮).
  Réglages (durée visée, ce qu'on garde, punchlines, musique, bords…) → analyse sur le téléphone
  (transcription reprise si tu fermes l'appli) → revue des séquences (cocher, réordonner, durée totale) → un nouveau
  montage « Montage express — <nom> » que tu retouches comme d'habitude. Un seul Annuler le remet à zéro.
  Avec l'IA (ta clé) : seul du texte est envoyé, jamais le son.

## Best-of serré, chibis et « Insérer ici » (novembre 2026)

Pour monter une session de jeu entre potes « façon best-of » : seulement les meilleurs moments, montés serré, avec un
petit personnage pour chaque voix. Tout reste sur ton téléphone.

- **Best-of serré** (Montage express → Style du montage) : les rires et les moments forts gardés **avec leur contexte**
  (la phrase d'avant, la chute d'après) ; une scène drôle mais longue est **resserrée** au lieu d'être jetée ; coupe
  Serrée ; punchlines calées sur les mots ; musique qui baisse quand on parle ; **pas de bruitages** ; titres de
  séquence **facultatifs** (décochés d'office) ; bip sur les gros mots au choix. Un nouveau montage « Best-of — <nom> »,
  un seul Annuler.
- **Qui parle ?** : Arko reconnaît les voix (pistes séparées si ta vidéo OBS en a, sinon le niveau et le timbre),
  tu les nommes en écoutant 3 extraits, et tu corriges une phrase d'un toucher.
- **Avatars** : le chibi de chaque personne apparaît quand elle parle (en bas à gauche, taille moyenne), change selon
  l'émotion, bouge la bouche avec la voix. **Sous-titres pour : <personne>** : toutes les phrases de la voix qu'on
  entend mal sont sous-titrées en bas, en plus des punchlines.
- **Chibis** (Ma bibliothèque → Chibis) : personnages originaux dessinés par Arko, volontairement « un peu ratés »,
  3 styles (Feutre raté, Crayon, Paint), 24 émotions bouche ouverte / fermée (48 variantes par style), coiffures, tenues
  (astronaute, cow-boy, armure…), accessoires ; « Au hasard », « Ressemble à… », export PNG transparent ou .zip. CC0.
- **Passages pas retenus** (Couper) : les moments notés mais pas gardés, triés par note : Écouter, Ajouter d'un toucher.
- **Insérer ici** (Couper) : coupe la vidéo à la tête de lecture et place entre les deux parties une autre vidéo, un
  mème, une image fixe, un carton texte ou un chibi plein écran ; la suite est décalée toute seule.
- **Vidéo à plusieurs pistes de son** (micro et Discord séparés dans OBS) : choisis les pistes gardées et leur volume.
- **Monteur sans IA** : clips qui racontent quelque chose (mise en place + chute), sans doublons ; le titre se change
  ou se retire d'un toucher.

Les chibis d'Arko ne copient aucun personnage existant (ni Wankul, ni Pepe) : ils sont dessinés par le code.

## TikTok ou YouTube

Au premier lancement, Arko demande **« Tu montes pour où ? »** : TikTok, ou YouTube puis **Vidéo (16:9)** ou **Short (vertical)**.
Le choix est mémorisé (pastille « Pour : … · Changer » sur l'accueil et dans Mes montages) et chaque montage garde le sien.
Les anciens montages restent en TikTok.

- **Short** : le parcours TikTok, avec la zone sûre des Shorts, un export 1080 × 1920 et une alerte au-delà de 3 min.
- **Vidéo 16:9** : l'étape Vertical devient **Cadrage** (Plein 16:9 ou Ajustée + fond flou, sautée si la vidéo est déjà en 16:9) ;
  export 1920 × 1080 à 8 Mb/s (1440p à 16 Mb/s en option si la vidéo d'origine le permet) ; dans Habiller,
  **Chapitres** (« Copier les chapitres » → `0:00 Intro`…, règles de YouTube vérifiées) et **Intro / outro**
  (3 modèles animés avec le nom de ta chaîne, ou ta propre vidéo, gardés sur l'appareil) ; à l'export, **Miniature**
  (1280 × 720, gros texte, émoji, flèche, JPEG ou PNG de moins de 2 Mo). Le monteur IA peut faire une **compilation 16:9**.

Règles de YouTube vérifiées le 4/11/2026 : [Shorts de 3 min](https://support.google.com/youtube/answer/15424877),
[réglages d'envoi](https://support.google.com/youtube/answer/1722171), [chapitres](https://support.google.com/youtube/answer/9884579),
[miniatures](https://support.google.com/youtube/answer/72431), [écrans de fin](https://support.google.com/youtube/answer/6388789).
YouTube ne publie pas de zone sûre officielle pour les Shorts : Arko prend des marges prudentes (voir `src/recette/destination.ts`).
