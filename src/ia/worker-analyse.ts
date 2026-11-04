// Worker d'analyse d'une longue source (phase 6) : son + images clés, en parallèle, avec points de reprise
// dans IndexedDB toutes les 60 s de source. À la fin, fusion des signaux en moments candidats.
// Annuler = la page arrête net ce Worker (terminate) ; la relance repart du dernier point de reprise.

import { ErreurArko } from '../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../moteur/media';
import type { Sec } from '../recette/types';
import { candidats } from './candidats';
import { passeImages, passeSon, type EtatImages } from './lecture-analyse';
import { VERSION_REPRISE, type DemandeAnalyse, type DepuisWorkerAnalyse, type PointReprise } from './messages-analyse';
import { ecrirePoint, lirePoint, oublierAnalyse } from './reprise';
import { Enveloppe, PAS_ENVELOPPE } from './signaux';

function envoyer(m: DepuisWorkerAnalyse) {
  postMessage(m);
}

/** Écrit les points de reprise l'un après l'autre ; une demande pendant une écriture est regroupée. */
function creerEcrivain(empreinte: string, instantane: () => PointReprise) {
  let enCours: Promise<void> | null = null;
  let encore = false;
  const lancer = () => {
    enCours = ecrirePoint(empreinte, instantane()).finally(() => {
      enCours = null;
      if (encore) {
        encore = false;
        lancer();
      }
    });
  };
  return {
    demander() {
      if (enCours) encore = true;
      else lancer();
    },
    async attendre() {
      while (enCours) await enCours;
    },
  };
}

function minutes(t: Sec): number {
  return Math.floor(t / 60);
}

async function analyser(d: DemandeAnalyse) {
  const debutMs = performance.now();
  envoyer({ type: 'progression', p: 0, message: 'J\'ouvre ta vidéo…' });
  const media = await ouvrirMedia(d.fichier, 'video');
  try {
    const duree = media.duree;
    const pas = PAS_ENVELOPPE;
    if (!d.reprendre) await oublierAnalyse(d.empreinte);
    let point = d.reprendre ? await lirePoint(d.empreinte, duree, pas) : null;
    const repris = !!point && (point.tSon > 0 || point.tImage > 0);
    const reprisA = point?.tSon ?? 0;
    let imagesCles = point?.diffs.length ?? 0;

    if (!point?.fini) {
      if (repris) envoyer({ type: 'progression', p: 0.01, message: 'Je reprends là où l\'analyse s\'était arrêtée…' });
      const env = new Enveloppe(duree, pas);
      if (point) env.restaurer(point.enveloppe);
      const etat: EtatImages = { diffs: point ? [...point.diffs] : [], derniere: point?.derniere ?? null, lues: 0 };
      // Ce qui est « validé » (fini et sûr) : c'est cela qu'on écrit dans le point de reprise.
      const valide = { tSon: point?.tSon ?? 0, tImage: point?.tImage ?? 0, nbDiffs: etat.diffs.length, derniere: etat.derniere };
      const ecrivain = creerEcrivain(d.empreinte, () => ({
        version: VERSION_REPRISE,
        duree,
        pas,
        tSon: valide.tSon,
        enveloppe: env.valeurs(Math.round(valide.tSon / pas)),
        tImage: valide.tImage,
        diffs: etat.diffs.slice(0, valide.nbDiffs),
        derniere: valide.derniere,
        fini: false,
      }));
      // Progression fondée sur le SON : c'est lui qui fixe le point de reprise (les images vont bien plus vite).
      // Sans son, on suit les images.
      const sonPresent = !!media.sinkAudio;
      const imagesPresentes = !!(media.video && media.sinkVideo);
      let avSon = sonPresent ? valide.tSon : duree;
      let avImage = imagesPresentes ? valide.tImage : duree;
      let dernierEnvoi = 0;
      const progresser = () => {
        const maintenant = performance.now();
        if (maintenant - dernierEnvoi < 200) return;
        dernierEnvoi = maintenant;
        const fait = Math.min(sonPresent ? avSon : avImage, duree);
        const p = 0.02 + 0.93 * Math.min(1, fait / Math.max(duree, 0.01));
        envoyer({ type: 'progression', p, message: `J'écoute le son et je regarde les images… (${minutes(fait)} min sur ${minutes(duree) || 1})` });
      };
      await Promise.all([
        sonPresent
          ? passeSon(media.sinkAudio!, env, valide.tSon, duree, {
              auPoint: (t) => {
                valide.tSon = Math.min(t, duree);
                ecrivain.demander();
              },
              avance: (t) => {
                avSon = Math.min(t, duree);
                progresser();
              },
            })
          : null,
        imagesPresentes
          ? passeImages(media.video!, media.sinkVideo!, valide.tImage, etat, {
              auPoint: (t) => {
                valide.tImage = Math.min(t, duree);
                valide.nbDiffs = etat.diffs.length;
                valide.derniere = etat.derniere;
                ecrivain.demander();
              },
              avance: (t) => {
                avImage = Math.min(t, duree);
                progresser();
              },
            })
          : null,
      ]);
      await ecrivain.attendre();
      imagesCles += etat.lues;
      point = { version: VERSION_REPRISE, duree, pas, tSon: duree, enveloppe: env.valeurs(), tImage: duree, diffs: etat.diffs, derniere: etat.derniere, fini: true };
      await ecrirePoint(d.empreinte, point);
    }

    envoyer({ type: 'progression', p: 0.97, message: 'Je choisis les meilleurs moments…' });
    const moments = candidats({ pas, duree, enveloppe: point.enveloppe, diffs: point.diffs }, d.candidats);
    envoyer({
      type: 'fini',
      moments,
      stats: { duree, repris, reprisA, ms: Math.round(performance.now() - debutMs), imagesCles, son: !!media.sinkAudio },
    });
  } finally {
    fermerMedia(media);
  }
}

self.onmessage = (ev: MessageEvent<DemandeAnalyse>) => {
  analyser(ev.data).catch((e: unknown) => {
    if (e instanceof ErreurArko) envoyer({ type: 'erreur', message: e.message, code: e.code });
    else {
      console.error(e);
      envoyer({ type: 'erreur', message: 'L\'analyse a échoué : ta vidéo est peut-être abîmée. Réessaie.', code: 'analyse' });
    }
  });
};
