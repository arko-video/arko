# Arko phase 1 : rapport de QA indépendante

3 novembre 2026. Relecteur qui n'a pas vu le code s'écrire. Référence : `conception/decisions-phase1.md` (fait foi), `architecture.md`, `retours-ux.md` §4 et §5.
Environnement : Linux, Chrome stable en mode headless (Playwright `channel: 'chrome'`), 2 cœurs, 7 Go de RAM, ffmpeg 6.1. Aucun fichier de `src/` ni de `tests/e2e/` n'a été modifié.

## 1. Résultats des tests

| Suite | Résultat | Durée |
|---|---|---|
| `npx tsc --noEmit` | ✅ 0 erreur | 0,9 s |
| `npx vitest run` | ✅ 10 fichiers, 70 tests réussis | 1,8 s |
| `npx playwright test` (critère de fin de phase 1) | ✅ 1/1 réussi | 13,3 s |
| QA : `npx playwright test --config tests/qa/playwright.qa.config.ts` | **19 réussis, 3 échecs** (tous les trois sont des bugs réels, voir §2) | 4,0 min |

Le critère de fin de phase 1 est **atteint** : le MP4 fait 1080 × 1920, dure 2,00 s ± 0,05 et contient une piste AAC.

### Scénarios supplémentaires (fichiers `tests/qa/*.qa.ts`, vidéos générées dans `tests/qa/fixtures/`)

| # | Scénario | Résultat | Mesures |
|---|---|---|---|
| a | Source verticale 1080 × 1920, 5 s | ✅ | Étape Vertical sautée, message « déjà verticale » affiché, Retour → Couper. Export : 5,0 s de calcul, 1080 × 1920, 5,013 s, AAC. |
| b | Plein écran avec un glissé de 40 % vers la gauche | ✅ | `mise = {recadre, x: 0,63}`. Pixel central exporté R = 168 (attendu ≈ 161 avec x = 0,63) : le cadrage exporté suit bien le glissé. L'image remplit tout l'écran, sans bandes. Le glissé ne lance pas la lecture. Export en 2,9 s. |
| c | Annuler / Rétablir après Scinder ×2 et Supprimer | ✅ | 3 × Annuler, puis 3 × Rétablir. Une nouvelle action efface bien « Rétablir ». Un double clic sur Scinder ne crée pas de plan vide. Commencer ici et Finir ici marchent. La bulle de temps s'affiche pendant le glissé (« 0:01,5 »). |
| d | Annuler l'export à ≥ 30 % puis relancer | ✅ | Message « Export annulé, ton montage est gardé. ». OPFS vide 3,5 s après l'annulation. Relance : 12 s de vidéo 1080p en 17,2 s, durée 12,011 s. Retour bloqué pendant l'export (toast). |
| d2 | Annuler puis relancer dans la même seconde | ✅ | Export complet en 16,7 s, 1 seul fichier dans l'OPFS. |
| d3 | Onglet caché puis visible pendant l'export | ✅ | L'export se termine normalement. |
| e | Rechargement pendant le montage → « Reprendre » | ✅ | Carte « Arrêté à : Vertical ». Un autre fichier est refusé avec « Ce n'est pas la même vidéo. Choisis « test-1920x1080.mp4 ». ». Avec le même fichier, on reprend à l'étape 3 avec les mêmes plans `[{de:2,a:5}]` et la même mise (Plein écran). |
| e2 | Erreurs d'import | ✅ | Faux fichier : « Format de fichier non reconnu. Choisis une vidéo MP4, MOV ou WebM. ». HEVC : message clair en français (H.264 / « Plus compatible »). |
| f | Source de 2 h, 320 × 180, 5 i/s, 219 Mo | ✅ moteur / ⚠️ interface | Ouverture : **186 ms**. Reprise d'un plan à 1 h 30 : **119 ms**, image affichée à 1 h 30 en **198 ms**. Export du plan de 10 s pris à 1 h 30 : **10,5 s** (10,005 s, AAC). Tas JS : 4 → 22 → 39 → 28 Mo (stable). Mais l'interface ne permet pas d'aller à 1 h 30 (voir I-1). |
| g | Captures 360 × 740 de chaque écran (11 écrans) + 320 × 640 | ✅ | Aucun défilement horizontal. Cibles de moins de 44 px : la tête de lecture (48 × 28) et, à 320 px seulement, le bouton Retour (43 × 48). Aucun bouton sans nom. |
| h1 | Double toucher sur « Créer la vidéo » | ❌ | **Le 2ᵉ toucher annule l'export** (voir B-2). |
| h2 | Modifier la recette après un export | ✅ | L'ancien résultat est jeté et on revient à l'écran « avant ». |
| i / k1 | Aperçu juste après l'import | ❌ | **Aperçu noir dans 5 cas sur 6** tant qu'on ne touche à rien (voir B-1). |
| j1 | Vidéo de 2 h : allonger le plan à la poignée | ⚠️ | Chaque glissé sur toute la largeur ajoute seulement 9 à 25 s : 60 s → 3 min 8 s après 8 glissés (voir I-1). |
| j2 | Lecture à travers 8 coupes | ✅ | Aucune erreur ni avertissement « VideoFrame non fermée ». |
| k2 | Aperçu après le glissé du recadré | ✅ | L'aperçu se met à jour (R 133 → 168). |
| l | 3 plans gardés sur 6 : couleurs exportées aux bons temps | ✅ | 7 points contrôlés, écart ≤ 26/255 (sous-échantillonnage 4:2:0). Chaque coupe tombe au bon endroit. |
| m | Précision à l'image après « Commencer ici » | ❌ (cause : I-2) | La tête était à 0,45 s au lieu de 0,50 après 15 pas. L'export commence bien à l'image source qui correspond à 0,45 s : le moteur est exact, c'est le pas de l'interface qui est faux. |
| n1 | Vidéo avec rotation de 90° (téléphone) | ✅ | Traitée comme verticale (l 1080, h 1920). Vertical sautée, export 1080 × 1920. |
| n2 | 30 × « +1 image » | ❌ | La tête arrive à **0,90 s au lieu de 1,00** (voir I-2). |
| n3 | « Oublier ce projet » | ✅ | Plus de carte après rechargement. |

