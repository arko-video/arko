// D. Dessin d'un perso dans un des 6 styles « Persos » (7/11/2026) : BD, dessin animé, bonhomme raté, mascotte
// ronde, pixel, papier découpé (le style retenu par Romain : en buste, goofy, avec des situations de jeu). Chaque
// style a ses proportions (fiches.ts), sa posture par émotion (postures.ts, squelette.ts), son corps
// (corps-perso.ts), sa tête (tete-perso.ts) et son rendu (rendus-persos.ts, pixel.ts). Le visage, les coiffures,
// les chapeaux, les accessoires, les tenues et les signes sont ceux des chibis, reposés par des sous-repères.
// Une situation de jeu (situations.ts) change la pose des bras et ajoute un objet ou un décor. Même entrée → mêmes
// pixels ; une seule voie de rendu (aperçu = export).

import type { Ctx2D } from '../../moteur/canevas';
import type { DefinitionChibi } from '../../recette/types';
import type { StylePerso } from '../catalogue';
import { autourDuCou } from '../chapeaux';
import { cheveuxArriere } from '../coiffures';
import type { CadreChibi, PoseChibi } from '../dessin';
import { EXPRESSIONS, phaseSignes } from '../expressions';
import { HAUT_CHEVEUX, TETE } from '../geometrie';
import { Pinceau } from '../pinceau';
import { signesAutour, signesDerriere } from '../signes';
import { habits, tenueArriere, tenueDevant } from '../tenues';
import { brasComplet, jambeComplete, main, torse } from './corps-perso';
import { FICHES } from './fiches';
import type { Scene } from './objets-armes';
import { balancement, bordDechire, exagerer, penche, phaseBalancement } from './papier';
import { Grille, PIXEL, RenduPixel } from './pixel';
import { DEF_SITUATIONS, situationDe } from './situations';
import { squelette } from './squelette';
import { repereTete, repereTorse, tete } from './tete-perso';

/** Dessine le perso (styles « Persos ») avec un pinceau déjà placé (pieds, échelle, sens). */
export function dessinerPersoAvec(root: Pinceau, style: StylePerso, def: DefinitionChibi, pose: PoseChibi) {
  const f = FICHES[style];
  const emo = EXPRESSIONS[pose.emo] ? pose.emo : 'parle';
  const S = situationDe(pose.sit, style);
  let ex = style === 'papier' ? exagerer(emo, EXPRESSIONS[emo]) : EXPRESSIONS[emo];
  // Avec une situation, pas d'aura de flammes (on la prendrait pour « en feu »).
  if (S && ex.signes.includes('feu')) ex = { ...ex, signes: ex.signes.filter((s) => s !== 'feu') };
  const sq = squelette(f, emo, [S?.d, S?.g]);
  const ph = phaseSignes(emo, pose.t);
  // Tête goofy du papier : penchée d'office, et qui se balance en rythme.
  const teteA = sq.tete + (style === 'papier' ? penche(root) + balancement(pose.t) : 0);
  const b = root.repere(0, -sq.saut, 1 - sq.etire * 0.5, 1 + sq.etire);
  const sc: Scene = { pi: b, sq, f, def, ph: phaseBalancement(pose.t) / 6 };
  // Derrière : flammes de « déterminé », décor de la situation.
  const larg = Math.max(f.tete.rx, f.torse.lh + 4, 16);
  signesDerriere(b.repere(0, 0, larg / 30, 1, 1), ex.signes, ph);
  S?.derriere?.(sc);
  if (!f.buste) sq.jambes.forEach((m, i) => jambeComplete(b, f, def, m, i === 0 ? 1 : -1));
  b.tourner(sq.corps, 0, f.hanche.y + sq.plie, () => {
    const u = b.repere(0, sq.plie, 1, 1);
    const cou = f.cou;
    tenueArriere(repereTorse(u, f), def);
    u.tourner(teteA, 0, cou, () => cheveuxArriere(repereTete(u, f), def));
    if (f.buste) bordDechire(u, f, def);
    if (f.torse.forme !== 'aucun') {
      torse(u, f, def);
      const tr = repereTorse(u, f);
      tenueDevant(tr, def);
      autourDuCou(tr, def);
    }
    const [d, g] = sq.bras;
    if (!g.devant) brasComplet(b, f, def, g, -1);
    if (!d.devant) brasComplet(b, f, def, d, 1);
    u.tourner(teteA, 0, cou, () => tete(repereTete(u, f), f, style, def, ex, pose, ph, S?.lunettes ?? false));
    if (g.devant) brasComplet(b, f, def, g, -1);
    if (d.devant) brasComplet(b, f, def, d, 1);
    // L'objet de la situation, puis les mains qui le tiennent par-dessus.
    if (S?.devant) {
      S.devant(sc);
      for (const cote of S.tenu ?? []) main(b, f, cote, sq.bras[cote === 'd' ? 0 : 1], habits(def).mains);
    }
    // Signes autour de la tête, à une taille lisible même quand la tête est petite.
    const sa = Math.max(f.tete.rx / TETE.rx, 0.55);
    const haut = HAUT_CHEVEUX[def.coiffure] ?? -98;
    // Papier : une marge au-dessus des cheveux (les hérissés montent plus haut), et le nuage décollé de la visière
    // d'une casquette à l'envers.
    const marge = style === 'papier' ? 4 + (def.accessoire === 'casquetteEnvers' ? 5 : 0) : 0;
    const hautS = TETE.cy + ((haut - TETE.cy) * (f.tete.ry / TETE.ry)) / sa - marge;
    u.tourner(teteA * 0.5, 0, cou, () => signesAutour(u.repere(0, f.tete.cy - TETE.cy * sa, sa, sa, 0.9), ex.signes, ph, hautS));
  });
}

