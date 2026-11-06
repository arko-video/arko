// YouTube : destination dans la recette (anciens projets = TikTok, inchangés), gabarits, durées, chapitres
// (format et règles de YouTube), intro / outro, compilation du monteur IA.

import { describe, expect, it } from 'vitest';
import { bilanChapitres, chapitresFinaux, formatHorodatage, texteChapitres, verifierChapitres } from '../chapitres';
import { fusionnerRecettes } from '../compilation';
import { dejaAuFormat, destinationDe, gabaritDe, SHORT, TIKTOK, YOUTUBE } from '../destination';
import { dureeTotale } from '../generiques';
import { normaliser } from '../normaliser';
import { ajouterChapitre, choisirGenerique, supprimerChapitre } from '../operations';
import type { Recette, Source } from '../types';
import gaming from '../exemples/gaming-25s.json';

const S1: Source = { id: 's1', nom: 'partie.mp4', taille: 10, emp: 'e1', duree: 1500, type: 'video', l: 1920, h: 1080 };
const G1: Source = { id: 'g1', nom: 'intro.mp4', taille: 5, emp: 'eg', duree: 4, type: 'video', l: 1920, h: 1080 };

function recette(extra: Record<string, unknown> = {}, a = 60): Recette {
  return normaliser({ format: 'arko.recette/1', sources: [S1], plans: [{ de: 0, a }], ...extra }, { sources: [S1] }).recette;
}

describe('destination dans la recette', () => {
  it('un ancien projet (sans destination) reste TikTok et ne reçoit AUCUN champ nouveau', () => {
    const ancien = structuredClone(gaming) as Record<string, unknown>;
    const r = normaliser(ancien).recette;
    expect(destinationDe(r)).toBe('tiktok');
    expect(gabaritDe(r)).toBe(TIKTOK);
    for (const cle of ['destination', 'chapitres', 'intro', 'outro']) expect(cle in r).toBe(false);
    // Normaliser deux fois ne change rien : l'ancien projet s'ouvre pareil.
    expect(normaliser(r).recette).toEqual(r);
  });

  it('garde youtube et short, refuse une destination inconnue (TikTok par défaut)', () => {
    expect(recette({ destination: 'youtube' }).destination).toBe('youtube');
    expect(recette({ destination: 'short' }).destination).toBe('short');
    const n = normaliser({ plans: [{ de: 0, a: 3 }], destination: 'instagram' });
    expect(n.recette.destination).toBeUndefined();
    expect(n.problemes.some((p) => p.chemin === 'destination')).toBe(true);
  });

  it('gabarits : 1920 × 1080 en 16:9, zone sûre propre aux Shorts', () => {
    expect(YOUTUBE).toMatchObject({ l: 1920, h: 1080, paysage: true });
    expect(SHORT).toMatchObject({ l: 1080, h: 1920, paysage: false, dureeLimite: 180 });
    expect(SHORT.zone).not.toEqual(TIKTOK.zone);
    expect(dejaAuFormat(1920, 1080, YOUTUBE)).toBe(true);
    expect(dejaAuFormat(1440, 1080, YOUTUBE)).toBe(false);
    expect(dejaAuFormat(1080, 1920, SHORT)).toBe(true);
  });

  it('16:9 : sous-titres en bas par défaut, textes permis plus bas qu\'en TikTok', () => {
    const r = recette({ destination: 'youtube', sousTitres: { mots: [['salut', 1, 1.4]] }, textes: [{ txt: 'GG', t: 0, y: 0.8 }] });
    expect(r.sousTitres?.y).toBe(0.82);
    expect(r.textes[0]!.y).toBe(0.8);
    expect(recette({ textes: [{ txt: 'GG', t: 0, y: 0.8 }] }).textes[0]!.y).toBe(0.62);
  });

  it('durées : 25 min permises en YouTube 16:9, bloquantes en TikTok ; Short > 3 min prévenu', () => {
    const long = { sources: [S1], plans: [{ de: 0, a: 1500 }] };
    expect(normaliser({ ...long, destination: 'youtube' }, { sources: [S1] }).bloquant).toBe(false);
    expect(normaliser(long, { sources: [S1] }).bloquant).toBe(true);
    const short = normaliser({ sources: [S1], plans: [{ de: 0, a: 200 }], destination: 'short' }, { sources: [S1] });
    expect(short.bloquant).toBe(false);
    expect(short.problemes.find((p) => p.chemin === 'plans')?.message).toMatch(/3 min/);
  });
});

