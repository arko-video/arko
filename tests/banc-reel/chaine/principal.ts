// Banc réel — commandes (appelées par tests/banc-reel/lancer.ts, dans le module runner de Vite).

import { assemblerMots, DUREE_SOURCE, mesurerVitesse, transcrireSession } from './whisper';

export interface Arguments {
  commande: string;
  options: Map<string, string | true>;
}

export function lireArguments(argv: readonly string[]): Arguments {
  const options = new Map<string, string | true>();
  let commande = 'chaine';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const suivant = argv[i + 1];
      if (suivant !== undefined && !suivant.startsWith('--')) {
        options.set(a.slice(2), suivant);
        i++;
      } else options.set(a.slice(2), true);
    } else commande = a;
  }
  return { commande, options };
}

/** « 0-1800 » → { de: 0, a: 1800 }. */
export function lirePlage(v: string | true | undefined, defaut: { de: number; a: number }): { de: number; a: number } {
  if (typeof v !== 'string') return defaut;
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(v);
  if (!m) throw new Error(`--plage attend « de-a » en secondes (ex. 0-1800), reçu « ${v} ».`);
  return { de: Number(m[1]), a: Number(m[2]) };
}

export async function principal(argv: readonly string[]): Promise<number> {
  const { commande, options } = lireArguments(argv);
  switch (commande) {
    case 'vitesse': {
      const de = Number(options.get('de') ?? 1200);
      await mesurerVitesse(de, Number(options.get('duree') ?? 60));
      return 0;
    }
    case 'transcrire': {
      const p = lirePlage(options.get('plage'), { de: 0, a: DUREE_SOURCE });
      await transcrireSession(p.de, p.a);
      return 0;
    }
    case 'signaux': {
      const { mesuresSon } = await import('./signaux');
      await mesuresSon(DUREE_SOURCE, { refaire: options.has('refaire') });
      console.log('Mesures du son prêtes.');
      return 0;
    }
    case 'essai': {
      // Whisper sur une plage, sans rien écrire ; compare aux tranches gardées (BANC_ORT=web : moteur WASM).
      const { essaiWhisper } = await import('./diagnostic');
      console.log(await essaiWhisper(lirePlage(options.get('plage'), { de: 6900, a: 7200 })));
      return 0;
    }
    case 'vad': {
      const { cacheVad } = await import('./vad');
      const v = options.get('variante');
      const variantes: ('appli' | 'saut' | 'continu')[] = v === 'saut' || v === 'continu' || v === 'appli' ? [v] : ['appli'];
      for (const variante of variantes) await cacheVad(DUREE_SOURCE, { refaire: options.has('refaire'), variante });
      return 0;
    }
    case 'diagnostic': {
      const { diagnosticWhisper } = await import('./diagnostic');
      console.log(diagnosticWhisper());
      return 0;
    }
    case 'assembler': {
      const { moteurChaine } = await import('./whisper');
      console.log(moteurChaine(), assemblerMots());
      return 0;
    }
    default: {
      const { lancerChaine } = await import('./chaine');
      return lancerChaine(options);
    }
  }
}
