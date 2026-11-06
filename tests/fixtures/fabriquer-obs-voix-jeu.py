# Fabrique UNE FOIS la fixture du Montage auto « Coupes » (lancé à la main, pas par les tests) :
#   python3 -I tests/fixtures/fabriquer-obs-voix-jeu.py tests/fixtures
# obs-voix-jeu.mp4 : 40 s, 1280 × 720, comme une capture OBS d'un écran Windows :
#  - image : testsrc2 qui défile + grain (le jeu bouge partout), débit d'un enregistrement OBS léger, barre de titre MAGENTA de 20 px en haut, barre des tâches CYAN de 40 px en bas
#    avec une « horloge » blanche qui change ;
#  - son : bruit de jeu (souffle −30 dBFS + grondement 60 Hz), la phrase de parole-fr.wav à 6 s et à 24 s
#    (voix ≈ −20 dBFS), une explosion à 16 s. Ailleurs : le jeu seul (jamais muet).
import subprocess
import sys
import wave

import numpy as np

sortie = sys.argv[1]
F = 48000
DUREE = 40
rng = np.random.default_rng(5)
t = np.arange(DUREE * F) / F
son = rng.uniform(-1, 1, t.size) * 0.055 + 0.12 * np.sin(2 * np.pi * 60 * t)

with wave.open(f"{sortie}/parole-fr.wav") as w:
    voix16 = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
voix = np.interp(np.arange(int(voix16.size * 3)) / 3, np.arange(voix16.size), voix16)
voix *= 0.1 / np.sqrt(np.mean(voix[np.abs(voix) > 0.01] ** 2))  # ≈ −20 dBFS pendant la parole
for debut in (6, 24):
    k = debut * F
    son[k : k + voix.size] += voix

k = 16 * F
n = int(0.4 * F)
son[k : k + n] += rng.uniform(-1, 1, n) * 0.6 * np.exp(-np.arange(n) / F * 6)
son = np.clip(son, -0.98, 0.98)
pcm = (np.stack([son, son], axis=1) * 32767).astype(np.int16)
with wave.open(f"{sortie}/obs-voix-jeu.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(F)
    w.writeframes(pcm.tobytes())

# Le jeu bouge partout (comme une caméra de jeu qui tourne) : testsrc2 qui défile + grain.
filtre = (
    "scroll=h=0.004:v=0.002,noise=alls=30:allf=t,"
    "drawbox=x=0:y=0:w=1280:h=20:color=0xFF00FF:t=fill,"
    "drawbox=x=0:y=680:w=1280:h=40:color=0x00FFFF:t=fill,"
    "drawbox=x=1180:y=690:w=60:h=20:color=white@1:t=fill:enable='lt(mod(t,20),10)'"
)
subprocess.run(
    ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc2=size=1280x720:rate=30:duration={DUREE}", "-i", f"{sortie}/obs-voix-jeu.wav",
     "-vf", filtre, "-c:v", "libx264", "-b:v", "1500k", "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
     "-shortest", "-movflags", "+faststart", f"{sortie}/obs-voix-jeu.mp4"],
    check=True,
)
