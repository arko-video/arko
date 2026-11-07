// Atelier des chibis (D, dev 3) : grand aperçu animé, styles, Au hasard, Ressemble à… (traits un par un), grille des
// 24 émotions (bouche animée), nom, Garder dans Ma bibliothèque, Exporter en PNG, Tout exporter (.zip). Ouvert par
// ChoixChibi (`pour`) : « Choisir ce chibi » et la liste de Mes chibis.

import { useEffect, useState } from 'preact/hooks';
import { EMOTIONS, STYLES_ATELIER } from '../../../chibis/catalogue';
import { TV } from '../../../textes-v3';
import { IconeRetour } from '../../composants/Icones';
import { Pastilles } from '../../composants/outils/Commun';
import { ApercuChibi } from './ApercuChibi';
import { arreterHorloge, auHasard, brouillon, changerTrait, choisir, demarrerHorloge, emoChoisie, exporterPng, sitChoisie, exporterZip, garder, idBrouillon, mesChibis, nomBrouillon, occupe, preparer } from './atelier';
import { atelierOuvert, fermerAtelier } from './etat-chibis';
import { PersosPrets, Situations } from './RangeesPerso';
import { TraitsChibi } from './TraitsChibi';
import './chibis.css';

export function AtelierChibi() {
  const d = atelierOuvert.value;
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (!d) return;
    setPret(false);
    demarrerHorloge();
    void preparer(d).then(() => setPret(true));
    return arreterHorloge;
  }, [d]);
  if (!d) return null;
  const t = TV.chibis;
  const def = brouillon.value;
  const emo = emoChoisie.value;
  const nom = nomBrouillon.value.trim() || t.nomDefaut;
  return (
    <div class="bibliotheque-fond" data-testid="v3-atelier">
      <div class="ecran bibliotheque atelier-chibi">
        <header class="entete">
          <button type="button" class="btn btn-icone" aria-label={t.nouveau} onClick={fermerAtelier} data-testid="v3-atelier-fermer">
            <IconeRetour taille={22} />
          </button>
          <h1 class="entete-titre">{idBrouillon.value ? t.modifierTitre : t.nouveau}</h1>
        </header>
        <main class="ecran-corps">
          {d.pour && (mesChibis.value?.length ?? 0) > 0 && (
            <section class="chibi-section">
              <h2 class="outil-sous-titre">{t.mesChibis}</h2>
              <div class="chibi-vignettes">
                {mesChibis.value!.map((c) => (
                  <button key={c.id} type="button" class="chibi-vignette" onClick={() => void choisir(c.def, c.id)} data-testid={`atelier-mien-${c.id}`}>
                    <ApercuChibi def={c.def} taille={62} />
                    <span class="petit">{c.nom}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div class="chibi-scene" data-testid="atelier-apercu" data-pret={pret ? '1' : '0'}>
            <ApercuChibi def={def} emo={emo} sit={sitChoisie.value} taille={220} anime signes label={t.apercu(nom, t.emotions[emo])} />
          </div>
          <Pastilles label={t.style} choix={STYLES_ATELIER} actif={def.style} onChoisir={(style) => changerTrait({ style })} prefixe="chibi-style" rendu={(k) => <span>{t.styles[k]}</span>} />
          <div class="chibi-actions">
            <button type="button" class="btn btn-principal" onClick={auHasard} data-testid="chibi-hasard">
              {t.hasard}
            </button>
          </div>
          <PersosPrets />
          <details class="chibi-section" data-testid="chibi-ressemble">
            <summary class="btn">{t.ressemble}</summary>
            <TraitsChibi />
          </details>
          <section class="chibi-section">
            <h2 class="outil-sous-titre">
              {t.emotion} · {t.variantes(EMOTIONS.length * 2)}
            </h2>
            <div class="chibi-grille" role="radiogroup" aria-label={t.emotion}>
              {EMOTIONS.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={e === emo} class="chibi-vignette" data-actif={e === emo ? '1' : '0'} onClick={() => (emoChoisie.value = e)} data-testid={`chibi-emo-${e}`}>
                  <ApercuChibi def={def} emo={e} sit={sitChoisie.value} taille={70} anime />
                  <span class="petit">{t.emotions[e]}</span>
                </button>
              ))}
            </div>
          </section>
          <Situations def={def} />
          <label class="champ-saisie">
            <span class="outil-sous-titre">{t.nom}</span>
            <input type="text" maxLength={24} autoComplete="off" placeholder={t.nomIndice} value={nomBrouillon.value} onInput={(e) => (nomBrouillon.value = (e.currentTarget as HTMLInputElement).value)} data-testid="chibi-nom" />
          </label>
          <div class="chibi-actions">
            {d.pour && (
              <button type="button" class="btn btn-principal" onClick={() => void choisir()} data-testid="chibi-choisir">
                {t.choisir}
              </button>
            )}
            <button type="button" class={`btn ${d.pour ? '' : 'btn-principal'}`} onClick={() => void garder()} data-testid="chibi-garder">
              {idBrouillon.value ? t.enregistrer : t.garder}
            </button>
            <button type="button" class="btn" onClick={() => void exporterPng()} data-testid="chibi-png">
              {t.exporterPng}
            </button>
            <button type="button" class="btn" disabled={occupe.value} onClick={() => void exporterZip()} data-testid="chibi-zip">
              {t.exporterTout}
            </button>
          </div>
          <p class="petit doux">{t.licence}</p>
        </main>
      </div>
    </div>
  );
}
