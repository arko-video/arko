# Estime l'agrandissement d'un zoom : image n de B ≈ image n de A agrandie autour de (cx, cy) (fractions).
# Usage : python3 p3-estimer-zoom.py A.mp4 B.mp4 n cx cy [y0 y1]  →  {"echelle": s, "erreur": mse}
import json, subprocess, sys
import numpy as np

def image(chemin, n, l=270, h=480):
    b = subprocess.run(['ffmpeg', '-v', 'error', '-i', chemin, '-vf', f'select=eq(n\\,{n}),scale={l}:{h}', '-vsync', '0', '-frames:v', '1',
                        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(b, np.uint8).reshape(h, l).astype(np.float64)

def zoomer(img, s, cx, cy):
    h, l = img.shape
    ys, xs = np.mgrid[0:h, 0:l].astype(np.float64)
    px, py = cx * l, cy * h
    sx = px + (xs + 0.5 - px) / s - 0.5
    sy = py + (ys + 0.5 - py) / s - 0.5
    x0 = np.clip(np.floor(sx).astype(int), 0, l - 2); y0 = np.clip(np.floor(sy).astype(int), 0, h - 2)
    fx = np.clip(sx - x0, 0, 1); fy = np.clip(sy - y0, 0, 1)
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)

a_, b_, n, cx, cy = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
y0 = float(sys.argv[6]) if len(sys.argv) > 6 else 0; y1 = float(sys.argv[7]) if len(sys.argv) > 7 else 1
A, B = image(a_, n), image(b_, n)
h = A.shape[0]; r0, r1 = int(y0 * h), int(y1 * h)
meilleur = None
for s in np.arange(1.0, 2.61, 0.02):
    e = float(np.mean((zoomer(A, s, cx, cy)[r0:r1] - B[r0:r1]) ** 2))
    if meilleur is None or e < meilleur[1]: meilleur = (round(float(s), 2), round(e, 1))
print(json.dumps({'echelle': meilleur[0], 'erreur': meilleur[1]}))
