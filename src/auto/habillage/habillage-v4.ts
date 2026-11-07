// Étape « habillage » de la chaîne v4 (dev-habillage), PURE : punchlines, zooms, accroche, chapitres, titres.
// Contrat : /home/claude/equipe/CONTRAT.md §1.7 et §4.7. Signature GELÉE (types-v4.ts).
//
// Sur un montage déjà coupé (plans = morceaux gardés des séquences), dans l'ordre :
//  1. punchlines (mode mots) : ≈ 3,3 par minute, au moins une par séquence, sur des répliques (punchlines-v4.ts) ;
//     dessin et tenue = ceux du moteur (MAJUSCULES, mot clé coloré, jurons masqués, 1er mot → dernier + 0,2 s, 2,5 s) ;
//  2. zooms : ×1,32 sur ≈ 35 % des plans (les plus forts), ×1,12 sur ≈ 23 % (jamais deux de suite) (zooms-v4.ts) ;
//  3. accroche (~6 s) : le meilleur moment DES séquences gardées, 1 ou 2 morceaux coupés sur des bords de mots
//     (accroche-v4.ts), copiés au début par accrocheDesMorceaux ; texte « ATTENDS… » seulement si les titres sont
//     cochés ; aucun chapitre ni musique dedans (la musique commence après le « glitch », dev-musique) ;
//  4. chapitres YouTube (règles d'avant, après l'accroche) ; titres de section seulement si cochés, ≈ 1 toutes les
//     2 min, sans whoosh (aucun bruitage dans un Best-of).
// Le Montage express et Habiller gardent leurs fonctions d'avant (trouverPunchlines, zoomsAutomatiques,
// modeleMeilleurDAbord) : rien de ce fichier ne leur sert.

import { chapitresDesScenes } from '../express/express';
import { compiler } from '../../recette/chronologie';
import { gabaritDe } from '../../recette/destination';
import { accrocheDesMorceaux, MEILLEUR } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { appliquerZoomsAuto, choisirModeSousTitres, definirPunchlines, titresDeSection } from '../../recette/operations';
import type { Recette, Sec, Texte } from '../../recette/types';
import type { BilanHabillage, EntreeHabillage, ResultatHabillage, SequenceV4 } from '../types-v4';
import { choisirAccroche } from './accroche-v4';
import { candidatsPunchlines, choisirPunchlines, PUNCHLINES_V4, type CandidatPunchline } from './punchlines-v4';
import { CENTRE_ZOOMS_AUTO, FORCES_ZOOMS_AUTO } from './zooms-auto';
import { planifierZoomsV4 } from './zooms-v4';

/** Titres de section du Best-of v4 : au plus un toutes les `ecart` s (≈ 1 toutes les 2 min, comme la main : 8 en 16,5 min). */
export const TITRES_V4 = { ecart: 110, finMin: 10 } as const;

const arrondi = (t: Sec) => Math.round(t * 100) / 100;

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

/** Ce que l'habillage a posé (comptes seulement). */
export function bilanHabillage(r: Recette, accroche: BilanHabillage['accroche']): BilanHabillage {
  const z = r.plans.map((p) => p.zoomFixe?.force ?? 1);
  return {
    punchlines: r.sousTitres?.punchlines?.length ?? 0,
    zoomsForts: z.filter((x) => x >= 1.2).length,
    zoomsLegers: z.filter((x) => x > 1 && x < 1.2).length,
    plans: r.plans.length,
    accroche,
    chapitres: r.chapitres?.length ?? 0,
    titres: r.textes.filter((x) => x.role === 'section').length,
  };
}

/** La meilleure punchline possible DANS l'accroche, si aucune punchline choisie n'y tombe (null sinon). */
export function punchlineDeLAccroche(plages: readonly { de: Sec; a: Sec }[], choisies: readonly CandidatPunchline[], candidats: readonly CandidatPunchline[]): CandidatPunchline | null {
  const dedans = (c: CandidatPunchline) => plages.some((p) => c.ts >= p.de - 1e-6 && c.fin <= p.a + 1e-6);
  if (choisies.some(dedans)) return null;
  const libre = (c: CandidatPunchline) => choisies.every((x) => x.fin <= c.ts || x.ts >= c.fin);
  return [...candidats].filter((c) => dedans(c) && libre(c) && c.note >= PUNCHLINES_V4.noteMin).sort((x, y) => y.note - x.note || x.t0 - y.t0)[0] ?? null;
}

