import sys, glob, os, json
import numpy as np
from scipy.io import wavfile
from scipy import signal
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
dossier, sortie = sys.argv[1], sys.argv[2]
fich = sorted(glob.glob(dossier + '/*.wav'))
ordre = ['impact','whoosh','meme','comedie','tension','jeu','interface']
fich.sort(key=lambda f: (ordre.index(os.path.basename(f).split('.')[0]), f))
n = len(fich); cols = 4; rows = (n + cols - 1)//cols
fig, axs = plt.subplots(rows*2, cols, figsize=(cols*4.2, rows*4.0), gridspec_kw={'height_ratios':[1,2.2]*rows})
metr = []
for k, f in enumerate(fich):
    fs, x = wavfile.read(f); x = x.astype(np.float64)
    r, c = divmod(k, cols)
    a1, a2 = axs[2*r][c], axs[2*r+1][c]
    t = np.arange(len(x))/fs
    a1.plot(t, x, lw=0.4, color='k'); a1.set_xlim(0, t[-1]); a1.set_ylim(-1,1); a1.set_xticks([]); a1.set_yticks([])
    nom = os.path.basename(f)[:-4]
    a1.set_title(nom, fontsize=9)
    fr, tt, S = signal.spectrogram(x, fs, nperseg=1024, noverlap=896)
    a2.pcolormesh(tt, fr/1000, 10*np.log10(S+1e-12), vmin=-120, vmax=-30, shading='auto', cmap='magma')
    a2.set_ylim(0, 8); a2.tick_params(labelsize=6)
    # clics : passe-haut 6 kHz, crête vs médiane d'enveloppe
    b, aa = signal.butter(4, 6000/(fs/2), 'high'); h = signal.lfilter(b, aa, x)
    env = np.abs(h)
    w = int(0.002*fs); env2 = np.convolve(env, np.ones(w)/w, mode='same')
    clic = float(env2.max() / (np.median(env2)+1e-9))
    tclic = float(np.argmax(env2)/fs)
    d = np.abs(np.diff(x)); 
    # sur-échantillonnage x4 pour crête vraie
    tp = np.abs(signal.resample_poly(x, 4, 1)).max()
    rms = 20*np.log10(np.sqrt(np.mean(x**2))+1e-12)
    m = dict(id=nom, dur=round(len(x)/fs,3), creteDb=round(20*np.log10(np.abs(x).max()),2), vraieCreteDb=round(20*np.log10(tp),2), rmsDb=round(rms,1),
             dc=round(float(x.mean()),5), debut1ms=round(float(np.abs(x[:48]).max()),4), sautMax=round(float(d.max()),3),
             hf6k_crete_sur_mediane=round(clic,1), t_hf=round(tclic,3), ecretage=int((np.abs(x)>0.999).sum()))
    metr.append(m)
plt.tight_layout(); plt.savefig(sortie, dpi=70)
print(json.dumps(metr, indent=0))
