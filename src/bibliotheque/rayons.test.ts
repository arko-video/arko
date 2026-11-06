// Ma bibliothèque : rangement automatique dans les rayons d'après le nom des dossiers, fichiers ignorés ou à convertir.
// Noms de dossiers comme ceux de Romain (« sound effect », « son de fond », « effet de fond vert », « meme ») et variantes.

import { describe, expect, it } from 'vitest';
import { natureFichier, planifierImport, rayonDuChemin, rayonDuDossier, rayonFinal } from './rayons';

describe('rayon d\'après le nom du dossier', () => {
  it('les 4 dossiers de Romain', () => {
    expect(rayonDuDossier('sound effect')).toBe('bruitages');
    expect(rayonDuDossier('son de fond')).toBe('musiques');
    expect(rayonDuDossier('effet de fond vert')).toBe('fondsVerts');
    expect(rayonDuDossier('meme')).toBe('memes');
  });

  it('variantes : majuscules, accents, pluriels, « _ » et « - », anglais', () => {
    const cas: [string, string][] = [
      ['Sound_Effects', 'bruitages'],
      ['SFX', 'bruitages'],
      ['sons', 'bruitages'],
      ['Bruitages', 'bruitages'],
      ['effets-sonores', 'bruitages'],
      ['SFX TikTok 2024', 'bruitages'],
      ['Musique', 'musiques'],
      ['music', 'musiques'],
      ['Sons de fond', 'musiques'],
      ['BGM', 'musiques'],
      ['Musiques libres de droits', 'musiques'],
      ['Green Screen', 'fondsVerts'],
      ['greenscreen', 'fondsVerts'],
      ['Fond vert', 'fondsVerts'],
      ['FONDS VERTS', 'fondsVerts'],
      ['Green screen effects pack', 'fondsVerts'],
      ['Mèmes', 'memes'],
      ['memes fr', 'memes'],
      ['Meme videos', 'memes'],
    ];
    for (const [nom, rayon] of cas) expect(rayonDuDossier(nom), nom).toBe(rayon);
  });

  it('un nom inconnu ou trop vague → null (on demandera le rayon)', () => {
    for (const nom of ['Téléchargements', 'Pack 2', 'effects', 'Nouveau dossier', '', 'mon fx préféré']) expect(rayonDuDossier(nom), nom).toBeNull();
  });

  it('le dossier reconnu le plus proche du fichier compte (sous-dossiers d\'étiquettes)', () => {
    expect(rayonDuChemin('Arko/sound effect/Rires/haha.mp3')).toBe('bruitages');
    expect(rayonDuChemin('Arko/effet de fond vert/Boutons/abonne.mp4')).toBe('fondsVerts');
    expect(rayonDuChemin('PC/son de fond/lofi.mp3')).toBe('musiques');
    expect(rayonDuChemin('meme/bruh.mp4')).toBe('memes');
    expect(rayonDuChemin('Divers/truc.mp4')).toBeNull();
    expect(rayonDuChemin('truc.mp4')).toBeNull();
  });
});

describe('nature des fichiers', () => {
  it('sons, vidéos, .zip', () => {
    expect(natureFichier('boom.mp3')).toBe('son');
    expect(natureFichier('rire.WAV')).toBe('son');
    expect(natureFichier('cri.m4a')).toBe('son');
    expect(natureFichier('abonne.mp4')).toBe('video');
    expect(natureFichier('rec.MOV')).toBe('video');
    expect(natureFichier('pack.zip')).toBe('zip');
  });

  it('.sfk, images, textes, fichiers cachés : ignorés ; .wmv / .avi : à convertir', () => {
    for (const n of ['boom.mp3.sfk', 'boom.sfk', 'cover.jpg', 'LISEZ-MOI.txt', '.DS_Store', 'Thumbs.db', 'desktop.ini', 'son.asd']) expect(natureFichier(n), n).toBe('ignore');
    expect(natureFichier('vieux.wmv')).toBe('aConvertir');
    expect(natureFichier('clip.AVI')).toBe('aConvertir');
  });

  it('un son dans un rayon de vidéos va dans Bruitages ; une vidéo dans Bruitages ne garde que son son', () => {
    expect(rayonFinal('son', 'meme/bruh.mp3', null)).toBe('bruitages');
    expect(rayonFinal('video', 'sound effect/wow.mp4', null)).toBe('bruitages');
    expect(rayonFinal('video', 'clip.mp4', 'memes')).toBe('memes');
    expect(rayonFinal('video', 'clip.mp4', null)).toBeNull();
  });
});

describe('plan d\'import d\'un dossier comme celui de Romain', () => {
  const dossier = [
    'Arko/sound effect/boom.mp3',
    'Arko/sound effect/boom.mp3.sfk',
    'Arko/sound effect/rire.wav',
    'Arko/sound effect/cri.m4a',
    'Arko/son de fond/lofi.mp3',
    'Arko/son de fond/epic.mp3',
    'Arko/effet de fond vert/abonne.mp4',
    'Arko/effet de fond vert/rec camera.mp4',
    'Arko/effet de fond vert/vieux.wmv',
    'Arko/meme/bruh.mp4',
    'Arko/meme/clip.avi',
    'Arko/cover.jpg',
    'Arko/divers.mp4',
  ].map((chemin) => ({ nom: chemin.split('/').pop()!, chemin }));

  it('rangé tout seul ; le fichier sans dossier connu est à demander', () => {
    const p = planifierImport(dossier, null);
    expect(p.parRayon).toEqual({ bruitages: 3, musiques: 2, fondsVerts: 2, memes: 1 });
    expect(p.sansRayon).toBe(1);
    expect(p.aConvertir).toEqual(['vieux.wmv', 'clip.avi']);
    expect(p.ignores).toBe(2);
  });

  it('avec le rayon choisi pour les autres', () => {
    expect(planifierImport(dossier, 'memes').parRayon.memes).toBe(2);
    expect(planifierImport(dossier, 'memes').sansRayon).toBe(0);
  });
});
