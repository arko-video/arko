# Ajouter Arko dans Mon Hub

Ce dossier contient un module Mon Hub prêt à copier. Il ajoute une page « Arko » avec un bouton qui ouvre Arko dans un onglet Chrome intégré à l'appli.

## Avant de commencer
- Arko doit être en ligne (GitHub Pages). Sinon le bouton n'ouvrira rien.
- Fais un point Git dans `C:\dev\mon_hub` :
  ```
  git add .
  git commit -m "avant module Arko"
  ```

## Étapes (dans `C:\dev\mon_hub`)
1. Ajoute le paquet qui ouvre les liens :
   ```
   flutter pub add url_launcher
   ```
2. Copie `ecran_arko.dart` dans `lib/modules/arko/ecran_arko.dart`, puis mets la vraie adresse d'Arko dans `adresseArko`.
3. Dans `android/app/src/main/AndroidManifest.xml`, ajoute ce bloc à l'intérieur de `<manifest>`. Android 11 et plus en a besoin pour ouvrir un lien :
   ```xml
   <queries>
     <intent>
       <action android:name="android.intent.action.VIEW" />
       <data android:scheme="https" />
     </intent>
   </queries>
   ```
4. Déclare le module comme les autres (Piano, par exemple) :
   - une entrée `ModuleInfo` dans `lib/noyau/catalogue.dart` (id `arko`, nom « Arko », une icône vidéo)
   - son écran `EcranArko` dans `lib/modules/registre.dart`
   - un bâtiment dans le village, si les autres modules en ont un

   Ce branchement dépend de la structure exacte de Mon Hub. Le plus sûr : demande à Claude de le faire pendant une session où ton PC est relié. Il lira le catalogue et le registre avant d'écrire.
5. Vérifie, puis lance :
   ```
   flutter analyze
   flutter test
   flutter run -d edge --web-port 8080
   ```
   Pendant que ça tourne : `r` recharge, `R` redémarre, `q` quitte. Essaie ensuite sur le Xiaomi.
6. Si tout marche, fais un point Git :
   ```
   git add .
   git commit -m "module Arko"
   ```

## Plus tard
- Envoyer une vidéo de Mon Hub vers Arko, et récupérer le MP4 dans Mon Hub.
- Partager la clé du collègue IA de Mon Hub avec le monteur IA d'Arko (phase 6), sans jamais mettre de clé dans le code de l'appli.
