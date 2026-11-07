// Tests du stockage des modèles (dev-vad) : Cache Storage, fetch et navigator.storage SIMULÉS (jamais de vrai
// téléchargement, jamais le vrai modèle). Fiches remplacées par de petits fichiers fabriqués.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErreurArko } from '../../moteur/erreurs';

const VAD = new Uint8Array(Array.from({ length: 3000 }, (_, i) => (i * 7) % 256));
const EMP = new Uint8Array(Array.from({ length: 5000 }, (_, i) => (i * 13 + 1) % 256));
const sha = (x: Uint8Array) => createHash('sha256').update(x).digest('hex');
const URL_EMP = 'https://huggingface.co/x/y/resolve/0743f301363dec56491a490f6d6cbc9d67f9a3bf/campplus.onnx';

vi.mock('./catalogue', async (avant) => {
  const vrai = await avant<typeof import('./catalogue')>();
  return {
    ...vrai,
    MODELES: {
      vad: { ...vrai.MODELES.vad, octets: VAD.length, sha256: sha(VAD) },
      empreinte: { ...vrai.MODELES.empreinte, url: URL_EMP, octets: EMP.length, sha256: sha(EMP) },
    },
  };
});

const { MODELES } = await import('./catalogue');
const { cleDuModele, etatModele, garderModelesDeLAppli, lireModele, oublierModele, telechargerModele } = await import('./modeles');
const { adresseDansLAppli, adresseHuggingFacePermise } = await import('./adresses');

/** Faux Cache Storage : une table adresse → octets. */
class FauxCache {
  readonly m = new Map<string, Uint8Array>();
  async match(k: RequestInfo | URL) {
    const b = this.m.get(String(k instanceof Request ? k.url : k));
    return b ? new Response(b.slice()) : undefined;
  }
  async put(k: RequestInfo | URL, r: Response) {
    this.m.set(String(k instanceof Request ? k.url : k), new Uint8Array(await r.arrayBuffer()));
  }
  async delete(k: RequestInfo | URL) {
    return this.m.delete(String(k instanceof Request ? k.url : k));
  }
  async keys() {
    return [...this.m.keys()].map((u) => new Request(u));
  }
}

let cache: FauxCache;
let appels: string[];
/** Ce que le faux réseau sert : adresse → octets (absent = 404) ; `horsLigne` = fetch échoue. */
let serveur: Map<string, Uint8Array>;
let horsLigne = false;
let libre = 1e9;

/** Réponse en flux par morceaux de 1000 octets (comme un vrai téléchargement). */
function enFlux(b: Uint8Array, signal?: AbortSignal | null): Response {
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (signal?.aborted) return c.error(new DOMException('annulé', 'AbortError'));
        if (i >= b.length) return c.close();
        c.enqueue(b.slice(i, i + 1000));
        i += 1000;
      },
    }),
  );
}

