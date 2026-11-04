# Arko phase 3 (sons, transitions, zooms, son guide) : rapport de QA indépendante

4 novembre 2026. Relecteur qui n'a pas vu le code s'écrire, sur la **copie figée** `qa-p3`. Référence : `conception/decisions-phases-2-6.md` (« Parcours et Habiller », « Phase 3 ») et `phases-2-6.md` (Phase 3).
Environnement : Linux, Chrome stable headless (Playwright `channel: 'chrome'`), 360 × 740, 2 cœurs, ffmpeg 6.1. Rien n'a été modifié dans `src/` ni dans les configs. Seuls les scénarios `tests/qa/p3-*` et leurs fixtures ont été ajoutés. Les p1 et p2 n'ont pas été relancés.

## 1. Résultats

`npx tsc --noEmit` : 0 erreur. `npx vitest run` : 30 fichiers, 248 tests réussis. QA phase 3 (`tests/qa/p3-*.qa.ts`, 8 scénarios) : **5 réussis** (p3-b, p3-c2, p3-e, p3-f, p3-g). Les 3 autres (p3-a, p3-c, p3-d) n'ont échoué que sur un contrôle d'Annuler mal écrit dans le scénario (notes ¹ et ²) : toutes leurs mesures sont bonnes. Ces contrôles sont corrigés, mais les 3 scénarios n'ont pas été relancés. Plus un script d'écoute (extraction des 20 sons en WAV avec Node). Les vrais écarts sont au § 2.

