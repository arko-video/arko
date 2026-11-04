# Contribuer à Arko

Merci de vouloir aider ! Arko doit rester **gratuit, simple et pensé pour TikTok**.

## Proposer une idée ou signaler un problème
- Ouvre une *issue* avec le modèle « Bug » ou « Idée ».
- Pour un bug, donne ton téléphone, ta version de Chrome, ce que tu as fait, ce qui s'est passé, et une capture si possible.
- Ne joins jamais une vidéo privée ou une clé API.

## Proposer du code
1. Installe [Node.js](https://nodejs.org) 22, puis lance `npm install` et `npm run dev`.
2. Fais un petit changement à la fois.
3. Vérifie que tout passe : `npm run verif` (types et tests rapides), et si possible `npm run e2e`.
4. Ouvre une *pull request* qui explique **pourquoi** tu fais ce changement.

## Règles du projet
- **La recette** (`src/recette/`) est la seule source de vérité du montage. L'interface la modifie uniquement par les fonctions de `src/recette/operations*.ts`.
- **Un seul moteur de rendu** pour l'aperçu et l'export : tout nouvel effet passe par `rendre()`.
- **Rien ne quitte le téléphone** : aucun serveur, aucun traqueur. Le seul réseau autorisé : le module sous-titres (une fois, après accord) et l'IA choisie par l'utilisateur, avec sa propre clé.
- **Licences** : uniquement du code et des ressources libres (MIT, Apache-2.0, MPL-2.0, OFL, CC0). Aucun son, image ou police copiés sans licence claire.
- Code et textes **en français**, simples à lire. Les fichiers restent courts (moins de 300 lignes).