Le MP4 exporté a son en-tête au début (`ftyp, moov, free, mdat`) : `fastStart: 'reserve'` fonctionne.

## 2. Bugs, par priorité

### Bloquant

**B-1. L'aperçu reste noir à l'arrivée sur Couper et sur Vertical** (moteur)
- `src/moteur/lecteur.ts:53` : `if (redessiner && r === rendu)`.
- Reproduction : importer `tests/fixtures/test-1920x1080.mp4` sans toucher à rien. Le canevas reste noir (centre 0,0,0) pendant 4 s et plus, dans 5 essais sur 6 (`k1`). Même chose en arrivant sur Vertical (capture `captures/g-3-vertical-flou.png`). L'image n'apparaît qu'après un geste (flèche, lecture). Pour un débutant, l'appli a l'air cassée dès le premier écran.
- Cause : `Apercu` appelle `charger()` deux fois au montage (`useEffect` en `Apercu.tsx:50`, puis `useSignalEffect` en `Apercu.tsx:68`). Le 2ᵉ `charger` remplace `rendu` pendant que le dessin du 1ᵉʳ est en cours. Ce dessin abandonne (`ferme`) et le dessin demandé entre-temps est perdu, car `r !== rendu`. La même course peut laisser une image périmée après Scinder ou Supprimer en pause.
- Correction : en `lecteur.ts:53`, relancer `dessiner()` dès que `redessiner` est vrai (la fonction lit le `rendu` courant). Côté interface, on peut aussi éviter le double `charger` au montage. Ajouter un test e2e : « centre de l'aperçu non noir 1 s après l'import ».

