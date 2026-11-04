# Sécurité

## Signaler une faille
Si tu trouves une faille de sécurité, **ne l'ouvre pas en issue publique**. Écris à l'adresse de contact du propriétaire du dépôt, avec les détails pour la reproduire. Tu auras une réponse dès que possible.

## Ce qu'Arko protège
- **Tes vidéos** ne sont jamais envoyées : tout se fait sur ton appareil.
- **Ta clé API** (monteur IA) est gardée sur ton appareil seulement. Elle est envoyée uniquement au fournisseur d'IA que tu as choisi, et tu peux l'effacer à tout moment.
- Une règle de sécurité stricte (Content-Security-Policy) interdit à la page de contacter d'autres sites que ceux nécessaires.

## Conseil pour héberger Arko
Sur GitHub Pages, toutes les pages d'un même compte (`<compte>.github.io`) partagent le même stockage. Héberge Arko sur une **organisation GitHub dédiée**, ou sur un domaine à lui, pour qu'aucune autre page ne puisse lire ses données.
