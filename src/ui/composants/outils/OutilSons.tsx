// Outil Sons : les familles en onglets, un toucher écoute le son, « + » le pose à la tête de lecture
// (attaché au temps source). En bas : importer un son ou l'enregistrer au micro, et la phrase sur les droits.
// Un son choisi sur la mini-frise ouvre ses réglages (PanneauSon).

import { useEffect } from 'preact/hooks';
import { catalogueSons, ecouterSon, famillesSons, type SourceOuverte } from '../../../moteur/api';
import { T } from '../../../textes-fr';
import { recetteAffichee } from '../../etat';
import {
  ajouterSonIci,
  idSonImporte,
  importEnCours,
  importerFichierSon,
  ongletSons,
  sonChoisi,
  sonsImportes,
} from '../../effets';
import { formatDuree } from '../../format';
import { IconeAlerte, IconeImporter, IconeLecture, IconePlus } from '../Icones';
import { BoutonMicro } from './Micro';
import { PanneauSon } from './PanneauSon';
import { Onglets } from './Reglages';

/** Arrêt du son en cours d'écoute (un seul à la fois). */
let arreterEcoute: (() => void) | null = null;

export function arreterLecture() {
  arreterEcoute?.();
  arreterEcoute = null;
}

async function ecouter(son: string | SourceOuverte) {
  arreterLecture();
  try {
    arreterEcoute = await ecouterSon(son);
  } catch (e) {
    console.error(e);
  }
}

interface Ligne {
  id: string;
  nom: string;
  duree: number;
  source?: SourceOuverte;
}

export function OutilSons() {
  useEffect(() => arreterLecture, []);
  const r = recetteAffichee.value;
  if (!r) return null;
  const i = sonChoisi.value;
  if (i !== null && r.sons[i]) return <PanneauSon i={i} son={r.sons[i]} />;

  const onglet = ongletSons.value;
  const onglets = [
    ...famillesSons.map((f) => ({ id: f.id as string, nom: f.nom })),
    { id: 'mes', nom: T.sons.mesSons },
  ];
  const lignes: Ligne[] =
    onglet === 'mes'
      ? sonsImportes.value.map((s) => ({
          id: idSonImporte(s),
          nom: s.infos.nom,
          duree: s.infos.duree,
          source: s,
        }))
      : catalogueSons
          .filter((s) => s.famille === onglet)
          .map((s) => ({ id: s.id, nom: s.nom, duree: s.duree }));

  return (
    <div class="outil" data-testid="outil-sons">
      <Onglets
        label={T.sons.familles}
        onglets={onglets}
        actif={onglet}
        onChoisir={(id) => (ongletSons.value = id)}
        prefixe="famille"
        panneau="liste-sons"
      />
      <p class="petit doux outil-aide">{T.sons.aide}</p>
      <ul
        id="liste-sons"
        class="liste-sons"
        role="tabpanel"
        aria-labelledby={`famille-onglet-${onglet}`}
        tabIndex={0}
      >
        {lignes.length === 0 && <li class="petit doux liste-sons-vide">{T.sons.vide}</li>}
        {lignes.map((s) => (
          <li key={s.id} class="son-ligne">
            <button
              type="button"
              class="son-ecouter"
              aria-label={T.sons.ecouter(s.nom)}
              onClick={() => void ecouter(s.source ?? s.id)}
              data-testid={`son-ecouter-${s.id}`}
            >
              <span class="son-lecture" aria-hidden="true">
                <IconeLecture taille={16} />
              </span>
              <span class="son-nom">{s.nom}</span>
              <span class="chiffres petit doux">{formatDuree(s.duree)}</span>
            </button>
            <button
              type="button"
              class="btn btn-icone son-ajouter"
              aria-label={T.sons.ajouter(s.nom)}
              onClick={() => {
                arreterLecture();
                ajouterSonIci(s.id, s.source);
              }}
              data-testid={`son-ajouter-${s.id}`}
            >
              <IconePlus taille={20} />
            </button>
          </li>
        ))}
      </ul>

      <div class="grille-2 sons-import">
        <label class="btn" data-occupe={importEnCours.value ? '1' : '0'} data-testid="importer-son">
          <IconeImporter taille={18} />
          {importEnCours.value ? T.sons.chargement : T.sons.importer}
          <input
            type="file"
            class="sr-only"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov"
            disabled={importEnCours.value}
            onChange={(e) => {
              const input = e.currentTarget as HTMLInputElement;
              const f = input.files?.[0];
              input.value = '';
              if (f) void importerFichierSon(f);
            }}
            data-testid="importer-son-fichier"
          />
        </label>
        <BoutonMicro onFichier={(f) => void importerFichierSon(f)} />
      </div>
      <p class="petit doux droits-sons" data-testid="droits-sons">
        <IconeAlerte taille={14} />
        {T.sons.droits}
      </p>
    </div>
  );
}
