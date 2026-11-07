# Références pour le montage auto (best-of gaming) et petits modèles sur l'appareil

Écrit le 7/11/2026 par l'agent « références ». But : donner des règles chiffrées au « Best-of serré » d'Arko, et choisir
de petits modèles d'IA gratuits (ONNX, pour `onnxruntime-web`, déjà dans Arko) qui l'aident.
**La DA validée par Romain l'emporte toujours** sur ce qu'on trouve ailleurs. Quand une règle diffère de la DA, c'est écrit.

Ce document ne contient rien de la session de Romain (ni son, ni texte) : seulement des mesures (durées, niveaux, taux).

---

## En bref : les règles à adopter

| # | Règle | Valeur pour Arko | D'où ça vient | Par rapport à la DA |
|---|---|---|---|---|
| 1 | Marge autour d'un mot | 0,25 s avant, 0,35 s après | DA | = DA (les outils gardent moins : 0,01 à 0,25 s) |
| 2 | Fin de mot protégée par la VAD | si la VAD entend encore la voix (p > 0,35) au-delà du mot, prolonger jusqu'à la fin de la voix (+0,3 s au plus ; −0,2 s au plus avant) | Silero + DA | ajout (garde seulement un peu plus) |
| 3 | Point de coupe | jamais là où p > 0,35 ; au creux le plus calme (10 ms) à ±60 ms du point prévu ; fondus 20 / 40 ms | DA + Descript « Avoid harsh cuts » | = DA + précision |
| 4 | Blanc minimum coupé | 0,5 s (sinon on fusionne) | DA ; montage validé : 0 blanc coupé sous 0,5 s sur 208 | = DA (outils : 0,2 à 0,75 s) |
| 5 | Morceau minimum | 0,35 s | DA ; montage validé : plus court 0,70 s | = DA (à surveiller au banc, voir A3) |
| 6 | Rythme visé (mesure du banc) | morceau médian ≈ 2,8 s, ≈ 15 coupes / min, séquence médiane ≈ 48 s, ≈ 62 % du temps source gardé dans une séquence | montage validé | mesure, pas une règle de coupe |
| 7 | Réaction sans mots | « voix sans mots » (la VAD entend une voix, Whisper n'écrit rien) juste après une phrase gardée (≤ 2 s) = réaction probable : la garder avec les marges des mots | essai sur le vrai son | ajout (indice, à mesurer) |
| 8 | Zones de parole | Silero VAD v5 : entrée 0,5, sortie 0,35, parole ≥ 0,25 s, trous < 0,3 s bouchés | réglages officiels Silero (0,5 / 250 ms / 100 ms / 30 ms) | nouveau |
| 9 | Qui parle | morceaux d'environ 1,5 s (au moins 0,6 s) dans la parole ; niveau + empreinte CAM++ ; 2 groupes ; « 2 voix » si cosinus entre les 2 centres < 0,68 ou écart de niveau ≥ 6 dB | essai sur le vrai son | nouveau ; seuil 6 dB = Arko |
| 10 | Secours sans modèle | niveau seul (2 groupes sur le niveau, coupure au creux de l'histogramme) | essai : 95,0 % | = Arko actuel, mais sur les zones de la VAD |
| 11 | Zooms | ×1,32 sur cri / rire / explosion, ×1,12 un morceau sur trois ; viser au banc ≈ 35 % des morceaux en ×1,32, ≈ 23 % en ×1,12 | DA ; montage validé | = DA (FireCut : 2 à 4 zooms / min, ×1,2) |
| 12 | Punchlines | ≈ 3,3 par minute, 1,5 s en médiane, 2,5 s au plus | DA ; montage validé (54 en 16,5 min) | = DA |
| 13 | Sous-titres de la voix faible | ≈ 14 par minute, 1,1 s en médiane, 2,8 s au plus | DA ; montage validé | = DA |
| 14 | Titres de section | ≈ 1 toutes les 2 min, 2,2 s | DA ; montage validé (8 en 16,5 min) | = DA |
| 15 | Musique | −17 dB, baisse quand on parle (seuil 0,03, ratio 6, 20 / 400 ms), fondus 1,2 / 1,5 s, −14 LUFS ; un morceau par groupe de séquences (6 morceaux, 6 changements pour 19 séquences) ; accroche sans musique | DA ; montage validé | = DA (sources : 8 à 24 dB sous la voix selon le style) |
| 16 | Musique déjà dans le jeu | si CED-tiny dit « Music » > 0,5 pendant ≥ 10 s, baisser la musique d'Arko à cet endroit | essai | facultatif, à valider par Romain |
| 17 | Accroche | ~6 s, le meilleur moment, sans musique | DA | = DA |
| 18 | J-cut | pas d'office ; option : le son du morceau suivant arrive 3 images (0,1 s) avant son image, aux coupes d'une même scène | FireCut (1 à 10 images) | **pas dans la DA : à valider par Romain** |
| 19 | Revue « tout modifiable » | liste des coupes avec Écouter (2 s avant / après), garder / retirer d'un toucher, marge réglable après coup sans réanalyse, « Tout appliquer », un seul Annuler | Descript, TimeBolt, FireCut, Gling | = règles d'Arko |

---

## A. Références de montage

### A1. Best-of gaming français (Wankil Studio, Laink et Terracid, Squeezie…)
Ce qu'on trouve en public est surtout **qualitatif** ; aucune interview de monteur avec des chiffres (durée d'un plan,
coupes par minute) n'a été trouvée.
- **Wankil Studio** recrute ses monteurs sur des « maquettes » : un monteur reçoit des rushes et rend une vidéo test.
  Recrutement 2025 ouvert jusqu'au 28/02/2025 ([annonce Wankil Studio](https://x.com/WankilStudio/status/1882877834924003602)) ;
  Terracid dit avoir regardé « plus de 500 maquettes »
  ([message de Terracid](https://x.com/terracid/status/1903181210207101381)) ; le recrutement de 2022 a été fait en
  direct (VOD de 206 min, [fiche](https://www.thetvdb.com/series/wankil-studio-vod/episodes/9270789)). Des exemples de
  maquettes sont en ligne ([« La première maquette d'un monteur Wankil »](https://www.youtube.com/watch?v=mTIC3ZxcY0U),
  non lue ici : YouTube refuse la lecture automatique).
- **Squeezie** : une vidéo récente crédite 7 personnes en post-production (montage, étalonnage, 3D, effets)
  ([article](https://charles-edward.fr/squeezie-influenceurs-combien-monteurs/)) : c'est un travail d'équipe, pas
  seulement des coupes.
- Une mesure publique de rythme existe, mais **pas sur du gaming** : des documentaires YouTube narrés à 12,8 à 14,7
  coupes / min, plan médian 4,1 à 5,0 s, ouverture plus rapide (≈ 19 coupes / min la 1ʳᵉ minute)
  ([Umbrella Creators](https://umbrellacreators.com/blog/youtube-video-cut-pacing-data)).
- Des conseils de « rétention » (relance toutes les ~2 min, enjeu dans les 15 premières secondes) existent, mais sans
  méthode publiée ([AIR](https://air.io/en/youtube-hacks/advanced-retention-editing-cutting-patterns-that-keep-viewers-past-minute-8)).

**La meilleure référence chiffrée est donc le montage fait à la main que Romain a validé** (style Laink / Terracid /
Nosiaral, voir la DA). Mesures faites sur ses fichiers de rendu (temps seulement) :

| Mesure | Valeur |
|---|---|
| Durée finale | 16,5 min (990 s) pour une session dont le son dure ≈ 2 h |
| Morceaux (plans) | 243 ; durée médiane 2,78 s (10 % : 1,22 s ; 25 % : 1,88 s ; 75 % : 5,05 s ; 90 % : 7,66 s ; de 0,70 à 25,8 s) |
| Coupes par minute | 14,7 |
| Blanc retiré entre deux morceaux d'une même scène | médiane 2,0 s (25 % : 1,2 s ; 75 % : 3,8 s) ; aucun sous 0,5 s |
| Séquences | 19 (+ accroche de 6,0 s) ; durée médiane 48 s (3 à 115 s) ; dans une séquence, 62 % du temps source est gardé (médiane) |
| Zooms | ×1 : 42 % des morceaux (28 % du temps) ; ×1,12 : 23 % (17 %) ; ×1,32 : 35 % (55 %) |
| Punchlines | 54 (3,3 / min), 1,47 s en médiane, 2,5 s au plus |
| Sous-titres de la voix faible | 227 (13,8 / min), 1,06 s en médiane, 2,8 s au plus |
| Titres de section | 8 (0,5 / min), 2,2 s |
| Musique | 6 morceaux, 6 changements, aucune sur l'accroche |

À retenir : les **zooms ×1,32 sont bien plus fréquents** que « seulement sur les cris » (un morceau sur trois, plus de
la moitié du temps), et les **blancs retirés sont longs** (2 s en médiane) : on coupe les vrais temps morts, on ne
« hache » pas l'intérieur des phrases.

Ce qu'un best-of garde (DA + montage validé + ce qu'Arko fait déjà) : la **mise en place** (5 à 15 s avant le moment
fort, au début de la phrase), le **moment**, la **réaction** (rire, cri, silence choqué) et la **chute** (+1 s) ; un
**titre de section** quand l'histoire change ; l'**ordre chronologique** après une accroche. Ce qu'il coupe : les temps
morts, les phrases sans suite, les passages AFK.

### A2. Outils de montage automatique (pour les idées)

| Outil | Comment il trouve la parole / les blancs | Marges | Pas de coupe en plein mot | Qui parle | Comment on corrige |
|---|---|---|---|---|---|
| **auto-editor** (libre) | niveau = l'échantillon le plus fort de chaque tranche de temps ÷ le maximum ; seuil **0,04** ([doc `--edit`](https://auto-editor.com/ref/edit)) | `--margin` **0,2 s** (une ou deux valeurs : avant, après) ; `--smooth` : coupe ≥ **0,2 s**, morceau ≥ **0,1 s** ([options](https://auto-editor.com/ref/options)) | seulement par la marge | non | fichier de montage pour un éditeur |
| **TimeBolt** | seuil de niveau proposé tout seul, **−30 à −42 dB** | gauche **0,10 s** / droite **0,15 s** (vidéo écrite), **0,01** / **0,15** (vidéo libre) ; blanc coupé dès **0,2 s** (écrite) ; détections < **0,75 s** ignorées ([manuel](https://timebolt-assets.s3.us-east-1.amazonaws.com/TimeBolt_QuickStart_Manual.pdf)) | marge droite plus longue pour les consonnes finales | non | touche **O** (garder / retirer le morceau suivant), **U** (revenir 3 coupes en arrière), **S** (couper), coupes sauvées en JSON |
| **FireCut** | seuil **−30 dBFS** conseillé, choisi « entre les deux pics » de l'histogramme des niveaux | blanc ≥ **750 ms**, marges **250 / 250 ms** ([doc](https://learn.firecut.ai/features/remove-silences.md)) ; J-cut **1 à 10 images** ([doc](https://learn.firecut.ai/features/remove-silences/j-cuts)) | par les marges | non | liste des blancs, **X** pour en garder un, marge réglable après coup |
| **AutoCut** | seuil en dB (proposé), « couper les blancs plus longs que », « garder les sons plus longs que » | marges avant / après ; **0,3 à 0,5 s** conseillé pour un rythme YouTube ; préréglages Calm / Measured / Paced ([blog](https://www.autocut.com/en/blogs/autocut-silences-parameters/)) | fondu « Constant Power » | non | dans Premiere |
| **Descript** | la transcription (mots) ; « Shorten word gaps » : blancs « plus de » / « entre » X s ramenés à une durée (200 ms dans l'exemple) ([doc](https://help.descript.com/script-editing/shorten-word-gaps.md)) | — | « **Avoid harsh cuts** » : un « euh » qu'on ne peut pas retirer sans toucher les mots voisins est laissé ([doc](https://help.descript.com/script-editing/filler-words.md)) | détection auto (fichier de 10 s à 5 h), puis « Identify speakers » : un extrait par voix, on tape le nom ; nombre de voix demandé en mode manuel ([doc](https://help.descript.com/script-editing/speaker-detection)) | liste des « euh » avec l'heure, écoute, Supprimer / Remplacer par un blanc / Ignorer ; « Shorten » ou « Shorten all » |
| **Gling** | analyse les rushes parlés : blancs, « euh », mauvaises prises | non publiées | — | — | coupes **proposées**, on écoute et on « restaure la prise qu'on préfère » ([blog](https://gling.ai/blog/mastering-ai-video-editing-removing-unwanted-clips-and-silences)) |
| **AutoPod** | jump cuts par seuil en dB (20 à 60 dB selon le micro, d'après [Vidpros](https://vidpros.com/autopod-review-ai-editing-for-podcasts-worth-it/)) | — | — | **une piste audio par personne** : « une piste mixée ne marche pas » ; plans larges à régler ([InVideo](https://invideo.io/blog/ai-video-editor-vs-premiere-pro-plugins-multicam-podcasts/)) | à la main dans Premiere (trop ou trop peu de plans larges) |
| **Opus Clip** | choisit des extraits et leur donne un score **0 à 99** (accroche, enchaînement, valeur, tendance) ; extraits triés du meilleur au moins bon ([doc](https://help.opus.pro/docs/article/virality-score)) | — | — | — | on choisit parmi les extraits |
| **Recut** | aucune documentation publique trouvée sur ses réglages | — | — | — | — |
| **PNGTubers** (ex. Flood-Tuber) | la bouche s'ouvre « strictement » selon des seuils de volume ([forum OBS](https://obsproject.com/forum/threads/flood-tuber-native-pngtuber-plugin.193671/)) | — | — | — | — |

Leçons pour Arko :
- **Un seuil de niveau fixe ne marche pas pour une voix faible.** Le seuil d'auto-editor (0,04 de crête ≈ −28 dBFS) ou
  ceux de TimeBolt / FireCut (−30 à −42 dB) couperaient une bonne partie de la voix de Romain (≈ −40 dB, avec le jeu
  dessous). Il faut une **détection de la voix** (VAD), pas un seuil de volume.
- Le « choisir entre les deux pics de l'histogramme » de FireCut est exactement ce qu'il faut pour séparer deux voix par
  le niveau (−40 et −25 dB).
- Tous gardent **plus après qu'avant** (consonnes finales) : la DA (0,25 / 0,35 s) va dans le même sens, en plus large.
- **Qui parle sur une seule piste** : les outils pro ne le font pas (AutoPod exige une piste par micro) ou demandent de
  nommer chaque voix sur un extrait (Descript). Arko fait déjà les deux (pistes OBS séparées, écran « Qui parle ? »).
- La **revue** est toujours une liste : écouter, garder / retirer d'un toucher, tout appliquer, revenir en arrière.

### A3. Remarques sur les règles (complément du tableau « En bref »)
- **Règle 5 (morceau minimum)** : la DA dit 0,35 s ; dans le montage validé, aucun morceau ne fait moins de 0,70 s et
  10 % font moins de 1,22 s ; TimeBolt ignore tout ce qui fait moins de 0,75 s. On garde 0,35 s (DA). Si le banc trouve
  des morceaux isolés très courts qui « sautent », proposer à Romain : un morceau isolé < 0,7 s sans réaction forte est
  collé à son voisin ou retiré.
- **Règle 7 (voix sans mots)** : sur la session, la part des trames où la VAD entend une voix sans aucun mot de Whisper
  à ±0,3 s est de **33 %** dans les phrases où l'on rit, contre **17 %** dans les autres phrases et **8 %** sur toute la
  vidéo. C'est un indice (5 phrases de rire seulement dans la 1ʳᵉ tranche), à mesurer sur le banc réel avant d'en faire
  une règle forte.
- **Règle 15 (musique)** : les sources externes vont de 18 à 24 dB sous une narration
  ([OverseerOS](https://www.overseeros.com/blog/background-music-volume-under-voiceover)) à 8–12 dB sous la voix pour
  un contenu énergique ([AIR](https://air.io/en/youtube-hacks/advanced-retention-editing-cutting-patterns-that-keep-viewers-past-minute-8)) ;
  la DA (−17 dB puis baisse quand on parle) est entre les deux. On garde la DA.

---

## B. Petits modèles d'IA sur l'appareil

Tous ont été téléchargés depuis huggingface.co, lancés avec `onnxruntime-node` et avec `onnxruntime-web` (WASM, 1 fil,
dans Node), sur le vrai son de la session (1ʳᵉ tranche de 50 min, 16 kHz). La « vérité » vient du montage fait à la
main (qui parle, phrases, émotions, morceaux gardés). Machine : 2 cœurs partagés, 1 fil.

### B1. Ce qui est retenu

| Besoin | Modèle | Taille | 60 s de son, natif / WASM | Résultat sur le vrai son | Licence |
|---|---|---|---|---|---|
| Voix ou pas (VAD) | **Silero VAD v5** | 2,2 Mo | 0,3–0,5 s / 1,0–1,3 s | entend la voix faible de Romain (−40 dB) presque aussi bien que celle de Guts (−25 dB) : 68 % contre 73 % des trames de leurs mots | MIT |
| Qui parle | **CAM++ zh-en « common advanced »** (3D-Speaker) | 28,3 Mo | 2,8 s / 5,4 s | 2 groupes justes à 95,9 % (97,2 % sur la parole sûre) ; chaîne complète : **95,7 % du temps de parole** bien attribué | Apache 2.0 |
| Qui parle (2ᵉ choix) | TitaNet-S « optimized » (NeMo) | 23,8 Mo | 0,9 s / 4,2 s | 95,0 % ; chaîne complète 94,3 % ; aucun pré-traitement (mel dans le modèle) | Apache 2.0 |
| Musique / explosions (facultatif) | CED-tiny | 6,7 Mo | 0,8–1,3 s / 3,1 s | trouve un peu de musique et d'explosions, **mais aucun rire ni cri** de la session | Apache 2.0 |

Téléchargement une fois, après accord, gardé sur l'appareil (comme Whisper, ≈ 90 Mo) : VAD + CAM++ = **≈ 31 Mo**.

### B2. Détection de la voix : Silero VAD v5
- **Essai** (tout le son de la 1ʳᵉ tranche, trames de 32 ms, p > 0,5) :

| Zone | v5 | v6.2 |
|---|---|---|
| mots de Romain (≈ −40 dBFS) | 68,3 % | 78,0 % |
| mots de Guts (≈ −28 dBFS) | 73,1 % | 81,2 % |
| toutes les trames | 26,8 % | 32,0 % |

  Le taux n'est pas 100 % parce que les fenêtres des mots comprennent les petits blancs entre syllabes. La v6.2 trouve
  plus de mots de Romain mais se déclenche aussi plus ailleurs ; sans mots de référence fiables partout, on ne peut pas
  dire quelle part est une fausse alarme (rires, mots que Whisper rate, ou bruit du jeu). Les deux ont **la même entrée /
  sortie** : on peut passer de l'une à l'autre en changeant le fichier.
- **Entrées / sorties** : `input` float32 `[B, 576]` (64 derniers échantillons du morceau précédent + 512 nouveaux =
  32 ms à 16 kHz), `state` float32 `[2, B, 128]` (zéros au départ, puis la sortie `stateN`), `sr` int64 = 16000 →
  `output` `[B, 1]` (probabilité), `stateN`. On peut traiter **B bouts de la vidéo en même temps** (lot) : un peu plus
  rapide.
- **Réglages** (officiels) : entrée dans la parole à 0,5, sortie à 0,35, parole ≥ 250 ms, silence ≥ 100 ms, marge 30 ms.
- **Ce qu'on gagne** : (1) la voix faible est enfin trouvée sans Whisper ; (2) on ne lance Whisper que sur les zones
  de parole (29 % de la 1ʳᵉ tranche) : Arko colle déjà des morceaux dans une fenêtre de Whisper, la VAD dit lesquels ;
  (3) les coupes évitent les zones où la voix continue (règles 2 et 3) ; (4) « qui parle » ne regarde que la parole.

### B3. Qui parle : empreinte de voix
- **Essai 1** (morceaux de 1,5 s pris dans les phrases sûres : 70 de Romain, 152 de Guts) : empreintes, puis 2 groupes
  (k-moyennes au cosinus), sans regarder la vérité.

| Méthode | Taille | 2 groupes justes | séparation (AUC) | avec la VAD (143 morceaux) |
|---|---|---|---|---|
| niveau seul (sans IA) | — | 92,8 % | — | 95,1 % |
| timbre classique (moyenne des mel, sans IA) | — | 65,3 % | 0,71 | — |
| **CAM++ zh-en** (3D-Speaker) | 28,3 Mo | **95,9 %** | **0,865** | **97,2 %** |
| TitaNet-S | 23,8 Mo | 95,0 % | 0,868 | 95,1 % (AUC 0,894) |
| ECAPA 512 (WeSpeaker) | 24,9 Mo | 94,6 % | 0,804 | 96,5 % |
| CAM++ VoxCeleb (WeSpeaker / 3D-Speaker) | 29 Mo | 94,1–94,6 % | 0,79–0,81 | 95,8–97,2 % |
| ResNet34 (WeSpeaker, avec / sans « LM », int8) | 6,7–26,5 Mo | 93,7–94,6 % | 0,79–0,82 | 95,8–97,2 % |
| ERes2Net VoxCeleb (3D-Speaker) | 26,5 Mo | 95,0 % | 0,785 | 97,2 % |

  Les groupes suivent bien le niveau (≈ −36 dB et ≈ −23 dB), alors que l'empreinte **ne voit pas le volume** (chaque
  bande est recentrée) : elle sépare vraiment les deux voix. Dans la **zone ambiguë** (−32 à −26 dB, 17 morceaux), le
  niveau seul tombe à 53 % et les empreintes restent à 94–100 %.
- **Essai 2** (chaîne complète, sans vérité) : VAD → 566 zones de parole (875 s sur 3000 s) → 633 morceaux d'environ
  1,5 s (au moins 0,6 s) → 2 groupes. Temps des mots de la vérité attribué comme la vérité : niveau seul **95,0 %**, CAM++ **95,7 %**
  (Romain 97,2 %, Guts 95,0 %), TitaNet 94,3 %. La cible du brief (≥ 90 %) est atteinte.
- **Une voix ou deux ?** Cosinus entre les 2 centres des groupes : 0,76–0,82 quand il n'y a qu'une voix (Guts seul,
  Romain seul), 0,53–0,54 avec les deux. Règle : **2 voix si cosinus < 0,68**, ou si les niveaux diffèrent de ≥ 6 dB.
- **Pourquoi CAM++ zh-en** : le meilleur sur les 2 groupes, licence Apache 2.0 claire (ModelScope), fichier stable depuis
  2024 chez le mainteneur de sherpa-onnx ; TitaNet-S est plus rapide et sans pré-traitement, mais vient d'un ré-export
  publié par une seule personne il y a deux jours (on peut le garder en 2ᵉ choix, avec une empreinte SHA-256 figée).
- **Écartés** : WeSpeaker (licence **CC BY 4.0** héritée de VoxCeleb : « les modèles héritent de la licence de leurs
  données », [Praat](https://www.fon.hum.uva.nl/praat/manual/VoxCeleb_CC-BY-4_0_license.html) ; et la version int8 est
  très lente : 700 ms par morceau) ; ERes2Net (plus lent, pas meilleur) ; TitaNet-S d'origine (40 Mo, au-dessus de 30 Mo).
- **Entrée / sortie CAM++** : `x` float32 `[N, T, 80]` (fbank 80, voir B6) → `embedding` `[N, 192]` ; normer, cosinus.
- **Coût sur téléphone** : 5,4 s de calcul WASM par minute de parole sur cette machine. Pour 2 h de session (≈ 35 min
  de parole), tout calculer prendrait ≈ 3 min ici, sans doute 2 à 3 fois plus sur un téléphone moyen (**estimation, pas
  mesuré**). Conseil : le niveau d'abord ; l'empreinte seulement sur ≈ 150 morceaux tirés sur toute la vidéo (pour
  décider « 1 ou 2 voix » et trouver les 2 centres) + les morceaux au niveau ambigu (±4 dB du seuil) : ≈ 30 s.

### B4. Rires, cris, sons forts, musique
- **CED-tiny** (6,7 Mo, Apache 2.0) et **YAMNet** (15 Mo) ont été passés sur les 100 premières minutes de la session
  (fenêtres de 2 s pour CED, 0,96 s pour YAMNet).
- **Rires** : 9 phrases où l'on rit dans la vérité ; au seuil 0,2, **0 sur 9** trouvée par l'un ou l'autre. **Cris** :
  20 phrases « crie / hurle / panique » ; aucun score au-dessus de 0,1. Ces modèles, appris sur AudioSet (YouTube), ne
  reconnaissent pas des rires courts, mêlés à la parole, compressés par Discord et couverts par le jeu.
- **Musique / explosions** : quelques passages trouvés (musique > 0,5 sur 0,1 % des fenêtres ; explosions jusqu'à 0,73
  avec YAMNet), sans vérité pour juger.
- **Whisper n'écrit pas les rires** (0 « ha / mdr » sur les 5 phrases de rire de la 1ʳᵉ tranche).
- **Conclusion** : pas de modèle de sons pour les rires. Garder les règles d'Arko (pic de son, rire dans le texte) et
  ajouter l'indice « voix sans mots » de la VAD (règle 7). CED-tiny reste une option légère pour « il y a déjà de la
  musique dans le jeu » (règle 16).
- **YAMNet écarté** : le seul ONNX trouvé est un fichier compilé de Qualcomm AI Hub (même empreinte SHA-256 que leur
  export), re-publié ailleurs sous une autre licence ; la licence n'est pas claire.

### B5. Licences et adresses stables (révision figée + SHA-256 à vérifier après téléchargement)

| Modèle | Adresse | Octets | SHA-256 | Licence du modèle | Données |
|---|---|---|---|---|---|
| Silero VAD v5 | `https://huggingface.co/onnx-community/silero-vad/resolve/e71cae966052b992a7eca6b17738916ce0eca4ec/onnx/model.onnx` | 2 243 022 | `a4a068cd…5808` | MIT ([Silero](https://pypi.org/project/silero-vad/)) | non publiées par Silero |
| Silero VAD v6.2 (option) | `https://huggingface.co/istupakov/silero-vad-onnx/resolve/b3e3ee3cce4c11ceb63b1a0b229d916069c1ddf6/silero_vad.onnx` | 2 327 524 | `1a153a22…88e3` (= fichier officiel PyPI 6.2.0) | MIT | — |
| CAM++ zh-en | `https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/0743f301363dec56491a490f6d6cbc9d67f9a3bf/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | 28 281 164 | `aa3cfc16…eba2` | Apache 2.0 ([ModelScope](https://www.modelscope.cn/models/iic/speech_campplus_sv_zh_en_16k-common_advanced/summary)) | grand jeu chinois-anglais (3D-Speaker) |
| TitaNet-S (option) | `https://huggingface.co/notaneimu/titanet-s-optimized-onnx/resolve/283246c06875a204ea6cc47d39576a4c090bbe75/titanet-s-optimized.onnx` | 23 844 247 | `19f02695…e985` | Apache 2.0 (licence NeMo, [fiche NGC](https://catalog.ngc.nvidia.com/orgs/nvidia/nemo/models/titanet_small/-)) | VoxCeleb, Fisher, Switchboard, LibriSpeech |
| CED-tiny (option) | `https://huggingface.co/mispeech/ced-tiny/resolve/ace276d29dd0bb3f3517b0fa8cf300738c409019/model.onnx` | 6 681 767 | `3890f227…3435` | Apache 2.0 ([fiche](https://huggingface.co/mispeech/ced-tiny)) | AudioSet |

Empreintes complètes : voir le LISEZ-MOI des modèles (hors dépôt) ou les recalculer. Les deux miroirs (onnx-community,
csukuangfj) sont ceux de transformers.js et de sherpa-onnx. Comme pour Whisper : adresse sur huggingface.co seulement,
téléchargement après accord, Cache Storage, vérifier la taille (et si possible le SHA-256).
**Crédits** à ajouter dans `CREDITS.md` si on les intègre : Silero (MIT), 3D-Speaker / ModelScope (Apache 2.0),
NVIDIA NeMo (Apache 2.0) si TitaNet, CED (Apache 2.0) si CED-tiny.

### B6. Pré-traitement à écrire en TypeScript : fbank 80 « Kaldi » (pour CAM++)
Une version en JS simple a été vérifiée contre `kaldi-native-fbank` (écart maximal 8·10⁻⁵ sur 3 s du vrai son).
Pour chaque trame :
1. trames de 400 échantillons (25 ms), pas de 160 (10 ms), seulement les trames entières ;
2. retirer la moyenne de la trame ;
3. pré-accentuation : `y[i] = x[i] − 0,97·x[i−1]`, et `y[0] = x[0] − 0,97·x[0]` ;
4. fenêtre « povey » : `(0,5 − 0,5·cos(2π·i / 399))^0,85` (WeSpeaker utiliserait « hamming ») ;
5. compléter à 512 avec des zéros, FFT, puissance `|X|²` des cases 0 à 255 (la case 256 est ignorée) ;
6. 80 filtres triangulaires en échelle mel `1127·ln(1 + f / 700)`, de 20 Hz à 8000 Hz (case k = 31,25·k Hz) ;
7. `log(max(énergie, 1,19·10⁻⁷))` ;
8. sur tout le morceau, retirer à chaque bande sa moyenne.
Le son entre tel quel (entre −1 et 1). Un morceau de 1,5 s donne 148 trames : entrée `[1, 148, 80]`. Coût en JS :
≈ 10 ms par morceau.

### B7. Mémoire (WASM, Node, après chargement et un calcul)
Silero ≈ 165 Mo (surtout le moteur WASM lui-même), CAM++ ≈ 300 Mo, TitaNet ≈ 260 Mo, CED-tiny ≈ 210 Mo. Charger un
modèle à la fois dans le Worker, et le libérer (`release()`) avant le suivant.