beforeEach(() => {
  cache = new FauxCache();
  appels = [];
  serveur = new Map([
    [cleDuModele(MODELES.vad), VAD],
    [URL_EMP, EMP],
  ]);
  horsLigne = false;
  libre = 1e9;
  vi.stubGlobal('caches', { open: async () => cache });
  vi.stubGlobal('navigator', { storage: { persist: async () => true, estimate: async () => ({ quota: libre, usage: 0 }) } });
  vi.stubGlobal('fetch', async (u: string, o?: RequestInit) => {
    appels.push(u);
    if (horsLigne) throw new TypeError('Failed to fetch');
    const b = serveur.get(u);
    return b ? enFlux(b, o?.signal) : new Response('non', { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'aucune erreur';
  } catch (e) {
    return e instanceof ErreurArko ? e.code : String(e);
  }
}

describe('modèles sur l\'appareil', () => {
  it('le détecteur de voix est livré avec l\'appli : « présent » sans accord, même avant d\'être gardé', async () => {
    expect(await etatModele('vad')).toEqual({ id: 'vad', present: true, octets: VAD.length, dansLAppli: true, enCache: false });
    expect(await etatModele('empreinte')).toMatchObject({ present: false, dansLAppli: false, enCache: false, octets: EMP.length });
    expect(appels).toEqual([]);
  });

  it('lireModele : le détecteur de voix est lu depuis l\'appli au 1er usage, vérifié, gardé, puis relu sans réseau', async () => {
    const b = await lireModele('vad');
    expect(new Uint8Array(b!)).toEqual(VAD);
    expect(appels).toEqual([cleDuModele(MODELES.vad)]);
    expect(new URL(appels[0]!).origin).toBe(new URL(adresseDansLAppli('x')).origin);
    expect((await etatModele('vad')).enCache).toBe(true);
    horsLigne = true;
    expect(new Uint8Array((await lireModele('vad'))!)).toEqual(VAD);
    expect(appels.length).toBe(1);
  });

  it('au démarrage, en ligne : le détecteur de voix (livré) est gardé d\'avance ; jamais CAM++ ; rien hors ligne', async () => {
    expect(await garderModelesDeLAppli(false)).toEqual([]);
    expect(appels).toEqual([]);
    expect(await garderModelesDeLAppli(true)).toEqual(['vad']);
    expect(appels).toEqual([cleDuModele(MODELES.vad)]);
    expect((await etatModele('vad')).enCache).toBe(true);
    expect((await etatModele('empreinte')).enCache).toBe(false);
    // Déjà gardé : plus rien à faire.
    expect(await garderModelesDeLAppli(true)).toEqual([]);
    expect(appels.length).toBe(1);
  });

  it('lireModele : un modèle à télécharger qui n\'est pas là → null, et RIEN n\'est téléchargé', async () => {
    expect(await lireModele('empreinte')).toBeNull();
    expect(appels).toEqual([]);
  });

  it('télécharger (après accord) : depuis huggingface.co seulement, en flux avec progression, gardé', async () => {
    const messages: [number, string][] = [];
    await telechargerModele('empreinte', { surProgression: (p, m) => messages.push([p, m]) });
    expect(appels).toEqual([URL_EMP]);
    expect(messages.length).toBeGreaterThan(3);
    expect(messages.at(-1)![0]).toBe(1);
    expect(messages.at(-1)![1]).toMatch(/^Je télécharge l'empreinte de voix… 0,0 \/ 0,0 Mo$/);
    for (let i = 1; i < messages.length; i++) expect(messages[i]![0]).toBeGreaterThanOrEqual(messages[i - 1]![0]);
    expect(await etatModele('empreinte')).toMatchObject({ present: true, enCache: true });
    expect(new Uint8Array((await lireModele('empreinte'))!)).toEqual(EMP);
    // Déjà là : rien à refaire.
    await telechargerModele('empreinte');
    expect(appels.length).toBe(1);
  });

  it('taille fausse ou SHA-256 faux : le fichier est jeté (erreur « module »)', async () => {
    serveur.set(URL_EMP, EMP.slice(0, 4000));
    expect(await code(telechargerModele('empreinte'))).toBe('module');
    serveur.set(URL_EMP, new Uint8Array([...EMP, 1, 2]));
    expect(await code(telechargerModele('empreinte'))).toBe('module');
    const faux = EMP.slice();
    faux[10] = faux[10]! ^ 0xff;
    serveur.set(URL_EMP, faux);
    expect(await code(telechargerModele('empreinte'))).toBe('module');
    expect(cache.m.size).toBe(0);
    // Le détecteur de voix abîmé dans l'appli : lireModele dit null (la passe du son continue sans lui).
    serveur.set(cleDuModele(MODELES.vad), VAD.slice(1));
    expect(await lireModele('vad')).toBeNull();
  });

  it('hors ligne, erreur 404 : « reseau » ; pas assez de place : « place », sans rien demander au réseau', async () => {
    horsLigne = true;
    expect(await code(telechargerModele('empreinte'))).toBe('reseau');
    horsLigne = false;
    serveur.delete(URL_EMP);
    expect(await code(telechargerModele('empreinte'))).toBe('reseau');
    appels = [];
    libre = EMP.length; // il faut 20 % de plus
    expect(await code(telechargerModele('empreinte'))).toBe('place');
    expect(appels).toEqual([]);
  });

  it('annulation pendant le téléchargement : « annule », rien de gardé', async () => {
    const ctl = new AbortController();
    const p = telechargerModele('empreinte', { signal: ctl.signal, surProgression: (x) => x > 0.3 && ctl.abort() });
    expect(await code(p)).toBe('annule');
    expect(cache.m.size).toBe(0);
    const deja = new AbortController();
    deja.abort();
    expect(await code(telechargerModele('empreinte', { signal: deja.signal }))).toBe('annule');
  });

  it('un fichier abîmé dans le cache est retiré ; oublierModele vide la place', async () => {
    cache.m.set(URL_EMP, EMP.slice(0, 100));
    expect(await lireModele('empreinte')).toBeNull();
    expect(cache.m.has(URL_EMP)).toBe(false);
    await telechargerModele('empreinte');
    cache.m.set(`${adresseDansLAppli(MODELES.vad.dansLAppli!)}?sha=ancienne`, VAD.slice(0, 10));
    await lireModele('vad');
    // Une ancienne version du détecteur de voix (autre SHA) est retirée quand la nouvelle est gardée.
    expect([...cache.m.keys()].filter((u) => u.includes('silero')).length).toBe(1);
    await oublierModele('empreinte');
    await oublierModele('vad');
    expect(cache.m.size).toBe(0);
  });

  it('seule origine permise pour un téléchargement : huggingface.co à une révision figée', () => {
    expect(adresseHuggingFacePermise(URL_EMP)).toBe(true);
    expect(adresseHuggingFacePermise('https://huggingface.co/x/y/resolve/main/m.onnx')).toBe(false);
    expect(adresseHuggingFacePermise('https://exemple.com/x/resolve/0743f301363dec56491a490f6d6cbc9d67f9a3bf/m.onnx')).toBe(false);
    expect(adresseHuggingFacePermise('http://huggingface.co/x/resolve/0743f301363dec56491a490f6d6cbc9d67f9a3bf/m.onnx')).toBe(false);
    expect(adresseHuggingFacePermise('pas une adresse')).toBe(false);
  });
});
