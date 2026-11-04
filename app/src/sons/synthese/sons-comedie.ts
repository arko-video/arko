// Famille « comedie » : trombone triste, criquets, ba-dum-tss.

import { adsr, bruit, courbeExpo, expo, FREQ, melanger, multiplier, nbEchantillons, note, oscillateur, tableau, type Piste } from './briques';
import { filtrer, reverberation, saturer } from './effets';

/**
 * Une note de trombone avec sourdine « wah » : onde en scie, filtre qui s'ouvre puis se referme.
 * `derniere` : la longue note finale, avec un vibrato qui grandit et qui s'affaisse à la fin.
 */
function noteTrombone(freq: number, duree: number, derniere: boolean): Float32Array {
  const cents = (c: number) => Math.exp(c * 0.000577623); // 2^(c/1200)
  const courbe = (t: number) => {
    let c = -60 * Math.exp(-t / 0.04); // on « glisse » dans la note par en dessous
    if (derniere) {
      c += 35 * Math.min(1, t / 0.8) * Math.sin(2 * Math.PI * 5.5 * t);
      c -= 100 * Math.max(0, (t - (duree - 0.35)) / 0.35); // la note s'affaisse
    }
    return freq * cents(c);
  };
  const hauteur = tableau(courbe, duree);
  const son = oscillateur('scie', duree, hauteur);
  const wah = (t: number) => (derniere ? Math.min(1, t / 0.12) * (1 - 0.6 * Math.min(1, t / duree)) : Math.sin(Math.PI * Math.min(1, t / duree)));
  const ouvert = filtrer(son, 'passe-bas', (t) => 350 + 1700 * wah(t), 1.4);
  return multiplier(saturer(ouvert, 1.5), adsr(duree, 0.03, 0.1, 0.8, derniere ? 0.25 : 0.08));
}

/** Trombone triste : « wah wah wah waaah », 4 notes qui descendent d'un demi-ton (si♭, la, la♭, sol). */
export function tromboneTriste(): Float32Array {
  const d = 2.9;
  const notes = [note(-11), note(-12), note(-13), note(-14)];
  const pistes: Piste[] = notes.map((f, k) => ({
    signal: noteTrombone(f, k === 3 ? 1.5 : 0.38, k === 3),
    debut: k * 0.45,
  }));
  return reverberation(melanger(d, pistes), { taille: 0.5, amorti: 0.5, mix: 0.12 });
}

/** Un criquet : des chants de 3 petites impulsions (20 ms chacune), répétés tous les `periode` secondes. */
function criquet(duree: number, freq: number, periode: number, decalage: number): Float32Array {
  const sortie = new Float32Array(nbEchantillons(duree));
  const nImpulsion = Math.round(0.02 * FREQ);
  for (let chant = decalage; chant < duree; chant += periode) {
    for (let k = 0; k < 3; k++) {
      const i0 = Math.round((chant + k * 0.033) * FREQ);
      for (let j = 0; j < nImpulsion && i0 + j < sortie.length; j++) {
        const t = j / FREQ;
        const volume = Math.sin((Math.PI * j) / nImpulsion) ** 2;
        sortie[i0 + j] = Math.sin(2 * Math.PI * freq * t * (1 + 0.02 * k)) * volume;
      }
    }
  }
  return sortie;
}

/** Criquets : le silence gênant, deux criquets dans la nuit. */
export function criquets(): Float32Array {
  const d = 2.6;
  const nuit = filtrer(bruit(d, 141), 'passe-bas', 400);
  const brut = melanger(d, [
    { signal: criquet(d, 4400, 0.62, 0.05) },
    { signal: criquet(d, 4950, 0.71, 0.33), gain: 0.7 },
    { signal: nuit, gain: 0.05 },
  ]);
  return reverberation(brut, { taille: 0.75, amorti: 0.5, mix: 0.25 });
}

/** Caisse claire : un ton bref et un souffle aigu. */
function caisseClaire(): Float32Array {
  const d = 0.3;
  const ton = multiplier(oscillateur('sinus', d, courbeExpo(230, 185, 0.03)), expo(d, 0.05, 0.001));
  const timbre = multiplier(filtrer(bruit(d, 151), 'passe-haut', 1400), expo(d, 0.08, 0.001));
  return melanger(d, [{ signal: ton, gain: 0.7 }, { signal: timbre }]);
}

/** Tom + grosse caisse : le « dum ». */
function tom(): Float32Array {
  const d = 0.6;
  const tomTon = multiplier(oscillateur('sinus', d, courbeExpo(150, 98, 0.1)), expo(d, 0.18, 0.002));
  const kick = multiplier(oscillateur('sinus', d, courbeExpo(110, 50, 0.06)), expo(d, 0.15, 0.002));
  return melanger(d, [{ signal: tomTon }, { signal: kick, gain: 0.7 }]);
}

/** Cymbale « tss » : 6 ondes carrées à des fréquences qui ne s'accordent pas (son métallique) + souffle. */
function cymbale(): Float32Array {
  const d = 1.3;
  const metal = melanger(
    d,
    [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => ({ signal: oscillateur('carre', d, f * 1.7), gain: 0.2 })),
  );
  const brillant = filtrer(filtrer(metal, 'passe-bande', 8500, 1), 'passe-haut', 6000);
  const souffle = filtrer(bruit(d, 161), 'passe-haut', 7000);
  return multiplier(melanger(d, [{ signal: brillant }, { signal: souffle, gain: 0.5 }]), expo(d, 0.4, 0.002));
}

/** Ba-dum-tss : la chute de blague à la batterie. */
export function baDumTss(): Float32Array {
  const d = 1.8;
  const brut = melanger(d, [
    { signal: caisseClaire(), debut: 0, gain: 0.8 },
    { signal: tom(), debut: 0.16 },
    { signal: cymbale(), debut: 0.42, gain: 0.9 },
  ]);
  return reverberation(brut, { taille: 0.4, amorti: 0.5, mix: 0.12 });
}
