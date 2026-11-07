# Banc réel (hors `npm test`)

Fait passer la **vraie session de Romain** (3 h 20, son jusqu'à ≈ 2 h 03, plus ≈ 3 min vers 2 h 46) dans la chaîne
« Montage express → style **Best-of serré**, SANS IA » d'Arko, **dans Node**, puis la mesure contre le montage fait à
la main (la vérité, `verite/verite.json`, mesures de l'agent banc-verite dans `mesures/`).

Le banc n'est **jamais** lancé par `npm test` (Vitest ne prend que `src/**/*.test.ts`) : il lui faut ffmpeg, le
modèle Whisper et les données privées, qui ne sont pas dans le dépôt.

## Lancer

```sh
npm run banc-reel                         # les 2 modes (mots, voix) depuis les caches + mesures (≈ 10 à 20 s)
npm run banc-reel -- --mode voix          # un seul mode : mots (Transcrire les voix coché) ou voix (décoché)
npm run banc-reel -- --etape scenes       # s'arrêter avant le montage (voix | scenes | coupes = tout, défaut)
npm run banc-reel -- --plage 0-1800       # seulement cette partie (temps source, s) ; durée visée au prorata
npm run banc-reel -- --duree 15-20        # autre durée visée (minutes)
npm run banc-reel -- --musique son.mp3    # donner une musique (cochée dans Mes sons) ; défaut : aucune (comme Romain)
npm run banc-reel -- --whisper-strict     # une erreur de transformers.js arrête l'analyse, comme dans l'appli
```

Il faut Node ≥ 22.18 (il lit le TypeScript tout seul) : `lancer.ts` démarre Vite en mode serveur pour importer
`src/` exactement comme l'appli le compile (imports sans extension, `import.meta.env`).

Sorties (hors dépôt) : `/home/claude/banc-cache/sortie/<mode>/` : `recette.json` (la recette rendue par
`construireBestOf`), `analyse.json` (`parole`, `mots`, `scenes`, `voix`, `passages`, `avertissements`),
`activite.json` (`{ pas: 0.02, db }` : énergie de la voix 300–3400 Hz en dBFS, temps source, toute la session),
`banc.json` (réglages, mode, plage, résumé chiffré, journal des adaptateurs). Résultats des mesures :
`/home/claude/banc-cache/resultats/<date>.json`.

## Chaîne v4 (vague 2) : `--v4`

```sh
nice -n 10 npm run banc-reel -- --v4 --seul <étape> [--mode mots|voix] [--plage 0-3000] [--etape <étape>]
nice -n 10 npm run banc-reel -- --v4                          # toute la v4, 2 modes (≈ 12 s avec les mesures)
nice -n 10 npm run banc-reel -- --v4 --ancien voix,coupes     # tout v4 sauf ces étapes
nice -n 10 npm run banc-reel -- --v4 --ancien tout --reglages avant --mode voix   # le Best-of d'avant : 6 / 19
```
Étapes : `parole, mots, voix, moments, coupes, sequences, habillage, persos` (+ `musique` pour `--etape`).
`--modules whisper,vad` (présents, les autres absents) ou `whisper=refuse,vad=horsLigne,empreinte=absent` ;
`--empreinte forcee` (= le modèle CAM++ est « présent » sur l'appareil) ; `--vad appli|saut|continu` ;
`--sans-injection` ; `--nom <dossier>` ; `--whisper-strict`.
Chemin = celui de l'appli, sans rien recopier de l'interface : `mesurerPourBestOf` (faux Workers) → `analyserChaine`
→ `revueParDefaut` → `dureeEstimee` → `recetteDeDepart` → `monterSansMusique` → musique auto (fonctions pures de
`auto/son/musique-auto.ts`, morceaux de `public/musiques/kevin-macleod/`, sinon musique fabriquée) → `poserMusique`
(`chaine/chaine-v4.ts`, `chaine/lancer-v4.ts`). Sorties : `banc-cache/sortie/v4/<combinaison>/<mode>/` (un dossier
par combinaison d'options). `banc.json` → `temps` : chaîne pure, durée annoncée, montage, et l'écart durée annoncée /
durée montée. Mesures par étape : `mesures/etapes.ts` (pur, testé).
- **VAD + hauteur (intégrateur, 7/11 au soir)** : d'office `--vad appli` = le flux EXACT du Worker « Qui parle » de
  l'appli (`son-48k.f32` par morceaux de 1024 → `Vers16k` → `MoteurVad` aux réglages d'office → `FileSon16k` →
  `AccumulateurHauteur`), avec le modèle rangé dans l'appli (`public/modeles/silero-vad-v5.onnx`), sur
  onnxruntime-node 1 fil : `banc-cache/vad-appli.u8` + `hauteur-appli.f32` + `vad-appli.json` (`npm run banc-reel --
  vad --variante appli [--refaire]`, ≈ 100 s ; identique à 0 / 255 près au fichier de dev-vad). Servies par le faux
  Worker quand la passe du son les demande. `--vad saut|continu` : les anciens caches (règle −60 dBFS / toutes les
  trames, sans hauteur). `vad-v5-continu.u8` reste la référence « pleine parole » des mesures d'étape.
- **Whisper** : mots gardés (`mots-arko.json`), servis pour les zones demandées, sans refaire Whisper. La commande
  `transcrire` passe par `ecouterPlages` de l'appli (`src/sous-titres/ecoute.ts`) + `reparerDecodageVide` : la tranche
  6900–7200 s a été refaite ainsi (625 mots bruts, plus d'erreur) : `--whisper-strict` passe.
- **Empreinte CAM++** : le faux Worker `worker-empreintes.ts` lit les morceaux comme le Worker (48 kHz → `Vers16k`) et
  calcule avec `calculerEmpreintes` + `fbank80` de dev-voix sur onnxruntime-node
  (`/home/claude/modeles/3dspeaker-campplus-zh-en/model.onnx`, `BANC_MODELE_EMPREINTE`), ≈ 8 s pour 300 morceaux.
- **Coupes « en plein mot »** : `cuts.pleinMot` (score) reste mesuré sur les mots BRUTS de Whisper ; `--etape coupes`
  ajoute la même mesure sur les mots NETTOYÉS de l'analyse (Arko ET la vérité), et les bords en pleine parole selon
  Silero.
- `npm run banc-reel` sans `--v4` = la chaîne de l'appli du 7/11 (avec `chaine/interface.ts`, gardé pour référence).
- Tests purs du banc : `npx vitest run --config tests/banc-reel/mesures/vitest.config.ts` (26 verts).

## Préparer les caches (une fois)

Tout est dans `/home/claude/banc-cache/` (JAMAIS dans le dépôt) :

1. **Son décodé** `son-48k.f32` (PCM float mono 48 kHz, 2,3 Go) :
   `for i in 0 1 2: ffmpeg -i part$i.ogg -t 3000 -ac 1 -ar 48000 -f f32le -` puis `part3.ogg` en entier, collés.
2. **Mesures du son** (`signaux/`, ≈ 3 min) : `npm run banc-reel -- signaux` (`--refaire` pour les refaire).
3. **Transcription** : `BANC_ORT=web npm run banc-reel -- transcrire [--plage 0-2400]` — onnxruntime-**web** (WASM,
   1 fil), le moteur du Worker du navigateur → `whisper-web/tranche-*.json` ; sans `BANC_ORT=web` : onnxruntime-node
   → `whisper/`. Long (≈ 1 h à 1 h 30 pour la session sur 1 cœur), à lancer en arrière-plan avec `nice -n 10`. Une
   tranche de 5 min = un fichier : relancer reprend où ça s'était arrêté. Où ça en est :
   `tail /home/claude/banc-cache/whisper-web/journal.log`. La chaîne prend les mots « web » dès que les 40 tranches
   sont faites, sinon « node » (`BANC_WHISPER=node|web` pour forcer) ; `mots-arko.json` = les mots qu'elle prend.
   `npm run banc-reel -- vitesse` mesure la vitesse sur 60 s ; `-- essai --plage 6900-7200` compare un moteur aux
   tranches gardées ; `-- diagnostic` compte ce que le nettoyage retire (aucun texte affiché).

## Ce qui tourne vraiment, ce qui est remplacé

- **Code d'Arko tel quel** : `analyserPourBestOf` → `analyserPourExpress` → `lireSignauxSource` (+ `ia/signaux`,
  `ia/rires`), `transcrireLongue` (tranches de 5 min, `nettoyer`, `appliquerCorrections`, `ajouterTranche`),
  `mesurerVoix` + `zonesDeVoix` + `motsDeVoix` (mode voix), `ecouterVoix` → `analyserQuiParle` → `separerVoix`,
  `scenesBestOf` (derush), puis `construireBestOf` → `etapesMontage` → `poserPersos`… Whisper : même modèle
  (`onnx-community/whisper-base_timestamped`, q8, 1 fil), mêmes fenêtres (`remplirFenetre`), mêmes options, même
  correction des temps (`corrigerTempsWhisper`).
- **Remplacé** (`chaine/adaptateurs/`) : les **Workers** (`faux-worker.ts` : même protocole de messages, branchés sur
  les caches calculés par les accumulateurs d'Arko — `passeSon` + `Enveloppe`, `AccumulateurVoix`,
  `AccumulateurEmpreintes` — sur des morceaux de 1024 images à 48 kHz, comme Mediabunny les donne), **IndexedDB**
  (`idb-keyval.ts`, en mémoire), et le décodage Mediabunny / WebCodecs (`chaine/son.ts`).
- **Recopié de l'interface** (`chaine/interface.ts`) : les réglages par défaut et le parcours des fichiers d'état
  `src/ui/auto/express/etat-express.ts` et `etat-best-of.ts` (qui ne sont pas des fonctions pures). **Toute
  modification de ces fichiers doit être recopiée dans `interface.ts`** (ou mieux : déplacée dans une fonction pure
  de `src/auto/express/` que le banc importera).

## Écarts connus avec le navigateur

- Son : nous n'avons que de l'**Opus 16 kHz** (bande coupée à 8 kHz), redécodé à 48 kHz ; la capture OBS de Romain
  avait toute la bande. Les mesures voix (300–3400 Hz) et Whisper (16 kHz) n'en dépendent presque pas ;
  l'enveloppe (pics, cris, rires) un peu. `BANC_FREQUENCE=16000 BANC_SORTIE=…/sortie-16k npm run banc-reel` refait
  tout à partir d'un décodage 16 kHz pour comparer.
- Whisper : avec `BANC_ORT=web`, même moteur que le navigateur (onnxruntime-web, WASM, 1 fil) ; onnxruntime-node
  donne des mots nettement différents (≈ 1 sur 3 identique sur une tranche). Aucune correction de mots mémorisée (le
  `localStorage` de Romain est inconnu).
- transformers.js plante sur la fenêtre 7039–7067 s (« token_ids must be a non-empty array of integers. », les deux
  moteurs) : dans l'appli, l'analyse échoue ; le banc saute la fenêtre et le note (`--whisper-strict` = comme l'appli).
- Vidéo fictive (noire, sans images) : « Enlever les bords » ne trouve rien (aucun rognage) ; l'analyse des images du
  monteur IA (différences d'images) est vide — elle ne sert pas aux signaux du Montage express.
- Une seule piste de son (comme un mélange). Si le fichier de Romain avait 2 pistes ou plus, « Qui parle ? » aurait
  pris le chemin « pistes séparées » : le banc ne peut pas le reproduire sans les pistes.
- Les parties muettes non transcrites (sous −60 dBFS) sont rendues sans mots ; le navigateur y fait passer Whisper
  (qui peut y inventer quelques mots).
