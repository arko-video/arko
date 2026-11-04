# Arko

**Monte tes clips de jeu en TikTok, directement sur ton téléphone. Gratuit, open source, sans compte.**

Arko est un éditeur vidéo pensé uniquement pour TikTok : il ne fait pas tout, mais ce qu'il fait doit être rapide, simple et au bon format.
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

Les futurs effets sonores seront uniquement sous licence **CC0** (domaine public), pour que tout le monde puisse publier ses vidéos sans risque. Les sons tendance de TikTok s'ajoutent au moment de publier, dans TikTok.
