# Arko — Architecture technique (phases 1 à 6)

Version 1, 3 novembre 2026. Rédigée par l'agent architecte, arbitrée dans `decisions-phase1.md` (en cas de conflit, `decisions-phase1.md` l'emporte).

## 0. Quatre principes
1. **La recette est la seule source de vérité.** L'interface et l'IA écrivent la même recette JSON ; l'aperçu et l'export ne lisent qu'elle.
2. **Un seul moteur de rendu** : aperçu et export appellent les mêmes fonctions de dessin et de mixage.
3. **Jamais un fichier entier en mémoire** : lecture par morceaux, MP4 écrit sur disque (OPFS).
4. **Code lisible par un débutant** : fichiers < 300 lignes, noms et commentaires en français, fonctions pures testées.

## 1. Pile
| Élément | Version | Rôle |
|---|---|---|
| Vite | 8.x | dev + build |
| TypeScript | strict | types |
| Preact + @preact/signals | 10.x/11.x | interface (JSX), état par signals |
| mediabunny | **1.65.1 figée** (≥ 1.64 obligatoire, bug Android) | lecture, décodage, encodage, MP4 |
| @mediabunny/aac-encoder | 1.65.1 (MPL-2.0, vérifié npm) | AAC de secours, chargé à la demande |
| vite-plugin-pwa | dernière | manifest + service worker (`registerType: 'prompt'`) |
| idb-keyval | 6.x | sauvegarde auto |
| Vitest / Playwright | dernières | tests |

Pas de framework CSS, pas de routeur (signal `ecran`), pas de Zod, pas de ffmpeg.wasm. Polices via `@fontsource/inter` et `@fontsource/space-grotesk` (OFL). Hébergement GitHub Pages (`base: '/arko/'`), CI : `tsc --noEmit`, `vitest run`, `playwright test`.

## 2. Arborescence
```
src/
  main.tsx · textes-fr.ts
  recette/  types.ts · defauts.ts · temps.ts · normaliser.ts · migrations.ts · chronologie.ts · operations.ts · schema.json · exemples/
  moteur/   api.ts (contrat avec l'UI) · capacites.ts · sources.ts · rendre.ts · etat-image.ts · compositeur.ts · curseur-images.ts
            mises-en-page/{flou,recadre,jeu-cam}.ts · couches/{textes,sous-titres,zooms,transitions}.ts (bouchons)
            audio/{lecteur-audio,reechantillonner,mixeur}.ts · lecteur.ts
            export/{worker,exporter,cascade,sortie-opfs,client}.ts
  sons/{catalogue,chargeur}.ts · sous-titres/transcrire.ts (bouchon) · ia/{moments,analyse,agent}.ts
  integration/monhub.ts (bouchon) · stockage/{projet,fichiers}.ts
  ui/ etat.ts · App.tsx · ecrans/{Importer,Couper,Vertical,Exporter}.tsx · composants/… · styles/theme.css
tests/ fixtures/test-1920x1080.mp4 · e2e/export.spec.ts · e2e/coherence.spec.ts
```

## 3. Recette `arko.recette/1`
- Clés françaises courtes mais entières ; abréviations seulement `t` (temps de sortie), `ts` (temps source), `dur`.
- Temps en secondes arrondis au 1/100 ; le normaliseur accepte aussi `"12,5"` et `"1:02:14.5"`.
- Dans `plans`, `de`/`a` = temps source. Sons, zooms, mots en `ts` suivent la vidéo (réapparaissent si un passage est réutilisé). Textes toujours en `t`.
- Les transitions ne font pas chevaucher les plans : **durée finale = Σ (a − de) / vit**.
- `plan.mise` du même type que la mise globale est fusionnée.
- Types complets : `src/recette/types.ts`.

