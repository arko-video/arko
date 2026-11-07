# Banc réel — la vérité et les mesures (agent « banc-verite », 7/11/2026)

Le montage fait à la main par Claude sur la vraie session de Romain (Minecraft, 3 h 20, validé par Romain) est la
**vérité**. Ce dossier en garde **les temps et les étiquettes seulement** (jamais le son, jamais le texte prononcé) et
mesure contre elle la recette produite par Arko (Montage express → Best-of serré, sans IA).

## Fichiers

| Fichier | Rôle |
|---|---|
| `verite/extraire-verite.mjs` | Lit les scripts de rendu du montage à la main (`rendre.sh`, `ordre.json`, `sNN_k.ass`, `final.py`, hors dépôt) et écrit `verite.json`. Reproductible. |
| `verite/verite.json` | La vérité : séquences, morceaux gardés, phrases (qui parle, émotion, situation), bouche, punchlines, sous-titres, titres, musique. Temps et étiquettes seulement (nombre de mots, pas les mots). |
| `mesures/mesurer.ts` | `mesurerDossier(dossierSortie, dossierVerite)`, `afficher(resultats)` ; cœur pur `mesurer(entrees)`. |
| `mesures/temps.ts` | Outils purs : intervalles, grille de 20 ms, plans (temps source ↔ sortie), bords de coupe, niveau de la voix. |
| `mesures/plafond.ts` | La recette d'un Arko « parfait » fabriquée depuis `verite.json` (mêmes plans, voix, persos, textes, musique). |
| `mesures/outils.ts`, `mesures/lancer-mesures.ts` | Commandes `plafond`, `mesurer`, `calibrer` (hors `npm test`). |
| `mesures/mesurer.test.ts`, `mesures/vitest.config.ts` | Tests unitaires PURS (petites données fabriquées + `verite.json`). |

## Commandes

```
node tests/banc-reel/verite/extraire-verite.mjs [dossier montage4] [verite.json]   # refaire la vérité
npx vitest run --config tests/banc-reel/mesures/vitest.config.ts                  # tests (purs, ~1 s)
node tests/banc-reel/mesures/lancer-mesures.ts plafond [--ecrire]                 # vérité contre elle-même
node tests/banc-reel/mesures/lancer-mesures.ts mesurer /home/claude/banc-cache/sortie/voix
node tests/banc-reel/mesures/lancer-mesures.ts calibrer                           # seuils vus sur la vérité
npm run banc-reel                                                                 # chaîne + mesures (banc-chaine)
```

Les tests ne sont **pas** pris par `npm test` (qui ne lit que `src/**/*.test.ts`) ; ils sont purs (aucun fichier
privé, aucun ffmpeg, aucun modèle) et pourraient y être ajoutés (`include` de `vite.config.ts`).
Les mesures lisent aussi, si elles existent (hors dépôt) : `$BANC_CACHE/mots-arko.json` (mots de Whisper d'Arko, avec
`plages` = parties déjà transcrites), `<dossier>/activite.json` (niveau de la bande voix 300–3400 Hz en dB toutes les
20 ms, temps source) et `<dossier>/banc.json` (`plage` : la chaîne n'a vu qu'une partie de la session → la vérité est
réduite à cette partie). Résultats : `$BANC_CACHE/resultats/<mode>.json` (temps seulement).

## La vérité en chiffres (`verite.json`, `resume` et `controles`)

- **Durée 990,1 s = 16 min 30,1 s** (la vidéo validée fait 16 min 33 : l'écart vient de l'arrondi des images à 30 i/s
  de chacun des 243 morceaux ; le générateur, lui, comptait en secondes de son, comme ici).
- 35 tranches, **19 séquences** + l'**accroche de 6,01 s** (2 morceaux copiés de la séquence 14), **243 morceaux**
  (241 hors accroche), 4,07 s en moyenne, aucun sous 0,35 s ; zooms : ×1 sur 102, ×1,12 sur 55, ×1,32 sur 86.