describe('chapitres', () => {
  it('horodatages au format YouTube', () => {
    expect(formatHorodatage(0)).toBe('0:00');
    expect(formatHorodatage(83.4)).toBe('1:23');
    expect(formatHorodatage(600)).toBe('10:00');
    expect(formatHorodatage(3725)).toBe('1:02:05');
  });

  it('texte prêt à coller : une ligne par chapitre', () => {
    expect(texteChapitres([{ t: 0, nom: 'Intro' }, { t: 83, nom: 'Le clutch' }, { t: 125, nom: '' }])).toBe('0:00 Intro\n1:23 Le clutch\n2:05 Chapitre');
  });

  it('règles de YouTube : 0:00, au moins 3, 10 s chacun', () => {
    expect(verifierChapitres([{ t: 0, nom: 'a' }, { t: 10, nom: 'b' }, { t: 20, nom: 'c' }], 30)).toEqual([]);
    expect(verifierChapitres([{ t: 0, nom: 'a' }, { t: 10, nom: 'b' }], 30)[0]).toMatch(/au moins 3/);
    expect(verifierChapitres([{ t: 2, nom: 'a' }, { t: 12, nom: 'b' }, { t: 22, nom: 'c' }], 40).join()).toMatch(/0:00/);
    expect(verifierChapitres([{ t: 0, nom: 'a' }, { t: 10, nom: 'b' }, { t: 21, nom: 'c' }], 30).join()).toMatch(/« c » dure 9 s/);
    expect(verifierChapitres([], 30)[0]).toMatch(/tu en as 0/);
  });

  it('dans la vidéo finale : décalés de l\'intro, le 1er reste à 0:00, l\'outro allonge le dernier', () => {
    const r = recette({ intro: { modele: 'neon', dur: 3 }, outro: { modele: 'abonne', dur: 5 }, chapitres: [{ t: 0, nom: 'A' }, { t: 20, nom: 'B' }, { t: 52, nom: 'C' }] });
    expect(chapitresFinaux(r)).toEqual([{ t: 0, nom: 'A' }, { t: 23, nom: 'B' }, { t: 55, nom: 'C' }]);
    const b = bilanChapitres(r);
    expect(b.texte).toBe('0:00 A\n0:23 B\n0:55 C');
    expect(b.problemes).toEqual([]); // C : 55 → 68 s (outro comprise)
  });

  it('opérations : triés, bornés à la vidéo, pas deux à moins d\'1 s', () => {
    let r = recette({ destination: 'youtube' });
    r = ajouterChapitre(r, 30, 'B').recette;
    r = ajouterChapitre(r, 0, 'A').recette;
    expect(ajouterChapitre(r, 30.4, 'X').recette).toBe(r);
    r = ajouterChapitre(r, 999, 'Fin').recette;
    expect(r.chapitres).toEqual([{ t: 0, nom: 'A' }, { t: 30, nom: 'B' }, { t: 60, nom: 'Fin' }]);
    expect(supprimerChapitre(r, 1).chapitres?.map((c) => c.nom)).toEqual(['A', 'Fin']);
  });
});

describe('intro et outro', () => {
  it('durée totale = intro + montage + outro ; outro bornée à 5-20 s', () => {
    const r = recette({ intro: { modele: 'neon', dur: 2 }, outro: { modele: 'abonne', dur: 40 } });
    expect(r.outro?.dur).toBe(20);
    expect(dureeTotale(r)).toBe(82);
    expect(recette({ outro: { modele: 'inconnu', dur: 5 } }).outro).toBeUndefined();
  });

  it('une vidéo d\'intro devient une source (à la fin) et part avec l\'intro', () => {
    const r0 = recette({ destination: 'youtube' });
    const r1 = choisirGenerique(r0, 'intro', { src: 'g1', dur: 10 }, G1);
    expect(r1.sources.map((s) => s.id)).toEqual(['s1', 'g1']);
    expect(r1.intro).toEqual({ src: 'g1', dur: 4 }); // pas plus que la vidéo
    const r2 = choisirGenerique(r1, 'intro', null);
    expect(r2.intro).toBeUndefined();
    expect(r2.sources.map((s) => s.id)).toEqual(['s1']);
  });
});

describe('compilation du monteur IA', () => {
  it('met les clips bout à bout dans UNE recette 16:9, avec un chapitre par clip', () => {
    const a = recette({ titre: 'Le one-shot', plans: [{ de: 100, a: 112 }], textes: [{ txt: 'WOW', t: 1 }] });
    const b = recette({ plans: [{ de: 500, a: 515 }], textes: [{ txt: 'GG', t: 2 }], sons: [{ id: 'impact.boom', ts: 505 }] });
    const c = fusionnerRecettes([a, b])!;
    expect(c.destination).toBe('youtube');
    expect(c.plans.map((p) => [p.de, p.a])).toEqual([[100, 112], [500, 515]]);
    expect(c.textes.map((x) => [x.txt, x.t])).toEqual([['WOW', 1], ['GG', 14]]);
    expect(c.sons).toHaveLength(1);
    expect(c.chapitres).toEqual([{ t: 0, nom: 'Le one-shot' }, { t: 12, nom: 'Moment 2' }]);
    expect(fusionnerRecettes([])).toBeNull();
  });
});
