// Clés API du monteur IA, côté interface. Chaque fournisseur a SA saisie (I-1) : une clé tapée pour Anthropic
// n'est jamais envoyée à OpenAI, ni gardée à la place de la clé d'un autre fournisseur.
// Si l'appareil refuse de la garder (navigation privée), elle reste en mémoire jusqu'à la fermeture d'Arko (M-7).

import { signal } from '@preact/signals';
import { lireCle, oublierCle, sauverCle, type IdFournisseur } from '../../moteur/api';

type ParFournisseur = Partial<Record<IdFournisseur, string>>;

/** Ce qui est tapé dans le champ de la clé, fournisseur par fournisseur. */
export const clesSaisies = signal<ParFournisseur>({});

export function saisir(f: IdFournisseur, cle: string) {
  clesSaisies.value = { ...clesSaisies.peek(), [f]: cle };
}

/** La clé tapée pour CE fournisseur (sans espaces autour). */
export function saisie(f: IdFournisseur): string {
  return (clesSaisies.peek()[f] ?? '').trim();
}

/** Clés gardées seulement en mémoire (l'appareil a refusé de les garder). */
const enMemoire: ParFournisseur = {};
/** Fournisseurs dont la clé n'est qu'en mémoire (pour le prévenir). */
export const clesEnMemoire = signal<IdFournisseur[]>([]);

function majMemoire() {
  clesEnMemoire.value = Object.keys(enMemoire) as IdFournisseur[];
}

/** La clé gardée pour ce fournisseur (sur l'appareil, sinon en mémoire), ou null. */
export async function cleGardee(f: IdFournisseur): Promise<string | null> {
  return (await lireCle(f)) ?? enMemoire[f] ?? null;
}

/** Garde la clé tapée pour CE fournisseur, puis vide son champ. */
export async function garderCle(f: IdFournisseur, cle: string): Promise<void> {
  try {
    await sauverCle(f, cle);
    delete enMemoire[f];
  } catch {
    enMemoire[f] = cle.replace(/\s+/g, '');
  }
  majMemoire();
  saisir(f, '');
}

/** « Oublier ma clé » : sur l'appareil, en mémoire et dans le champ. */
export async function oublierCleMonteur(f: IdFournisseur): Promise<void> {
  await oublierCle(f);
  delete enMemoire[f];
  majMemoire();
  saisir(f, '');
}