- **333 phrases** : Romain 183, Guts 148, + 2 dans l'accroche. Parole (bouche) : Romain 314 s, Guts 340 s, aucun
  chevauchement ; perso montré : Romain 392 s, Guts 415 s. Persos : Guts à gauche, Romain à droite, toujours.
- **54 punchlines** (53 hors accroche ; celle de l'accroche double celle de la séquence 14) : Romain 30, Guts 24.
- **227 sous-titres** de la voix faible : 226 sur la parole de Romain (225 s), 1 sur Guts (1,2 s). 8 titres de section.
- **Musique** : 6 morceaux (Kevin MacLeod) qui se suivent de 6,01 s à la fin (accroche sans musique), −17 dB, baisse
  quand on parle 0,03 / 6 / 20 ms / 400 ms, fondus 1,2 / 1,5 s, −14 LUFS, crête −1,5 dBTP (lus dans `final.py`).
- Contrôles : 0 fenêtre hors d'un morceau gardé, 0 fenêtre rognée au bord d'une tranche, 0 bouche sans phrase,
  morceaux de chaque séquence dans l'ordre ; 45 fenêtres « perso montré » passent une coupe (coupées en 2 en temps source).
- À savoir : l'ordre n'est pas tout à fait chronologique (séquences 02–03 = source 776–917 s, montées après 00–01 =
  1296–1550 s) ; la séquence 02 ne fait que 2,85 s ; la fin de l'accroche coupe une phrase qui continue en séquence 14.

Conventions : temps **source** = secondes ABSOLUES dans la vidéo de 3 h 20 (`-ss $(rel NN T)` de `rendre.sh`, en
supposant le début de chaque extrait ≤ T) ; temps de **sortie** = vidéo finale. « montre » = perso affiché (≈ 1er mot
− 0,1 s → dernier mot + 0,35 s) ; « bouche » = bouche qui bouge (`_o`, ≈ les mots) = la parole de la vérité.

## Les mesures (définitions exactes)

Tout se compare en **temps source** (seul repère commun aux deux montages), sur une grille de 20 ms, sauf la musique
et la durée (temps de sortie). Plans, sous-titres et avatars d'Arko sont placés par **le code d'Arko lui-même**
(`compiler`, `placerAvatars`, `avatarsAuTemps`) : on mesure ce que l'aperçu et l'export montrent.
**Accroche d'Arko** : les plans avant le 1er plan qui entre par la transition « glitch » (« Le meilleur d'abord »).
**Voix d'Arko → personne** : chaque voix (ou personne de la recette) va à la personne de la vérité dont la parole
recouvre le plus ses tours (plusieurs voix peuvent aller à la même personne ; aucune si elle ne recouvre rien).

