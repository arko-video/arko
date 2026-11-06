# Arko — Décisions des phases 2 à 6 (après la revue de l'équipe)

4 novembre 2026, 0 h 30. Les décisions ci-dessous complètent `phases-2-6.md` et l'emportent en cas de conflit. Elles s'appuient sur la critique UX et la critique technique. Romain dort : les questions ouvertes sont tranchées ici.

## Parcours et Habiller
- **Parcours** : Importer → Couper → Vertical → Habiller → Exporter (« Étape x sur 5 »).
- **Barre d'outils de Habiller** :
  - phase 2 : **Accroche**, Texte, Sous-titres
  - phase 3 : Sons, Transitions, Zoom
  - phase 4 : Combos, Modèles
- **Son guide** : il va dans **Couper**, avec l'aimant au rythme (c'est là qu'on coupe). Il ne va pas dans Habiller.
- **Clavier ouvert** : le panneau du bas se réduit au seul champ de saisie, pour que l'aperçu reste visible.
- **Mini-frise de Habiller** : elle ne montre que les calques de l'outil ouvert. Elle garde le zoom et les boutons ±1 image.
- **Zone sûre** : elle s'affiche **automatiquement pendant qu'on fait glisser un texte**. Une petite icône dans le coin de l'aperçu permet aussi de l'afficher à la main.