/** Titres de section au début des séquences (après l'accroche), un toutes les ≈ 2 min, sans son. */
function titresV4(r: Recette, sequences: readonly SequenceV4[], src: string, finAccroche: Sec): Recette {
  const sc = compiler(r);
  const poses: { t: Sec; nom: string }[] = [];
  for (const s of sequences) {
    const nom = s.titre?.trim();
    if (!nom) continue;
    const plan = sc.plans.find((p) => p.t0 >= finAccroche - 0.01 && p.src === src && p.de >= s.de - 0.01 && p.a <= s.a + 0.01);
    if (!plan) continue;
    const t = arrondi(plan.t0);
    const dernier = poses[poses.length - 1];
    if ((dernier && t - dernier.t < TITRES_V4.ecart) || sc.duree - t < TITRES_V4.finMin) continue;
    poses.push({ t, nom });
  }
  if (poses.length === 0) return r;
  const textes: Texte[] = [...r.textes.filter((x) => x.role !== 'section'), ...poses.map((x): Texte => ({ txt: x.nom, role: 'section', style: 'bandeau', t: x.t }))];
  return titresDeSection({ ...r, textes }, { source: 'main', son: false });
}

export function habillerV4(r0: Recette, e: EntreeHabillage): ResultatHabillage {
  let r = r0;
  const src = e.src;
  // 1. Punchlines (mode mots seulement).
  let punch: CandidatPunchline[] = [];
  let candidats: CandidatPunchline[] = [];
  if (e.punchlines && r.sousTitres && e.mots.some((m) => m[0].trim())) {
    candidats = candidatsPunchlines(r, {
      src,
      mots: e.mots,
      moments: e.moments,
      signaux: e.signaux,
      sequences: e.sequences,
      ...(e.voix && e.voix.voix.length >= 2 ? { tours: e.voix.tours } : {}),
    });
    punch = choisirPunchlines(candidats, compiler(r).duree);
    r = choisirModeSousTitres(definirPunchlines(r, punch), 'punchlines');
  }
  // 2. Zooms.
  if (e.zooms) r = appliquerZoomsAuto(r, planifierZoomsV4(r.plans, { premiere: src, moments: e.moments, punchlines: punch, signaux: e.signaux, force: e.zooms }));
  // 3. Accroche.
  let accroche: BilanHabillage['accroche'] = null;
  let finAccroche = 0;
  if (e.accroche) {
    const a = choisirAccroche(r, { src, mots: e.mots, moments: e.moments, sequences: e.sequences, punchlines: punch, signaux: e.signaux });
    if (a) {
      // La phrase de l'accroche s'affiche en punchline (comme la main), si aucune ne tombe déjà dedans.
      const plus = punchlineDeLAccroche(a.plages, punch, candidats);
      if (plus) {
        punch = [...punch, plus].sort((x, y) => x.t0 - y.t0);
        r = definirPunchlines(r, punch);
      }
      const fort = e.zooms ? { force: (FORCES_ZOOMS_AUTO[e.zooms] ?? FORCES_ZOOMS_AUTO.normal).fort, y: CENTRE_ZOOMS_AUTO.y } : null;
      // La réaction (le dernier morceau) en punch-in, comme la main (×1 puis ×1,32).
      const morceaux = a.plages.map((p, i) => ({ ...p, src, zoomFixe: i === a.plages.length - 1 ? fort : null }));
      const avec = accrocheDesMorceaux(r, morceaux, { texte: e.titres ? MEILLEUR.texte : null });
      if (avec !== r) {
        const plans = compiler(avec).plans;
        const k = plans.findIndex((p, i) => i > 0 && p.trans?.type === MEILLEUR.transition);
        finAccroche = k > 0 ? plans[k]!.t0 : 0;
        accroche = a;
        r = avec;
      }
    }
  }
  // 4. Chapitres (YouTube 16:9, après l'accroche) et titres de section (cochés seulement).
  const chapitres = gabaritDe(r).paysage ? chapitresDesScenes(r, e.sequences, src, finAccroche) : [];
  if (chapitres.length > 0) r = finir({ ...r, chapitres });
  if (e.titres) r = titresV4(r, e.sequences, src, finAccroche);
  return { recette: r, bilan: bilanHabillage(r, accroche) };
}
