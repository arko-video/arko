import { describe, expect, it } from 'vitest';
import type { MotBrut } from './messages';
import { cle, collerPonctuation, espaceFrancaise, estFort, filtrerHallucinations, nettoyer, retirerRepetitions } from './nettoyage';

/** Fabrique des mots bruts à la suite (0,3 s chacun, son normal). */
function mots(texte: string, niveau = 0.2, debut = 0): MotBrut[] {
  return texte.split(' ').map((txt, i) => ({ txt: ' ' + txt, ts: debut + i * 0.4, fin: debut + i * 0.4 + 0.3, niveau }));
}
const textes = (m: { txt: string }[]) => m.map((x) => x.txt).join(' ');

describe('cle', () => {
  it('ignore la casse, la ponctuation et les espaces', () => {
    expect(cle(' JLB, ')).toBe('jlb');
    expect(cle('Jlb!')).toBe('jlb');
  });
});

describe('collerPonctuation', () => {
  it('colle la ponctuation isolée au mot précédent et enlève les espaces', () => {
    const r = collerPonctuation([...mots('super'), { txt: ' !', ts: 0.3, fin: 0.35, niveau: 0.2 }, ...mots('ok', 0.2, 1)]);
    expect(textes(r)).toBe('super! ok');
    expect(r[0]!.fin).toBe(0.3);
  });
  it('recolle une élision coupée par Whisper', () => {
    const r = collerPonctuation([
      { txt: ' Aujourd', ts: 2.6, fin: 2.8, niveau: 0.2 },
      { txt: "'hui", ts: 2.8, fin: 3.2, niveau: 0.3 },
      { txt: " 'gg'", ts: 3.3, fin: 3.5, niveau: 0.3 },
    ]);
    expect(r.map((m) => [m.txt, m.ts, m.fin])).toEqual([["Aujourd'hui", 2.6, 3.2], ["'gg'", 3.3, 3.5]]);
  });
  it('jette une ponctuation sans mot avant et les mots vides', () => {
    expect(collerPonctuation([{ txt: ' ,', ts: 0, fin: 0.1, niveau: 0.2 }, { txt: '  ', ts: 0, fin: 0.1, niveau: 0.2 }])).toEqual([]);
  });
});

describe('filtrerHallucinations', () => {
  it('retire « Sous-titrage … » et « Amara.org » même avec du son', () => {
    const r = filtrerHallucinations([...mots('on a gagné.'), ...mots('Sous-titrage Société Radio-Canada', 0.2, 2)]);
    expect(textes(r)).toBe(' on  a  gagné.');
    const r2 = filtrerHallucinations(mots("Sous-titres réalisés par la communauté d'Amara.org"));
    expect(r2).toEqual([]);
  });
  it('retire « Merci d\'avoir regardé » seulement si le son est faible', () => {
    expect(filtrerHallucinations(mots("Merci d'avoir regardé", 0.005))).toEqual([]);
    expect(filtrerHallucinations(mots("Merci d'avoir regardé", 0.2))).toHaveLength(3);
  });
  it('retire les mots de plus de 1,5 s dans un son faible, raccourcit les autres', () => {
    const r = filtrerHallucinations([{ txt: 'euh', ts: 0, fin: 2, niveau: 0.005 }, ...mots('bonjour', 0.2, 3)]);
    expect(textes(r)).toBe(' bonjour');
    const r2 = filtrerHallucinations([{ txt: 'fin', ts: 1, fin: 4, niveau: 0.1 }]);
    expect(r2).toEqual([{ txt: 'fin', ts: 1, fin: 2.5, niveau: 0.1 }]);
  });
});

describe('retirerRepetitions', () => {
  it('garde une seule fois un mot ou un groupe répété 3 fois ou plus', () => {
    expect(textes(retirerRepetitions(mots('et et et et alors')))).toBe(' et  alors');
    expect(textes(retirerRepetitions(mots('on y va on y va on y va')))).toBe(' on  y  va');
  });
  it('laisse une répétition de 2 fois', () => {
    expect(retirerRepetitions(mots('non non'))).toHaveLength(2);
  });
});

describe('estFort', () => {
  it('reconnaît la liste gaming, les MAJUSCULES et le « ! »', () => {
    expect(estFort('Non')).toBe(true);
    expect(estFort('mdr,')).toBe(true);
    expect(estFort('attends')).toBe(true);
    expect(estFort('GG')).toBe(true);
    expect(estFort('INCROYABLE')).toBe(true);
    expect(estFort('bravo!')).toBe(true);
    expect(estFort('maison')).toBe(false);
    expect(estFort('A')).toBe(false);
  });
});

describe('nettoyer', () => {
  it('donne des Mot triés avec fort = 1', () => {
    const bruts: MotBrut[] = [
      { txt: ' quoi', ts: 1, fin: 1.3, niveau: 0.2 },
      { txt: '?', ts: 1.3, fin: 1.3, niveau: 0.2 },
      { txt: ' Salut', ts: 0, fin: 0.4, niveau: 0.2 },
    ];
    expect(nettoyer(bruts)).toEqual([
      ['Salut', 0, 0.4],
      ['quoi\u00A0?', 1, 1.3, 1],
    ]);
    // En anglais, pas d'espace avant « ? ».
    expect(nettoyer(bruts, 'en')[1]).toEqual(['quoi?', 1, 1.3, 1]);
  });
  it('met l\'espace française avant « ! ? : ; » seulement', () => {
    expect(espaceFrancaise('monde!')).toBe('monde\u00A0!');
    expect(espaceFrancaise('quoi?!')).toBe('quoi\u00A0?!');
    expect(espaceFrancaise('attends:')).toBe('attends\u00A0:');
    expect(espaceFrancaise('monde\u00A0!')).toBe('monde\u00A0!');
    expect(espaceFrancaise('salut,')).toBe('salut,');
    expect(espaceFrancaise('12:30')).toBe('12:30');
    expect(cle('monde\u00A0!')).toBe('monde');
    expect(estFort('bravo\u00A0!')).toBe(true);
  });
});
