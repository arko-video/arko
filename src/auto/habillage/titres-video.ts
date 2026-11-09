// Titres de vidéo YouTube et gros textes de miniature PROPOSÉS d'après ce qui se dit dans la vidéo (9/11/2026,
// retour d'un spectateur : « un meilleur titre du genre : 100 Jours sur Minecraft ONE BLOCK ! »). Pure, sans IA :
// on repère le jeu, le mode (one block, hardcore…), un nombre de jours et le sujet qui revient, puis on remplit des
// modèles de titres qui marchent en gaming. Tout reste modifiable (ce ne sont que des propositions).

import type { Mot } from '../../recette/types';

const JEUX: readonly [RegExp, string][] = [
  [/\bminecraft\b|\bcreeper|\bender\s?dragon|\bnether\b|\bvillageois/, 'Minecraft'],
  [/\bfortnite\b/, 'Fortnite'],
  [/\bgta\b/, 'GTA'],
  [/\bamong\s?us\b/, 'Among Us'],
  [/\bvalorant\b/, 'Valorant'],
  [/\blethal\s?company\b/, 'Lethal Company'],
  [/\broblox\b/, 'Roblox'],
  [/\brocket\s?league\b/, 'Rocket League'],
  [/\bfall\s?guys\b/, 'Fall Guys'],
  [/\bphasmophobia\b/, 'Phasmophobia'],
  [/\bleague\s?of\s?legends\b|\blol\b/, 'League of Legends'],
];

const MODES: readonly [RegExp, string][] = [
  [/\bone\s?block\b|\bun\s?seul\s?bloc/, 'ONE BLOCK'],
  [/\bhardcore\b/, 'HARDCORE'],
  [/\bskyblock\b/, 'SKYBLOCK'],
  [/\bbed\s?wars\b/, 'BEDWARS'],
  [/\bspeedrun/, 'SPEEDRUN'],
  [/\bmanhunt\b/, 'MANHUNT'],
  [/\bcache[- ]cache\b/, 'CACHE-CACHE'],
  [/\bmod(s|é|ée)?\b/, 'MODDÉ'],
  [/\bsurvie\b/, 'SURVIE'],
];

const VIDES = new Set(
  'alors aussi avec avoir bah bon bref cette ceux chez comme comment dans donc elle elles encore enfin était faire fait genre ici juste leur mais même moi nous oui ouais parce pour quand quoi rien sans sont sous suis sur tout tous toute très trop vas voilà vous wesh ahah haha euh hein putain merde vraiment attends regarde viens truc chose faut peut veux avait cest quil jsuis jvais tavais'.split(' '),
);

export interface IndicesVideo {
  jeu: string | null;
  mode: string | null;
  jours: number | null;
  sujet: string | null;
}

/** Ce qu'on devine de la vidéo à partir de ses mots. */
export function indicesVideo(mots: readonly Mot[]): IndicesVideo {
  const texte = ` ${mots.map((m) => m[0]).join(' ').toLowerCase()} `;
  const jeu = JEUX.find(([re]) => re.test(texte))?.[1] ?? null;
  const mode = MODES.find(([re]) => re.test(texte))?.[1] ?? null;
  const nombres = [...texte.matchAll(/\b(\d{1,4})\s*(?:jours?|days?)\b/g)].map((m) => Number(m[1])).filter((n) => n >= 2 && n <= 1000);
  const jours = nombres.length > 0 ? Math.max(...nombres) : null;
  const n = new Map<string, number>();
  for (const m of mots) {
    const w = m[0].toLowerCase().replace(/[^a-zà-ÿ0-9-]/g, '');
    if (w.length < 5 || VIDES.has(w) || /^\d+$/.test(w)) continue;
    n.set(w, (n.get(w) ?? 0) + 1);
  }
  const jeuBas = jeu?.toLowerCase();
  const [sujet] = [...n].filter(([w, k]) => k >= 3 && w !== jeuBas).sort((a, b) => b[1] - a[1])[0] ?? [null];
  return { jeu, mode, jours, sujet };
}

const MAX = 70;
const coupe = (t: string) => (t.length > MAX ? `${t.slice(0, MAX - 1).trimEnd()}…` : t);
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Jusqu'à 5 titres de vidéo, du meilleur au moins bon, sans doublon. */
export function proposerTitres(mots: readonly Mot[]): string[] {
  const { jeu, mode, jours, sujet } = indicesVideo(mots);
  const j = jeu ?? 'ce jeu';
  const jm = mode ? `${j} ${mode}` : j;
  const res: string[] = [];
  if (jours) res.push(`${jours} Jours sur ${jm} !`);
  res.push(`On a essayé ${jm}… c'était une catastrophe`);
  if (sujet) res.push(`${maj(sujet)} nous a rendus FOUS sur ${j} 😱`);
  res.push(`${jm} mais tout part en vrille`);
  if (!jours) res.push(`J'ai survécu à ${jm} avec mon pote (ou pas)`);
  if (sujet) res.push(`Le pire moment de ${j} : ${sujet}`);
  return [...new Set(res.map(coupe))].slice(0, 5);
}

/** Idées de GROS texte de miniature (2 à 3 mots, en majuscules). */
export function textesMiniature(mots: readonly Mot[]): string[] {
  const { mode, jours, sujet } = indicesVideo(mots);
  const res: string[] = [];
  if (jours) res.push(`${jours} JOURS`);
  if (mode) res.push(`${mode} ?!`);
  if (sujet) res.push(`LE ${sujet.toUpperCase()} ?!`);
  res.push('CATASTROPHE', 'IMPOSSIBLE ?!', 'ON A CRAQUÉ');
  return [...new Set(res)].filter((t) => t.length <= 22).slice(0, 6);
}
