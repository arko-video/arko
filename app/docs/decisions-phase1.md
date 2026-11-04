# Arko — Décisions de la phase 1 (synthèse de l'équipe)

3 novembre 2026. Synthèse de `architecture.md` (architecte) et `retours-ux.md` (critique UX). Ce document l'emporte en cas de conflit.

## Arbitrages

| Sujet | Architecte | Critique UX | Décision |
|---|---|---|---|
| Ordre des étapes | Importer → Vertical → Couper | Couper avant Vertical | **Importer → Couper → Vertical → Exporter** (« Étape x sur 4 » en phase 1 ; Habiller s'insérera avant Exporter en phase 2) |
| Mises en page en phase 1 | Fond flou seul, les autres « bientôt » | Recadré déplaçable, webcam réglable | **Fond flou + Plein écran (recadré, on fait glisser pour cadrer)**. « Jeu + webcam » affiché avec un badge « Bientôt » (phase 2) |
| Vidéo déjà verticale | — | sauter l'étape | **Oui** : étape Vertical sautée, message « Ta vidéo est déjà verticale, on passe direct à la suite. » |
| Bouton Suivant sur Importer | — | le retirer | **Oui** : choisir une vidéo fait avancer |
| Découpe | poignées pas de 0,1 s | poignées 48 px, zoom, ±1 image, Commencer/Finir ici, sélection | **Tout le retour UX** : poignées visibles 24 px / zone de toucher ≥ 48 px à l'extérieur du plan, zoom de la frise (pincer + boutons −/+), bulle de temps pendant le glissé, ±1 image, « Commencer ici » / « Finir ici », sélection d'un plan (contour citron), Supprimer grisé sans sélection |
| Annuler / Rétablir | 50 états | partout | **Oui**, dans l'en-tête de Couper et Vertical |
| Durée | — | compteur coloré | **« Durée finale : 24 s »** vert de 7 à 30 s, neutre jusqu'à 45 s, orange au-delà + conseil |
| Bande des 3 s | — | sur la frise | **Oui** (« Les 3 premières secondes : ton accroche ») |
| Sauvegarde auto | IndexedDB 1 s après modif | à chaque action + reprise | **Oui** ; reprise avec re-sélection guidée du fichier + contrôle d'empreinte |
| Aperçu | rendu WebCodecs + AudioContext (même code que l'export) | — | **Architecte**. Si l'aperçu temps réel saccade trop, repli autorisé : lecture via `<video>` pour le son et rendu canvas des images (même `dessinerImage`), noté dans la passation |
| Export | Worker + OPFS + cascade | estimations, batterie, espace, Wake Lock repris | **Les deux**. Si l'onglet est caché pendant l'export et que l'export échoue : message « L'export s'est arrêté pendant ton absence. Reprendre » (on relance) |
| Fin d'export | Partager / Télécharger | idem + aperçu en boucle + astuce | **Oui** : aperçu du MP4 en boucle (avec zone sûre activable), Partager, Télécharger (« va dans Téléchargements »), astuce de publication, « Monter un autre clip » |
| Cadence | 30 i/s | garder la source plus tard | **30 i/s** en phase 1 |
| Recette | types de toutes les phases | champs `marqueurs`, statut | **Ajoutés** : `marqueurs?: Marqueur[]` et `statut?: 'brouillon' \| 'garde' \| 'jete'` |
| Licence aac-encoder | « LGPL ? » | — | **MPL-2.0** (vérifié sur npm le 3/11) → compatible MIT |
| Ce qui n'existe pas encore | — | ne rien montrer | **Masqué** : silences, alerte de rythme, son guide, sons, textes |

## Contrat interface ↔ moteur
Fichiers écrits avant le développement, à respecter par les deux développeurs :
- `src/recette/types.ts` : types de la recette.
- `src/moteur/api.ts` : fonctions que le moteur expose à l'interface.
- `src/recette/operations.ts` : signatures des opérations d'édition (implémentées par le développeur moteur).

Propriété des dossiers :
- **Développeur moteur** : `src/recette/**`, `src/moteur/**`, `src/stockage/**`, `src/sons/**`, `src/sous-titres/**`, `src/ia/**`, `src/integration/**`, tests Vitest associés.
- **Développeur interface** : `src/ui/**`, `src/main.tsx`, `src/textes-fr.ts`, `index.html`, `public/**`, configuration PWA, `tests/e2e/**`.
- `package.json`, `vite.config.ts`, `tsconfig.json` : préparés à l'avance ; chacun peut ajouter une dépendance, en le signalant dans son rapport.

## Critère de fin de phase 1
Dans Chrome headless (test automatique) : importer la vidéo de test, scinder à 2 s, supprimer un plan, choisir Fond flou, exporter → MP4 lisible, 1080 (ou 1072) × 1920, durée attendue ± 0,05 s, piste audio présente. `tsc --noEmit`, `vitest run` et `playwright test` au vert. Test réel sur le Xiaomi : à faire par Romain.