### Normaliseur (corrige au lieu de rejeter, messages en français)
| Champ | Défaut | Correction |
|---|---|---|
| temps | — | chaînes converties, arrondi 1/100, négatif → 0 |
| plans de/a | — | inversés → échangés ; bornés à [0, durée source] ; plan < 0,10 s supprimé |
| vit | 1 | [0,25 ; 4] |
| src | 1re source vidéo | inconnue → remplacée si une seule source, sinon plan supprimé |
| trans | coupe franche | type inconnu → coupe ; dur [0,1 ; 0,6] défaut 0,3 |
| mise | {type:'flou'} | type inconnu → flou ; x,y [0,1] ; cam.l/h ≥ 0,05 ; partCam [0,25 ; 0,6] défaut 0,35 |
| textes | style accroche, dur 3, x 0,5, y 0,2 | t borné ; dur ≥ 0,3 ; y ramené dans [0,15 ; 0,62] ; 120 caractères max ; vide supprimé |
| sousTitres | style karaoke, y 0,58, parLigne 3 | mots triés ; fin ≥ début + 0,05 ; mot ≤ 1,5 s |
| sons | vol 0,8 | id inconnu supprimé + 3 ids proches proposés ; vol [0 ; 1,5] ; ni t ni ts → supprimé ; les deux → ts |
| zooms | dur 0,6, x,y 0,5, force 1,3, punch | force [1 ; 2,5] ; dur [0,2 ; 5] |
| guide | null | vol [0 ; 1] défaut 0,6 |
| durée totale | — | > 180 s conseil ; > 600 s bloquant ; aucun plan bloquant |
| clé inconnue | — | ignorée + suggestion (« plan » → « plans ») |
| format | — | absent → v1 supposée + avertissement ; /2+ bloquant |

Exemples de messages : « La fin (12,00 s) était avant le début (15,30 s) : je les ai inversées. » · « Le son "vine_boom" n'existe pas. Sons proches : impact.boom, impact.grave, cartoon.boing. Son retiré. » · « Le texte sortait de la zone visible sur TikTok (y = 0,90) : remonté à 0,62. »

L'interface ne modifie jamais la recette directement : `operations.ts` → `normaliser` → historique → sauvegarde auto.

### Exemple minimal écrit par une IA (≈ 90 tokens)
```json
{"format":"arko.recette/1","plans":[{"de":842.3,"a":851},{"de":855.2,"a":859.8,"trans":"whoosh"}],
 "textes":[{"txt":"Le one-shot le plus sale","t":0}],"sousTitres":{"mots":"auto"},"sons":[{"id":"impact.boom","ts":857.1}]}
```

### Résumé des moments envoyé à l'IA (phase 6)
```
ARKO-MOMENTS/1 src=s1 duree=10835.2 langue=fr nb=87
# id debut fin score etiquettes | extrait (≤ 80 caractères)
m01 842.3 859.8 87 rire,cri | "attends attends… NON il m'a one-shot"
m02 1203.0 1215.4 74 silence>pic | "bon… j'ai rien vu venir"
```
≈ 30 tokens/ligne ; 100 moments ≈ 3 000 ; consignes ≈ 800 ; 30 recettes ≈ 6 000 → **≈ 10 000 tokens par live**.

## 4. Moteur
### 4.1 Un seul chemin de rendu
`rendre(recette, sources) → { duree, image(t, ctx, env), audio(t0, n, {guide}), fermer() }` utilisé par l'aperçu (`lecteur.ts`) et l'export (Worker).
1. `compiler(recette)` (pur) → Scenario : plans en temps de sortie, `sourceA(t)`, `sortiesDe(src, ts)`, sons/zooms/mots convertis.
2. `etatImage(scenario, t)` (pur) : plan, ts, mise fusionnée, zoom, textes, sous-titres, transition.
3. `dessinerImage(ctx, etat, image, env)` : mise en page → zoom → transition → textes → sous-titres. Tailles définies pour 1080 px × `env.echelle`. **Canevas du flou fixe 90 × 160** (aperçu = export).
4. `CurseurImages` par plan : parcourt `VideoSampleSink.samples(de, a)` vers l'avant, ferme chaque image remplacée, garde l'image au ralenti. `sample.draw()` gère la rotation.
On remplace la Conversion API du prototype par `Output` + `CanvasSource` + `AudioSampleSource` (plans multiples, mixage, calques).

### 4.2 Longs fichiers (1 h 30 – 5 h)
Une `Input` par source (`BlobSource(file, {maxCacheSize: 16 Mio})`), une `VideoSampleSink` et une `AudioSampleSink` par source ; lecture à la demande. `computeDuration()` une fois à l'import. Test dès la phase 1 avec une vidéo de 2 h basse résolution (ouverture < 10 s, saut à 1 h 30 < 2 s, mémoire stable).