**B-2. Un double toucher sur « Créer la vidéo » annule l'export** (interface)
- `src/ui/ecrans/Exporter.tsx:75` et `:107` : « Annuler l'export » apparaît au même endroit que « Créer la vidéo » (y = 664 contre 668, même largeur).
- Reproduction : `h1`. Toucher deux fois rapidement : « Export annulé, ton montage est gardé. ». Sur téléphone, un double toucher involontaire est fréquent.
- Correction : placer Annuler ailleurs (bouton discret en haut, ou sous un texte), ou l'ignorer pendant les 800 premières millisecondes, ou demander une confirmation.

### Important

**I-1. Impossible d'atteindre 1 h 30 d'un live avec l'interface** (interface, avec une petite aide du moteur)
- `src/recette/defauts.ts:30` (`DUREE_INITIALE.garde: 60`) et `src/ui/composants/Frise.tsx` : la frise ne montre que la vidéo finale.
- Reproduction : `j1`. Sur une source de 2 h, on part d'un plan [0 ; 60 s]. Allonger le plan à la poignée de fin ajoute 9 à 25 s par glissé : il faudrait des centaines de glissés pour arriver à 1 h 30. Le moteur, lui, saute à 1 h 30 en 0,2 s (`f`).
- Correction : ajouter une navigation dans la source pour les longues vidéos. Par exemple une barre « Dans la vidéo d'origine » (0 → 2 h) qui place un plan de 30 s autour du point touché. Ou un champ « Aller à 1:30:00 ». C'est un usage central (VOD de stream) prévu dans `architecture.md` §4.2.

**I-2. « ±1 image » et les flèches du clavier dérivent (pas de 0,03 s au lieu de 1/30 s)** (interface)
- `src/ui/ecrans/Couper.tsx:76` et `:80`, `src/ui/composants/Frise.tsx:229-230` : `auCentieme(t ± 1/30)` arrondit chaque pas à 0,03 s.
- Reproduction : `n2`. 30 appuis donnent 0,90 s au lieu de 1,00. On saute ou on répète des images, et « Commencer ici » tombe 1 à 3 images à côté (`m`).
- Correction : se caler sur la grille des images, `t = (Math.round(t * 30) ± 1) / 30`, et n'arrondir au 1/100 que lors de l'écriture dans la recette.

**I-3. Le pré-décodage tourne hors de la file de rendu** (moteur)
- `src/moteur/curseur-images.ts:41-43` et `src/moteur/rendre.ts:95` : `prechauffer()` lance `imageA()` en parallèle, sans passer par `fileImages`. Si `image()` demande le même curseur pendant que ce pré-décodage est en cours, deux appels `relancer()` peuvent se croiser. On risque alors un itérateur orphelin et des `VideoSample` jamais fermés.
- Je ne l'ai pas reproduit en headless (`j2`, `l` sans avertissement), mais la course est réelle. Elle est plus probable sur un téléphone lent.
- Correction : un verrou (promesse en cours) dans `CurseurImages`, ou faire passer le pré-décodage par la file.

**I-4. Chaque modification de la recette recrée tout le rendu** (moteur, performance)
- `src/moteur/lecteur.ts:123` : `rendre()` crée de nouveaux `VideoSampleSink` et `LecteurAudio` (décodeurs). Pendant le glissé d'une poignée ou du recadré, cela arrive jusqu'à 60 fois par seconde, et chaque fois le décodage repart de l'image clé.
- C'est fluide sur le PC de test avec des images clés serrées. Sur le Xiaomi, avec une source 1080p60 aux images clés espacées de 4 à 10 s, ça risque de saccader.
- Correction : garder les sinks par source et les curseurs dont le plan (src, de, a) n'a pas changé d'un rendu à l'autre. À vérifier sur le téléphone.

**I-5. Deux exports peuvent tourner en même temps pendant 3 s** (moteur)
- `src/moteur/export/client.ts:120` : après Annuler, le Worker n'est arrêté qu'au bout de 3 s. Une relance immédiate (`d2`) ouvre un 2ᵉ encodeur H.264 pendant ce temps. Ça passe sur PC, mais un téléphone n'a souvent qu'un encodeur matériel : le 2ᵉ export peut échouer ou basculer en encodage logiciel.
- Correction : attendre la confirmation du Worker (message « annulé », ou délai court) avant de permettre « Créer la vidéo », ou réutiliser le même Worker.

