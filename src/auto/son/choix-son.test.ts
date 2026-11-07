// E. Choix du son (Mes sons d'abord, par étiquette + nom, recherche floue ; sinon son d'Arko), étiquettes de dossier,
// crédits de la musique, opérations « Tout poser » / « Retirer ».
import { describe, expect, it } from 'vitest';
import { normaliser } from '../../recette/normaliser';
import { choisirVolumeFinal, definirMusique, poserBruitages, retirerBruitagesAuto } from '../../recette/operations-son-auto';
import type { Recette, Source } from '../../recette/types';
import { etiquetteDuChemin, etiquettePour } from '../../sons/dossiers';
import type { MonSon } from '../../stockage/mes-sons';
import { choisirSon, scoreFlou, SONS_ARKO_CATEGORIES, sonsPossibles } from './choix-son';
import { avisMusique, estMusiqueDeJeu, titreMorceau } from './credits';

const mon = (id: string, nom: string, etiquette = '', duree = 2): MonSon => ({ id, nom, etiquette, type: 'audio/mpeg', taille: 10, duree, ajouteLe: 0 });

describe('choix du son', () => {
  const sons = [
    mon('m1', 'airhorn', 'MLG Sound Effects'),
    mon('m2', 'sitcom laugh 2', 'Laughs'),
    mon('m3', 'track 07', 'Laughs'),
    mon('m4', 'Mission Passed', 'GTA'),
    mon('m5', 'Windows XP Shutdown', 'Windows'),
    mon('m6', 'explossion', ''),
    mon('m7', 'Boss music', 'Laughs', 120),
  ];

  it('Mes sons passe avant Arko, le nom avant l\'étiquette', () => {
    expect(choisirSon('rire', sons)).toEqual({ type: 'mesSons', id: 'm2', nom: 'sitcom laugh 2' });
    expect(choisirSon('reussite', sons)).toMatchObject({ id: 'm4' });
    expect(choisirSon('fin', sons)).toMatchObject({ id: 'm5' });
  });

  it('l\'étiquette du dossier suffit (« Laughs » → rire), mais pas une musique de 2 min', () => {
    const r = sonsPossibles('rire', sons).map((s) => s.id);
    expect(r).toEqual(['m2', 'm3']);
  });

  it('recherche floue : une faute de frappe passe', () => {
    expect(choisirSon('explosion', sons)).toMatchObject({ id: 'm6' });
    expect(scoreFlou({ nom: 'explossion', etiquette: '' }, 'explosion')).toBeGreaterThan(0);
    expect(scoreFlou({ nom: 'exposition', etiquette: '' }, 'explosion')).toBe(0);
  });

  it('rien dans Mes sons → son d\'Arko (CC0)', () => {
    expect(choisirSon('bruh', sons)).toEqual({ type: 'arko', id: SONS_ARKO_CATEGORIES.bruh });
    expect(choisirSon('wasted', [])).toEqual({ type: 'arko', id: 'jeu.degat' });
  });

  it('varie entre deux sons aussi bons', () => {
    const deux = [mon('a', 'wow 1'), mon('b', 'wow 2')];
    expect(choisirSon('wow', deux).id).toBe('a');
    expect(choisirSon('wow', deux, { eviter: new Set(['a']) }).id).toBe('b');
  });
});

describe('étiquette du dossier', () => {
  it('le dossier le plus proche du fichier', () => {
    expect(etiquetteDuChemin('Pack/MLG Sound Effects/airhorn.mp3')).toBe('MLG Sound Effects');
    expect(etiquetteDuChemin('Laughs\\rire.wav')).toBe('Laughs');
    expect(etiquetteDuChemin('airhorn.mp3')).toBe('');
    expect(etiquetteDuChemin('__MACOSX/Laughs/._x.mp3')).toBe('Laughs');
    expect(etiquetteDuChemin('../../Bruitages_Drôles/x.mp3')).toBe('Bruitages Drôles');
    expect(etiquetteDuChemin(`${'a'.repeat(80)}/x.mp3`)).toHaveLength(60);
    expect(etiquettePour('x.mp3', 'Memes')).toBe('Memes');
    expect(etiquettePour('Pack/Laughs/x.mp3', 'Memes')).toBe('Laughs');
  });
});