/** Lag : le perso coupé en 4 bandes décalées (dessiné 4 fois, chaque fois dans sa bande). */
const LAG = [-0.13, 0.1, -0.06, 0.14] as const;

/** Dessine le perso dans le cadre (pieds en (x, y), hauteur h). Le style Pixel passe par sa grille. */
export function dessinerPerso(ctx: Ctx2D, style: StylePerso, def: DefinitionChibi, pose: PoseChibi, cadre: CadreChibi) {
  const s = pose.retourne ? -1 : 1;
  const effet = pose.sit ? DEF_SITUATIONS[pose.sit]?.effet : undefined;
  if (effet === 'lag') {
    const haut = cadre.h * 1.5;
    LAG.forEach((dx, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cadre.x - cadre.h, cadre.y - haut + (i * haut) / 4, cadre.h * 2, haut / 4 + 0.5);
      ctx.clip();
      ctx.translate(dx * cadre.h, 0);
      dessinerPerso(ctx, style, def, { ...pose, sit: 'aucune' }, cadre);
      ctx.restore();
    });
    return;
  }
  if (style !== 'pixel') {
    const pi = new Pinceau(ctx, style, def.graine, cadre.x, cadre.y, cadre.h / 100, s);
    // Chute : tout le perso bascule.
    if (effet === 'chute') pi.tourner(28, 0, -55, () => dessinerPersoAvec(pi, style, def, pose));
    else dessinerPersoAvec(pi, style, def, pose);
    return;
  }
  const n = PIXEL.cases;
  const l = Math.ceil(n * 1.1) + 2;
  const ht = Math.ceil(n * 1.45) + 2;
  const g = new Grille(l, ht);
  const px = Math.floor(l / 2);
  const py = Math.round(n * 1.42);
  dessinerPersoAvec(new Pinceau(ctx, style, def.graine, px, py, n / 100, s, new RenduPixel(g)), style, def, pose);
  g.silhouette(parseInt(PIXEL.encre.slice(1), 16));
  const k = cadre.h / n;
  g.recopier(ctx, cadre.x - px * k, cadre.y - py * k, k);
}