| # | Scénario | Résultat | Mesures |
|---|---|---|---|
| p3-a | Sons du catalogue | ✅ | 3 sons posés à 1, 4, 7 s : attaques dans le MP4 à **1,0001 / 4,0000 / 7,0000 s**. Après +0,2 s : **7,2000 s**. Après « Commencer ici » à 2 s dans Couper, les sons (attachés au temps source) passent à **1,998 / 5,200 s**. Suppression OK. Volume 150 % : crête × **1,42** au lieu de × 1,875 (écrêtage, I-1). Annuler / Rétablir : **14/14** ¹. |
| p3-écoute | Planche des 20 sons (`captures/p3-planche-sons.png`) | ✅ | Les 20 sons sont **déterministes** (2 synthèses identiques à l'échantillon près), sans NaN. Crête **−1,00 dBFS** pour tous. Début et fin à 0, aucun clic (plus grand saut entre 2 échantillons hors attaque voulue : 0,09). Synthèse en 3 à 53 ms par son (Node). Trombone : **466 → 440 → 414 → 393 Hz** (si♭, la, la♭, sol) + vibrato : juste. Mais l'écart de **volume perçu** entre sons atteint 24 dB (I-2), et 3 sons dépassent −1 dBFS en crête vraie (M-5). |
| p3-b | 7 transitions (`captures/p3-b-planche-transitions.png`) | ✅ | Planche regardée : flash (blanc à la coupe), zoom (× 1,4 à la coupe), glisse (filé + flou), noir, glitch (tranches + RVB), secousse. **Durée 10,005 s** dans tous les cas (comme sans transition). Son à la coupe : flash, zoom, glisse, glitch, secousse **présents**, noir **muet**. « Avec le son » coupé ⇒ **0** à la coupe, l'autre coupe garde son son. « Partout » ⇒ `[null, glitch, glitch]`. Un seul plan ⇒ « Coupe ta vidéo dans l'étape Couper… ». Annuler / Rétablir **16/16**. La secousse se voit à peine (M-9). |
| p3-c | Zooms punch et doux (`captures/p3-c-planche-zooms.png`) | ✅ ² | Force mesurée sur l'export (comparé à un export sans zoom) : punch demandé × 2 ⇒ **× 2,00** à 2,3 s, × 1,66 à 2,04 s (entrée), × 1,18 à 2,57 s (sortie), × 1,00 avant et après. Doux × 1,3 sur 2 s ⇒ **× 1,30** à 6,5 s, × 1,00 à 7,1 s. Centre déplacé au clavier vers (0,25 ; 0,30) : visible sur la planche. Une entrée d'annulation par appui de flèche (M-3). |
| p3-c2 | Jeu + webcam | ✅ | Zoom ajouté avec `zone: 'cam'` par défaut. Écart moyen avec un export sans zoom (même image, zoom × 2 au maximum) : **9,25** dans la bande webcam, **0,13** dans la bande de jeu ⇒ le zoom reste dans la bande webcam. |
| p3-d | Son guide (Couper) | ✅ ¹ | **20 temps forts** affichés (20 attendus). Aperçu : 6 blocs sur 13 contiennent du son pendant 2,5 s de lecture d'une vidéo muette ⇒ le guide est bien **mixé dans l'aperçu**. **MP4 : 0,000** de crête hors du son importé ⇒ guide **absent** de l'export. Aimant : tête à 3,167 s + Scinder ⇒ coupe à **3,24 s** (temps fort à 3,25 s). Rappel : « Dans TikTok, ajoute ton son et démarre-le à **0:12** ». Bandeau permanent présent. |
| p3-d (reprise) | Rechargement | ✅ | On ne re-choisit que la vidéo : guide (`debut` 12, vol 1) et son importé reviennent, étape 5 reprise. Base `arko-sons` vidée ⇒ « Le son « p3-guide-120bpm.wav » n'a pas été retrouvé : il est retiré. » (et le bip), sons et guide retirés de la recette. Les sources restent dans `recette.sources` (M-4). |
| p3-e | Import WAV, MP3, son d'une vidéo | ✅ | Les 3 sont dans le MP4 : attaques à **1,0000 / 4,0000 / 7,0000 s** (le délai du décodeur MP3 est bien compensé), hauteur **440 / 440 / 1995 Hz**, niveaux = fichier × 80 %. Ids `a1`, `a2`, `a3`, phrase sur les droits affichée. |
| p3-f | Micro (faux périphérique Chrome) | ✅ | 2,2 s enregistrées ⇒ « Micro 1.webm » (2,22 s) dans « Mes sons », posé à 2 s, présent dans le MP4. Pistes du micro **`ended`** après Stop **et** après fermeture du panneau pendant l'enregistrement (rien importé). |
| p3-g | Performance (10 s en 1080p) | ✅ | Sans effets **16,1 s** ; avec 4 transitions (flash, glisse, glitch, zoom), 2 zooms et 5 impacts **16,6 s** : **surcoût 3 %**. Mais le son de cet export monte à **+0,84 dBFS** (saturé, I-2). |

¹ Le seul écart relevé par `verifierAnnulerRetablir` (« annuler → état 0 ») venait du test : l'état de départ était lu avant la 1ʳᵉ sauvegarde automatique (`trans: []` au lieu de `[null]`). Corrigé dans `p3-outils.ts` après coup.
² Le contrôle d'Annuler du zoom supposait que les 9 appuis de flèche faisaient une seule entrée ; ce n'est pas le cas (M-3). Les 7 autres étapes sont justes. Scénario corrigé pour noter chaque appui.

Aucune erreur dans la console sur ces scénarios. Aucun fichier TS/TSX de plus de 300 lignes (le plus gros de la phase 3 : `src/ui/effets.ts`, 224), aucun CSS au-delà de 297 lignes. Textes visibles en français, sauf des noms repris du jargon TikTok : « Whoosh », « Bass drop », « Tape stop », « Ba-dum-tss », « Glitch », « Punch » (à faire valider par Romain).
Sécurité : rien n'est envoyé en ligne (micro, sons, guide restent dans IndexedDB `arko-sons`). Les noms de fichiers sont affichés par Preact (échappés). Le guide n'est même pas ouvert par le Worker d'export (`worker.ts:88`).
Fuites : l'AudioContext de la lecture est fermé (`lecteur.ts:213`). Celui de l'écoute (`sons/ecoute.ts:18`) vit toute la session (un seul, acceptable). Les `AudioSample` de `parcourirSon` sont fermés en `finally`. Les pistes du micro sont arrêtées dans les cas testés, mais pas dans une course (I-3).

## 2. Bugs

### Bloquant
Aucun.

### Important

**I-1. Un son réglé au-dessus d'environ 110 % sature** (sons, moteur)
- `src/sons/synthese/finition.ts:172` normalise chaque son à −1 dBFS en crête. Le mixeur ajoute `son × vol` puis écrête en tanh au-delà de 0,95 (`src/moteur/audio/mixeur.ts:241-249`).
- Avec le volume maximal prévu (150 %), « Ding » monte à 1,34 avant écrêtage : il est écrasé à ~1,0. Mesure (`p3-a`) : la crête ne monte que de × 1,42 au lieu de × 1,875, et la forme est déformée (distorsion audible). C'est pire par-dessus le son du jeu.
- Correction : normaliser les sons à un niveau plus bas (crête −6 dBFS ou, mieux, en sonie, voir I-2) et/ou mettre un limiteur avec anticipation sur la sortie au lieu d'un tanh échantillon par échantillon.

**I-2. Écart de 24 dB de volume perçu entre les sons du catalogue** (sons)
- `finition.ts:201-207` règle la **crête**, pas la sonie. RMS mesuré : `impact.bass-drop` **−3,5 dBFS** (presque un signal carré, facteur de crête 2,5 dB), `impact.boom` −9,8, `whoosh.rapide` −17,5, `impact.claque` **−24,1**, `meme.photo` **−27,4**.
- Effet : à 80 %, le bass-drop est assourdissant pendant 2,5 s et sature dès qu'il y a la voix ou le jeu, alors que la claque et la photo s'entendent à peine. Dans `p3-g` (5 impacts sur une vidéo muette), le MP4 monte à **+0,84 dBFS** : l'AAC dépasse le plafond du tanh, et le son est écrêté à la lecture.
- Correction : viser un RMS (ou une sonie) commun par famille, par exemple −18 dBFS RMS avec une crête plafonnée, et adoucir la saturation du bass-drop.

**I-3. Le micro peut rester allumé (course au démarrage)** (interface, sons)
- `src/ui/composants/outils/Micro.tsx:232-255` : `courant.current` n'est rempli **qu'après** `await getUserMedia`. Si on ferme le panneau (ou quitte Habiller) pendant la demande d'autorisation, la fonction de nettoyage (`:214-223`) ne voit rien. Le flux obtenu ensuite n'est jamais arrêté : le témoin micro d'Android reste allumé, et l'enregistrement démarre sur un composant démonté (puis s'importe quand même). Un double toucher sur « Enregistrer au micro » ouvre 2 flux, et le 1ᵉʳ est perdu. Si `new MediaRecorder` ou `rec.start` lèvent une erreur, le flux n'est pas arrêté non plus.
- Correction : un drapeau « démonté » vérifié après l'`await` (et arrêter les pistes), un bouton désactivé pendant la demande, un `try/catch` qui arrête les pistes.

**I-4. Le nettoyage des sons ne connaît que le projet courant** (sons)
- `src/ui/etat.ts:240` appelle `nettoyerFichiersAudio([a.recette])`, alors que le contrat (`src/stockage/sons.ts:66`) demande les recettes de **tous** les projets sauvegardés.
- Aujourd'hui, avec un seul projet, ça passe. Avec « Mes montages » (phase 4), les sons et le guide des autres montages seront effacés une heure après leur dernier usage, puis « n'a pas été retrouvé » à la réouverture. De plus, un son importé dans « Mes sons » mais pas encore posé n'est pas dans `recette.sources` : il disparaît au rechargement, et son fichier est effacé une heure plus tard.
- Correction (phase 4) : passer les recettes de `stockage/projets.ts`. Ajouter la source à la recette dès l'import.

### Mineur
- **M-1** (moteur) `src/recette/defauts.ts:60` : `ZOOM.forceMin = 1`, alors que la spécification et l'interface (`OutilZoom.tsx`, `FORCE_MIN = 1.1`) disent 1,1. Le normaliseur accepte un zoom × 1 (sans effet).
- **M-2** (moteur) `src/moteur/etat-image.ts:312` : durée par défaut `0.6` écrite en dur au lieu de `ZOOM.dur`. Si deux zooms se chevauchent, le second remplace le premier d'un coup (saut d'échelle).
- **M-3** (interface) `src/ui/composants/CalqueZoom.tsx:115` : chaque appui de flèche crée une entrée d'annulation (9 pour déplacer la cible de 25 %). Regrouper les appuis rapprochés.
- **M-4** (sons) `src/ui/sons-gardes.ts:15-23`, `supprimerSon`, `retirerGuide` : la source audio reste dans `recette.sources` (constaté : `s1, a1, a2` après retrait). À chaque reprise, `rouvrirSourcesAudio` (`stockage/sons.ts:36`) rouvre **toutes** les sources audio, même inutilisées.
- **M-5** (sons) Crête vraie au-dessus de −1 dBFS (sur-échantillonnage × 4) : `meme.photo` −0,27, `whoosh.rapide` −0,31, `whoosh.montant` −0,43 dBTP. Normaliser sur la crête sur-échantillonnée.
- **M-6** (moteur) `src/moteur/audio/lecteur-audio.ts:47-48` : l'`AudioSample` n'est pas fermé si `copyTo` lève une erreur (`try/finally`), comme M-7 de la phase 2.
- **M-7** (interface, performance) `src/ui/composants/outils/OutilSons.tsx:79` : `title={formatTemps(teteLecture.value)}` abonne toute la liste des sons à la tête de lecture, qui est donc redessinée à chaque image pendant la lecture.
- **M-8** (interface) `src/ui/effets.ts:29-33` : `sonChoisi`, `zoomChoisi` et `coupeChoisie` sont des indices. Après Annuler ou Rétablir (qui ajoutent ou retirent des éléments), le panneau peut régler un **autre** son ou zoom. `annulerAction` (`etat.ts:122`) ne remet à zéro que `selection`.
- **M-9** (moteur) `src/moteur/couches/transitions.ts:19-20` : la secousse (3,5 % de la largeur, ±1,5°) se voit à peine sur la planche, surtout avec le fond flou. On pourrait doubler l'amplitude.
- **M-10** (sons) `src/moteur/audio/effets.ts:104` : le son des transitions est toujours à 80 %, et rien ne permet de le régler.
- **M-11** (interface, accessibilité) `src/ui/composants/outils/Reglages.tsx:117-133` : les onglets `role="tab"` n'ont ni navigation aux flèches ni `aria-controls` (`OutilSons.tsx:58`). Les temps forts sont `aria-hidden` : seul leur nombre est dit. Les repères de sons et de zooms sur la mini-frise sont de petites cibles.
- **M-12** (interface) Noms anglais visibles (Whoosh, Bass drop, Tape stop, Glitch, Punch). C'est un choix de vocabulaire, à valider.

## 3. Pas testé
Le vrai téléphone : vrai micro et dialogue d'autorisation Android, sortie audio Bluetooth (latence de l'aperçu avec le guide), vibration de l'aimant, encodeur matériel. Les poignées de Couper aimantées au rythme (seul Scinder l'a été). L'écoute réelle a été faite sur les formes d'onde et les spectrogrammes, pas à l'oreille.

## 4. Fichiers
Scénarios : `tests/qa/p3-*.qa.ts`, outils `tests/qa/p3-outils.ts`, estimation de la force du zoom `tests/qa/p3-estimer-zoom.py`. Écoute des sons : `cd tests/qa && node --import ./p3-enregistrer.mjs --experimental-strip-types p3-ecoute-sons.mts ../.. <dossier>` puis `python3 p3-planche-sons.py <dossier> planche.png`. Fixtures : `tests/qa/fixtures/p3-*` (mire 10 s à son muet, guide 120 BPM, bip WAV/MP3, vidéo avec son). Captures : `tests/qa/captures/p3-*.png`, dont la planche des sons `p3-planche-sons.png`. Lancer : `npx playwright test --config tests/qa/playwright.qa.config.ts p3-`.
