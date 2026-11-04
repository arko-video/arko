# Fabrique UNE FOIS la fixture parlée des sous-titres (lancé à la main dans la VM, pas par les tests).
#   pip install piper-tts --break-system-packages
#   voix : https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/medium
#   python3 -I tests/fixtures/fabriquer-parole-fr.py <dossier de la voix> tests/fixtures
# Produit parole-fr.wav (16 kHz mono) et parole-fr.json (mots attendus avec leurs temps),
# en synthétisant chaque mot à part (temps exacts). La vidéo parole-fr.mp4 se fait ensuite avec ffmpeg.
import json
import sys
import wave

import numpy as np
from piper import PiperVoice

PHRASE = "Salut tout le monde, aujourd'hui on lance une partie et on va gagner ce match ensemble."
SILENCE_AVANT = 0.6  # secondes de silence au début (vérifie le décalage des temps)
SILENCE_APRES = 0.8

dossier_voix, sortie = sys.argv[1], sys.argv[2]
voix = PiperVoice.load(f"{dossier_voix}/fr_FR-siwis-medium.onnx")
textes = PHRASE.replace(",", "").replace(".", "").split()
freq = voix.config.sample_rate

# Espeak fusionne certains mots (« tout le monde » = un seul bloc de phonèmes) : on synthétise donc
# chaque mot à part, on enlève ses silences, et on les colle avec un petit blanc. Les temps sont exacts.
BLANC = 0.12
audio = [np.zeros(int(SILENCE_AVANT * freq))]
mots = []  # [début, fin] en échantillons
pos = len(audio[0])
for t in textes:
    a = np.concatenate([m.audio_float_array for m in voix.synthesize(t)])
    fort = np.nonzero(np.abs(a) > 0.02)[0]
    a = a[max(0, fort[0] - 80) : fort[-1] + 80]
    mots.append([pos, pos + len(a)])
    audio.append(a)
    audio.append(np.zeros(int(BLANC * freq)))
    pos += len(a) + int(BLANC * freq)

son = np.concatenate([*audio, np.zeros(int(SILENCE_APRES * freq))])
# Rééchantillonnage simple vers 16 kHz (interpolation linéaire, la voix est déjà sous 8 kHz).
n16 = int(len(son) * 16000 / freq)
son16 = np.interp(np.arange(n16) * freq / 16000, np.arange(len(son)), son)
with wave.open(f"{sortie}/parole-fr.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(16000)
    w.writeframes((np.clip(son16, -1, 1) * 32767).astype(np.int16).tobytes())

print(len(textes), "mots dans la phrase,", len(mots), "mots alignés")
attendus = [
    {"txt": t, "ts": round(float(d) / freq, 2), "fin": round(float(f) / freq, 2)} for t, (d, f) in zip(textes, mots)
]
with open(f"{sortie}/parole-fr.json", "w", encoding="utf-8") as f:
    json.dump({"phrase": PHRASE, "duree": round(len(son) / freq, 2), "mots": attendus}, f, ensure_ascii=False, indent=1)
for a in attendus:
    print(a)