### 4.3 Aperçu (`lecteur.ts`)
Horloge `AudioContext.currentTime` (modèle « media-player » de Mediabunny). À chaque rAF : `rendu.image(t, ctx, {l:540,h:960,echelle:0.5})`, images sautées si retard, jamais le son. Pré-décodage ~0,5 s avant une coupe. Son : blocs de 0,25 s via `rendu.audio(..., {guide:true})` → `AudioBufferSourceNode.start(quand)`. Zone sûre = calque DOM (haut 12,5 %, bas 34,375 %, côtés 11,1 %), jamais dans le canevas.

### 4.4 Export (Worker)
Boucle image par image : `rendu.image(t)` sur un `OffscreenCanvas` → `CanvasSource.add(t, 1/30)` (await = contre-pression) ; audio entrelacé ≈ 0,5 s d'avance via `AudioSampleSource` + `AudioSample` f32-planar 48 kHz stéréo (son guide retiré). Progression tous les 15 images. Encodeur AAC de secours enregistré dans le Worker si `canEncodeAudio('aac')` échoue.

### 4.5 Écriture sans RAM
OPFS depuis le Worker : `createSyncAccessHandle()` enveloppé dans un `WritableStream` → `StreamTarget(flux, {chunked:true, chunkSize: 4 Mio})`. `Mp4OutputFormat({fastStart:'reserve'})` avec `maximumPacketCount` (vidéo : ceil(nbImages×1,33)+10 ; audio : ceil(durée×100×1,33)+10) ; repli `fastStart:false`. Jamais `'in-memory'` ni `'fragmented'`. Fin : `getFile()` → Partager (`navigator.share`, geste requis) / Télécharger (`<a download>`), nom `arko-AAAAMMJJ-HHMMSS.mp4`. Avant export : `storage.estimate()` ≥ débit × durée × 1,3 ; on garde les 3 derniers exports.

### 4.6 Mixage (pur, JS, 48 kHz stéréo)
Par bloc : lecture de la plage source (`AudioSampleSink`, `copyTo` f32-planar) → rééchantillonnage linéaire (× vit, hauteur qui baisse au ralenti assumée) + mono→stéréo → fondu 5 ms aux coupes → effets sonores × vol → son guide seulement si `guide:true` → écrêtage doux `tanh` au-delà de 0,95.

### 4.7 Cascade d'encodage
| Essai | Taille | Codec | Accélération | Débit |
|---|---|---|---|---|
| 1 | 1080×1920 | avc1.640028 | prefer-hardware | 10 Mb/s |
| 2 | 1080×1920 | avc1.640028 | no-preference | 10 Mb/s |
| 3 | 1080×1920 | avc1.640028 | prefer-software | 10 Mb/s |
| 4 | 720×1280 | avc1.4d401f | no-preference | 6 Mb/s |
`canEncodeVideo(...)` puis essai réel de 15 images vers `NullTarget` (< 2 s). Résultat mémorisé (`localStorage arko.encodage` + version de Chrome). Échec d'un vrai export → une fois l'essai suivant. 1072 au lieu de 1080 accepté (`onEncoderConfig`).

### 4.8 Ma bibliothèque (novembre 2026)
Clips vidéo (Fonds verts, Mèmes) gardés en entier dans l'OPFS (`stockage/clips.ts`), sons et musiques dans la base de
Mes sons. La recette ne garde que `source.bib`. Fond vert / mème incrusté = `recette.incrustations`, rendus par
`moteur/incrustation/incruster.ts` dans `rendre()` (décodage par le cache, détourage WebGL2 `gpu-chroma.ts` ou
processeur `chroma.ts`, même calcul) ; mème « Coupure » = un plan ordinaire. Détails : `docs/passation.md`.

## 5. Risques et parades
| Risque | Parade |
|---|---|
| H.264 1080×1920 refusé sur certains Android | cascade + essai réel + 720p, test sur le Xiaomi |
| Mémoire saturée | images fermées, OPFS + reserve, cache 16 Mo |
| Aperçu saccadé | 540×960, flou 90×160, repli 360×640 au-delà de 30 % d'images sautées |
| Aperçu ≠ export | `rendre()` unique, test PSNR > 30 dB |
| Onglet gelé pendant l'export | Worker, Wake Lock, message, sauvegarde auto |
| Recettes IA fausses | normaliseur + corpus `erreurs-ia/` + JSON Schema |
| Source perdue après rechargement | empreinte + re-sélection guidée |
| Pas d'AAC / H.264 en headless | aac-encoder ; `channel: 'chrome'` si besoin |
