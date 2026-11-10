# Monteur IA : étapes (une case = un petit travail fini, testé, sans casser le reste)

Légende : [x] fait et vérifié · [~] écrit, à vérifier par Romain (outils\verif_auto.bat) · [ ] à faire.
Règle : on prend la PREMIÈRE case non cochée, on la finit (code + test + typecheck), on la coche ici avec la date,
puis la suivante. Si une session est coupée, la suivante reprend à la première case vide. Plan général : plan.md.
Savoir donné à l'IA : savoir-du-monteur.md.

## A. Arko : le dossier et le plan (pur)
- [x] A1. Format du dossier (`auto/monteur-ia/dossier.ts`) + phrases avec qui parle — 9/11
- [x] A2. Validation du plan (`auto/monteur-ia/plan.ts`) + journal des corrections — 9/11
- [x] A3. `dossierDepuisAnalyse` : dossier construit depuis l'analyse du Best-of / Montage express (UI, sans écran) — 9/11
- [x] A4. Bouton « Envoyer au monteur IA » dans la revue : télécharge `dossier-monteur.json` — 9/11
- [x] A5. Bouton « Ouvrir un plan » : lit un `plan-monteur.json`, le valide, montre le journal — 9/11
- [x] A6. `appliquerPlan` (pur) : séquences → plans gardés, accroche (modèle « meilleur d'abord ») — 9/11 (`auto/monteur-ia/appliquer.ts`)
- [x] A7. `appliquerPlan` : effets zoom / texte / transition — 9/11
- [x] A8. `appliquerPlan` : bruitages, accents, mèmes, fonds verts (fichiers de Ma bibliothèque, copiés au moment de poser) — 9/11 (`poserEffetsBibliotheque`)
- [x] A9. Appliquer en UNE opération (un Annuler) + chaque élément retirable un par un (déjà vrai pour les calques) — 9/11 (monterExpress utilise le plan ; poserEffetsBibliotheque = 2e Annuler)
- [x] A10. Le « pourquoi » de chaque élément visible dans la revue (info-bulle) — 9/11 (Habiller → Sons : « Pourquoi le monteur IA a fait ces choix »)

## B. Mon Hub : le module « Monteur IA » (Flutter)
- [x] B1. Écran « Monteur IA » dans Mon Hub (`C:\dev\mon_hub\lib\modules\monteur_ia\` : écran + lecture du dossier + test `test/monteur_ia_dossier_test.dart`, déclaré dans catalogue.dart et registre.dart) — COMPILE et se lance sur Windows le 9/11 (après nuget + ATL installés)
- [x] B2a. Moteur choisi : **llamadart** (MIT, llama.cpp GGUF, Android + Windows + web, pub.dev, v0.16.x ; paquets `llamadart` + `llamadart_llama_cpp_flutter`) — 9/11
- [~] B2b. `llamadart: ^0.19.0` ajouté — pub get + build Windows OK le 9/11 ; reste : build Android, flutter test
- [~] B3. Modèles : PC = bartowski/Qwen2.5-7B-Instruct-GGUF Q4_K_M (4,7 Go), téléphone = Qwen/Qwen2.5-1.5B-Instruct-GGUF q4_k_m (1,1 Go), Apache 2.0 ; `MoteurMonteur.charger` (progression) — ÉCRIT 9/11, À VÉRIFIER
- [~] B4. `savoir_monteur.dart` (copie du savoir) + consignes (DA, durée, bibliothèque, retouches) + schéma JSON forcé (`createStructuredJson`) — ÉCRIT 9/11, À VÉRIFIER
- [~] B5. Écran : Préparer / Ouvrir un dossier / Créer le plan / Enregistrer le plan — ÉCRIT 9/11, À VÉRIFIER sur un vrai dossier
- [~] B6. `morceaux` (120 phrases), `assembler`, appel final (accroche, intro, titres, miniature) + tests `test/monteur_ia_consignes_test.dart` — ÉCRIT 9/11, À VÉRIFIER
- [ ] B7. Mesurer le temps sur PC et sur téléphone ; régler la taille du modèle

## C. Le lien direct Arko ↔ Mon Hub
- [~] C1. `serveur_monteur_io.dart` (127.0.0.1:47321, /etat, /plan, CORS + Private-Network, origines Arko seulement), démarré quand le modèle est prêt — ÉCRIT 9/11, À VÉRIFIER
- [x] C2. Arko : « Monteur IA : connecté / absent » ; envoi du dossier, réception du plan sans fichiers — 9/11 (client côté Arko : `verifierMonHub`, `demanderPlanMonHub`, protocole dans plan.md §8)
- [x] C3. Si Mon Hub est absent : Arko monte avec ses règles (comme aujourd'hui), sans erreur — 9/11

## D. Il s'améliore chaque jour
- [x] D1. À l'export : garder « proposé → ce que Romain a fait » comme exemple (sur l'appareil) — 9/11 (`exempleDe`, 20 derniers dans `arko.exemplesMonteur`, envoyés dans le dossier)
- [~] D2. `exemplesCourts` : les 5 dernières retouches dans chaque consigne — ÉCRIT 9/11, À VÉRIFIER
- [x] D3a. Arko utilise les titres, la miniature et l intro du plan (écran Miniature, panneau « Pourquoi ») — 9/11
- [~] D3b. Appel final (`schemaFinal`) : accroche, intro, 3 titres, miniature — ÉCRIT 9/11, À VÉRIFIER
- [ ] D4. Banc réel (passation générale §0.3) : note chaque version, on garde ce qui fait monter la note

## E. Règles d'Arko (sans IA) à finir en parallèle
- [x] E1. Goûts appliqués aux zooms et aux punchlines — 9/11 (`auto/apprentissage/appliquer-gouts.ts`)
- [x] E2. Goûts appliqués à la durée visée — 9/11 (analyse + montage express ; pas encore le Best-of v4)
- [x] E3. Apprendre des coupes (marges avant / après les mots) — 9/11 (marges apprises, appliquées aux jump cuts du Montage express)
- [x] E4a. `rythmeDe(recette)` : coupes, zooms, sons, mèmes, textes, transitions PAR MINUTE (pur) — 9/11 (`auto/apprentissage/rythme.ts`, + `densitesVers` pour E4c)
- [x] E4b. « Prendre ce projet comme modèle de rythme » (un de tes montages réussis) : rythme gardé sur l'appareil — 9/11 (bouton dans Exporter, après l export)
- [x] E4c. Au montage auto suivant : densités = rythme du modèle / rythme d'Arko (dans les goûts) — 9/11 (`rapprocherDuModele` dans ui/apprentissage.ts)

## Journal des essais
- 10/11, 1er essai réel (session CS de 40 min, 213 phrases) : plan avec 0 séquence / 0 effet (les morceaux
  dépassaient la mémoire par défaut de 4096 et l'erreur était avalée) et accroche INVENTÉE (« 100 jours ONE
  BLOCK », recopiée de l'exemple du savoir). Corrigé : `ModelParams(contextSize: 16384 / 8192)`, morceaux de
  80 / 45 phrases, bibliothèque 80 / 40 sons, erreurs montrées (`erreurs_monteur`), `momentsDuDossier` si les
  morceaux ne donnent rien, savoir sans exemple concret + « N'invente JAMAIS ». À retester.
- 10/11, 2e essai : plan sur le bon jeu (CS2) mais 35 min gardées sur 40 (visée 12), séquences de 6 min, 10 zooms à 0,25 s, 4 sons inventés, prénom « Guts » deviné (voix non nommées). Ajouté : `nettoyerPlan` (règles après le modèle) + consignes (noms, 15 à 90 s) + savoir sans prénoms. À retester.

## F. Retours sur la vidéo CS2 du 10/11 (« le montage est affreux »)
- [x] F1. Prises ratées : seule la DERNIÈRE prise d'une phrase redite (≤ 15 s, ≥ 3 mots, 70 % pareille) ou commencée
  puis reprise est gardée (`auto/coupes/prises.ts`, appliqué dans `nettoyer` et à la relecture des transcriptions
  gardées) — 10/11
- [x] F2. Accroche : une réaction humaine (cri, rire) avant un simple pic de son ; jamais les 90 premières s de la
  source sauf en dernier recours (express `meilleurMoment`, Best-of v4 `choisirAccroche`) — 10/11
- [x] F3. Persos 16:9 GRANDS comme dans les best-of YouTube (taille 0,42 de la hauteur, en bas dans les coins, x 0,13 / 0,87), demande de Romain — 10/11
- [x] F4. « Arko regarde l'image » (10/11) : CLIP ViT-B/32 vision quantifié (89 Mo, MIT, modèle « vision » du catalogue), une image clé / 3 s recadrée en 224, comparée à 10 phrases (auto/vision/phrases-vision.json). Interrupteur « Couper les menus et chargements » (réglages express) : le cocher télécharge le modèle. Worker arko-regard, résultat gardé (IndexedDB arko.regard.<emp>). Essai CS2 : 12/12 images de jeu gardées, 7/8 temps morts trouvés (le chargement de Nuke est encore raté).
- [x] F5. Zones mortes (≥ 2 images, ≥ 6 s, p(jeu) < 0,58) ajoutées aux passages muets (`vu`) : coupes v4, blancs, scènes, accroche les sautent ; pas de message « AFK » pour elles.
- [x] F6. Début : le bureau / lanceur au début est une zone morte qui commence à 0 → coupé par F5.
- [~] F7. Les effets (zooms v4, sons, punchlines) ne tombent plus dans les menus puisque ces plans n'existent plus. Reste à voir sur une vraie vidéo s'il faut en plus monter la dose sur cri / rire en jeu.
- [x] F8. Dossier : `zonesMortes` + phrases et réactions dedans retirées ; Mon Hub `nettoyerPlan` retaille les séquences qui y entrent (test Dart écrit, pas encore lancé).
