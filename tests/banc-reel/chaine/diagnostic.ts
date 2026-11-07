// Banc réel — diagnostic de la transcription : ce que le nettoyage d'Arko retire, tranche par tranche (comptes
// seulement : aucun texte de la session n'est affiché).
import { collerPonctuation, DUREE_MAX_MOT, filtrerHallucinations, NIVEAU_FAIBLE, retirerRepetitions } from '../../../src/sous-titres/nettoyage';
import type { PlageTemps } from '../../../src/auto/types';
import { nettoyer } from '../../../src/sous-titres/nettoyage';
import { SonPcm } from './son';
import { lireTranchesFaites, transcrirePlages } from './whisper';

export function diagnosticWhisper(): string {
  const l: string[] = ['tranche        bruts  collés  étirés-faibles  répétitions  gardés'];
  let tot = [0, 0, 0, 0, 0];
  for (const t of lireTranchesFaites()) {
    const tries = [...t.bruts].sort((a, b) => a.ts - b.ts);
    const colles = collerPonctuation(tries);
    const etires = colles.filter((m) => m.fin - m.ts > DUREE_MAX_MOT && m.niveau < NIVEAU_FAIBLE).length;
    const rep = colles.length - retirerRepetitions(colles).length;
    const gardes = filtrerHallucinations(colles).length;
    const x = [t.bruts.length, colles.length, etires, rep, gardes];
    tot = tot.map((v, i) => v + x[i]!);
    l.push(`${String(t.tranche.de).padStart(5)}–${String(t.tranche.a).padEnd(6)} ${x.map((v) => String(v).padStart(7)).join(' ')}`);
  }
  l.push(`total        ${tot.map((v) => String(v).padStart(7)).join(' ')}`);
  return l.join('\n');
}

/** Whisper sur une plage (sans rien écrire) : nombre de mots, erreurs, et ressemblance avec les tranches gardées. */
export async function essaiWhisper(p: PlageTemps): Promise<string> {
  const son = new SonPcm();
  const t0 = performance.now();
  const r = await transcrirePlages(son, [p]);
  const s = (performance.now() - t0) / 1000;
  son.fermer();
  const garde = lireTranchesFaites()
    .flatMap((t) => t.bruts)
    .filter((m) => (m.ts + m.fin) / 2 >= p.de && (m.ts + m.fin) / 2 < p.a);
  const cle = (m: { txt: string; ts: number }) => `${m.txt.trim().toLowerCase()}|${Math.round(m.ts * 10)}`;
  const deja = new Set(garde.map(cle));
  const communs = r.bruts.filter((m) => deja.has(cle(m))).length;
  return [
    `moteur : ${process.env.BANC_ORT === 'web' ? 'onnxruntime-web (WASM)' : 'onnxruntime-node (CPU)'} ; ${p.de}–${p.a} s en ${s.toFixed(0)} s, ${r.fenetres} fenêtres`,
    `mots bruts : ${r.bruts.length} (gardés dans le cache : ${garde.length}, en commun texte + temps à 0,1 s : ${communs}) ; après nettoyage : ${nettoyer(r.bruts).length}`,
    `erreurs : ${r.erreurs.length === 0 ? 'aucune' : r.erreurs.map((e) => `${e.de.toFixed(1)}–${e.a.toFixed(1)} s « ${e.message} »`).join(' ; ')}`,
  ].join('\n');
}