## Phase 2
- **Accroche** (premier outil) :
  - texte de 0 à 2,5 s, style `accroche`, **entièrement visible dès la 1ʳᵉ image** (pas d'entrée « pop » à t = 0, l'animation commence à l'échelle 1)
  - environ 20 suggestions gaming à toucher, par exemple « 1v4 avec 8 PV », « Il ne s'attendait pas à ça », « Attends la fin… »
- **Polices** :
  - un seul module `moteur/polices.ts` charge les mêmes woff2 avec `new FontFace`, dans la page et dans le Worker
  - on ajoute Inter 700 et 800
  - la mise en page des textes est calculée à 1080 px, puis on applique `ctx.scale(echelle)`
- **Émoji** dans un texte : on prévient « Les émojis ne s'affichent pas encore dans la vidéo » et on les retire au dessin.
- **Sous-titres, hauteur par défaut selon la mise en page** (`ySousTitres(mise)` dans `defauts.ts`) :
  - fond flou : 0,68, juste sous la vidéo
  - plein écran : 0,60
  - jeu + webcam : sur la **jointure** entre les deux bandes
  - le normaliseur les garde entre 0,15 et 0,72
- **Whisper** :
  - API : `pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', { device: 'wasm', dtype: 'q8' })`, puis `asr(pcm16k, { language: 'fr', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })`
  - on découpe en fenêtres de 28 s au plus, avec une table des décalages
  - l'annulation se fait par `terminate()` du Worker, et le Worker est aussi fermé à la fin
  - le WASM d'onnxruntime-web est **inclus dans l'appli** (`public/ort/`, `wasmPaths` en objet), avec `numThreads = 1`
  - versions figées : `@huggingface/transformers` 4.3.2 et la version d'onnxruntime-web qu'il demande
  - à annoncer : « environ 90 Mo, une seule fois », avec un appel à `navigator.storage.persist()`
  - pas de WebGPU
- **Hallucinations de Whisper** : on filtre les phrases connues (« Amara.org », « Sous-titrage … », « Merci d'avoir regardé ») quand le son est faible, ainsi que les répétitions.
- **Corrections mémorisées** (pseudos, noms de jeux) :
  - stockées dans `localStorage` (`arko.corrections`)
  - appliquées aux transcriptions suivantes
  - une correction peut s'appliquer à tous les mots identiques
- **Test des sous-titres** :
  - un petit WAV en français fabriqué une fois dans la VM, placé dans `tests/fixtures/`
  - le modèle est téléchargé dans `tests/fixtures/modeles/` (hors Git) et servi par `page.route` dans l'e2e

## Phase 3
- **Sons synthétisés** :
  - **20 sons soignés** plutôt que 30 :
    - impact : boom, meme, claque, bass-drop
    - whoosh : rapide, montant
    - meme : klaxon, disque-raye, tape-stop, photo
    - comedie : trombone-triste, criquets, ba-dum-tss
    - interface : ding, erreur
    - tension : riser, coeur
    - jeu : piece, degat, bonus
  - chaque son est une fonction pure et déterministe, avec un cache mono `id@version` et des filtres biquad et une réverbération en JS
  - on peut aussi **importer un son** ou **enregistrer au micro** (MediaRecorder)
- **Transitions** :
  - `etatImage` signale la transition dès t ≥ t1 − dur/2 du plan précédent ; chaque moitié est limitée à la moitié du plan
  - zoom, glisse et secousse se dessinent **avant** la mise en page ; flash, noir et glitch **après**
  - flou de mouvement : 5 dessins avec `globalAlpha`, jamais de `getImageData`
  - alias `whoosh` → `glisse`, et `fondu` → `noir`
- **Zoom** : nouveau champ `zoom.zone?: 'tout' | 'cam' | 'jeu'`. En jeu + webcam, la valeur par défaut est `cam`.
- **Son guide** :
  - on retire le réglage `t` de l'interface (le champ reste à 0)
  - on garde `debut`
  - après l'export, un rappel : « Dans TikTok, démarre le son à 0:12 »

## Phase 4
- **Combos en un toucher**, posés pendant la lecture (on recule de 0,15 s et on s'aimante au pic sonore le plus proche) :
  - **Boom** : zoom punch + impact.meme
  - **Figé** : arrêt sur image 1 s + disque-raye
  - **Raté** : ralenti 0,5 sur 1,5 s + trombone-triste
- **Arrêt sur image `plan.fige`** :
  - on regroupe d'abord le calcul de durée dans une seule fonction `dureePlan(p)`, qui est aujourd'hui copié dans chronologie, operations et normaliser
  - on ajoute `PlanPlace.tFige`
  - pendant l'arrêt, `ts = a − 0,001`
  - le mixeur s'arrête à `tFige`
- **Modèles** :
  - **Top 3** : demande au moins 3 plans. Sinon le bouton est grisé avec une explication. Il ne supprime jamais rien sans prévenir.
  - **Le meilleur d'abord** : les 1,5 s du plan sélectionné, ou du pic le plus fort, sont copiées au début, avec le texte « ATTENDS… » et une transition glitch.
  - ~~Réaction~~ retiré (doublon).
- **Alerte de rythme** : elle compte aussi les pics sonores. **Un seul repère**, sur le pire passage.
- **Mes montages** : plusieurs projets, comme prévu.
- ~~Couper les blancs~~ **repoussé** : le son du jeu n'est jamais muet. Il faudra le refaire plus tard en « temps morts » (son de la voix + image).

## Phase 5
- Comme prévu : aide, `CONTRIBUTING`, `CREDITS`, `SECURITY`, et le module Mon Hub en code Dart prêt à copier.
- **Origine partagée** : sur `<compte>.github.io`, toutes les pages du compte partagent le même stockage. Il faut conseiller à Romain de créer une **organisation GitHub gratuite dédiée** (par exemple `arko-video`), pour qu'Arko ait sa propre origine. C'est gratuit et sans nom de domaine. À mettre dans la passation.

## Phase 6
- **Ordre du parcours** : **Demande → Analyse → Revue**. On règle tout, on lance, puis on revient aux brouillons finis.
- **Analyse** :
  - enveloppe sonore au pas de **20 ms**
  - images clés seulement (`getNextKeyPacket({ metadataOnly: true })`, puis `samplesAtTimestamps`)
  - **40 candidats**, chacun transcrit sur ±6 s au plus
  - Wake Lock, et des points de reprise dans IndexedDB : on peut reprendre une analyse interrompue
- **Le mode sans IA est le mode par défaut.**
- **Avec l'IA** :
  - 3 fournisseurs : Anthropic, OpenAI, Gemini
  - « Tester ma clé », un coût expliqué en mots simples et « Voir ce qui est envoyé »
  - en-têtes Anthropic : `anthropic-dangerous-direct-browser-access: true` et `anthropic-version: 2023-06-01`
  - réponse demandée : `{"recettes":[…]}`
  - pas d'adresse personnalisée ni de LM Studio : le contenu mixte serait bloqué
  - CSP `connect-src` : 'self', les domaines Hugging Face et ceux des 3 API
- **La clé reste dans Arko, sur l'appareil.** Le lien avec la clé du collègue IA de Mon Hub viendra plus tard.
- **Revue** :
  - en plein écran et en boucle : on balaie pour garder ou jeter, avec la raison affichée et sans score
  - les gardés vont dans **Mes montages**, et on les exporte un par un à la demande
  - pas d'envoi de plusieurs fichiers d'un coup vers TikTok : il risquerait de les fusionner

## Mises à jour après la QA de la phase 2 (4/11, 1 h 10)
- **Sous-titres sur fond flou** : y = **0,66** au lieu de 0,68, au ras du bas de la vidéo. Un avertissement apparaît si une ligne descend sous 0,72 (zone cachée par la description TikTok). **À juger par Romain sur une vraie vidéo.**
- Les **textes** gardent leur **boîte entière** dans la zone sûre, pas seulement leur centre. S'il le faut, ils sont remontés au dessin.
- Nouveau champ facultatif `Texte.role: 'accroche'`, pour reconnaître l'accroche sans deviner.
- **Cadre webcam par défaut** : en bas à gauche (x 0,02 ; y 0,62 ; l 0,26 ; h 0,34).
- **Corrections des sous-titres** :
  - deux choix séparés : « tous les mots identiques de cette vidéo » et « retenir pour mes prochaines vidéos »
  - une liste « Mots retenus » permet d'en oublier

## Montage auto (6/11/2026, intégrateur, après le premier retour de Romain)
- **Bruitages auto** : décochés d'office (Montage express) ; mode prudent par défaut : posés sur la réaction (après la
  phrase ou au rire / cri qui suit), jamais sur la parole, seulement les déclencheurs très sûrs, 1 toutes les 2 min ;
  écoute dans la vidéo (2 s avant, 2 s après) et case « Garder » décochée : rien n'est posé sans validation.
- **Punchlines** : calées sur les mots (début du 1er mot, fin du dernier + 0,2 s), 2,5 s au plus (sinon 2 lignes).
- **Montage express** : un NOUVEAU montage « Montage express — <nom> », construit en une seule opération (un Annuler).
  Ordre : A → D → B → (E) → C → accroche 6 s → chapitres → G → F ; l'accroche passe avant les chapitres, les titres et
  la musique (en temps de sortie), qui n'ont donc rien à recaler.
- **Sous-titres** : réutilisent la transcription déjà gardée (Couper les blancs, Montage express).
- **Textes** : espace insécable avant « : » partout, y compris « Volume : … » (le test figé suit la règle).
