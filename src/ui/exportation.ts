// Lancement de l'export depuis l'interface : Wake Lock (repris au retour sur la page),
// suivi de la progression, détection d'un échec survenu pendant que la page était cachée.

import { ErreurArko, lancerExport } from '../moteur/api';
import { T } from '../textes-fr';
import { etatExport, exportTermine, recette, sources } from './etat';

let verrou: WakeLockSentinel | null = null;
let cacheePendantExport = false;

async function demanderVerrou() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      verrou = await navigator.wakeLock.request('screen');
      verrou.addEventListener('release', () => (verrou = null));
    }
  } catch {
    verrou = null; // refusé (batterie faible, etc.) : on continue sans
  }
}

function libererVerrou() {
  void verrou?.release().catch(() => undefined);
  verrou = null;
}

function surVisibilite() {
  if (etatExport.peek().phase !== 'encours') return;
  if (document.visibilityState === 'hidden') cacheePendantExport = true;
  else if (!verrou) void demanderVerrou();
}

export function demarrerExport() {
  const r = recette.peek();
  if (!r || etatExport.peek().phase === 'encours') return;
  cacheePendantExport = false;
  document.addEventListener('visibilitychange', surVisibilite);
  void demanderVerrou();

  let enCours: ReturnType<typeof lancerExport>;
  try {
    enCours = lancerExport(r, sources.peek());
  } catch (e) {
    fin();
    etatExport.value = erreurDe(e, false);
    return;
  }

  etatExport.value = { phase: 'encours', p: 0, resteS: null, annuler: () => enCours.annuler() };
  enCours.surProgression((p, resteS) => {
    const e = etatExport.peek();
    if (e.phase === 'encours') etatExport.value = { ...e, p, resteS };
  });
  enCours.resultat.then(
    (resultat) => {
      fin();
      if (etatExport.peek().phase === 'encours') exportTermine(resultat, r);
    },
    (e: unknown) => {
      const absence = cacheePendantExport;
      fin();
      if (etatExport.peek().phase === 'encours') etatExport.value = erreurDe(e, absence);
    },
  );
}

function fin() {
  document.removeEventListener('visibilitychange', surVisibilite);
  libererVerrou();
}

function erreurDe(e: unknown, pendantAbsence: boolean) {
  if (!(e instanceof ErreurArko)) console.error(e);
  const code = e instanceof ErreurArko ? e.code : 'inconnu';
  const message = code === 'annule' ? T.exporter.annule : e instanceof ErreurArko ? e.message : T.exporter.plantage;
  return { phase: 'erreur' as const, code, message, pendantAbsence: pendantAbsence && code !== 'annule' };
}

export function retourAvantExport() {
  etatExport.value = { phase: 'avant' };
}

/** Niveau de batterie (0 à 1) et branchement, si le navigateur le permet. */
export async function lireBatterie(): Promise<{ niveau: number; enCharge: boolean } | null> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (!nav.getBattery) return null;
  try {
    const b = await nav.getBattery();
    return { niveau: b.level, enCharge: b.charging };
  } catch {
    return null;
  }
}