| Groupe | Clé | Définition | Cible |
|---|---|---|---|
| voix | `voix.nombre` | voix de `analyse.voix.voix` (sinon `recette.personnes`) | 2 (BRIEF) |
| voix | `voix.temps` | part des instants de parole de la vérité (bouche R ou G) où les tours d'Arko (`analyse.voix.tours`, sinon `recette.paroles`) disent exactement une ou des personnes qui parlent vraiment ; « sans voix » et « mauvaise » en détail | ≥ 90 % (BRIEF) |
| voix | `voix.phrases` | une phrase (hors accroche) est juste si la personne d'Arko qui recouvre le plus sa bouche est la bonne (égalité = fausse) | ≥ 90 % (BRIEF) |
| voix | `voix.niveaux` | niveau de chaque voix d'Arko → sa personne ; niveaux de la vérité = médiane d'`activite.json` sur la parole de chacun seul (bande voix : R ≈ −48 dB, G ≈ −38 dB) | indicatif |
| scènes | `scenes.sequences` | séquence retrouvée si ≥ 50 % de sa durée (plages source) est dans les plans d'Arko **hors accroche** | ≥ 80 % (BRIEF) |
| scènes | `scenes.punchlines` | punchline de la vérité (hors accroche) gardée si ≥ 80 % de sa fenêtre est dans les plans d'Arko | ≥ 70 % (BRIEF) |
| scènes | `scenes.punchlinesArko` | parmi les gardées : une ligne punchline d'Arko (temps de sortie → source) recouvre ≥ 30 % de la fenêtre | ≥ 50 % (banc) |
| cuts | `cuts.pleinMot` | **(décision de l'orchestrateur, 7/11 au soir)** bords de coupe (bord de plan où la source ne continue pas) STRICTEMENT dans un mot NETTOYÉ, à plus de 30 ms de ses bords (mots de Whisper gardés passés par `nettoyerMotsV4` avec la VAD de l'appli : `banc-cache/mots-nettoyes-v4.json`, écrit par `chaine/mots-nettoyes.ts`, les mêmes pour Arko, la vérité et toutes les passes) ; ET bords « en pleine parole » (VAD `vad-v5-continu` ≥ 0,5 des deux côtés, ± 60 ms) | ≤ la vérité mesurée pareil, pour les deux |
| cuts | `cuts.pleinMotBrut` | la même chose sur les mots BRUTS de Whisper (étirés sur les silences : 18 % des coupes de la main y tombent) | indicatif |
| cuts | `cuts.voixForte` | bord où, de CHAQUE côté (60 ms), le niveau max ≥ max(bruit de fond local + 10 dB, −40 dBFS) ; bruit de fond = 10e centile sur ± 5 s | ≤ la vérité (4,5 %) |
| cuts | `cuts.silences` | morceaux du montage (temps de sortie) de plus de 0,5 s sans mot (mot élargi de 0,25 s avant / 0,35 s après, les marges de la DA) ni activité (niveau ≥ max(fond + 10 dB, −55 dBFS)) ; élément inséré = silence ; partie ni transcrite ni mesurée = inconnue | 0 (BRIEF), ou temps mort / min ≤ la vérité ET pas plus de blancs > 2 s / min qu'elle |
| cuts | `cuts.planMoyen` | durée moyenne d'un plan vidéo (sortie) | indicatif (vérité 4,07 s) |
| cuts | `cuts.plansCourts` | plans < 0,35 s | 0 (DA) |
| musique | `musique.presence` | part de [fin de l'accroche, fin] couverte par les morceaux (`fin` ou début du suivant ; sans boucle : durée du fichier) | ≥ 95 % (BRIEF : partout sauf l'accroche) |
| musique | `musique.baisse` | `musique.baisse` ≠ false ET réglages du code (`BAISSE`) = 0,03 / 6 / 20 / 400 ms | oui (BRIEF) |
| musique | `musique.niveau` | 20 log10(`musique.vol` ?? 0,14) | −17 ± 1,5 dB (DA) |
| musique | `musique.lufs` | `volumeFinal.lufs` demandé | −14 LUFS (BRIEF) |
| durée | `duree.totale` | durée de sortie + intro + outro (indicative si la chaîne n'a vu qu'une partie) | 15 à 20 min (BRIEF) |
| persos | `persos.bon` | sur le temps de sortie dont la source a été gardée par la vérité : part de la parole de chaque personne où son perso (voix → personne de la recette) est affiché par Arko | ≥ 85 % (banc) |
| persos | `persos.mauvais` | part des instants de parole où Arko montre un perso que la vérité ne montre pas à ce moment (ou d'une voix sans personne) | ≤ 10 % (banc) |
| persos | `persos.emotions` | quand le bon perso est montré : même famille d'émotion que la vérité (rire ; colère/cri ; peur ; surprise ; calme/parle ; triste/défaite ; frime/moqueur/déterminé ; joie) ; « exacte » en plus | indicatif |
| sous-titres | `sousTitres.pour` | `sousTitres.pour` → personne | Romain (BRIEF) |
| sous-titres | `sousTitres.recouverts` | sous-titre de la vérité (hors accroche) recouvert si ≥ 50 % de sa fenêtre est sous une ligne affichée par Arko (boîte ou punchline : la DA ne double pas une phrase déjà en punchline) ; boîte seule en détail | ≥ 80 % (banc) |

**Score** = cibles atteintes / cibles (19). Une cible pas mesurable (pas de mots, pas d'activité…) compte comme
manquée ; les mesures indicatives ne comptent pas. « (banc) » = cible proposée par le banc, le BRIEF n'en donne pas.

## Calibrage sur la vérité (7/11, mots de Whisper d'Arko sur 0–3900 s, activité de toute la session)

- **Plafond** (vérité contre elle-même, `plafond`) : **19 / 19 cibles**, voix 99,9 % du temps et 331 / 331 phrases,
  19 / 19 séquences, 53 / 53 punchlines, persos 99,6 % (mauvais 0,4 %), sous-titres 225 / 227, émotions 94,9 % (les
  phrases « parle + situation » : Arko montre l'émotion de la situation). Le test `mesurer.test.ts` le vérifie.
- **Mots de Whisper d'Arko** (whisper-base « timestamped ») : 44 % des mots durent ≤ 0,05 s (plusieurs mots empilés au
  même instant), 2 % sont étirés à 1,5 s par-dessus les pauses. Résultat : **18 % des coupes de la VÉRITÉ tombent
  « dans un mot »** (51 / 284 avec 30 ms de tolérance ; encore 36 avec 150 ms), le plus souvent dans un silence
  (−66 dB). La mesure Whisper seule n'est donc pas fiable tant que les temps des mots sont ceux-là : la cible devient
  « ≤ la vérité mesurée avec les mêmes mots ».
- **Niveau de la voix** : la moitié du temps le son est un silence numérique (−100 dB) ; « fond + 10 dB » seul marque
  54 % des coupes de la vérité. Il faut un plancher absolu et les deux côtés de la coupe :

  | critère (2 côtés, ±60 ms, fond + 10 dB et…) | coupes de la vérité marquées | milieu de la parole repéré (R / G) |
  |---|---|---|
  | aucun plancher | 262 / 486 (53,9 %) | 95 % / 90 % |
  | ≥ −50 dBFS | 56 (11,5 %) | 64 % / 74 % |
  | ≥ −45 dBFS | 39 (8,0 %) | 49 % / 72 % |
  | **≥ −40 dBFS (choisi)** | **22 (4,5 %)** | 33 % / 64 % |
  | ≥ −35 dBFS | 11 (2,3 %) | 9 % / 46 % |

  La vérité ne descend jamais à 0 : ses 22 coupes « fortes » sont surtout des débuts / fins de séquence et des sons du
  jeu qui continuent. D'où la cible « ≤ la vérité ». La voix de Romain (−40 à −48 dB) est mal vue par ce critère.
- **Silences** : avec les mêmes mots et la même activité, la vérité a ≈ 8 s de « temps mort » par minute (7,8 s avec
  les mots sur 0–3900 s) et **aucun blanc > 2 s** ; ses pauses de 0,5–1,5 s sont des pauses dans les phrases (morceaux fusionnés sous 0,5 s) et des fins
  de sons forts (gardés −0,4 / +0,6 s). Seuil « actif » −55 dBFS (de −45 à −75 dB, la vérité garde 5 à 16 / min).

## Limites

- Les étiquettes de la vérité n'existent que là où elle a gardé la source : ailleurs, on ne sait pas qui parle (les
  mesures voix et persos ne regardent que là ; les séquences d'Arko hors vérité ne sont ni bonnes ni mauvaises).
- (Sans `mots-nettoyes-v4.json`, `cuts.pleinMot` retombe sur les mots bruts, comme avant.) `cuts.pleinMotBrut` dépend
  des temps des mots de Whisper d'Arko (mauvais aujourd'hui, voir plus haut) ; refaire
  `calibrer` quand la transcription est finie ou meilleure.
- Le niveau de la voix est celui de la bande 300–3400 Hz du MÉLANGE (jeu compris) : un son du jeu fort passe pour de la
  voix, et la voix faible de Romain passe souvent sous −40 dB.
- La musique est mesurée sur la recette (ce qui est demandé), pas sur un son exporté ; le −14 LUFS est le réglage
  demandé, pas une mesure du fichier.
- Les émotions comparées par familles restent une mesure indicative (le choix de l'émotion est un goût).