describe('crédits de la musique', () => {
  it('Kevin MacLeod / incompetech → ligne CC BY 4.0, sans doublon', () => {
    const a = avisMusique(['Kevin_MacLeod_-_Sneaky_Snitch.mp3', 'Sneaky Snitch (incompetech).mp3', 'Kevin MacLeod - Sneaky Snitch.mp3', 'ma musique.mp3']);
    expect(a.credits).toEqual(['"Sneaky Snitch" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/']);
    expect(a.alertes).toEqual([]);
    expect(titreMorceau('Kevin MacLeod - Monkeys Spinning Monkeys.mp3')).toBe('Monkeys Spinning Monkeys');
  });

  it('musique de jeu → alerte réclamations', () => {
    const a = avisMusique(['Super Mario Bros theme.mp3', 'Green Hill Zone (Sonic).mp3']);
    expect(a.alertes).toHaveLength(2);
    expect(a.alertes[0]).toContain('Super Mario Bros theme');
    expect(estMusiqueDeJeu('Pokémon Rouge.mp3')).toBe(true);
    expect(estMusiqueDeJeu('marionnette.mp3')).toBe(false);
  });
});

function recette(): Recette {
  const sources: Source[] = [{ id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 120, type: 'video', l: 1920, h: 1080 }];
  return normaliser({ format: 'arko.recette/1', sources, plans: [{ de: 0, a: 60 }], sons: [{ id: 'impact.boom', ts: 5, src: 's1' }] }, { sources }).recette;
}
const audio = (id: string): Source => ({ id, nom: `${id}.mp3`, taille: 1, emp: id, duree: 3, type: 'audio' });

describe('opérations', () => {
  it('« Tout poser » : sources ajoutées, sons de rôle bruitage ; « Retirer » enlève tout et les sources', () => {
    const r0 = recette();
    const r1 = poserBruitages(
      r0,
      [
        { id: 'a1', ts: 10.1, src: 's1', vol: 0.631, dur: 3, fondu: 0.3 },
        { id: 'comedie.criquets', ts: 30.1, src: 's1', vol: 0.631, dur: 2.6, fondu: 0.3 },
      ],
      [audio('a1')],
    );
    expect(r1.sources.map((s) => s.id)).toEqual(['s1', 'a1']);
    expect(r1.sons.filter((s) => s.role === 'bruitage')).toEqual([
      { id: 'a1', ts: 10.1, src: 's1', vol: 0.63, role: 'bruitage', dur: 3, fondu: 0.3 },
      { id: 'comedie.criquets', ts: 30.1, src: 's1', vol: 0.63, role: 'bruitage', dur: 2.6, fondu: 0.3 },
    ]);
    const r2 = retirerBruitagesAuto(r1);
    expect(r2.sons).toEqual(r0.sons);
    expect(r2.sources.map((s) => s.id)).toEqual(['s1']);
    expect(retirerBruitagesAuto(r0)).toBe(r0);
    expect(poserBruitages(r0, [], [])).toBe(r0);
  });

  it('musique et volume final', () => {
    const r0 = recette();
    const r1 = definirMusique(r0, { morceaux: [{ src: 'a2', t: 0 }, { src: 'a3', t: 30 }] }, [audio('a2'), audio('a3')]);
    expect(r1.musique?.morceaux.map((m) => m.src)).toEqual(['a2', 'a3']);
    expect(definirMusique(r1, null, []).musique).toBeUndefined();
    expect(definirMusique(r1, null, []).sources.map((s) => s.id)).toEqual(['s1']);
    const r2 = choisirVolumeFinal(r0, { lufs: -14, crete: -1.5 });
    expect(r2.volumeFinal).toEqual({ lufs: -14, crete: -1.5 });
    expect(choisirVolumeFinal(r2, null).volumeFinal).toBeUndefined();
    expect(choisirVolumeFinal(r0, null)).toBe(r0);
  });
});
