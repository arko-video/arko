# Arko phases 4, 5 et 6 : rapport de QA indépendante (final)

4 novembre 2026. Relecteur qui n'a pas vu le code s'écrire, sur `app/` (personne d'autre ne le modifiait). Références : `conception/decisions-phases-2-6.md` (Phase 4, Phase 5, Phase 6) et `conception/phases-2-6.md`.
Environnement : Linux, Chrome stable headless (Playwright `channel: 'chrome'`), 360 × 740, **2 cœurs** (souvent 2 lots de scénarios en parallèle : les temps sont pessimistes), ffmpeg 6.1. Rien n'a été modifié dans `src/`, `tests/e2e/`, `index.html` ni les configs. Ajouts et retouches seulement dans `tests/qa/` (voir § 4).

## 1. Résultats

`npx tsc --noEmit` : 0 erreur. `npx vitest run` : 43 fichiers, **379 tests réussis**.

### Nouveaux scénarios (phases 4, 5, 6)

12 scénarios : **11 réussis**, 1 en échec sur un vrai bug (p6-c, I-1).

| # | Scénario | Résultat | Mesures |
|---|---|---|---|
| p4-a | Vitesse 0,5 + arrêt 1 s sur [0 ; 4], vitesse 2 sur [4 ; 10] | ✅ | MP4 **12,011 s** pour Σ((a − de)/vit + fige) = 12. Temps source de chaque image (carré rouge) à ±0,04 s des valeurs attendues, à 9 instants. Pendant l'arrêt (8–9 s) : écart entre images **0,00** (vraiment figée) et son **RMS 0** (muet). Ralenti **220 Hz** et accéléré **878 Hz** pour un 440 Hz (plus grave / plus aigu, comme annoncé). Sons en temps source au bon endroit (**6,0 s** et **9,75 s**). Sous-titre « boîte » visible à 9,7 s, absent pendant l'arrêt. |
| p4-b | Combos | ✅ | Boom touché à 5,40 s → posé à **5,11** (pic du clic 5,0–5,1 ; sans aimant : 5,25). Loin d'un pic, 3,50 → **3,35** (recul seul). Figé à 7,70 → coupe à **7,59**, arrêt 1 s, disque rayé à 7,58. **Un seul Annuler** retire zoom + son, ou coupe + arrêt + son. Combo pendant la lecture : posé. Raté + Figé exportés : **12,501 s** pour 12,5 attendus, image figée (écart 0,00). |
| p4-c | Modèles | ✅ | Top 3 avec 2 plans : bouton grisé + « Il faut au moins 3 passages… », clic forcé sans effet, **2 plans gardés**. Top 3 sur 4 plans : **4 plans gardés**, #3/#2/#1 à 2/5/8 s, « TOP 3 » à 0, transitions zoom. « Le meilleur d'abord » à 7 s : copie [6,25 ; 7,75] au début, glitch, « ATTENDS… » 0–1,5 s ; texte 2 → **3,5**, son en temps de sortie 6 → **7,5**, zoom 4 → **5,5**, son en temps source inchangé (ts 7). Annulé d'un coup. |
| p4-d | Alerte de rythme | ✅ | Texte à 0,5 s et zoom à 5 s sur 10 s sans pic : **1 seul repère** (Habiller et Couper), son toucher amène la tête à **5,0** (pire passage 5 → 10), message « Ça traîne ici… ». |
| p4-e | Mes montages | ✅ | 3 projets, renommer (`  Mon   <b>clutch</b>  ` → « Mon <b>clutch</b> », affiché en texte), dupliquer « (copie) », supprimer avec confirmation. Son importé du projet B (vieilli de 2 h, hors délai de grâce) **gardé** après les enregistrements de A et C et la suppression de la copie ; B rouvert après rechargement avec son son, sans message « pas retrouvé ». B supprimé ⇒ son effacé (bon nettoyage). |
| p4-f | Migration `arko.projet` | ✅ | Ancienne clé écrite dans IndexedDB depuis une page de la même origine **avant** de charger l'appli : carte « Arrêté à : Vertical », `arko.projet` supprimée, `arko.projets` + 1 `arko.projet.<id>`, plans identiques après réouverture. |
| p4-nr | Parcours complet (parole 1280 × 720) | ✅ | Coupe à 5 s + fin à 9 s, fond flou, accroche, sous-titres (vrai modèle servi en local, **16 mots**), boum, flash, zoom, combo Boom. MP4 **9,003 s**, 1080 × 1920, AAC ; accroche présente à 0,5 s et partie à 4 s ; mot en cours citron sur 8 images sur 9 ; flash à la coupe (luminance 29 → 253) ; aucun CDN. Export 14,3 s. |
| p6-a | Monteur sans IA, 6 min | ✅ | Analyse rapide (sans transcription) **1,9 s**. Moments à **60 / 120,6 (voix) / 180 / 300 s**. 4 clips de 15 s, chacun couvre son pic. Garder, Jeter ; « Reprendre ma revue (2 clips restants) » ⇒ après rechargement, reprise à **3 / 4**. Fin « 3 clips gardés dans Mes montages » ; le clip ouvert (vidéo re-choisie) s'exporte : **15,02 s** pour 15,00. Wake Lock 2 pris / 2 relâchés, Worker d'analyse fermé. |
| p6-b | Avec l'IA, faux Anthropic | ✅ | « Clé acceptée », clé affichée « sk-…bbbb », coût « environ 1 800 tokens ». **401** ⇒ « Clé refusée : vérifie-la. » + « Continuer sans IA » ; **429** ⇒ « Trop de demandes ou crédit épuisé… » + « Continuer sans IA ». Réponse **coupée** ⇒ 2 clips sur 3 (M-4). Réponse en **markdown** ⇒ 3 clips. Titre `<img onerror>` et raison `<script>` affichés en texte, **jamais exécutés**. 6 requêtes, toutes vers api.anthropic.com avec `anthropic-version: 2023-06-01` et `anthropic-dangerous-direct-browser-access: true`. Clé absente de `localStorage`, de la console et du texte « Voir ce qui est envoyé ». |
| p6-c | Sécurité de la clé | ❌ (I-1) | Clés OpenAI et Gemini envoyées **seulement** à leur domaine, dans un en-tête (jamais dans l'adresse). « Oublier ma clé » retire `cle:gemini` d'IndexedDB (`arko-cles`). CSP : `fetch('https://example.com')` et `fetch('http://localhost:1234')` **bloqués** (violation `connect-src` relevée). **Mais** une clé tapée pour Anthropic reste dans le champ après le passage à OpenAI. |
| p6-d | Analyse d'une vidéo de 2 h | ✅ | **27,4 s** (1 cœur libre). Tas JS de la page ≤ **16 Mo** ; Chrome entier (tous processus) 994 → **1 266 Mo** au plus. Aucun moment (fixture sans événement) : « Je n'ai trouvé aucun moment fort… », pas de bouton. Annuler à 22 % ⇒ « interrompue », Worker fermé. Reprendre ⇒ « Analyse reprise à 4:00 », **24,8 s** (M-6). Wake Lock 6 pris / 6 relâchés. |
| p5-a | Aide | ✅ | **3 conseils** au 1er lancement, plus revus après rechargement. Écran Aide au clavier : 5 cartes, `lang="fr"`, titres h1/h2, aucun bouton sans nom, lien « Code source » `noopener noreferrer`, Retour ⇒ Importer. Focus non déplacé (M-9). |

Aucune erreur dans la console sur ces scénarios. Aucun fichier TS/TSX/CSS de plus de 300 lignes (les plus gros : `src/ui/etat.ts` **298**, `src/ui/styles/habiller.css` 297, `src/ia/signaux.ts` 285).

### Phases précédentes (relance)

42 scénarios (a…n, p2, p3) : **38 réussis**, 2 obsolètes, 2 non lancés. **Aucune régression trouvée.**
- Adaptés aux changements **voulus** puis réussis : `e-reprise` (×2), `f-longue`, `g-ecrans`, `n-divers` n3, `p2-annuler-reprise`, `p3-guide` (« Mes montages » remplace la carte « Reprendre ») ; `f-longue`, `i-apercu`, `j-limites` j1 (une vidéo de plus de 5 min propose d'abord le monteur IA) ; `p2-annuler-reprise` encore (`corriger-partout` → `corriger-identiques`). Tout le reste passe sans retouche, y compris les contrôles d'Annuler (c, p2-i, p3-*).
- Obsolètes (pas des bugs) : **p2-e** attend `arko.corrections` dans `localStorage` après « tous les mots identiques » ; c'est maintenant le choix séparé « retenir pour mes prochaines vidéos » (décision après la QA p2). **p2-g** glisse le cadre webcam depuis l'ancien défaut ; le nouveau défaut (en bas à gauche) le colle au bord (y + h = 1,00 > 0,97). p2-f et p2-e2 n'ont pas tourné (série arrêtée après p2-e).
- Config QA : `actionTimeout: 15 000` ajouté (un clic sur un élément disparu attendait jusqu'à la fin du scénario, 10 min).

## 2. Bugs

### Bloquant
Aucun.

### Important

**I-1. La clé tapée part chez le mauvais fournisseur** (ia, sécurité)
- `src/ui/composants/monteur/ReglagesIA.tsx:29` : `cleSaisie` est un signal global, et le choix du fournisseur (`:122`, `regler({ fournisseur })`) ne le vide pas. `src/ui/ecrans/monteur/Demande.tsx:49-53` garde ensuite `tapee` sous le fournisseur **courant**.
- Mesure (p6-c) : clé Anthropic collée, puis toucher « OpenAI » ⇒ le champ OpenAI contient la clé Anthropic. « Tester » ou « Lancer » l'envoie à api.openai.com. Pire (lu dans le code, `Demande.tsx:51-52`) : si une clé OpenAI était déjà gardée, le champ est caché (« Clé gardée : sk-…2222 »), mais « Lancer » **écrase** la clé OpenAI gardée par la clé Anthropic, sans rien montrer, puis l'envoie à OpenAI.
- Correction : vider `cleSaisie` à chaque changement de fournisseur (ou une saisie par fournisseur), et ne garder `tapee` que si le champ est visible.

**I-2. « Trouver le moment fort » prend le premier pic, pas le plus fort** (interface, moteur)
- `src/moteur/audio/pics-calcul.ts:102` renvoie les pics **triés par temps**. `src/ui/rythme.ts:178-186` (`meilleurMoment`) départage les égalités par « le premier de la liste (le plus fort si le moteur les trie par force) ».
- Effet : dès que les pics sont isolés (le cas courant), « Le meilleur d'abord » copie le **premier** pic de la vidéo, pas « le pic le plus fort » demandé par la décision Phase 4.
- Correction : faire renvoyer la force avec chaque pic (ou un tri par force) et choisir le plus fort.

**I-3. Le Wake Lock peut rester pris** (ia)
- `src/ui/monteur/analyse-monteur.ts:59-66` : après `await navigator.wakeLock.request()`, on ne revérifie pas `actif`. Si l'analyse se termine ou est annulée pendant la demande (reprise d'une analyse déjà finie, Annuler tout de suite), le verrou obtenu ensuite n'est jamais relâché. L'écran reste allumé jusqu'au prochain changement d'onglet.
- Le cas normal est bon (p6-a 2/2, p6-d 6/6). Un 2ᵉ verrou est pris en double par `src/ia/client-analyse.ts:135` (inutile).
- Correction : `if (!actif) { sentinelle.release(); return; }` après l'`await`, et un seul des deux verrous.

### Mineur
- **M-1** (interface) `src/ui/ecrans/monteur/Revue.tsx:118` : `onPointerCancel={haut}`. Avec `touch-action: pan-y` (`revue.css:121`), un geste en diagonale repris par le navigateur déclenche `pointercancel` (dont `clientX` peut valoir 0) et compte comme un balayage, donc « Jeter » sans le vouloir. Sur annulation : remettre `dx` à 0 sans agir.
- **M-2** (interface) `src/ui/composants/outils/OutilCombos.tsx:39` : le combo part au `pointerdown`. Un doigt posé sur un bouton pour faire défiler le panneau pose un combo (le message Annuler limite le mal). De plus, `data-testid="outil-combos"` est à la fois sur le bouton de la barre (`Habiller.tsx:214`) et sur le contenu du panneau (`OutilCombos.tsx:29`) : un clic au centre du panneau tombe sur « Figé » (vu pendant la QA).
- **M-3** (interface) `src/ui/rythme.ts:72` : `picsActuels()` renvoie les pics de la recette **d'avant** pendant le recalcul (0,8 s + décodage). Un 2ᵉ combo juste après un Figé ou un Raté s'aimante sur des temps décalés de 1 à 1,5 s.
- **M-4** (ia) Réponse coupée (p6-b) : l'écran dit seulement « 1 correction faite sur les propositions de l'IA » et « Voir mes 2 clips ». La remarque « La réponse de l'IA était coupée… » (`extraire-json.ts`) n'est pas montrée : l'utilisateur ne sait pas pourquoi il a 2 clips au lieu de 3.
- **M-5** (stockage) `src/ui/monteur/revue-monteur.ts:128` : `estLeMeme` compare `p.titre === r.titre`. Une recette de l'IA sans titre prend un titre par défaut différent, donc risque de doublon à la reprise des « gardés pas encore écrits ». Et la revue est écrite sans attendre (`persister`, `:36`) : recharger dans les ~200 ms après Garder ou Jeter perd ce choix (vu pendant la mise au point de p6-a : reprise à 1 / 4).
- **M-6** (ia) Reprise d'analyse peu utile : les points sont écrits toutes les 2 min de **son** (`lecture-analyse.ts:4`), mais la progression compte les images à 30 % alors qu'elles vont bien plus vite. Annulée à « 22 % », l'analyse de 2 h reprend à 4:00 et la reprise dure 24,8 s contre 27,4 s pour tout refaire. Afficher un pourcentage fondé sur le son.
- **M-7** (ia) `src/ui/ecrans/monteur/Demande.tsx:52` : `sauverCle(...).catch(() => {})`. Si la clé ne peut pas être gardée (navigation privée), l'analyse part puis échoue avec « Colle d'abord ta clé API », ce qui est trompeur.
- **M-8** (moteur) `src/recette/modeles.ts:33` : Top 3 retire sans prévenir les textes de l'utilisateur qui valent exactement « #1 », « #2 » ou « #3 ».
- **M-9** (interface, accessibilité) À l'ouverture de l'Aide, le focus reste sur `body` (p5-a) : le placer sur le titre « Aide ». `DialoguesMontage.tsx:88` limite le titre à 60 caractères, alors que le stockage en accepte 120 (`projets-index.ts:15`).
- **M-10** (ia) Titre « Calme puis gros pic à **0:59** » pour un bip à 1:00 et « à 4:59 » pour 5:00 (`sans-ia.ts`, `heure()` arrondit vers le bas un pic à 59,98 s).
- **M-11** (interface) Textes pas en français : « scratch » (`textes-rythme.ts:28`, « Arrêt sur image + scratch »), « Boom », « Top 3 », « tokens ». Anglicismes à faire valider par Romain.

## 3. Pas testé

Le vrai téléphone (Wake Lock réel, mise en veille, balayage au doigt avec `pointercancel`, vibration), les vraies API (aucune vraie clé : faux fournisseurs seulement), Gemini et OpenAI en génération complète (seul « Tester ma clé » passe par eux ; la génération est faite avec le faux Anthropic), la transcription pendant l'analyse du monteur (« Analyse rapide » seulement), les fichiers du dépôt de la phase 5 (`CONTRIBUTING`, `CREDITS`, `SECURITY`, module Mon Hub) n'ont été que survolés.

## 4. Fichiers

- Scénarios : `tests/qa/p4-vitesse-combos.qa.ts` (p4-a, p4-b), `p4-modeles-montages.qa.ts` (p4-c à p4-f), `p4-nonreg.qa.ts` (p4-nr), `p6-monteur.qa.ts` (p6-a à p6-d, p5-a). Outils : `tests/qa/p4-outils.ts`.
- Fixtures fabriquées avec ffmpeg : `tests/qa/fixtures/p4-boite-10s.mp4` (carré rouge qui descend de 100 px/s : sa position donne le temps source de chaque image ; 440 Hz continu + 3 clics forts à 2,0 / 5,0 / 7,5 s) `p4-parole-paysage.mp4` (`parole-fr.mp4` mise en 1280 × 720 pour pouvoir choisir le fond flou) et `p6-bips-voix-6min.mp4` (bruit rose faible, bips de 1 kHz à 1:00, 3:00, 5:00, `parole-fr.wav` collée à 2:00).
- Copiés depuis la copie figée `qa-p3/` (absents de `app/`) : `p3-outils.ts`, `p3-*.mjs/.mts/.py` et `fixtures/p3-*`.
- Adaptés (changements d'interface VOULUS) : `outils.ts` (`projetSauve` lit le projet courant de `arko.projets` ; `importer` choisit « Je monte moi-même » pour une vidéo de plus de 5 min ; nouveaux `cleCourante`, `rouvrirDernier`), `p2-outils.ts` (`injecter` écrit dans `arko.projet.<id>` et rouvre par Mes montages), `e-reprise`, `f-longue`, `g-ecrans`, `n-divers`, `p2-annuler-reprise`, `p3-guide` (carte « Reprendre » → « Mes montages »).
- Config QA : `actionTimeout: 15_000` dans `tests/qa/playwright.qa.config.ts`. Résultats bruts : `tests/qa/resultats-*.json`.
- Lancer : `npx playwright test --config tests/qa/playwright.qa.config.ts p4- p6-`.
