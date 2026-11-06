"""Fabrique tests/fixtures/jeu-720p60.mp4 : une fausse capture OBS de jeu « façon Minecraft » (blocs à texels nets,
ciel, barre d'objets), 1280 × 720, 60 i/s, 3 s, caméra qui avance, H.264 à 4,5 Mb/s (preset veryfast, comme OBS),
son 440 Hz. Sert à l'e2e « Améliorer l'image ».

    python3 tests/fixtures/fabriquer-jeu-720p.py
"""

import subprocess
import numpy as np

L, H, IPS, DUREE = 1280, 720, 60, 3
SORTIE = 'tests/fixtures/jeu-720p60.mp4'

rng = np.random.default_rng(7)
# 5 sortes de blocs (couleur de base) et une texture 16 × 16 de bruit par sorte.
BASES = np.array([[92, 153, 51], [120, 84, 56], [128, 128, 128], [158, 122, 71], [51, 107, 36]], dtype=np.float32)
TEXTURES = 1 + (rng.random((5, 16, 16)) - 0.5) * 0.35
TEXTURES[3, 3::4, :] *= 0.65  # planches
TEXTURES[4] *= np.where(rng.random((16, 16)) < 0.25, 0.4, 1)  # feuilles
CARTE = rng.integers(0, 5, size=(64, 256))


def image(n: int) -> np.ndarray:
    t = n / IPS
    img = np.zeros((H, L, 3), dtype=np.float32)
    ciel = int(H * 0.32)
    a = np.linspace(0, 1, ciel)[:, None]
    img[:ciel] = np.stack([115 + 50 * a, 166 + 38 * a, 242 + 0 * a], axis=-1)
    ys, xs = np.mgrid[ciel:H, 0:L]
    r = (ys - ciel) / (H - ciel)
    texel = np.where(r < 0.25, 2, np.where(r < 0.55, 4, 8))  # loin : petits texels ; près : gros
    decalage = (t * 60 * texel / 4).astype(np.int64)  # la caméra avance
    tx = (xs + decalage) // texel
    ty = (ys - ciel) // texel
    bloc = CARTE[(ty // 16) % 64, (tx // 16 + texel) % 256]
    k = TEXTURES[bloc, ty % 16, tx % 16]
    k = k * np.where((tx % 16 == 0) | (ty % 16 == 0), 0.72, 1)
    img[ciel:] = BASES[bloc] * k[..., None]
    # Barre d'objets (nette, fixe) au milieu en bas.
    cote, x0, y0 = 64, (L - 9 * 64) // 2, H - 64 - 8
    for c in range(9):
        x = x0 + c * cote
        img[y0:y0 + cote, x:x + cote] *= 0.35
        couleur = 255 if c == 3 else 140
        img[y0:y0 + 3, x:x + cote] = couleur
        img[y0 + cote - 3:y0 + cote, x:x + cote] = couleur
        img[y0:y0 + cote, x:x + 3] = couleur
        img[y0:y0 + cote, x + cote - 3:x + cote] = couleur
    # Viseur.
    img[H // 2 - 10:H // 2 + 10, L // 2 - 2:L // 2 + 2] = 255
    img[H // 2 - 2:H // 2 + 2, L // 2 - 10:L // 2 + 10] = 255
    return np.clip(img, 0, 255).astype(np.uint8)


ff = subprocess.Popen([
    'ffmpeg', '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{L}x{H}', '-r', str(IPS), '-i', '-',
    '-f', 'lavfi', '-i', f'sine=frequency=440:duration={DUREE}:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '4500k', '-maxrate', '4500k', '-bufsize', '9000k',
    '-pix_fmt', 'yuv420p', '-g', '120', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', SORTIE,
], stdin=subprocess.PIPE)
for n in range(IPS * DUREE):
    ff.stdin.write(image(n).tobytes())
ff.stdin.close()
ff.wait()
print(SORTIE)
