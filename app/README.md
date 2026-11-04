# Arko

**Monte tes clips de jeu pour TikTok ou YouTube, directement sur ton téléphone. Gratuit, open source, sans compte.**

Arko est un éditeur vidéo pensé pour TikTok et YouTube : il ne fait pas tout, mais ce qu'il fait doit être rapide, simple et au bon format.
Il tourne dans le navigateur (Chrome sur Android d'abord) et s'installe comme une appli. Tes vidéos ne quittent jamais ton téléphone.

## Ce que fait la version actuelle (phase 1)

1. **Importer** une vidéo (même très longue : un live de plusieurs heures).
2. **Couper** : scinder, supprimer un passage, rogner au pouce, « Commencer ici » / « Finir ici », annuler / rétablir, durée finale en couleur.
3. **Vertical** : fond flou ou plein écran recadré (tu fais glisser pour cadrer). Étape sautée si la vidéo est déjà verticale.
4. **Exporter** en MP4 1080 × 1920, 30 images/s (720p si le téléphone ne peut pas), puis Partager ou Télécharger.

Le montage est sauvegardé tout seul : si tu fermes l'appli, tu reprends où tu en étais.

À venir : textes et sous-titres automatiques, effets sonores et transitions, son guide, détection des moments forts, monteur IA (voir `docs/`).

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

Dans Habiller → Sons → **Mes sons**, tu gardes tes propres sons pour tous tes montages (100 Mo au plus, sur ton téléphone) :
- **Importer des sons** : plusieurs fichiers d'un coup, ou un `.zip` (200 sons au plus, seuls les fichiers audio sont pris), avec une étiquette (« Memes »…) ;
- **Partager → Arko** : depuis les Téléchargements ou le navigateur du téléphone, partage un son (ou un `.zip`) vers Arko. Ça marche **une fois Arko installé sur l'écran d'accueil** (Chrome Android, menu ⋮ → « Ajouter à l'écran d'accueil ») ;
- le bouton « Trouver des sons sur MyInstants ↗ » ouvre le site dans un nouvel onglet : c'est toi qui télécharges, Arko ne télécharge rien tout seul.

Les sons que tu importes sont sous ta responsabilité : un son protégé peut faire couper le son de ta vidéo sur TikTok. Aucun de ces sons n'est dans le dépôt.

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
