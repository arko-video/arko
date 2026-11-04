import { describe, expect, it } from 'vitest';
import { couperExtrait, formaterMoments, lireMoments } from './moments';

describe('formaterMoments (ARKO-MOMENTS/1)', () => {
  it('produit l\'en-tête, la légende et une ligne par moment, triés', () => {
    const txt = formaterMoments({ src: 's1', duree: 10835.2, langue: 'fr' }, [
      { debut: 1203, fin: 1215.44, score: 74, etiquettes: ['silence>pic'], extrait: 'bon… j\'ai rien vu venir' },
      { debut: 842.3, fin: 859.8, score: 87.4, etiquettes: ['rire', 'cri'], extrait: 'attends attends… NON il m\'a one-shot' },
    ]);
    expect(txt.split('\n')).toEqual([
      'ARKO-MOMENTS/1 src=s1 duree=10835.2 langue=fr nb=2',
      '# id debut fin score etiquettes | extrait (≤ 80 caractères)',
      'm01 842.3 859.8 87 rire,cri | "attends attends… NON il m\'a one-shot"',
      'm02 1203.0 1215.4 74 silence>pic | "bon… j\'ai rien vu venir"',
    ]);
  });
  it('ignore les moments vides, borne le score, nettoie étiquettes et extraits', () => {
    const txt = formaterMoments({ src: 's2', duree: 60 }, [
      { debut: 5, fin: 5, score: 50, etiquettes: [] },
      { id: 'x9', debut: 1, fin: 2, score: 140, etiquettes: ['Gros Kill', ''], extrait: 'il a dit "gg"\net parti' },
      { debut: 3, fin: 4, score: -3, etiquettes: [] },
    ]);
    const l = txt.split('\n');
    expect(l[0]).toBe('ARKO-MOMENTS/1 src=s2 duree=60.0 langue=fr nb=2');
    expect(l[2]).toBe('x9 1.0 2.0 100 gros-kill | "il a dit ”gg” et parti"');
    expect(l[3]).toBe('m02 3.0 4.0 0 -');
  });
  it('coupe les extraits à 80 caractères', () => {
    const e = couperExtrait('a'.repeat(200));
    expect([...e].length).toBe(80);
    expect(e.endsWith('…')).toBe(true);
  });
  it('se relit (aller-retour)', () => {
    const moments = [{ id: 'm01', debut: 1.5, fin: 3, score: 90, etiquettes: ['kill'], extrait: 'gg' }];
    const r = lireMoments(formaterMoments({ src: 's1', duree: 100 }, moments))!;
    expect(r.entete).toEqual({ src: 's1', duree: 100, langue: 'fr' });
    expect(r.moments).toEqual(moments);
  });
  it('environ 30 tokens par ligne (≈ 4 caractères par token)', () => {
    const l = 'm01 842.3 859.8 87 rire,cri | "attends attends… NON il m\'a one-shot"';
    expect(l.length / 4).toBeLessThan(30);
  });
});
