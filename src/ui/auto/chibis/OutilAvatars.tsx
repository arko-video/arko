// Outil « Avatars » de Habiller (C, dev 3) : Montrer les avatars, Quand (parle / tout le temps), Petit rebond, une
// ligne par personne (chibi via ChoixChibi, taille, montrer / cacher, place par défaut), place au doigt sur l'aperçu
// (CalqueAvatars), et « Qui parle ? » (dev 1).

import { chibiDe } from '../../../moteur/couches/avatars';
import { activerAvatars, donnerChibi, montrerAvatar, placerAvatar } from '../../../recette/operations-chibis';
import { PLACE_AVATAR } from '../../../recette/normaliser-chibis';
import type { Personne, Recette } from '../../../recette/types';
import { TV } from '../../../textes-v3';
import { Pastilles } from '../../composants/outils/Commun';
import { CurseurValeur, Interrupteur } from '../../composants/outils/Reglages';
import { gabaritProjet } from '../../destination';
import { modifier, recetteAffichee } from '../../etat';
import { EntreeQuiParle } from '../voix/EntreeQuiParle';
import { placesAffichees } from './CalqueAvatars';
import { ChoixChibi } from './ChoixChibi';
import './chibis.css';

/** Le bouton « Avatars » de la barre d'outils de Habiller ne s'affiche que si c'est prêt (ou forcé : drapeau « avatars »). */
export const PRETE_AVATARS = true;

const MODES = ['parle', 'reactions', 'toujours'] as const;

function LignePersonne({ r, p }: { r: Recette; p: Personne }) {
  const t = TV.chibis.avatars;
  const place = p.place ?? placesAffichees(r, gabaritProjet.value).find((x) => x.p === p.id)?.place ?? { x: 0.5, y: 1, taille: 0.3 };
  const visible = p.avatar !== false;
  return (
    <div class="avatar-personne" data-testid={`avatar-${p.id}`}>
      <div class="avatar-personne-tete">
        <span class="avatar-pastille" style={{ background: p.couleur ?? '#888' }} aria-hidden="true" />
        <strong class="chibi-ligne-nom">{p.nom}</strong>
        <button type="button" class="btn" onClick={() => modifier((x) => montrerAvatar(x, p.id, !visible))} data-testid={`avatar-montrer-${p.id}`}>
          {visible ? t.cacher : t.montrer}
        </button>
      </div>
      <ChoixChibi valeur={p.chibi ?? chibiDe(p)} surChoix={(def, bib) => modifier((x) => donnerChibi(x, p.id, def, bib))} testid={`avatar-chibi-${p.id}`} />
      {visible && r.avatars && (
        <>
          <CurseurValeur
            label={t.taille}
            min={PLACE_AVATAR.tailleMin}
            max={PLACE_AVATAR.tailleMax}
            step={0.01}
            valeur={place.taille}
            format={(v) => t.tailleValeur(Math.round(v * 100))}
            onValider={(taille) => modifier((x) => placerAvatar(x, p.id, { ...place, taille }))}
            testid={`avatar-taille-${p.id}`}
          />
          {p.place && (
            <button type="button" class="btn" onClick={() => modifier((x) => placerAvatar(x, p.id, null))} data-testid={`avatar-defaut-${p.id}`}>
              {t.placeDefaut}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function OutilAvatars() {
  const r = recetteAffichee.value;
  const t = TV.chibis.avatars;
  const personnes = r?.personnes ?? [];
  const reglages = r?.avatars;
  return (
    <div class="outil" data-testid="outil-avatars">
      <p class="petit doux outil-aide">{t.aide}</p>
      {r && personnes.length === 0 && <p class="petit doux">{t.sansVoix}</p>}
      {r && personnes.length > 0 && (
        <>
          <Interrupteur titre={t.activer} actif={!!reglages} onChange={(oui) => modifier((x) => activerAvatars(x, oui ? { mode: 'parle', rebond: true } : null))} testid="avatars-activer" />
          {reglages && (
            <>
              <h3 class="outil-sous-titre">{t.quand}</h3>
              <Pastilles label={t.quand} choix={MODES} actif={reglages.mode ?? 'parle'} onChoisir={(mode) => modifier((x) => activerAvatars(x, { ...x.avatars, mode }))} prefixe="avatars-mode" rendu={(k) => <span>{t[k]}</span>} />
              <Interrupteur titre={t.rebond} actif={reglages.rebond !== false} onChange={(rebond) => modifier((x) => activerAvatars(x, { ...x.avatars, rebond }))} testid="avatars-rebond" />
              <p class="petit doux">{t.placer}</p>
            </>
          )}
          <h3 class="outil-sous-titre">{t.personnes}</h3>
          {personnes.map((p) => (
            <LignePersonne key={p.id} r={r} p={p} />
          ))}
        </>
      )}
      <EntreeQuiParle />
    </div>
  );
}
