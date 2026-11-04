// File d'attente : les tâches passées à la file s'exécutent l'une après l'autre, jamais en même temps.
// Sert de verrou (« promesse en cours ») autour des décodeurs, qui ne supportent pas deux appels croisés.

export type FileTaches = <T>(tache: () => Promise<T>) => Promise<T>;

export function creerFile(): FileTaches {
  let derniere: Promise<unknown> = Promise.resolve();
  return <T>(tache: () => Promise<T>): Promise<T> => {
    const p = derniere.then(tache, tache);
    derniere = p.catch(() => undefined);
    return p;
  };
}