### Mineur

- **M-1** (interface) : la tête de lecture fait 48 × 28 px (`ecrans.css:354-359`) ; viser au moins 44 px de haut (la zone de toucher peut dépasser sous la frise). À 320 px de large, Retour fait 43 × 48.
- **M-2** (interface) : la carte « Reprendre » n'a pas de vraie vignette, seulement un cadre vide (`Importer.tsx:198` et `:226`). §4 le demande. On peut sauver une petite image (JPEG en base64 de quelques Ko) avec la recette.
- **M-3** (interface) : `Frise.tsx` fait 384 lignes, au-delà de la limite de 300 lignes (principe 4). `ecrans.css` (550) et `theme.css` (476) aussi, si la règle s'applique au CSS.
- **M-4** (interface) : après « Commencer ici », la tête garde le même temps de sortie (`Couper.tsx:36-39`). Elle se retrouve donc plus loin dans la source. Mieux vaut la mettre à 0.
- **M-5** (interface) : la sauvegarde attend 1 s (`etat.ts:176`) et rien ne force l'écriture sur `pagehide` ou `visibilitychange`. Une modification faite juste avant de fermer l'onglet est perdue.
- **M-6** (interface) : choisir une nouvelle vidéo alors qu'une carte « Reprendre » existe écrase le projet sauvegardé sans prévenir.
- **M-7** (interface) : `viderVignettes()` n'est jamais appelé. Le cache est limité à 240 images, donc la mémoire reste bornée, mais les vignettes de l'ancienne vidéo restent en mémoire.
- **M-8** (interface) : `T.importer.deposer` existe mais il n'y a pas de glisser-déposer sur ordinateur.
- **M-9** (interface) : la zone `duree-finale` est `aria-live` et annonce chaque changement pendant un glissé, ce qui fait beaucoup de bruit pour un lecteur d'écran. Les cartes `role="radio"` ne réagissent pas aux flèches du clavier.
- **M-10** (interface) : `nomExport` existe en double (`ui/format.ts:42` et `moteur/export/sortie-opfs.ts:31`).
- **M-11** (moteur) : si la piste audio existe mais ne peut pas être décodée (`media.ts:61`), l'export sort muet sans prévenir. Un message comme « Le son de cette vidéo ne peut pas être lu : la vidéo sera muette » aiderait.
- **M-12** (moteur) : en repli, sans OPFS, l'export s'écrit en mémoire (`sortie-opfs.ts:40`). L'architecture dit « jamais in-memory » : il faudrait au moins limiter ce repli aux exports courts.
- **M-13** (moteur) : le repli 360 × 640 quand plus de 30 % des images sont sautées (§4.3/§5) n'est pas fait.
- **M-14** (sécurité, interface) : pas de `Content-Security-Policy` en `<meta>` (GitHub Pages ne permet pas les en-têtes). Recommandé : `default-src 'self'; img-src 'self' blob: data:; media-src blob:; worker-src 'self' blob:`.

### Sécurité et vie privée : rien de bloquant
Aucun `innerHTML` ni `dangerouslySetInnerHTML`. Les noms de fichier passent par le texte JSX, qui est échappé. Aucun `fetch`, `XMLHttpRequest`, `sendBeacon` ni `WebSocket` dans `src/`. Le bundle ne contient aucune URL externe appelée (seulement des URL de licence ou de spécifications dans des commentaires). Les polices sont incluses dans l'appli, et le service worker ne met en cache que les fichiers de l'appli. **Aucune donnée ne quitte l'appareil.**

### Mémoire : globalement propre
Les `VideoSample` sont fermés (vignette `finally`, `CurseurImages` : image remplacée et `arreter`). Les `AudioSample` sont fermés après la copie, et à l'export. Les `ImageBitmap` sont fermés quand ils sortent du cache. Les `Input` sont libérés (worker `finally`, `fermerSource`). Les Workers sont arrêtés avec `terminate`. L'URL d'objet est révoquée dans `oublierExport`. L'`AudioContext` est fermé dans `detruire`. Le tas reste stable sur la vidéo de 2 h. Seul point à surveiller : I-3.

