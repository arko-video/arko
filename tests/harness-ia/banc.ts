// Banc d'essai de l'analyse dans Chrome : utilise UNIQUEMENT l'API publique (ia/api-ia + ouvrirSource).
// Le fichier est choisi par Playwright dans <input type="file"> : il reste sur le disque (comme sur le téléphone).
import { analyserSource, clipsSansIA, oublierAnalyse, type OptionsAnalyseSource } from '../../src/ia/api-ia';
import { ouvrirSource, fermerSource, type SourceOuverte } from '../../src/moteur/api';

const journal = document.getElementById('journal')!;
let source: SourceOuverte | null = null;

async function ouvrir(): Promise<SourceOuverte> {
  const f = (document.getElementById('fichier') as HTMLInputElement).files?.[0];
  if (!f) throw new Error('aucun fichier');
  if (source && source.fichier === f) return source;
  if (source) fermerSource(source);
  source = await ouvrirSource(f);
  return source;
}

/** Mémoire JS de la page (Mo), si Chrome la donne. */
function memoirePage(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
}

/**
 * Lance une analyse. `couperApresMs` : on annule (le Worker est arrêté net) au bout de ce temps.
 * Renvoie le résultat (sans l'erreur d'annulation), les progressions et la durée.
 */
async function analyser(options: Omit<OptionsAnalyseSource, 'signal' | 'surProgression'> & { couperApresMs?: number; clips?: number }) {
  const s = await ouvrir();
  const ctrl = new AbortController();
  const progres: [number, string][] = [];
  let memMax = memoirePage() ?? 0;
  const debut = performance.now();
  if (options.couperApresMs) setTimeout(() => ctrl.abort(), options.couperApresMs);
  try {
    const r = await analyserSource(s, {
      ...options,
      signal: ctrl.signal,
      surProgression: (p, m) => {
        progres.push([Math.round(p * 1000) / 1000, m]);
        memMax = Math.max(memMax, memoirePage() ?? 0);
        journal.textContent = `${Math.round(p * 100)} % — ${m}`;
      },
    });
    const clips = clipsSansIA(r.moments, s.infos, options.clips ?? 3);
    return {
      ok: true,
      ms: Math.round(performance.now() - debut),
      infos: s.infos,
      moments: r.moments,
      resume: r.resume,
      stats: r.stats,
      avertissements: r.avertissements,
      clips: clips.map((c) => ({ recette: c.recette, raison: c.raison, problemes: c.problemes })),
      premieres: progres.slice(0, 3),
      dernieres: progres.slice(-3),
      nbProgres: progres.length,
      memoirePageMo: memMax,
    };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return { ok: false, ms: Math.round(performance.now() - debut), code: err.code, message: err.message, dernieres: progres.slice(-2) };
  }
}

async function oublier() {
  const s = await ouvrir();
  await oublierAnalyse(s.infos.emp);
}

(window as unknown as { banc: unknown }).banc = { analyser, oublier };
journal.textContent = 'prêt';
