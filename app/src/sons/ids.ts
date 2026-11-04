// Identifiants des sons importés : « a1 », « a2 »… On prend toujours le premier libre.

/** Premier id « aN » qui n'est pas dans `pris` (fonction pure). */
export function premierIdLibre(pris: Iterable<string>): string {
  const deja = new Set(pris);
  let n = 1;
  while (deja.has(`a${n}`)) n++;
  return `a${n}`;
}
