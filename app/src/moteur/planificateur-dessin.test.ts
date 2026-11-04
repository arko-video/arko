// B-1 : aucun dessin demandé ne doit se perdre quand charger() remplace le rendu pendant un dessin.
import { describe, expect, it } from 'vitest';
import { CompteurSauts, creerPlanificateur } from './planificateur-dessin';

/** Faux rendu dont chaque dessin se termine quand on le décide. */
function fauxRendu(nom: string, journal: string[]) {
  const enAttente: (() => void)[] = [];
  let ferme = false;
  return {
    image: () =>
      new Promise<void>((ok) =>
        enAttente.push(() => {
          if (!ferme) journal.push(nom); // un rendu fermé abandonne son dessin, comme le vrai
          ok();
        }),
      ),
    fermer: () => (ferme = true),
    finir: () => enAttente.shift()?.(),
    get attente() {
      return enAttente.length;
    },
  };
}
const attendre = () => new Promise((ok) => setTimeout(ok, 0));

describe('planificateur de dessin (B-1)', () => {
  it('deux charger() de suite pendant un dessin : le dernier rendu est dessiné', async () => {
    const journal: string[] = [];
    const a = fauxRendu('a', journal);
    let rendu: ReturnType<typeof fauxRendu> | null = a;
    const p = creerPlanificateur(() => rendu?.image() ?? null);
    expect(p.demander()).toBe(true); // 1er charger : dessin de a en cours
    const b = fauxRendu('b', journal);
    rendu = b; // 2e charger : a est fermé, b demande un dessin
    a.fermer();
    expect(p.demander()).toBe(false); // sauté pour l'instant…
    a.finir();
    await attendre();
    expect(b.attente).toBe(1); // …mais relancé avec le rendu COURANT
    b.finir();
    await attendre();
    expect(journal).toEqual(['b']);
    expect(p.enCours).toBe(false);
  });

  it('plusieurs demandes pendant un dessin → un seul dessin de plus', async () => {
    const journal: string[] = [];
    const a = fauxRendu('a', journal);
    const p = creerPlanificateur(() => a.image());
    p.demander();
    p.demander();
    p.demander();
    a.finir();
    await attendre();
    expect(a.attente).toBe(1);
    a.finir();
    await attendre();
    expect(journal).toEqual(['a', 'a']);
  });

  it('une erreur de dessin ne bloque pas les suivants', async () => {
    let n = 0;
    const erreurs: unknown[] = [];
    const p = creerPlanificateur(() => (n++ === 0 ? Promise.reject(new Error('décodeur')) : Promise.resolve()), (e) => erreurs.push(e));
    p.demander();
    p.demander();
    await attendre();
    await attendre();
    expect(erreurs).toHaveLength(1);
    expect(n).toBe(2);
    expect(p.enCours).toBe(false);
  });

  it('sans rendu : rien à dessiner', () => {
    const p = creerPlanificateur(() => null);
    expect(p.demander()).toBe(true);
    expect(p.enCours).toBe(false);
  });
});

describe('compteur d\'images sautées (M-13)', () => {
  it('toutes les images affichées : pas de repli', () => {
    const c = new CompteurSauts();
    let res = false;
    for (let i = 0; i <= 61; i++) res = c.noter(i / 30, i / 30) || res;
    expect(res).toBe(false);
  });
  it('une image sur deux affichée (50 % sautées) : repli au bout de 2 s', () => {
    const c = new CompteurSauts();
    const res: boolean[] = [];
    for (let i = 0; i <= 60; i += 2) res.push(c.noter(i / 30, i / 30));
    expect(res.at(-1)).toBe(true);
    expect(res.slice(0, -1).every((x) => !x)).toBe(true);
  });
  it('20 % sautées : pas de repli', () => {
    const c = new CompteurSauts();
    let res = false;
    for (let i = 0; i <= 61; i++) if (i % 5 !== 0) res = c.noter(i / 30, i / 30) || res;
    expect(res).toBe(false);
  });
});