### Lisibilité pour un débutant
Bonne : noms et commentaires en français, fonctions pures séparées (`chronologie`, `etat-image`, `mixeur`, `frise-outils`), contrat `api.ts` clair. À améliorer : `Frise.tsx` (gestes, rendu et clavier dans un seul fichier), et les « boutons sur une ligne » de `Couper.tsx:64-81`, difficiles à lire.

### Accessibilité
Contrastes mesurés : texte doux #a3a9b6 sur le fond **8,0:1**, sur une surface 7,2:1 ; citron et texte foncé 16:1 ; orange sur fond 8,1:1, tous au-dessus de 4,5:1. Les boutons sont nommés (`aria-label`). La tête de lecture est un `role="slider"` utilisable au clavier, comme les poignées. Il y a une `progressbar` et des toasts `role="status"`. Les boutons font 48 à 56 px, sauf M-1.

## 3. Conformité au cahier des charges

### `decisions-phase1.md`
| Point | État | Note |
|---|---|---|
| Ordre Importer → Couper → Vertical → Exporter, « Étape x sur 4 » | ✅ Fait | |
| Fond flou + Plein écran (on glisse pour cadrer), Jeu + webcam « Bientôt » | ✅ Fait | test b |
| Vidéo verticale : étape sautée + message | ✅ Fait | tests a et n1 |
| Pas de Suivant sur Importer | ✅ Fait | |
| Découpe : poignées 24 px avec zone de 48 px à l'extérieur | ✅ Fait | `ecrans.css:296-315` |
| Zoom (pincer + −/+), règle en secondes | ✅ Fait | pincer non testé au doigt (headless) |
| Bulle de temps pendant le glissé | ✅ Fait | |
| ±1 image | ⚠️ Partiel | dérive I-2 |
| Commencer ici / Finir ici | ✅ Fait | |
| Sélection (contour citron), Supprimer grisé sans sélection | ✅ Fait | |
| Annuler / Rétablir (50 états) dans Couper et Vertical | ✅ Fait | |
| « Durée finale : 24 s » vert 7–30 s / neutre ≤ 45 s / orange + conseil | ✅ Fait | |
| Bande des 3 premières secondes | ✅ Fait | |
| Sauvegarde auto + reprise guidée + empreinte | ✅ Fait | test e (voir M-5) |
| Aperçu WebCodecs + AudioContext, même code que l'export | ⚠️ Partiel | même code ✅, mais aperçu noir au départ (B-1) |
| Export Worker + OPFS + cascade | ✅ Fait | |
| Estimations, batterie, espace, Wake Lock repris | ✅ Fait | batterie et espace non déclenchables en headless |
| Échec avec onglet caché → « L'export s'est arrêté pendant ton absence. Reprendre » | ✅ Fait (code) | échec non provoqué en test |
| Fin : aperçu en boucle + zone sûre, Partager, Télécharger (« Téléchargements »), astuce, « Monter un autre clip » | ✅ Fait | Partager masqué en headless (`canShare` faux) |
| 30 i/s | ✅ Fait | |
| Recette : `marqueurs`, `statut` | ✅ Fait | `types.ts:28-30` |
| aac-encoder MPL-2.0 | ✅ Vérifié | `node_modules/@mediabunny/aac-encoder/package.json` |
| Ce qui n'existe pas encore est masqué | ✅ Fait | |
| Critère de fin (e2e + tsc + vitest au vert) | ✅ Fait | test sur le Xiaomi : reste à faire par Romain |

