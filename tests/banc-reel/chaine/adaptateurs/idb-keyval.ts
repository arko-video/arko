// Banc réel — remplace le paquet `idb-keyval` (IndexedDB, absent de Node) par une table en mémoire, pour le temps
// d'un lancement. Le code d'Arko (points de reprise de l'analyse, transcription gardée, voix gardées…) tourne tel quel.
// Seules les fonctions utilisées par src/ sont fournies.

type Magasin = Map<IDBValidKey, unknown>;

const magasins = new Map<string, Magasin>();
const parDefaut: Magasin = new Map();

export type UseStore = Magasin;

export function createStore(base: string, table: string): Magasin {
  const cle = `${base}/${table}`;
  let m = magasins.get(cle);
  if (!m) {
    m = new Map();
    magasins.set(cle, m);
  }
  return m;
}

const de = (s?: Magasin) => s ?? parDefaut;

export async function get<T = unknown>(cle: IDBValidKey, s?: Magasin): Promise<T | undefined> {
  return de(s).get(cle) as T | undefined;
}

export async function set(cle: IDBValidKey, valeur: unknown, s?: Magasin): Promise<void> {
  de(s).set(cle, valeur);
}

export async function del(cle: IDBValidKey, s?: Magasin): Promise<void> {
  de(s).delete(cle);
}

export async function delMany(cles: IDBValidKey[], s?: Magasin): Promise<void> {
  for (const c of cles) de(s).delete(c);
}

export async function getMany<T = unknown>(cles: IDBValidKey[], s?: Magasin): Promise<(T | undefined)[]> {
  return cles.map((c) => de(s).get(c) as T | undefined);
}

export async function keys(s?: Magasin): Promise<IDBValidKey[]> {
  return [...de(s).keys()];
}

export async function values<T = unknown>(s?: Magasin): Promise<T[]> {
  return [...de(s).values()] as T[];
}

export async function clear(s?: Magasin): Promise<void> {
  de(s).clear();
}
