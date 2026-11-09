# Monteur IA local : module complet de Mon Hub (plan, 9/11/2026)

Choix de Romain : l'IA de montage est un **module complet de Mon Hub** (natif, plus rapide qu'un site), pas une
option d'Arko. But : « un vrai monteur », qui sait tout ce qu'un monteur doit savoir, avec de la créativité
mesurée, et qui s'améliore chaque jour.

## 1. Qui fait quoi
- **Arko (site)** reste l'atelier : il analyse la vidéo (voix, mots, rires, cris, scènes) et rend le montage. Il ne
  pense pas : il prépare le DOSSIER et applique le PLAN.
- **Le monteur IA (Mon Hub)** pense : il lit le dossier, décide le montage (accroche, séquences, coupes, effets,
  sons, mèmes, textes, intro « concept », titre, miniature) et renvoie un PLAN en JSON.
- **Les règles d'Arko** (sans IA, déjà codées) restent le filet de sécurité : si Mon Hub n'est pas lancé, Arko
  monte seul comme aujourd'hui.

## 2. Le dossier (Arko → Mon Hub), petit et sans images
JSON : durée, phrases (texte, début, fin, qui parle, émotion, force du son), rires, cris, pics, silences, scènes
candidates avec leurs notes, bibliothèque (noms + durées + rayon des sons, mèmes, fonds verts, musiques), goûts
appris (`auto/apprentissage/gouts.ts`), DA choisie (YouTube / TikTok), durée visée. Pour 2 h de session : environ
400 phrases, soit 30 à 60 Ko de texte.

## 3. Le plan (Mon Hub → Arko)
JSON validé par Arko (schéma strict, valeurs bornées ; un plan faux est corrigé ou refusé, jamais appliqué tel
quel) :
- `accroche` : de, a, texte ;
- `intro` : texte d'intro « concept » (1 à 2 phrases, à lire par Romain ou en carton) ;
- `sequences` : liste ordonnée {de, a, titre, pourquoi} ;
- `effets` : {t, type: zoom | bruitage | accent | meme | fondVert | texte | transition, quoi (nom du fichier de la
  bibliothèque ou réglage), pourquoi} ;
- `musique` : morceau par groupe de séquences ;
- `titre_video` : 3 propositions ; `miniature` : texte, émotion des persos, image (temps).
Chaque élément porte un `pourquoi` en une phrase, montré dans la revue : tout reste modifiable un par un dans
Arko, comme aujourd'hui.

## 4. Le lien Arko ↔ Mon Hub
- Sur PC : Mon Hub ouvre un petit serveur LOCAL (http://127.0.0.1:port, accepté seulement depuis
  arko-video.github.io et localhost) ; Arko envoie le dossier et reçoit le plan. Rien ne sort de l'appareil.
- Sur téléphone : même chose si les deux tournent sur le même appareil ; sinon, échange par fichier
  (« Envoyer à Mon Hub » / « Ouvrir le plan »).
- Arko demande la permission une fois et montre « Monteur IA : connecté » ou « absent (règles d'Arko) ».

## 5. Le modèle
- Moteur : llama.cpp (paquet Flutter natif, Windows et Android), modèle GGUF quantifié, gratuit et libre de
  licence (à vérifier au moment de choisir : famille Qwen ou équivalent, 3 à 8 milliards de paramètres sur PC,
  1,5 à 3 sur téléphone). Téléchargé une fois par Mon Hub, gardé sur l'appareil.
- Sortie forcée en JSON (grammaire GBNF de llama.cpp) : le modèle ne peut pas écrire autre chose que le plan.
- Le « savoir du monteur » (savoir-du-monteur.md) est son instruction de départ ; la DA de Romain et ses goûts
  appris sont ajoutés à chaque montage.
- Créativité : température basse (0,3 à 0,5) et règle « 1 idée surprenante par 3 minutes au plus ».

## 6. Comment il s'améliore chaque jour
1. À chaque export, Arko compare le plan à la version finale (déjà codé : gouts.ts) et garde les DIFFÉRENCES
   comme exemples (« proposé : X ; Romain a fait : Y »).
2. Les meilleurs exemples (sur l'appareil) sont ajoutés au début de l'instruction du modèle (apprentissage par
   l'exemple, sans réentraîner le modèle).
3. Plus tard, si besoin : petit réentraînement LoRA sur PC avec ces exemples (gratuit, local).
4. Le banc réel (passation générale §0.3) note chaque version : on ne garde une amélioration que si les notes
   montent.

## 7. Étapes (une par session)
1. Format du dossier et du plan + validation dans Arko (pur, testé) ; export du dossier (bouton dans la revue).
2. Module Mon Hub : écran « Monteur IA », téléchargement du modèle, llama.cpp, grammaire JSON, test sur un dossier.
3. Serveur local + connexion depuis Arko ; appliquer un plan (en UNE opération, un Annuler).
4. Exemples appris (étape 6) ; intro « concept », titres, miniature par l'IA.
5. Banc réel + réglages jusqu'à battre le montage fait à la main.

## 8. Protocole du lien direct (Arko le parle déjà, côté Mon Hub à faire en C1)
- Adresse : `http://127.0.0.1:47321` (constante `MON_HUB` dans `src/ui/auto/express/monteur-ia.ts`).
- `GET /etat` → `200 {"monteur": true, "modele": "<nom>"}` (Arko attend 1,5 s au plus).
- `POST /plan` avec le dossier (JSON, `src/auto/monteur-ia/dossier.ts`) → `200` + le plan (JSON,
  `src/auto/monteur-ia/plan.ts` ; Arko le valide et corrige). Arko attend 15 min au plus.
- En-têtes à renvoyer (le site est en HTTPS, Mon Hub en local) : `Access-Control-Allow-Origin:
  https://arko-video.github.io` (et `http://localhost:5173` pour le dev), `Access-Control-Allow-Headers:
  Content-Type`, `Access-Control-Allow-Private-Network: true` (préflight OPTIONS de Chrome).
- N'écouter QUE sur 127.0.0.1 ; refuser toute autre origine.