### `retours-ux.md` §4 (phase 1)
| Point | État |
|---|---|
| Ordre + « Étape x sur 4 » | ✅ |
| Annuler / Rétablir dans l'en-tête de Couper et Vertical (48 px) | ✅ |
| Sauvegarde à chaque action + « Enregistré » discret | ✅ (après 1 s) |
| Retour Android = étape précédente sans perte | ✅ |
| Masquer l'inexistant | ✅ |
| Importer : pas de Suivant | ✅ |
| Barre de chargement avec le nom du fichier | ⚠️ Partiel : nom + roue + texte d'étape, pas de vraie barre (l'import est rapide : 186 ms pour 2 h) |
| Erreurs claires (format, durée, espace) | ⚠️ Partiel : format et codec ✅ ; durée et espace pas contrôlés à l'import |
| Vidéo verticale → Vertical sauté | ✅ |
| « Reprendre » avec une vraie vignette ; « Re-choisir la vidéo » | ⚠️ Partiel : pas de vignette (M-2), re-choisir ✅ |
| Poignées 24 / 48 px à l'extérieur | ✅ |
| Zoom au pincer + règle + bulle « 0:12,4 » | ✅ |
| −1 / +1 image | ⚠️ (I-2) |
| Commencer ici / Finir ici | ✅ |
| Sélection citron, Supprimer grisé | ✅ |
| « Durée finale » colorée | ✅ |
| Bande des 3 s | ✅ |
| Vertical : l'aperçu joue le passage coupé | ✅ (B-1 au démarrage) |
| Recadré : on glisse l'image | ✅ |
| Jeu + webcam : cadre, Inverser, mémorisé | ➖ Phase 2 (badge « Bientôt », conforme aux décisions) |
| Zone sûre désactivée par défaut | ✅ |
| Exporter, avant : durée, taille, temps, batterie, espace | ✅ |
| Pendant : %, temps restant, Annuler, Wake Lock repris | ✅ (B-2) |
| Après : boucle + interface TikTok, Partager, Télécharger + où va le fichier, astuce | ✅ |
| « Monter un autre clip » seulement après | ✅ |

§5 (textes) : tous les textes sont repris à l'identique dans `textes-fr.ts`, sauf « s'est mis en pause » remplacé par « s'est arrêté », comme le veulent les décisions, qui font foi.

### `architecture.md` : écarts notables
- `tests/e2e/coherence.spec.ts` (PSNR aperçu = export > 30 dB) : **manquant**.
- Test automatique avec une vidéo de 2 h (§4.2) : absent du dépôt. Je l'ai fait en QA (`f`) et tous les objectifs sont atteints (ouverture < 10 s, saut < 2 s, mémoire stable).
- Repli 360 × 640 (§4.3) : manquant (M-13).

## 4. Ce qui n'a pas pu être testé
- **Le vrai téléphone (Xiaomi)** : encodeur H.264 matériel, 1080 contre 1072, thermique, saccades de l'aperçu (I-4), mémoire, Wake Lock réel, partage Android (`navigator.share`), dossier Téléchargements. Les temps mesurés ici (encodage logiciel sur un PC Linux) ne valent pas pour un téléphone.
- Les gestes tactiles réels (pincer, deux doigts, vibration de l'aimant) : simulés à la souris seulement.
- Les alertes batterie faible et manque de place : impossibles à provoquer en headless.
- Un vrai passage en arrière-plan sur Android (gel de l'onglet) et le message « pendant ton absence » : seul `visibilitychange` a été simulé, et l'export a réussi.
- La mise à jour PWA (« Recharger ») et le mode hors ligne.
- Le son réellement entendu dans l'aperçu (pas de sortie audio en headless).
- Les sources HEVC décodables (Chrome sur Android peut lire du HEVC) et les fichiers de plus de 4 Go.

## 5. Fichiers de la QA
- Configuration : `tests/qa/playwright.qa.config.ts` (lancer d'abord `npx vite preview --port 4173`, ou laisser `webServer` construire l'appli).
- Scénarios : `tests/qa/{a…n}-*.qa.ts`, outils communs dans `tests/qa/outils.ts`.
- Vidéos de test générées : `tests/qa/fixtures/` (221 Mo, dont la vidéo de 2 h : 219 Mo, à ne pas committer).
- Captures 360 × 740 et 320 × 640 : `tests/qa/captures/`.
- Résultats JSON détaillés : `tests/qa/resultats-qa.json`.
